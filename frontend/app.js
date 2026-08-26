import { formatOfficialDate, validateTenderCode, validateApiUrl } from './view-utils.js';

const DEFAULT_API_URL = 'https://licita-control-api.alangarcia-apr.workers.dev';
const API_STORAGE_KEY = 'licita-control-api-url';
const byId = (id) => document.getElementById(id);
let apiUrl = DEFAULT_API_URL;
try { apiUrl = validateApiUrl(localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL); } catch { /* Use the trusted default. */ }
let activeRequest;
let currentCode = '';

function setMessage(text, error = false) {
  byId('message').textContent = text;
  byId('message').className = `message${error ? ' error' : ''}`;
  byId('message').hidden = !text;
}

function setApiState(state, label) {
  byId('api-badge').className = `connection-badge ${state}`;
  byId('api-badge').textContent = label;
}

async function requestJson(base, path, signal) {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' }, signal, cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || 'No se pudo completar la consulta. Intenta nuevamente.');
  if (!payload || typeof payload !== 'object') throw new Error('La API devolvió una respuesta inesperada.');
  return payload;
}

async function testServer(base = apiUrl) {
  const health = await requestJson(base, '/health', AbortSignal.timeout(20000));
  if (health.ok !== true) throw new Error('El servidor no confirmó su disponibilidad.');
  if (!health.ticketConfigured) throw new Error('El servidor responde, pero la integración no está configurada.');
  return 'Servidor disponible. El acceso a datos se verifica al consultar una licitación.';
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function fact(label, value) {
  const wrapper = node('div');
  wrapper.append(node('dt', label), node('dd', value ?? 'No informado'));
  return wrapper;
}

function verification(title, detail) {
  const item = node('div', undefined, 'verification pending');
  const body = node('div');
  body.append(node('strong', title), node('small', detail));
  item.append(node('i'), body);
  return item;
}

function renderTender(tender, meta) {
  currentCode = tender.code;
  byId('detail-status').textContent = tender.status || 'Estado no informado';
  byId('detail-title').textContent = tender.name || 'Nombre no informado';
  byId('detail-code').textContent = `Licitación ${tender.code}`;
  byId('detail-description').textContent = tender.description || 'La fuente no informó una descripción.';
  byId('detail-closing').textContent = formatOfficialDate(tender.dates.closing);
  byId('source-label').textContent = `Fuente: Dirección ChileCompra · Consulta: ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(meta.retrievedAt))} (Santiago)`;
  byId('detail-facts').replaceChildren(
    fact('Organismo comprador', tender.buyer.organization),
    fact('Unidad compradora', tender.buyer.unit),
    fact('Región del comprador', tender.buyer.region),
    fact('Comuna del comprador', tender.buyer.commune),
    fact('Tipo informado', tender.type),
    fact('Moneda informada', tender.currency),
    fact('Apertura técnica', formatOfficialDate(tender.dates.technicalOpening)),
    fact('Apertura económica', formatOfficialDate(tender.dates.economicOpening)),
    fact('Adjudicación informada', formatOfficialDate(tender.dates.award)),
    fact('Días de cierre según API', tender.dates.daysRemaining),
  );
  const checks = [
    verification('Confirma estado y plazo', 'La ficha puede corresponder a un proceso cerrado, adjudicado o modificado. Revisa su estado vigente en Mercado Público.'),
    verification('Lee bases y anexos', 'No se han analizado documentos ni confirmado requisitos de admisibilidad.'),
    verification('Comprueba entrega y capacidad', 'La ubicación del comprador no equivale al lugar de entrega. Contrasta cantidades, plazos y especificaciones.'),
    verification('Revisa tu habilitación', 'La aplicación no conoce los antecedentes, registro ni capacidad de tu empresa.'),
  ];
  const missing = [!tender.name && 'nombre', !tender.description && 'descripción', !tender.dates.closing && 'cierre', !tender.buyer.organization && 'organismo', !tender.items.length && 'productos estructurados'].filter(Boolean);
  if (missing.length) checks.unshift(verification('Datos ausentes en esta respuesta', `Falta verificar: ${missing.join(', ')}. No se completaron con supuestos.`));
  byId('verification-list').replaceChildren(...checks);
  byId('product-count').textContent = `${tender.items.length} ítems · conteo calculado`;
  byId('product-list').replaceChildren(...tender.items.map((product) => {
    const article = node('article', undefined, 'product');
    const top = node('div', undefined, 'product-top');
    top.append(node('strong', product.name || 'Producto sin nombre informado'), node('span', `${product.quantity ?? 'Cantidad no informada'} ${product.unit ?? ''}`.trim()));
    article.append(top, node('p', product.description || 'Descripción no informada'), node('p', `Código: ${product.code ?? 'No informado'} · Categoría: ${product.category ?? 'No informada'}`));
    return article;
  }));
  if (!tender.items.length) byId('product-list').append(node('p', 'Sin productos estructurados en esta respuesta. Revisa las bases.'));
  byId('detalle').hidden = false;
  byId('detail-title').focus();
}

byId('tender-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);
  byId('detalle').hidden = true;
  currentCode = '';
  byId('query-button').disabled = true;
  byId('query-button').textContent = 'Consultando…';
  byId('consulta').setAttribute('aria-busy', 'true');
  try {
    const code = validateTenderCode(byId('tender-code').value);
    byId('tender-code').value = code;
    setMessage('Consultando la fuente oficial…');
    setApiState('neutral', 'Consulta en curso');
    const payload = await requestJson(apiUrl, `/api/licitacion/${encodeURIComponent(code)}`, controller.signal);
    if (activeRequest !== controller) return;
    if (payload.data?.code !== code || !payload.data.buyer || !payload.data.dates || !Array.isArray(payload.data.items) || !Number.isFinite(Date.parse(payload.meta?.retrievedAt))) throw new Error('La API devolvió una ficha incompleta o incompatible. Vuelve a intentar.');
    renderTender(payload.data, payload.meta);
    setApiState('connected', 'Consulta oficial verificada');
    setMessage(`Información oficial recibida para ${code}. Consulta el estado antes de preparar una oferta.`);
  } catch (error) {
    if (activeRequest !== controller) return;
    setApiState('neutral', 'Consulta no completada');
    setMessage(controller.signal.aborted ? 'La consulta tardó demasiado. Intenta nuevamente.' : error instanceof Error ? error.message : 'No fue posible consultar la licitación.', true);
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      byId('query-button').disabled = false;
      byId('query-button').textContent = 'Consultar ahora';
      byId('consulta').removeAttribute('aria-busy');
    }
  }
});

byId('close-detail').addEventListener('click', () => { byId('detalle').hidden = true; byId('tender-code').focus(); });
byId('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentCode); setMessage('Código copiado. Búscalo en Mercado Público.'); }
  catch { setMessage('No se pudo copiar. Selecciona el código visible en la ficha.', true); }
});
byId('open-settings').addEventListener('click', () => { byId('api-url').value = apiUrl; byId('settings-status').textContent = ''; byId('settings-dialog').showModal(); });
byId('settings-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  try {
    const next = validateApiUrl(byId('api-url').value);
    activeRequest?.abort();
    activeRequest = undefined;
    byId('query-button').disabled = false;
    byId('query-button').textContent = 'Consultar ahora';
    byId('consulta').removeAttribute('aria-busy');
    apiUrl = next;
    try { localStorage.setItem(API_STORAGE_KEY, next); } catch { /* Still usable for this page session. */ }
    byId('detalle').hidden = true;
    byId('settings-dialog').close();
    setMessage('Conexión guardada. Consulta un código para verificar el acceso a datos.');
    setApiState('neutral', 'Servidor sin verificar');
  } catch (error) { byId('settings-status').textContent = error.message; }
});
byId('test-api').addEventListener('click', async () => {
  byId('test-api').disabled = true;
  byId('settings-status').textContent = 'Verificando servidor…';
  try { byId('settings-status').textContent = await testServer(validateApiUrl(byId('api-url').value)); }
  catch (error) { byId('settings-status').textContent = error instanceof Error ? error.message : 'No fue posible conectar.'; }
  finally { byId('test-api').disabled = false; }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(() => { /* Online use remains available. */ }); });
}
// Health is not upstream authentication or a live data result.
const initialApiUrl = apiUrl;
void testServer(initialApiUrl).then(() => {
  if (!activeRequest && apiUrl === initialApiUrl) setApiState('neutral', 'Servidor disponible · consulta pendiente');
}).catch(() => { if (!activeRequest && apiUrl === initialApiUrl) setApiState('disconnected', 'Servidor no verificado · intenta consultar'); });
