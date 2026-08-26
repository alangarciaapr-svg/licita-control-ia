import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommercialProfile, formatOfficialDate, scoreOpportunity, validateTenderCode, validateAgileCode, validateApiUrl } from '../frontend/view-utils.js';
import { calculateCatalogCoverage } from '../frontend/operations.js';

test('tender input is normalized and COT codes are clearly separated', () => {
  assert.equal(validateTenderCode(' 123-45-le26 '), '123-45-LE26');
  for (const invalid of ['abc', '123-45-LE26?ticket=x', '<script>', '']) assert.throws(() => validateTenderCode(invalid));
  assert.throws(() => validateTenderCode('123-45-COT26'), /Compra Ágil/);
});

test('Compra Ágil accepts only normalized COT identifiers', () => {
  assert.equal(validateAgileCode(' 1234567-89-cot26 '), '1234567-89-COT26');
  for (const invalid of ['123-45-LE26', 'COT26', '123-45-COT', '123-45-COT26?ticket=x']) assert.throws(() => validateAgileCode(invalid));
});

test('dates retain official wall clock values rather than inventing a time zone', () => {
  assert.equal(formatOfficialDate('2026-09-01T15:00:00'), '01/09/2026 · 15:00:00');
  assert.equal(formatOfficialDate('2026-09-01T15:00:00Z'), '01/09/2026 · 15:00:00 (Z)');
  assert.equal(formatOfficialDate(null), 'No informada');
});

test('connection setting rejects credentials, query parameters and insecure remote URLs', () => {
  assert.equal(validateApiUrl('https://example.com/'), 'https://example.com');
  assert.equal(validateApiUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  for (const invalid of ['https://example.com/?ticket=x', 'https://user:pass@example.com', 'http://example.com', 'javascript:alert(1)', 'https://example.com/api']) assert.throws(() => validateApiUrl(invalid));
});

test('radar matching is deterministic, explainable and respects exclusions and lead time', () => {
  const profile = buildCommercialProfile('software, soporte informático', 'arriendo', 'Metropolitana', '3');
  const opportunity = { name: 'Servicio de soporte informático y software', description: null, buyer: 'Organismo sintético', region: 'Región Metropolitana', status: 'Publicada', closing: '2026-08-31T15:00:00' };
  const match = scoreOpportunity(opportunity, profile, '2026-08-26');
  assert.deepEqual({ eligible: match.eligible, score: match.score, matchedKeywords: match.matchedKeywords, daysRemaining: match.daysRemaining }, { eligible: true, score: 80, matchedKeywords: ['software', 'soporte informático'], daysRemaining: 5 });
  const excluded = scoreOpportunity({ ...opportunity, name: 'Arriendo de software' }, profile, '2026-08-26');
  assert.deepEqual({ eligible: excluded.eligible, score: excluded.score, matchedExclusions: excluded.matchedExclusions }, { eligible: false, score: 0, matchedExclusions: ['arriendo'] });
  const late = scoreOpportunity({ ...opportunity, closing: '2026-08-27T15:00:00' }, profile, '2026-08-26');
  assert.deepEqual({ eligible: late.eligible, score: late.score, daysRemaining: late.daysRemaining }, { eligible: false, score: 0, daysRemaining: 1 });
  assert.throws(() => buildCommercialProfile('', '', '', '3'));
});

test('static frontend contract: all script IDs exist, no secret field or automatic v2 query', () => {
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8');
  const operations = readFileSync(new URL('../frontend/operations.js', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of js.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing element: ${id}`);
  for (const [, id] of operations.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing operations element: ${id}`);
  assert.ok(!js.includes('/api/compra-agil'));
  assert.ok(html.includes('id="agile-form"'));
  assert.ok(html.includes('id="radar-form"'));
  assert.ok(js.includes('/api/oportunidades?fecha='));
  assert.ok(html.includes('Cotizar en Mercado Público'));
  assert.ok(js.includes('Postular en Mercado Público'));
  assert.ok(!html.includes('name="ticket"'));
  assert.ok(!js.includes('innerHTML'));
  assert.ok(!operations.includes('innerHTML'));
  assert.ok(!html.includes('El conector completa el portal'));
  assert.ok(html.includes('los formularios automáticos aún no están habilitados'));
});

test('browser connector uses minimum permissions and never requests credentials or cookies', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.host_permissions.every((value) => value.startsWith('https://')));
  assert.ok(!manifest.permissions.includes('cookies'));
  assert.ok(!background.includes('document.cookie'));
  assert.ok(!background.includes('password'));
});

test('catalog coverage matches tender items deterministically without inventing products', () => {
  const result = calculateCatalogCoverage(
    [{ name: 'Licencia de software empresarial', description: 'Soporte anual', category: 'Tecnología' }, { name: 'Notebook', description: null, category: 'Computadores' }],
    [{ id: 'p1', name: 'Microsoft 365', keywords: 'software, licencia', price: 12990 }],
  );
  assert.equal(result.total, 2);
  assert.equal(result.matched, 1);
  assert.deepEqual(result.matches[0], { itemIndex: 0, itemName: 'Licencia de software empresarial', productId: 'p1', productName: 'Microsoft 365', price: 12990 });
});

test('catalog changes refresh coverage in an already open tender', () => {
  const appSource = readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8');
  const operationsSource = readFileSync(new URL('../frontend/operations.js', import.meta.url), 'utf8');
  assert.match(operationsSource, /licita:catalog-changed/);
  assert.match(appSource, /addEventListener\('licita:catalog-changed'/);
  assert.match(appSource, /id = 'catalog-coverage'/);
});

test('document form survives the asynchronous IndexedDB operation', () => {
  const operationsSource = readFileSync(new URL('../frontend/operations.js', import.meta.url), 'utf8');
  assert.match(operationsSource, /const form = event\.currentTarget;/);
  assert.match(operationsSource, /await documentOperation\('put'/);
  assert.match(operationsSource, /form\.reset\(\);/);
  assert.ok(!operationsSource.includes('event.currentTarget.reset()'));
});

test('mobile layout allows grid children and file inputs to shrink', () => {
  const styles = readFileSync(new URL('../frontend/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.app-shell > \*, main \{ min-width: 0; max-width: 100%; \}/);
  assert.match(styles, /input\[type="file"\] \{ min-width: 0; max-width: 100%; \}/);
});
