import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatOfficialDate, validateTenderCode, validateApiUrl } from '../frontend/view-utils.js';

test('tender input is normalized and COT codes are clearly separated', () => {
  assert.equal(validateTenderCode(' 123-45-le26 '), '123-45-LE26');
  for (const invalid of ['abc', '123-45-LE26?ticket=x', '<script>', '']) assert.throws(() => validateTenderCode(invalid));
  assert.throws(() => validateTenderCode('123-45-COT26'), /Compra Ágil/);
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

test('static frontend contract: all script IDs exist, no secret field or automatic v2 query', () => {
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../frontend/app.js', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of js.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing element: ${id}`);
  assert.ok(!js.includes('/api/compra-agil'));
  assert.ok(!html.includes('name="ticket"'));
  assert.ok(!js.includes('innerHTML'));
});
