import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommercialProfile, formatOfficialDate, scoreOpportunity, validateTenderCode, validateAgileCode, validateApiUrl } from '../frontend/view-utils.js';

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
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of js.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing element: ${id}`);
  assert.ok(!js.includes('/api/compra-agil'));
  assert.ok(html.includes('id="agile-form"'));
  assert.ok(html.includes('id="radar-form"'));
  assert.ok(js.includes('/api/oportunidades?fecha='));
  assert.ok(html.includes('Cotizar en Mercado Público'));
  assert.ok(js.includes('Postular en Mercado Público'));
  assert.ok(!html.includes('name="ticket"'));
  assert.ok(!js.includes('innerHTML'));
});
