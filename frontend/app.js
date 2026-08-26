import { buildCommercialProfile, formatOfficialDate, scoreOpportunity, validateTenderCode, validateAgileCode, validateApiUrl } from './view-utils.js';
import { addOpportunityToPipeline, catalogCoverageForTender, initOperations } from './operations.js';

const DEFAULT_API_URL = 'https://licita-control-api.alangarcia-apr.workers.dev';
const API_STORAGE_KEY = 'licita-control-api-url';
const RADAR_PROFILE_STORAGE_KEY = 'licita-control-radar-profile-v1';
const byId = (id) => document.getElementById(id);
let apiUrl = DEFAULT_API_URL;
try { apiUrl = validateApiUrl(localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL); } catch { /* Use the trusted default. */ }
let activeRequest;
let radarRequest;
let currentCode = '';
let currentAgileCode = '';
let currentTenderItems = [];

function setMessage(text, error = false) {
  byId('message').textContent = text;
  byId('message').className = `message${error ? ' error' : ''}`;
  byId('message').hidden = !text;
}

function setApiState(state, label) {
  byId('api-badge').className = `connection-badge ${state}`;
  byId('api-badge').textContent = label;
}

function setAgileMessage(text, error = false) {
  byId('agile-message').textContent = text;
  byId('agile-message').className = `message${error ? ' error' : ''}`;
  byId('agile-message').hidden = !text;
}

function setRadarMessage(text, error = false) {
  byId('radar-message').textContent = text;
  byId('radar-message').className = `message${error ? ' error' : ''}`;
  byId('radar-message').hidden = !text;
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

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderOpportunities(items, profile, payload) {
  const referenceDate = payload.data.date;
  const ranked = items
    .map((opportunity) => ({ opportunity, match: scoreOpportunity(opportunity, profile, referenceDate) }))
    .filter(({ match }) => match.eligible)
    .sort((left, right) => right.match.score - left.match.score || (left.match.daysRemaining ?? 999) - (right.match.daysRemaining ?? 999));

  const cards = ranked.slice(0, 40).map(({ opportunity, match }) => {
    const article = node('article', undefined, 'opportunity');
    const top = node('div', undefined, 'opportunity-top');
    const identity = node('div');
    identity.append(node('span', opportunity.code, 'opportunity-code'), node('h3', opportunity.name || 'Nombre no informado'));
    const score = node('span', undefined, 'match-score');
    score.append(node('strong', String(match.score)), document.createTextNode('/100'));
    top.append(identity, score);
    const signals = node('div', undefined, 'signal-row');
    for (const keyword of match.matchedKeywords) signals.append(node('span', `Coincide: ${keyword}`, 'signal'));
    for (const region of match.matchedRegions) signals.append(node('span', `Región: ${region}`, 'signal'));
    if (match.daysRemaining !== null) signals.append(node('span', `${match.daysRemaining} días hasta cierre`, 'signal'));
    const footer = node('div', undefined, 'opportunity-footer');
    const source = node('p', opportunity.buyer || 'Organismo no informado en el listado', 'opportunity-buyer');
    const button = node('button', 'Crear expediente →', 'view-button');
    button.type = 'button';
    button.addEventListener('click', () => {
      addOpportunityToPipeline(opportunity, match);
      byId('tender-code').value = opportunity.code;
      byId('tender-form').requestSubmit();
    });
    footer.append(source, button);
    article.append(top, signals, footer);
    return article;
  });

  byId('opportunity-list').replaceChildren(...cards);
  if (!cards.length) byId('opportunity-list').append(node('p', 'No hubo coincidencias con las reglas actuales. Ajusta tu perfil o vuelve a actualizar más tarde.', 'message'));
  byId('radar-summary').textContent = `${ranked.length} de ${items.length} oportunidades coinciden`;
  byId('radar-source').textContent = `Cálculo determinista · ${profile.keywords.length} términos activos · máximo 40 resultados visibles`;
  byId('radar-date').textContent = referenceDate;
  byId('radar-results').hidden = false;
  byId('radar-badge').className = 'connection-badge connected';
  byId('radar-badge').textContent = `${ranked.length} priorizadas`;
}

async function runRadar(profile, automatic = false) {
  radarRequest?.abort();
  const controller = new AbortController();
  radarRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);
  byId('radar-button').disabled = true;
  byId('radar-refresh').disabled = true;
  byId('radar-badge').className = 'connection-badge neutral';
  byId('radar-badge').textContent = 'Detectando…';
  setRadarMessage(automatic ? 'Perfil recuperado. Buscando las oportunidades publicadas hoy…' : 'Consultando oportunidades oficiales publicadas hoy…');
  try {
    const date = localDateValue();
    const payload = await requestJson(apiUrl, `/api/oportunidades?fecha=${encodeURIComponent(date)}`, controller.signal);
    if (radarRequest !== controller) return;
    if (payload.data?.date !== date || !Array.isArray(payload.data.items) || !Number.isFinite(Date.parse(payload.meta?.retrievedAt))) throw new Error('El radar recibió una respuesta incompleta o incompatible.');
    renderOpportunities(payload.data.items, profile, payload);
    setRadarMessage(`Radar actualizado: se revisaron ${payload.data.items.length} licitaciones publicadas el ${date}.`);
  } catch (error) {
    if (radarRequest !== controller) return;
    byId('radar-badge').className = 'connection-badge disconnected';
    byId('radar-badge').textContent = 'Radar no actualizado';
    setRadarMessage(controller.signal.aborted ? 'El radar tardó demasiado. Intenta nuevamente.' : error instanceof Error ? error.message : 'No fue posible ejecutar el radar.', true);
  } finally {
    clearTimeout(timeout);
    if (radarRequest === controller) {
      byId('radar-button').disabled = false;
      byId('radar-refresh').disabled = false;
    }
  }
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

function refreshCatalogCoverage(tenderItems) {
  const coverage = catalogCoverageForTender(tenderItems);
  const detail = document.getElementById('catalog-coverage')?.querySelector('small');
  if (detail) detail.textContent = `${coverage.matched} de ${coverage.total} ítems tienen una coincidencia local. Es un cálculo textual; confirma producto, precio y especificaciones.`;
}

function setupChecklist(containerId, progressId, items) {
  const container = byId(containerId);
  const progress = byId(progressId);
  const inputs = items.map((item, index) => {
    const label = node('label', undefined, 'check-row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = `${containerId}-${index}`;
    const body = node('span');
    body.append(node('strong', item.title), node('small', item.detail));
    label.append(input, body);
    return { label, input };
  });
  const refresh = () => {
    const confirmed = inputs.filter(({ input }) => input.checked).length;
    progress.textContent = `${confirmed} de ${inputs.length} confirmados`;
    progress.className = `count-chip${confirmed === inputs.length ? ' complete' : ''}`;
  };
  for (const { input } of inputs) input.addEventListener('change', refresh);
  container.replaceChildren(...inputs.map(({ label }) => label));
  refresh();
}

const tenderSteps = [
  { title: 'Estado y cierre vigentes', detail: 'Confirmé la ficha y el plazo directamente en Mercado Público.' },
  { title: 'Bases, anexos y foro revisados', detail: 'Leí requisitos administrativos, técnicos y respuestas del organismo.' },
  { title: 'Registro de Proveedores hábil', detail: 'Verifiqué mi estado y la información de la empresa en el portal oficial.' },
  { title: 'Oferta técnica y documentos listos', detail: 'Preparé cada antecedente solicitado en el formato requerido.' },
  { title: 'Oferta económica verificada', detail: 'Revisé precio, impuestos, costos, entrega y confirmé el envío en Mercado Público.' },
];

const agileSteps = [
  { title: 'Proceso y llamado vigentes', detail: 'Busqué el código COT y confirmé estado, llamado aplicable y fecha de cierre.' },
  { title: 'Proveedor hábil y elegible', detail: 'Verifiqué el Registro y las condiciones de participación del llamado.' },
  { title: 'Requerimiento completo revisado', detail: 'Confirmé productos, cantidades, especificaciones, documentos y lugar de entrega.' },
  { title: 'Cotización económica verificada', detail: 'Revisé precio, impuestos, costos, plazo de entrega y vigencia.' },
  { title: 'Cotización enviada y confirmada', detail: 'Ingresé la cotización en Mercado Público y comprobé su recepción antes del cierre.' },
];

function renderTender(tender, meta) {
  currentCode = tender.code;
  currentTenderItems = tender.items;
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
  const catalogCoverage = catalogCoverageForTender(tender.items);
  if (catalogCoverage.total) {
    const catalogCheck = verification('Cobertura del catálogo', `${catalogCoverage.matched} de ${catalogCoverage.total} ítems tienen una coincidencia local. Es un cálculo textual; confirma producto, precio y especificaciones.`);
    catalogCheck.id = 'catalog-coverage';
    checks.unshift(catalogCheck);
  }
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
  setupChecklist('tender-checklist', 'tender-progress', tenderSteps);
  const published = tender.status?.trim().toLocaleLowerCase('es-CL') === 'publicada';
  byId('tender-official-heading').textContent = published ? 'Continúa tu postulación en Mercado Público.' : 'Revisa el estado antes de intentar postular.';
  byId('tender-official-note').textContent = published ? 'Carga y confirma allí la oferta técnica y económica antes del cierre.' : 'La fuente no confirma que este proceso esté recibiendo ofertas. Abre la ficha oficial.';
  byId('tender-official-link').textContent = published ? 'Postular en Mercado Público ↗' : 'Revisar ficha en Mercado Público ↗';
  byId('detalle').hidden = false;
  byId('detail-title').focus();
}

function profileFromForm() {
  return buildCommercialProfile(
    byId('radar-keywords').value,
    byId('radar-exclusions').value,
    byId('radar-regions').value,
    byId('radar-min-days').value,
  );
}

byId('radar-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const profile = profileFromForm();
    try { localStorage.setItem(RADAR_PROFILE_STORAGE_KEY, JSON.stringify(profile)); } catch { /* Radar still works for this session. */ }
    void runRadar(profile);
  } catch (error) {
    setRadarMessage(error instanceof Error ? error.message : 'El perfil comercial no es válido.', true);
  }
});

byId('radar-refresh').addEventListener('click', () => {
  try { void runRadar(profileFromForm()); }
  catch (error) { setRadarMessage(error instanceof Error ? error.message : 'El perfil comercial no es válido.', true); }
});

window.addEventListener('licita:open-tender', (event) => {
  const code = event.detail?.code;
  if (typeof code !== 'string') return;
  byId('tender-code').value = code;
  byId('tender-form').requestSubmit();
});

window.addEventListener('licita:catalog-changed', () => {
  if (currentTenderItems.length) refreshCatalogCoverage(currentTenderItems);
});

byId('tender-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);
  byId('detalle').hidden = true;
  currentCode = '';
  currentTenderItems = [];
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

byId('agile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const code = validateAgileCode(byId('agile-code').value);
    byId('agile-code').value = code;
    currentAgileCode = code;
    byId('agile-detail-code').textContent = `Código COT ${code}`;
    setupChecklist('agile-checklist', 'agile-progress', agileSteps);
    byId('agile-detail').hidden = false;
    byId('agile-detail-title').focus();
    setAgileMessage(`Preparación iniciada para ${code}. El código fue ingresado por ti y todavía no se contrastó con API2.`);
  } catch (error) {
    setAgileMessage(error instanceof Error ? error.message : 'El código no es válido.', true);
  }
});

byId('close-detail').addEventListener('click', () => { byId('detalle').hidden = true; byId('tender-code').focus(); });
byId('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentCode); setMessage('Código copiado. Búscalo en Mercado Público.'); }
  catch { setMessage('No se pudo copiar. Selecciona el código visible en la ficha.', true); }
});
byId('close-agile-detail').addEventListener('click', () => { byId('agile-detail').hidden = true; byId('agile-code').focus(); });
byId('copy-agile-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentAgileCode); setAgileMessage('Código COT copiado. Búscalo en Mercado Público.'); }
  catch { setAgileMessage('No se pudo copiar. Selecciona el código visible en la ficha.', true); }
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

try {
  const stored = JSON.parse(localStorage.getItem(RADAR_PROFILE_STORAGE_KEY) || 'null');
  if (stored && Array.isArray(stored.keywords) && stored.keywords.length) {
    const profile = buildCommercialProfile(stored.keywords.join(', '), Array.isArray(stored.exclusions) ? stored.exclusions.join(', ') : '', Array.isArray(stored.regions) ? stored.regions.join(', ') : '', stored.minimumLeadDays ?? 3);
    byId('radar-keywords').value = profile.keywords.join(', ');
    byId('radar-exclusions').value = profile.exclusions.join(', ');
    byId('radar-regions').value = profile.regions.join(', ');
    byId('radar-min-days').value = String(profile.minimumLeadDays);
    void runRadar(profile, true);
  }
} catch {
  try { localStorage.removeItem(RADAR_PROFILE_STORAGE_KEY); } catch { /* Storage can be unavailable. */ }
}

initOperations();
