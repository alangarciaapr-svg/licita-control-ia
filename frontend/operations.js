const PIPELINE_KEY = 'licita-control-pipeline-v1';
const CATALOG_KEY = 'licita-control-catalog-v1';
const DB_NAME = 'licita-control-local-v1';
const DOCUMENT_STORE = 'documents';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

let initialized = false;
let connectorAvailable = false;
let documentDatabase;

const byId = (id) => document.getElementById(id);

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [];
  } catch { return []; }
}

function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setInlineMessage(id, text, error = false) {
  const element = byId(id);
  element.textContent = text;
  element.className = `message${error ? ' error' : ''}`;
  element.hidden = !text;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return 'Precio no informado';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

function normalizedText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
}

export function calculateCatalogCoverage(tenderItems, catalogItems) {
  const matches = tenderItems.flatMap((item, itemIndex) => {
    const searchable = normalizedText([item.name, item.description, item.category].filter(Boolean).join(' '));
    const product = catalogItems.find((entry) => {
      const terms = [...String(entry.keywords || '').split(','), entry.name].map((term) => normalizedText(term.trim())).filter((term) => term.length >= 3);
      return terms.some((term) => searchable.includes(term));
    });
    return product ? [{ itemIndex, itemName: item.name || 'Ítem sin nombre', productId: product.id, productName: product.name, price: product.price }] : [];
  });
  return { matched: matches.length, matches, total: tenderItems.length };
}

export function catalogCoverageForTender(tenderItems) {
  return calculateCatalogCoverage(tenderItems, readList(CATALOG_KEY));
}

function stageLabel(value) {
  return ({ analisis: 'En análisis', preparacion: 'Preparando oferta', revision: 'En revisión', lista: 'Lista para enviar', enviada: 'Enviada' })[value] || 'En análisis';
}

function renderMetrics(items) {
  byId('metric-analysis').textContent = String(items.filter((item) => item.stage === 'analisis').length);
  byId('metric-preparing').textContent = String(items.filter((item) => item.stage === 'preparacion' || item.stage === 'revision').length);
  byId('metric-ready').textContent = String(items.filter((item) => item.stage === 'lista').length);
  byId('metric-sent').textContent = String(items.filter((item) => item.stage === 'enviada').length);
}

function renderPipeline() {
  const items = readList(PIPELINE_KEY).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  renderMetrics(items);
  byId('pipeline-count').textContent = `${items.length} expediente${items.length === 1 ? '' : 's'}`;
  const cards = items.map((item) => {
    const article = node('article', undefined, 'pipeline-item');
    const identity = node('div');
    identity.append(node('strong', item.name || 'Licitación sin nombre'), node('small', `${item.code} · ${item.buyer || 'Comprador por verificar'}${Number.isFinite(item.score) ? ` · Match ${item.score}/100` : ''}`));
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Estado de ${item.code}`);
    for (const value of ['analisis', 'preparacion', 'revision', 'lista', 'enviada']) {
      const option = node('option', stageLabel(value));
      option.value = value;
      option.selected = item.stage === value;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const next = readList(PIPELINE_KEY).map((entry) => entry.code === item.code ? { ...entry, stage: select.value, updatedAt: new Date().toISOString() } : entry);
      writeList(PIPELINE_KEY, next);
      renderPipeline();
    });
    const actions = node('div', undefined, 'connector-actions');
    const open = node('button', 'Abrir expediente', 'view-button');
    open.type = 'button';
    open.addEventListener('click', () => window.dispatchEvent(new CustomEvent('licita:open-tender', { detail: { code: item.code } })));
    actions.append(open);
    if (item.stage === 'lista') {
      const send = node('button', 'Preparar conector', 'ghost-button');
      send.type = 'button';
      send.addEventListener('click', () => {
        window.postMessage({ source: 'licita-control-app', type: 'PREPARE_JOB', payload: { code: item.code, stage: item.stage } }, location.origin);
        setConnectorState(connectorAvailable, connectorAvailable ? `Paquete ${item.code} enviado al conector.` : 'Instala y activa el conector antes de preparar el envío.');
      });
      actions.append(send);
    }
    article.append(identity, select, actions);
    return article;
  });
  byId('pipeline-list').replaceChildren(...cards);
  if (!cards.length) byId('pipeline-list').append(node('p', 'Aún no hay expedientes. En el radar, elige “Crear expediente” en una oportunidad.', 'empty-state'));
}

export function addOpportunityToPipeline(opportunity, match) {
  const items = readList(PIPELINE_KEY);
  const record = {
    buyer: opportunity.buyer || null,
    closing: opportunity.closing || null,
    code: opportunity.code,
    name: opportunity.name || null,
    score: match?.score ?? null,
    stage: 'analisis',
    updatedAt: new Date().toISOString(),
  };
  const existing = items.find((item) => item.code === record.code);
  writeList(PIPELINE_KEY, existing ? items.map((item) => item.code === record.code ? { ...record, stage: item.stage } : item) : [record, ...items]);
  if (initialized) renderPipeline();
}

function renderCatalog() {
  const items = readList(CATALOG_KEY);
  byId('catalog-count').textContent = `${items.length} producto${items.length === 1 ? '' : 's'}`;
  const cards = items.map((item) => {
    const article = node('article', undefined, 'asset-item');
    const identity = node('div');
    identity.append(node('strong', item.name), node('small', `${item.sku || 'Sin SKU'} · Coincidencias: ${item.keywords || item.name}`));
    article.append(identity, node('span', formatMoney(item.price), 'asset-price'));
    const remove = node('button', 'Eliminar', 'remove-button');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      writeList(CATALOG_KEY, items.filter((entry) => entry.id !== item.id));
      renderCatalog();
      window.dispatchEvent(new CustomEvent('licita:catalog-changed'));
    });
    article.append(remove);
    return article;
  });
  byId('catalog-list').replaceChildren(...cards);
  if (!cards.length) byId('catalog-list').append(node('p', 'Carga tus productos o servicios para reutilizar precios, SKU y coincidencias.', 'empty-state'));
}

function openDocumentDatabase() {
  if (documentDatabase) return documentDatabase;
  documentDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No fue posible abrir la bóveda local.'));
  });
  return documentDatabase;
}

async function documentOperation(mode, value) {
  const db = await openDocumentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, mode === 'list' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(DOCUMENT_STORE);
    const request = mode === 'list' ? store.getAll() : mode === 'put' ? store.put(value) : store.delete(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('La bóveda local no pudo completar la operación.'));
  });
}

async function renderDocuments() {
  try {
    const items = await documentOperation('list');
    items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    byId('document-count').textContent = `${items.length} documento${items.length === 1 ? '' : 's'}`;
    const cards = items.map((item) => {
      const article = node('article', undefined, 'asset-item');
      const identity = node('div');
      identity.append(node('strong', item.name), node('small', `${item.category} · ${(item.size / 1024).toFixed(0)} KB · Vence: ${item.expiresAt || 'No informado'}`));
      const download = node('a', 'Descargar', 'view-button');
      download.href = URL.createObjectURL(item.file);
      download.download = item.name;
      const remove = node('button', 'Eliminar', 'remove-button');
      remove.type = 'button';
      remove.addEventListener('click', async () => { await documentOperation('delete', item.id); await renderDocuments(); });
      article.append(identity, download, remove);
      return article;
    });
    byId('document-list').replaceChildren(...cards);
    if (!cards.length) byId('document-list').append(node('p', 'Guarda certificados, declaraciones y antecedentes recurrentes en este dispositivo.', 'empty-state'));
  } catch (error) {
    setInlineMessage('document-message', error instanceof Error ? error.message : 'No fue posible leer la bóveda local.', true);
  }
}

function setConnectorState(connected, label) {
  connectorAvailable = connected;
  byId('connector-badge').className = `connection-badge ${connected ? 'connected' : 'neutral'}`;
  byId('connector-badge').textContent = connected ? 'Conector disponible' : 'Conector no detectado';
  byId('connector-status').className = `connector-status${connected ? ' connected' : ''}`;
  byId('connector-status').querySelector('span').textContent = label;
}

function requestConnectorStatus() {
  window.postMessage({ source: 'licita-control-app', type: 'GET_STATUS' }, location.origin);
  setTimeout(() => { if (!connectorAvailable) setConnectorState(false, 'La extensión no respondió. Instálala o vuelve a cargarla.'); }, 1200);
}

function setupTabs() {
  const buttons = [...document.querySelectorAll('[data-workspace-tab]')];
  for (const button of buttons) button.addEventListener('click', () => {
    const target = button.dataset.workspaceTab;
    for (const current of buttons) {
      const selected = current === button;
      current.classList.toggle('active', selected);
      current.setAttribute('aria-selected', String(selected));
      byId(`workspace-${current.dataset.workspaceTab}`).hidden = !selected;
    }
  });
}

export function initOperations() {
  initialized = true;
  setupTabs();
  renderPipeline();
  renderCatalog();
  void renderDocuments();

  byId('catalog-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = byId('catalog-name').value.trim();
    const priceValue = byId('catalog-price').value.trim();
    const price = priceValue ? Number(priceValue) : null;
    if (!name || (price !== null && (!Number.isFinite(price) || price < 0))) return setInlineMessage('catalog-message', 'Revisa el nombre y el precio referencial.', true);
    const items = readList(CATALOG_KEY);
    items.unshift({ id: crypto.randomUUID(), name, sku: byId('catalog-sku').value.trim(), price, keywords: byId('catalog-keywords').value.trim(), updatedAt: new Date().toISOString() });
    writeList(CATALOG_KEY, items);
    form.reset();
    setInlineMessage('catalog-message', 'Producto guardado localmente.');
    renderCatalog();
    window.dispatchEvent(new CustomEvent('licita:catalog-changed'));
  });

  byId('document-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = byId('document-file').files?.[0];
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) return setInlineMessage('document-message', 'El documento supera el máximo local de 10 MB.', true);
    try {
      await documentOperation('put', { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, category: byId('document-category').value, expiresAt: byId('document-expiry').value || null, file, updatedAt: new Date().toISOString() });
      form.reset();
      setInlineMessage('document-message', 'Documento guardado únicamente en este dispositivo.');
      await renderDocuments();
    } catch (error) { setInlineMessage('document-message', error instanceof Error ? error.message : 'No se pudo guardar el documento.', true); }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'licita-control-extension') return;
    if (event.data.type === 'STATUS') setConnectorState(true, event.data.payload?.marketplaceOpen ? 'Extensión activa · Mercado Público detectado' : 'Extensión activa · inicia sesión en Mercado Público una vez');
    if (event.data.type === 'PACKAGE_ACCEPTED') setConnectorState(true, `Paquete ${event.data.payload?.code || ''} preparado localmente.`);
  });
  byId('connector-test').addEventListener('click', requestConnectorStatus);
  requestConnectorStatus();
}
