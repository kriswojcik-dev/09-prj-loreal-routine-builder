/* Paste the class or assignment Worker URL here. The Worker holds the API key. */
const workerUrl = "loreal-worker.kwojcik4.workers.dev";
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

document.getElementById("rtlToggle").addEventListener("change", (event) => {
  document.documentElement.dir = event.target.checked ? "rtl" : "ltr";
});

function updateChatControls() {
  generateRoutine.disabled = waiting || !selectedIds.size;
  userInput.disabled = waiting || !messages.length;
  sendBtn.disabled = userInput.disabled;
}

/* Add a message as text, with clickable inline citations when provided. */
function addMessage(label, content, annotations = []) {
  const line = document.createElement("p");
  line.dir = "auto";
  const heading = document.createElement("strong");
  heading.textContent = `${label}: `;
  line.append(heading);
  let position = 0;
  const citations = annotations.filter(({ type }) => type === "url_citation")
    .map((annotation) => annotation.url_citation || annotation)
    .sort((a, b) => a.start_index - b.start_index);
  for (const citation of citations) {
    const { start_index: start, end_index: end, url, title } = citation;
    if (!Number.isInteger(start) || !Number.isInteger(end) ||
        start < position || end <= start || end > content.length ||
        !/^https?:\/\//i.test(url)) continue;
    const link = document.createElement("a");
    link.href = url;
    link.textContent = content.slice(start, end);
    if (title) link.title = title;
    line.append(content.slice(position, start), link);
    position = end;
  }
  line.append(content.slice(position));
  chatWindow.append(line);
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
