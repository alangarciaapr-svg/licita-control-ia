const DEFAULT_API_URL = "https://licita-control-api.alangarcia-apr.workers.dev";
const API_STORAGE_KEY = "licita-control-api-url";

const elements = {
  apiBadge: document.querySelector("#api-badge"),
  apiUrl: document.querySelector("#api-url"),
  closeDetail: document.querySelector("#close-detail"),
  detail: document.querySelector("#detalle"),
  detailCode: document.querySelector("#detail-code"),
  detailDescription: document.querySelector("#detail-description"),
  detailFacts: document.querySelector("#detail-facts"),
  detailStatus: document.querySelector("#detail-status"),
  detailTitle: document.querySelector("#detail-title"),
  detailUrgency: document.querySelector("#detail-urgency"),
  dialog: document.querySelector("#settings-dialog"),
  form: document.querySelector("#radar-form"),
  list: document.querySelector("#opportunity-list"),
  message: document.querySelector("#message"),
  nextPage: document.querySelector("#next-page"),
  openSettings: document.querySelector("#open-settings"),
  pageIndicator: document.querySelector("#page-indicator"),
  previousPage: document.querySelector("#previous-page"),
  productCount: document.querySelector("#product-count"),
  productList: document.querySelector("#product-list"),
  query: document.querySelector("#search-query"),
  radarButton: document.querySelector("#radar-button"),
  results: document.querySelector("#radar-results"),
  resultContext: document.querySelector("#result-context"),
  resultCount: document.querySelector("#result-count"),
  region: document.querySelector("#region-filter"),
  settingsForm: document.querySelector("#settings-form"),
  testApi: document.querySelector("#test-api"),
  verificationList: document.querySelector("#verification-list"),
};

const radarState = { page: 1, totalPages: 0 };

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
  const response = await fetch(`${getApiUrl()}${path}`, { headers: { Accept: "application/json" } });
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
      setMessage("El Worker responde, pero falta configurar la integración.", "error");
      return false;
    }
    setApiState("connected", "API conectada");
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

function formatMoney(value, currency = "CLP") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "No informado";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: currency || "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function urgencyInfo(hours) {
  if (hours === null || hours === undefined) return { className: "", label: "Cierre por verificar", short: "Sin cálculo" };
  if (hours <= 0) return { className: "critical", label: "Cierre alcanzado", short: "0 h" };
  if (hours <= 24) return { className: "critical", label: `Cierra en ${hours} h`, short: `${hours} h` };
  if (hours <= 72) return { className: "", label: `Alta urgencia · ${hours} h`, short: `${hours} h` };
  const days = Math.ceil(hours / 24);
  return { className: "", label: `Cierra en ${days} días`, short: `${days} días` };
}

function textOr(value, fallback = "No informado") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function createSignal(text) {
  const signal = document.createElement("span");
  signal.className = "signal";
  signal.textContent = text;
  return signal;
}

function createOpportunity(item) {
  const article = document.createElement("article");
  article.className = "opportunity";

  const top = document.createElement("div");
  top.className = "opportunity-top";
  const code = document.createElement("span");
  code.className = "opportunity-code";
  code.textContent = item.code;
  const urgency = urgencyInfo(item.dates?.hoursRemaining);
  const urgencyChip = document.createElement("span");
  urgencyChip.className = `urgency-chip ${urgency.className}`;
  urgencyChip.textContent = urgency.label;
  top.append(code, urgencyChip);

  const title = document.createElement("h3");
  title.textContent = item.name || "Compra Ágil sin título informado";
  const buyer = document.createElement("p");
  buyer.className = "opportunity-buyer";
  buyer.textContent = [item.buyer?.organization, item.buyer?.region].filter(Boolean).join(" · ") || "Comprador no informado";

  const signals = document.createElement("div");
  signals.className = "signal-row";
  signals.append(
    createSignal(item.call?.label || (item.call?.number ? `Llamado ${item.call.number}` : "Llamado no informado")),
    createSignal(`${item.quoteCount ?? 0} cotizaciones`),
    createSignal(`${item.documents?.length ?? 0} documentos`),
  );

  const footer = document.createElement("div");
  footer.className = "opportunity-footer";
  const budget = document.createElement("div");
  budget.className = "opportunity-budget";
  const budgetLabel = document.createElement("span");
  budgetLabel.textContent = "Presupuesto disponible";
  const budgetValue = document.createElement("strong");
  budgetValue.textContent = formatMoney(item.budget?.amountClp ?? item.budget?.amount, item.budget?.currency);
  budget.append(budgetLabel, budgetValue);
  const button = document.createElement("button");
  button.className = "view-button";
  button.type = "button";
  button.dataset.code = item.code;
  button.textContent = "Evaluar →";
  footer.append(budget, button);

  article.append(top, title, buyer, signals, footer);
  return article;
}

function renderRadar(page) {
  elements.resultCount.textContent = `${page.pagination.totalResults} ${page.pagination.totalResults === 1 ? "oportunidad" : "oportunidades"}`;
  elements.resultContext.textContent = "abiertas según la fuente oficial";
  elements.pageIndicator.textContent = `Página ${page.pagination.page} de ${Math.max(page.pagination.totalPages, 1)}`;
  elements.list.replaceChildren(...page.items.map(createOpportunity));
  if (!page.items.length) {
    const empty = document.createElement("div");
    empty.className = "message";
    empty.textContent = "No hay oportunidades abiertas que coincidan. Prueba con un término más amplio o con Todo Chile.";
    elements.list.replaceChildren(empty);
  }
  radarState.page = page.pagination.page;
  radarState.totalPages = page.pagination.totalPages;
  elements.previousPage.disabled = radarState.page <= 1;
  elements.nextPage.disabled = radarState.page >= radarState.totalPages;
  elements.results.hidden = false;
}

async function loadRadar(page = 1) {
  elements.radarButton.disabled = true;
  elements.radarButton.textContent = "Buscando…";
  setMessage("Consultando oportunidades abiertas en la fuente oficial…");
  const params = new URLSearchParams({ pagina: String(page) });
  const query = elements.query.value.trim();
  if (query) params.set("q", query);
  if (elements.region.value) params.set("region", elements.region.value);

  try {
    const payload = await requestJson(`/api/compra-agil?${params.toString()}`);
    renderRadar(payload.data);
    setMessage(`Radar actualizado: ${payload.data.pagination.totalResults} oportunidades encontradas.`);
    setApiState("connected", "API conectada");
  } catch (error) {
    elements.results.hidden = true;
    setMessage(error instanceof Error ? error.message : "No fue posible cargar el radar.", "error");
  } finally {
    elements.radarButton.disabled = false;
    elements.radarButton.textContent = "Buscar ahora";
  }
}

function createFact(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = textOr(value);
  wrapper.append(term, detail);
  return wrapper;
}

function createVerification(title, detail, pending = false) {
  const item = document.createElement("div");
  item.className = `verification ${pending ? "pending" : ""}`;
  const dot = document.createElement("i");
  const body = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = title;
  small.textContent = detail;
  body.append(strong, small);
  item.append(dot, body);
  return item;
}

function renderProducts(products) {
  elements.productCount.textContent = `${products.length} ${products.length === 1 ? "ítem" : "ítems"}`;
  if (!products.length) {
    const empty = document.createElement("p");
    empty.textContent = "La fuente oficial no informó productos estructurados.";
    elements.productList.replaceChildren(empty);
    return;
  }
  elements.productList.replaceChildren(
    ...products.map((product) => {
      const article = document.createElement("article");
      article.className = "product";
      const top = document.createElement("div");
      top.className = "product-top";
      const name = document.createElement("strong");
      name.textContent = product.name || "Producto o servicio sin nombre";
      const quantity = document.createElement("span");
      quantity.textContent = [product.quantity, product.unit].filter((value) => value !== null && value !== undefined).join(" ");
      const description = document.createElement("p");
      description.textContent = product.description || `Código de producto: ${product.code || "no informado"}`;
      top.append(name, quantity);
      article.append(top, description);
      return article;
    }),
  );
}

function renderDetail(item) {
  const urgency = urgencyInfo(item.dates?.hoursRemaining);
  elements.detailStatus.textContent = item.status?.label || item.status?.code || "Estado no informado";
  elements.detailTitle.textContent = item.name || "Compra Ágil sin título informado";
  elements.detailCode.textContent = `Código ${item.code}`;
  elements.detailDescription.textContent = item.description || "La fuente oficial no informó una descripción adicional.";
  elements.detailUrgency.replaceChildren();
  const urgencyLabel = document.createElement("span");
  urgencyLabel.textContent = "URGENCIA CALCULADA";
  const urgencyValue = document.createElement("strong");
  urgencyValue.textContent = urgency.label;
  const urgencySource = document.createElement("small");
  urgencySource.textContent = `Cierre oficial: ${formatDate(item.dates?.closing)}`;
  elements.detailUrgency.append(urgencyLabel, urgencyValue, urgencySource);

  elements.detailFacts.replaceChildren(
    createFact("Organismo", item.buyer?.organization),
    createFact("Unidad compradora", item.buyer?.unit),
    createFact("Región", item.buyer?.region),
    createFact("Presupuesto", formatMoney(item.budget?.amountClp ?? item.budget?.amount, item.budget?.currency)),
    createFact("Convocatoria", item.call?.label),
    createFact("Cotizaciones recibidas", item.quoteCount ?? 0),
    createFact("Entrega", item.delivery?.address),
    createFact("Plazo de entrega", item.delivery?.days !== null && item.delivery?.days !== undefined ? `${item.delivery.days} días` : null),
  );

  const checks = [
    createVerification("Proceso publicado", "Dato oficial: la oportunidad aparece abierta para recibir cotizaciones."),
    createVerification(
      item.call?.number === 1 ? "Confirma condición EMT" : "Revisa quién puede participar",
      item.call?.number === 1 ? "El primer llamado está dirigido a Empresas de Menor Tamaño y proveedores locales." : "Verifica las condiciones del llamado vigente en Mercado Público.",
      true,
    ),
    createVerification("Confirma Registro de Proveedores hábil", "La aplicación todavía no conoce el estado legal o tributario de tu empresa.", true),
  ];
  if (item.flags?.environmentalRequirements) {
    checks.push(createVerification("Incluye requisito medioambiental", "Dato oficial informado por el proceso; revisa su respaldo antes de cotizar."));
  }
  if (item.flags?.socialEconomicRequirements) {
    checks.push(createVerification("Incluye requisito de impacto social o económico", "Dato oficial informado por el proceso."));
  }
  if (item.documents?.length) {
    checks.push(createVerification(`${item.documents.length} documentos informados`, "Revísalos en Mercado Público antes de enviar la cotización.", true));
  }
  elements.verificationList.replaceChildren(...checks);
  renderProducts(item.products || []);
  elements.detail.hidden = false;
  elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadDetail(code) {
  setMessage(`Cargando evidencia oficial de ${code}…`);
  try {
    const payload = await requestJson(`/api/compra-agil/${encodeURIComponent(code)}`);
    renderDetail(payload.data);
    setMessage(`Compra Ágil ${payload.data.code} lista para evaluación.`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "No fue posible cargar el detalle.", "error");
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadRadar(1);
});

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-code]");
  if (button?.dataset.code) void loadDetail(button.dataset.code);
});

elements.previousPage.addEventListener("click", () => void loadRadar(Math.max(1, radarState.page - 1)));
elements.nextPage.addEventListener("click", () => void loadRadar(Math.min(radarState.totalPages, radarState.page + 1)));
elements.closeDetail.addEventListener("click", () => {
  elements.detail.hidden = true;
  document.querySelector("#radar").scrollIntoView({ behavior: "smooth", block: "start" });
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
  void testConnection().then((connected) => connected && loadRadar(1));
});

elements.testApi.addEventListener("click", async () => {
  localStorage.setItem(API_STORAGE_KEY, elements.apiUrl.value.trim().replace(/\/$/, ""));
  await testConnection();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}

void testConnection().then((connected) => connected && loadRadar(1));
