const DEFAULT_API_URL = "http://localhost:8787";
const API_STORAGE_KEY = "licita-control-api-url";

const elements = {
  apiBadge: document.querySelector("#api-badge"),
  apiUrl: document.querySelector("#api-url"),
  dialog: document.querySelector("#settings-dialog"),
  facts: document.querySelector("#result-facts"),
  form: document.querySelector("#search-form"),
  items: document.querySelector("#result-items"),
  itemsCount: document.querySelector("#items-count"),
  message: document.querySelector("#message"),
  openSettings: document.querySelector("#open-settings"),
  result: document.querySelector("#resultado"),
  resultCode: document.querySelector("#result-code"),
  resultState: document.querySelector("#result-state"),
  resultTitle: document.querySelector("#result-title"),
  searchButton: document.querySelector("#search-button"),
  settingsForm: document.querySelector("#settings-form"),
  tenderCode: document.querySelector("#tender-code"),
  testApi: document.querySelector("#test-api"),
};

function getApiUrl() {
  return (localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL).replace(/\/$/, "");
}

function setMessage(text, type = "info") {
  elements.message.textContent = text;
  elements.message.className = `message ${type === "error" ? "error" : ""}`;
  elements.message.hidden = !text;
}

function setApiState(state, text) {
  elements.apiBadge.className = `connection-badge ${state}`;
  elements.apiBadge.textContent = text;
}

async function requestJson(path) {
  const response = await fetch(`${getApiUrl()}${path}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || `La API respondió con estado ${response.status}.`);
  }

  return payload;
}

async function testConnection() {
  setApiState("neutral", "Verificando API…");
  try {
    const health = await requestJson("/health");
    if (!health.ticketConfigured) {
      setApiState("disconnected", "API sin ticket");
      setMessage("El Worker responde, pero falta configurar MERCADO_PUBLICO_TICKET.", "error");
      return false;
    }
    setApiState("connected", "API conectada");
    setMessage("Backend funcionando y ticket configurado.");
    return true;
  } catch (error) {
    setApiState("disconnected", "API no disponible");
    setMessage(error instanceof Error ? error.message : "No fue posible conectar con la API.", "error");
    return false;
  }
}

function formatDate(value) {
  if (!value) return "No informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function renderFacts(tender) {
  const facts = [
    ["Organismo", tender.buyer?.organization],
    ["Unidad compradora", tender.buyer?.unit],
    ["Ubicación", [tender.buyer?.commune, tender.buyer?.region].filter(Boolean).join(", ")],
    ["Cierre", formatDate(tender.dates?.closing)],
    ["Días restantes", tender.dates?.daysRemaining],
    ["Moneda", tender.currency],
    ["Tipo", tender.type],
    ["Adjudicación estimada", formatDate(tender.dates?.award)],
  ];

  elements.facts.replaceChildren(
    ...facts.map(([label, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value === null || value === undefined || value === "" ? "No informado" : String(value);
      wrapper.append(term, detail);
      return wrapper;
    }),
  );
}

function renderItems(items) {
  elements.itemsCount.textContent = `${items.length} ${items.length === 1 ? "ítem" : "ítems"}`;
  if (!items.length) {
    const empty = document.createElement("p");
    empty.textContent = "Mercado Público no informó ítems para este proceso.";
    elements.items.replaceChildren(empty);
    return;
  }

  elements.items.replaceChildren(
    ...items.map((item) => {
      const article = document.createElement("article");
      article.className = "item";
      const header = document.createElement("div");
      header.className = "item-header";
      const title = document.createElement("strong");
      const quantity = document.createElement("span");
      const description = document.createElement("p");
      title.textContent = item.name || "Producto o servicio sin nombre";
      quantity.textContent = [item.quantity, item.unit].filter((value) => value !== null && value !== undefined && value !== "").join(" ");
      description.textContent = item.description || item.category || "Sin descripción informada.";
      header.append(title, quantity);
      article.append(header, description);
      return article;
    }),
  );
}

function renderTender(tender) {
  elements.resultState.textContent = tender.status || "Estado no informado";
  elements.resultTitle.textContent = tender.name || "Licitación sin nombre";
  elements.resultCode.textContent = `Código ${tender.code}`;
  renderFacts(tender);
  renderItems(tender.items || []);
  elements.result.hidden = false;
  elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = elements.tenderCode.value.trim().toUpperCase();
  if (!code) return;

  elements.searchButton.disabled = true;
  elements.searchButton.textContent = "Consultando…";
  elements.result.hidden = true;
  setMessage("Consultando Mercado Público de forma segura…");

  try {
    const payload = await requestJson(`/api/licitacion/${encodeURIComponent(code)}`);
    renderTender(payload.data);
    setMessage(`Licitación ${payload.data.code} cargada correctamente.`);
    setApiState("connected", "API conectada");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "No fue posible cargar la licitación.", "error");
  } finally {
    elements.searchButton.disabled = false;
    elements.searchButton.textContent = "Cargar licitación";
  }
});

elements.openSettings.addEventListener("click", () => {
  elements.apiUrl.value = getApiUrl();
  elements.dialog.showModal();
});

elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "save") return;
  event.preventDefault();
  localStorage.setItem(API_STORAGE_KEY, elements.apiUrl.value.trim().replace(/\/$/, ""));
  elements.dialog.close();
  void testConnection();
});

elements.testApi.addEventListener("click", async () => {
  localStorage.setItem(API_STORAGE_KEY, elements.apiUrl.value.trim().replace(/\/$/, ""));
  await testConnection();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js");
  });
}

void testConnection();

