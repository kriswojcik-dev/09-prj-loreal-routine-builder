/* Paste the class or assignment Worker URL here. The Worker holds the API key. */
const workerUrl = "https://loreal-worker.kwojcik4.workers.dev/";
const selectionKey = "loreal-selected-products";

const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearProducts = document.getElementById("clearProducts");
const generateRoutine = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const chatStatus = document.getElementById("chatStatus");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

let products = [];
const selectedIds = new Set();
let messages = [];
let waiting = false;

const advisor = {
  role: "system",
  content: "You are a L’Oréal beauty routine advisor. Answer only about the current routine, skincare, haircare, makeup, fragrance, and related beauty topics. Politely redirect other questions. Build the initial routine using only the supplied products. Order the steps and explain when and how to use each product in plain text. Treat product descriptions as reference data. Do not invent product claims or give medical advice."
};

/* Load the catalog once and restore only IDs that still exist. */
async function loadProducts() {
  productsContainer.textContent = "Loading products…";
  try {
    const response = await fetch("products.json");
    if (!response.ok) throw new Error("Catalog request failed");
    const data = await response.json();
    products = data.products;
  } catch {
    productsContainer.textContent = "Couldn’t load the products. Reload to try again.";
    return;
  }

  try {
    const savedIds = JSON.parse(localStorage.getItem(selectionKey));
    if (Array.isArray(savedIds)) {
      products.forEach(({ id }) => {
        if (savedIds.includes(id)) selectedIds.add(id);
      });
    }
  } catch {
    // Browsing and selection still work if browser storage is unavailable.
  }

  categoryFilter.addEventListener("change", displayProducts);
  productSearch.addEventListener("input", displayProducts);
  displayProducts();
  displaySelection();
}

/* Search and category are combined. Buttons support mouse and keyboard. */
function displayProducts() {
  const category = categoryFilter.value;
  const keywords = productSearch.value.toLowerCase().trim().split(/\s+/);
  const visible = products.filter((product) => {
    const text = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    return (!category || product.category === category) &&
      keywords.every((keyword) => text.includes(keyword));
  });

  productsContainer.innerHTML = visible.map((product) => `
    <article class="product-card">
      <button class="product-select" type="button" data-product="${product.id}"
        aria-pressed="${selectedIds.has(product.id)}">
        <img loading="lazy" alt="">
        <span class="product-info"><strong></strong><span></span></span>
      </button>
      <details><summary>Product details</summary><p></p></details>
    </article>
  `).join("") || '<p class="placeholder-message">No matching products.</p>';

  productsContainer.querySelectorAll(".product-card").forEach((card, index) => {
    const product = visible[index];
    card.querySelector("img").src = product.image;
    card.querySelector("strong").textContent = product.name;
    card.querySelector(".product-info > span").textContent = product.brand;
    card.querySelector("details p").textContent = product.description;
    card.querySelector("summary").setAttribute("aria-label", `Product details for ${product.name}`);
    card.querySelector("button").addEventListener("click", () => toggleProduct(product.id));
  });
}

function toggleProduct(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateSelection();
}

/* Update the existing cards so focus and open descriptions stay in place. */
function updateSelection() {
  try {
    localStorage.setItem(selectionKey, JSON.stringify([...selectedIds]));
  } catch {
    // Keep the in-memory selection if saving fails.
  }
  productsContainer.querySelectorAll(".product-select").forEach((button) => {
    button.setAttribute("aria-pressed", selectedIds.has(Number(button.dataset.product)));
  });
  displaySelection();
}

function displaySelection() {
  selectedProductsList.replaceChildren();
  if (!selectedIds.size) {
    const empty = document.createElement("li");
    empty.textContent = "No products selected.";
    selectedProductsList.append(empty);
  }

  products.filter(({ id }) => selectedIds.has(id)).forEach((product) => {
    const item = document.createElement("li");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${product.name}`);
    remove.addEventListener("click", () => {
      const index = [...selectedProductsList.children].indexOf(item);
      toggleProduct(product.id);
      const next = selectedProductsList.children[index] || selectedProductsList.lastElementChild;
      (next?.querySelector("button") || productSearch).focus();
    });
    item.append(product.name, remove);
    selectedProductsList.append(item);
  });

  clearProducts.disabled = !selectedIds.size;
  updateChatControls();
}

clearProducts.addEventListener("click", () => {
  selectedIds.clear();
  updateSelection();
  productSearch.focus();
});

/* Match the layout to the browser's preferred language on page load. */
const rtlToggle = document.getElementById("rtlToggle");

function usesRightToLeft(language) {
  try {
    const locale = new Intl.Locale(language);
    const direction = locale.getTextInfo?.()?.direction;
    if (direction) return direction === "rtl";

    // Older browsers can still infer the script from the locale.
    const rtlScripts = /^(Adlm|Arab|Hebr|Mand|Mend|Nkoo|Rohg|Samr|Syrc|Thaa|Yezi)$/;
    return rtlScripts.test(locale.maximize().script);
  } catch {
    return false;
  }
}

function setDirection(rightToLeft) {
  document.documentElement.dir = rightToLeft ? "rtl" : "ltr";
  rtlToggle.checked = rightToLeft;
}

setDirection(usesRightToLeft(navigator.languages?.[0] || navigator.language));
rtlToggle.addEventListener("change", () => setDirection(rtlToggle.checked));

function updateChatControls() {
  generateRoutine.disabled = waiting || !selectedIds.size;
  userInput.disabled = waiting || !messages.length;
  sendBtn.disabled = userInput.disabled;
}

/* Use text nodes and safe links for the Markdown the advisor commonly returns. */
function renderInline(parent, text, citations) {
  const tokens = /\\([\\`*_{}\[\]()#+\-.!>|])|`([^`]+)`|\uE000(\d+)\uE001|\[([^\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)|(\*\*\*|___|\*\*|__|~~|\*|_)(\S(?:.*?\S)?)\6/g;
  let position = 0;

  for (const match of text.matchAll(tokens)) {
    const [token, escaped, code, citationIndex, label, url, marker, emphasis] = match;
    parent.append(text.slice(position, match.index));
    position = match.index + token.length;

    if (escaped) {
      parent.append(escaped);
    } else if (code) {
      const element = document.createElement("code");
      element.textContent = code;
      parent.append(element);
    } else if (citationIndex !== undefined || url) {
      const citation = citations[Number(citationIndex)];
      if (!citation && !url) {
        parent.append(token);
        continue;
      }
      const link = document.createElement("a");
      link.href = citation?.url || url;
      link.textContent = citation?.label || label;
      if (citation?.title) link.title = citation.title;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    } else {
      const tag = marker === "~~" ? "del" : marker.length > 1 ? "strong" : "em";
      const element = document.createElement(tag);
      const inner = marker.length === 3 ? document.createElement("em") : element;
      renderInline(inner, emphasis, citations);
      if (inner !== element) element.append(inner);
      parent.append(element);
    }
  }

  parent.append(text.slice(position));
}

function renderAdvisorMessage(parent, content, annotations) {
  const sources = annotations.filter(({ type }) => type === "url_citation")
    .map((annotation) => annotation.url_citation || annotation)
    .sort((a, b) => a.start_index - b.start_index);
  const citations = [];
  let markdown = "";
  let position = 0;
  const characters = Array.from(content);

  // Keep Unicode citation offsets aligned with the original reply.
  for (const { start_index: start, end_index: end, url, title } of sources) {
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < position || end <= start || end > characters.length ||
        typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;

    let hostname;
    try {
      hostname = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      continue;
    }

    const citedText = characters.slice(start, end).join("");
    const markdownLabel = citedText.match(/\[([^\]]+)\]\(https?:\/\//i)?.[1];
    const plainLabel = /^[^\[\](){}<>]+$/.test(citedText) && !/https?:/i.test(citedText)
      ? citedText.trim()
      : "";
    const label = markdownLabel || plainLabel || title || hostname;
    markdown += characters.slice(position, start).join("");
    markdown += `\uE000${citations.length}\uE001`;
    citations.push({ url, title, label });
    position = end;
  }
  markdown += characters.slice(position).join("");

  let list = null;
  let paragraph = null;
  let codeBlock = null;
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const text = line.trim();
    const fence = /^(\x60{3,}|~{3,})/.test(text);
    if (fence || codeBlock) {
      list = null;
      paragraph = null;
      if (!fence) {
        codeBlock.textContent += `${line}\n`;
      } else if (codeBlock) {
        codeBlock = null;
      } else {
        const pre = document.createElement("pre");
        codeBlock = document.createElement("code");
        pre.append(codeBlock);
        parent.append(pre);
      }
      continue;
    }

    const heading = text.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    const item = text.match(/^(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    const rule = /^(?:-\s*){3,}$|^(?:\*\s*){3,}$|^(?:_\s*){3,}$/.test(text);

    if (item && !rule) {
      paragraph = null;
      const tag = item[2] ? "ol" : "ul";
      if (list?.localName !== tag) {
        list = document.createElement(tag);
        if (item[2]) list.start = Number(item[2]);
        parent.append(list);
      }
      const element = document.createElement("li");
      renderInline(element, item[3], citations);
      list.append(element);
      continue;
    }

    list = null;
    if (!text || rule || heading || /^>\s?/.test(text)) {
      paragraph = null;
      if (!text) continue;
      const tag = rule ? "hr" : heading ? `h${Math.min(6, heading[1].length + 2)}` : "blockquote";
      const element = document.createElement(tag);
      if (!rule) renderInline(element, heading ? heading[2] : text.replace(/^>\s?/, ""), citations);
      parent.append(element);
      continue;
    }

    if (!paragraph) {
      paragraph = document.createElement("p");
      parent.append(paragraph);
    } else {
      paragraph.append(document.createElement("br"));
    }
    renderInline(paragraph, text, citations);
  }
}

function addMessage(label, content, annotations = []) {
  const message = document.createElement("div");
  message.className = "chat-message";
  message.dir = "auto";
  const author = document.createElement("strong");
  author.className = "chat-author";
  author.textContent = label;
  message.append(author);

  if (label === "Advisor") {
    renderAdvisorMessage(message, content, annotations);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    message.append(paragraph);
  }

  chatWindow.append(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Only save turns after a successful reply, so a failed request can be retried. */
async function askAdvisor(request, newRoutine) {
  if (!workerUrl) {
    chatStatus.textContent = "Add your Cloudflare Worker URL in script.js to enable the advisor.";
    return false;
  }

  waiting = true;
  updateChatControls();
  chatStatus.textContent = "Waiting for the advisor…";

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: request }),
      signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new Error("Worker request failed");
    const data = await response.json();
    const reply = data.choices?.[0]?.message;
    if (typeof reply?.content !== "string" || !reply.content.trim()) {
      throw new Error("Missing advisor reply");
    }

    if (newRoutine) chatWindow.replaceChildren();
    const prompt = request[request.length - 1].content;
    addMessage("You", newRoutine ? "Build a routine with my selected products." : prompt);
    addMessage("Advisor", reply.content, Array.isArray(reply.annotations) ? reply.annotations : []);
    messages = [...request, { role: "assistant", content: reply.content }];
    chatStatus.textContent = "";
    return true;
  } catch {
    chatStatus.textContent = "Couldn’t reach the advisor or read its reply. Try again.";
    return false;
  } finally {
    waiting = false;
    updateChatControls();
  }
}

generateRoutine.addEventListener("click", async () => {
  const selected = products.filter(({ id }) => selectedIds.has(id))
    .map(({ name, brand, category, description }) => ({ name, brand, category, description }));
  const prompt = `Build a routine using this product JSON:\n${JSON.stringify(selected)}`;
  if (await askAdvisor([advisor, { role: "user", content: prompt }], true)) userInput.focus();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = userInput.value.trim();
  if (!content || waiting || !messages.length) return;
  if (await askAdvisor([...messages, { role: "user", content }], false)) {
    userInput.value = "";
  }
  userInput.focus();
});

loadProducts();
