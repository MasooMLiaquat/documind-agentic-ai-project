import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import OpenAI from 'openai';
import pdf from 'pdf-parse';

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024 } });
const documents = new Map();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.post('/api/documents', upload.single('document'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose a PDF document.' });
  try {
    const buffer = await fs.readFile(request.file.path);
    const parsed = await pdf(buffer);
    const pages = splitPages(parsed);
    if (!pages.length) throw new Error('No readable text was found. This PDF may be scanned or image-only.');
    const documentId = crypto.randomUUID();
    documents.set(documentId, buildDocument(pages));
    response.json({ documentId, pageCount: pages.length, preview: pages.map((page) => page.text.slice(0, 2500)) });
  } catch (error) {
    response.status(400).json({ error: error.message });
  } finally {
    await fs.rm(request.file.path, { force: true }).catch(() => {});
  }
});

app.post('/api/chat', async (request, response) => {
  const { documentId, question } = request.body;
  const document = documents.get(documentId);
  if (!document) return response.status(404).json({ error: 'The document is no longer available. Upload it again.' });
  if (!question?.trim()) return response.status(400).json({ error: 'Enter a question.' });
  try {
    const toolsUsed = [];
    const allSources = new Map();
    const messages = [{ role: 'system', content: `You are a document-grounded analyst. Use tools to inspect the document. Never claim evidence that the tools did not retrieve. Answer concisely. Include requirements as a numbered or bulleted list only when useful. Every factual statement must be supported by a retrieved page excerpt. If evidence is insufficient, say so. When a user asks for requirements, use extract_requirements. When evidence may be inexact, use verify_evidence. Final sources are drawn from tool results.` }, { role: 'user', content: question }];
    const tools = [
      { type: 'function', function: { name: 'search_document', description: 'Search relevant passages in the uploaded document.', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', default: 6 } }, required: ['query'] } } },
      { type: 'function', function: { name: 'extract_requirements', description: 'Extract explicit requirements, obligations, constraints, and acceptance criteria.', parameters: { type: 'object', properties: { focus: { type: 'string' } }, required: ['focus'] } } },
      { type: 'function', function: { name: 'verify_evidence', description: 'Verify that an answer is supported by document passages.', parameters: { type: 'object', properties: { claim: { type: 'string' } }, required: ['claim'] } } }
    ];

    for (let turn = 0; turn < 5; turn += 1) {
      const completion = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, tools, tool_choice: 'auto', temperature: 0 });
      const choice = completion.choices[0];
      messages.push(choice.message);
      if (!choice.message.tool_calls?.length) {
        const answer = choice.message.content || 'I could not produce an answer.';
        return response.json({ answer, sources: [...allSources.values()].slice(0, 8), toolsUsed: [...new Set(toolsUsed)] });
      }
      for (const call of choice.message.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        const result = executeTool(call.function.name, args, document);
        toolsUsed.push(call.function.name);
        result.sources.forEach((source) => allSources.set(`${source.page}-${source.excerpt}`, source));
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    response.status(502).json({ error: 'The document analysis did not finish.' });
  } catch (error) {
    response.status(502).json({ error: error.message || 'The AI provider request failed.' });
  }
});

app.use((error, request, response, _next) => {
  response.status(error instanceof multer.MulterError ? 400 : 500).json({ error: error.message });
});

function splitPages(parsed) {
  const chunks = String(parsed.text || '').split(/\f+/).map((text) => text.trim()).filter(Boolean);
  if (chunks.length > 1) return chunks.map((text, index) => ({ page: index + 1, text }));
  const lines = String(parsed.text || '').trim().split(/\n+/);
  const pages = []; let current = '';
  for (const line of lines) {
    if (current.length > 2300) { pages.push({ page: pages.length + 1, text: current.trim() }); current = ''; }
    current += `${line}\n`;
  }
  if (current.trim()) pages.push({ page: pages.length + 1, text: current.trim() });
  return pages;
}

function buildDocument(pages) {
  return { pages, chunks: pages.flatMap((page) => page.text.match(/.{1,900}(?:\s|$)/gs)?.map((text) => ({ page: page.page, text: text.trim() })) || [{ page: page.page, text: page.text }]) };
}

function executeTool(name, args, document) {
  if (name === 'search_document') return searchDocument(document, args.query, args.limit || 6);
  if (name === 'extract_requirements') return extractRequirements(document, args.focus);
  if (name === 'verify_evidence') return verifyEvidence(document, args.claim);
  throw new Error(`Unknown tool: ${name}`);
}

function searchDocument(document, query, limit) {
  const terms = tokenize(query);
  const ranked = document.chunks.map((chunk) => ({ ...chunk, score: terms.reduce((score, term) => score + chunk.text.toLowerCase().split(term).length - 1, 0) })).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  const sources = ranked.map(sourceShape);
  return { kind: 'search_results', query, passages: ranked.map((item) => `Page ${item.page}: ${item.text}`), sources };
}

function extractRequirements(document, focus) {
  const terms = tokenize(focus);
  const hits = document.chunks.map((chunk) => ({ ...chunk, score: requirementScore(chunk.text, terms) })).sort((a, b) => b.score - a.score).slice(0, 8).filter((item) => item.score > 0);
  const sources = hits.map(sourceShape);
  return { kind: 'requirement_passages', focus, passages: hits.map((item) => `Page ${item.page}: ${item.text}`), sources };
}

function verifyEvidence(document, claim) {
  const terms = tokenize(claim).filter((term) => term.length > 3);
  const hits = document.chunks.map((chunk) => ({ ...chunk, score: terms.reduce((score, term) => score + chunk.text.toLowerCase().includes(term) * 2, 0) })).sort((a, b) => b.score - a.score).slice(0, 5).filter((item) => item.score > 0);
  return { kind: 'verification_passages', claim, passages: hits.map((item) => `Page ${item.page}: ${item.text}`), sources: hits.map(sourceShape) };
}

function requirementScore(text, terms) {
  const lower = text.toLowerCase();
  const markers = ['must', 'shall', 'required', 'responsible', 'ensure', 'may not', 'will', 'provided that', 'compliance'];
  return terms.reduce((score, term) => score + lower.split(term).length - 1, 0) + markers.reduce((score, marker) => score + lower.includes(marker) * 3, 0);
}

function sourceShape(item) { return { page: item.page, excerpt: item.text.slice(0, 420) + (item.text.length > 420 ? '…' : '') }; }
function tokenize(text) { return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2))]; }

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Evidence Desk running at http://localhost:${port}`));
