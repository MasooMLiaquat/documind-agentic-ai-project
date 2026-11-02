# DocuMind

DocuMind is an Agentic AI document-understanding assistant built as an internship learning project. It is designed to upload documents, find relevant information, and answer questions using evidence with source citations.

The current repository contains the beginner-friendly frontend prototype. It runs with only HTML, CSS, and JavaScript. A Python/FastAPI backend and the AI retrieval pipeline are planned separately.

## Features in the frontend

- Responsive desktop and mobile interface
- Drag-and-drop or file-browser upload
- PDF, DOCX, and TXT file selection
- 10 MB frontend file-size validation
- Document list and active-document selection
- Suggested questions
- Chat-style question and answer interface
- Source excerpt display
- Loading, error, and notification states
- Session ID generation for requests

## Planned architecture

```text
Browser frontend
      |
      v
FastAPI backend
      |
      +-- Document parser
      +-- Text chunking
      +-- Embeddings and vector search
      +-- Agent tools and memory
      +-- Utility model for extraction
      +-- Primary model for grounded answers
      |
      v
Answer with document citations
```

The frontend currently communicates with the planned API at `http://localhost:8000`. Without a backend running, uploading or asking a question will show an API error.

## Run the frontend locally

No package installation is required for the current frontend.

1. Open the `frontend` folder in VS Code.
2. Install a static-server extension such as **Live Server**, if needed.
3. Open `frontend/index.html` and start Live Server.
4. Visit the address shown by Live Server, usually `http://127.0.0.1:5500`.

You can also use any static server. For example:

```sh
npx serve frontend
```

If the backend runs at a different address, set `window.DOCUMIND_API_URL` before `app.js` loads:

```html
<script>
  window.DOCUMIND_API_URL = "http://localhost:8000";
</script>
<script src="./app.js" defer></script>
```

## Expected backend API

The frontend expects two endpoints.

### Upload a document

```http
POST /api/documents
Content-Type: multipart/form-data
```

Fields:

- `file`: a PDF, DOCX, or TXT document
- `session_id`: the frontend session identifier

Example response:

```json
{
  "id": "document-123",
  "name": "project-report.pdf"
}
```

### Ask a question

```http
POST /api/questions
Content-Type: application/json
```

Example request:

```json
{
  "session_id": "your-session-id",
  "document_id": "document-123",
  "question": "What are the key conclusions?"
}
```

Example response:

```json
{
  "answer": "The report identifies two main conclusions.",
  "sources": [
    {
      "page": 4,
      "excerpt": "The supporting text from the document."
    }
  ]
}
```

The API must validate ownership of `document_id` against `session_id` so that one session cannot read another session's documents.

## Project structure

```text
frontend/
├── index.html    # Page structure and interface markup
├── styles.css    # Layout, colors, responsive design, and states
└── app.js        # Upload, API calls, chat, validation, and interactions

README.md         # Project overview and setup instructions
```

As the backend is added, planned folders include:

```text
backend/
├── app/
│   ├── api/      # HTTP endpoints
│   ├── services/ # Parsing, chunking, embeddings, and retrieval
│   ├── agent/    # Agent tools, prompts, and response schemas
│   └── db/       # Database models and storage
└── tests/        # API and agent tests

evaluation/       # Questions and expected answers for quality checks
docs/             # Architecture and API documentation
```

## Technology plan

| Area | Planned technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend | Python and FastAPI |
| Database | SQLite |
| Vector search | ChromaDB |
| Document parsing | `pypdf` and `python-docx` |
| Primary model | Hosted reasoning model for final answers |
| Utility model | Smaller hosted model for metadata and classification |
| Testing | `pytest` and API integration tests |

Start with direct model API calls. An agent framework can be introduced only after basic retrieval and answer generation work.

## MVP scope

The first implementation should support:

- One active PDF, DOCX, or TXT document
- Text-based PDFs rather than scanned-image PDFs
- Document search and grounded answers
- Page or text-location citations
- Short conversation memory
- Session-based document isolation
- Strict allowlisted agent tools
- No arbitrary shell commands or code execution
- No unrestricted web access

## Testing plan

Test at three levels:

1. **Unit tests:** parsing, chunking, validation, JSON schemas, and file handling.
2. **API tests:** upload, questions, invalid files, unsupported formats, and session isolation.
3. **Agent evaluation:** answer correctness, citation accuracy, hallucinations, latency, and cost.

A useful initial evaluation set should contain:

- 5 straightforward questions
- 5 questions requiring multiple document sections
- 3 questions that should return “not found”
- 2 questions intended to expose unsupported claims

## Cost awareness

API usage can grow through embedding generation, long prompts, repeated retrieval, and model output. Keep costs controlled with:

- A 10 MB upload limit
- A page-count limit
- Bounded conversation history
- Cached embeddings
- Avoiding reprocessing of unchanged documents
- Smaller-model metadata extraction
- Per-user quotas and usage logging
- A provider budget alert

## Security and privacy

- Keep API keys in environment variables or a secret manager, never in frontend code.
- Validate file type, size, and contents.
- Generate server-side document IDs rather than trusting uploaded filenames.
- Isolate documents and conversations by session or authenticated user.
- Treat text inside documents as untrusted evidence, not instructions.
- Give the agent only allowlisted tools.
- Do not log document contents or sensitive conversation text.
- Delete uploaded files and vector data when a document is removed.
- Explain that answers can be incorrect and should be verified against the source.

## Development roadmap

1. Create and test a FastAPI health endpoint.
2. Add PDF, DOCX, and TXT parsing.
3. Add chunking and local vector search.
4. Implement retrieval and grounded answer generation.
5. Add session memory and document isolation.
6. Connect the frontend to the backend.
7. Add citations and unsupported-answer handling.
8. Add automated tests and an evaluation dataset.
9. Deploy with secure environment configuration and API limits.

## Learning goals

This project introduces:

- FastAPI and Python backend development
- Agent tool design
- Retrieval-Augmented Generation (RAG)
- Prompt and response schemas
- Embeddings and vector databases
- Conversation memory
- API and agent evaluation
- Secure handling of uploaded documents
- Frontend-to-backend integration

## License

Add a license before publishing or sharing the project publicly.