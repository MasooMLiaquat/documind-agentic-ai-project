const fileInput = document.querySelector('#file-input');
const chatForm = document.querySelector('#chat-form');
const question = document.querySelector('#question');
const chatStream = document.querySelector('#chat-stream');
const sendButton = document.querySelector('#send-button');
const toast = document.querySelector('#toast');
let documentId = null;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  setLoading(true);
  const form = new FormData();
  form.append('document', file);
  try {
    const response = await fetch('/api/documents', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    documentId = data.documentId;
    document.querySelector('#empty-state').hidden = true;
    const loaded = document.querySelector('#document-loaded');
    loaded.hidden = false;
    loaded.style.display = 'grid';
    document.querySelector('#document-status').textContent = file.name;
    document.querySelector('#document-name').textContent = file.name;
    document.querySelector('#document-size').textContent = formatBytes(file.size);
    document.querySelector('#page-count').textContent = `${data.pageCount} page${data.pageCount === 1 ? '' : 's'}`;
    renderPreview(data.preview);
  } catch (error) { notify(error.message); }
  finally { setLoading(false); }
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = question.value.trim();
  if (!value || !documentId) return;
  appendMessage('user', value);
  question.value = '';
  sendButton.disabled = true;
  const pending = appendMessage('assistant', '<span class="typing">Searching and checking evidence…</span>');
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ documentId, question: value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    pending.innerHTML = renderAnswer(data.answer, data.sources, data.toolsUsed);
  } catch (error) { pending.textContent = error.message; }
  finally { sendButton.disabled = false; }
});

function appendMessage(role, content) {
  const element = document.createElement('div');
  element.className = role === 'user' ? 'user-message' : 'assistant-message';
  element.innerHTML = content;
  chatStream.append(element);
  chatStream.scrollTop = chatStream.scrollHeight;
  return element;
}

function renderAnswer(answer, sources = [], toolsUsed = []) {
  const toolText = toolsUsed.length ? `Tools used: ${toolsUsed.join(' → ')}` : 'Direct answer';
  const cards = sources.map((source) => `<div class="source-card"><button type="button" data-page="${source.page}">Page ${source.page}</button><br>${escapeHtml(source.excerpt)}</div>`).join('');
  return `<div class="tool-note">${escapeHtml(toolText)}</div>${escapeHtml(answer).replace(/\n/g, '<br>')}${cards ? `<div class="source-cards"><strong>Sources</strong>${cards}</div>` : ''}`;
}

function renderPreview(pages) {
  document.querySelector('#page-preview').innerHTML = pages.map((page, index) => `<article class="source-page"><strong>PAGE ${index + 1}</strong>${escapeHtml(page).replace(/\n/g, '<br>')}</article>`).join('');
}

chatStream.addEventListener('click', (event) => {
  const target = event.target.closest('[data-page]');
  if (!target) return;
  document.querySelectorAll('.source-page')[Number(target.dataset.page) - 1]?.scrollIntoView({ behavior: 'smooth' });
});
document.querySelector('#new-chat').addEventListener('click', () => location.reload());
function setLoading(isLoading) { sendButton.disabled = isLoading; }
function formatBytes(bytes) { return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
function notify(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 2800); }
