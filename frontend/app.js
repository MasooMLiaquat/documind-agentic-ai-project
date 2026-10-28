const API_BASE = window.DOCUMIND_API_URL || "http://localhost:8000";

const elements = {
  uploadArea: document.querySelector("#uploadArea"),
  fileInput: document.querySelector("#fileInput"),
  newDocumentButton: document.querySelector("#newDocumentButton"),
  documentList: document.querySelector("#documentList"),
  documentTitle: document.querySelector("#documentTitle"),
  welcomeState: document.querySelector("#welcomeState"),
  conversation: document.querySelector("#conversation"),
  suggestions: document.querySelector("#suggestions"),
  questionForm: document.querySelector("#questionForm"),
  questionInput: document.querySelector("#questionInput"),
  sendButton: document.querySelector("#sendButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebar: document.querySelector(".sidebar"),
  toast: document.querySelector("#toast")
};

const state = {
  sessionId: crypto.randomUUID(),
  activeDocument: null,
  documents: []
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function setBusy(isBusy) {
  elements.uploadArea.disabled = isBusy;
  elements.sendButton.disabled = isBusy || !state.activeDocument || !elements.questionInput.value.trim();
  elements.questionInput.disabled = isBusy;
}

function updateComposer() {
  elements.sendButton.disabled = !state.activeDocument || !elements.questionInput.value.trim();
  elements.questionInput.style.height = "auto";
  elements.questionInput.style.height = `${Math.min(elements.questionInput.scrollHeight, 140)}px`;
}

function enterDocumentMode() {
  elements.welcomeState.hidden = true;
  elements.conversation.hidden = false;
  elements.suggestions.hidden = false;
}

function renderDocuments() {
  if (!state.documents.length) {
    elements.documentList.innerHTML = '<p class="empty-state-small">No documents uploaded yet.</p>';
    return;
  }

  elements.documentList.innerHTML = state.documents.map((document) => `
    <button class="document-item ${document.id === state.activeDocument?.id ? "active" : ""}" type="button" data-document-id="${escapeHtml(document.id)}">
      <span class="document-icon" aria-hidden="true">▧</span>${escapeHtml(document.name)}
    </button>
  `).join("");
}

function selectDocument(document) {
  state.activeDocument = document;
  elements.documentTitle.textContent = document.name;
  enterDocumentMode();
  renderDocuments();
  updateComposer();
  elements.sidebar.classList.remove("open");
}

async function uploadFile(file) {
  const allowedExtensions = ["pdf", "docx", "txt"];
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    showToast("Please upload a PDF, DOCX, or TXT file.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("The file is larger than 10 MB.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("session_id", state.sessionId);
  setBusy(true);

  try {
    const response = await fetch(`${API_BASE}/api/documents`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Upload failed (${response.status}).`);
    }

    const document = await response.json();
    const normalizedDocument = {
      id: document.id || crypto.randomUUID(),
      name: document.name || file.name
    };
    state.documents.unshift(normalizedDocument);
    selectDocument(normalizedDocument);
    showToast(`${file.name} is ready to query.`);
  } catch (error) {
    showToast(`${error.message} Start the backend or set window.DOCUMIND_API_URL before opening this page.`);
  } finally {
    setBusy(false);
  }
}

function addMessage(role, text) {
  const message = document.createElement("article");
  message.className = `message message-${role}`;
  message.innerHTML = `
    <div class="message-label">${role === "user" ? "You" : "DocuMind"}</div>
    <div class="message-body">${escapeHtml(text).replaceAll("\n", "<br>")}</div>
  `;
  elements.conversation.append(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  return message;
}

function addLoadingMessage() {
  const message = document.createElement("article");
  message.className = "message message-assistant";
  message.innerHTML = `
    <div class="message-label">DocuMind</div>
    <div class="message-body loading" aria-label="Thinking"><i></i><i></i><i></i></div>
  `;
  elements.conversation.append(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  return message;
}

async function askQuestion(question) {
  addMessage("user", question);
  elements.questionInput.value = "";
  updateComposer();
  setBusy(true);
  const loadingMessage = addLoadingMessage();

  try {
    const response = await fetch(`${API_BASE}/api/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        document_id: state.activeDocument.id,
        question
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Question failed (${response.status}).`);
    }

    const result = await response.json();
    loadingMessage.remove();

    const answer = typeof result.answer === "string"
      ? result.answer
      : "I could not generate a response.";

    const message = addMessage("assistant", answer);
    const body = message.querySelector(".message-body");

    if (Array.isArray(result.sources) && result.sources.length) {
      const sources = document.createElement("div");
      sources.className = "sources";
      sources.innerHTML = result.sources.map((source, index) => `
        <div class="source-card">
          <strong>Source ${index + 1}${source.page ? ` · Page ${escapeHtml(String(source.page))}` : ""}</strong>
          ${escapeHtml(source.excerpt || source.text || "")}
        </div>
      `).join("");
      body.append(sources);
    }
  } catch (error) {
    loadingMessage.remove();
    addMessage("assistant", error.message);
  } finally {
    setBusy(false);
  }
}

function resetWorkspace() {
  state.activeDocument = null;
  state.documents = [];
  elements.conversation.replaceChildren();
  elements.conversation.hidden = true;
  elements.welcomeState.hidden = false;
  elements.suggestions.hidden = true;
  elements.documentTitle.textContent = "Ask DocuMind";
  elements.questionInput.value = "";
  renderDocuments();
  updateComposer();
}

elements.uploadArea.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) uploadFile(file);
  event.target.value = "";
});

elements.newDocumentButton.addEventListener("click", () => {
  elements.sidebar.classList.remove("open");
  elements.fileInput.click();
});

elements.documentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-document-id]");
  if (!button) return;
  const document = state.documents.find((item) => item.id === button.dataset.documentId);
  if (document) selectDocument(document);
});

elements.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = elements.questionInput.value.trim();
  if (question && state.activeDocument) askQuestion(question);
});

elements.questionInput.addEventListener("input", updateComposer);
elements.questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.questionForm.requestSubmit();
  }
});

elements.suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-question]");
  if (button) askQuestion(button.dataset.question);
});

elements.clearHistoryButton.addEventListener("click", () => {
  elements.conversation.replaceChildren();
  showToast("Conversation cleared.");
});

elements.mobileMenuButton.addEventListener("click", () => {
  elements.sidebar.classList.toggle("open");
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadArea.classList.add("dragover");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.uploadArea.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadArea.classList.remove("dragover");
  });
}

elements.uploadArea.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) uploadFile(file);
});

updateComposer();
