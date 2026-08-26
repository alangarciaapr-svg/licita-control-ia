import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { readBoundedJson } from '../src/upstream';

// Synthetic fixtures only. Every credential below is generated per test, not a real ticket.
const code = '123-45-LE26';
const fixture = { Listado: [{ CodigoExterno: code, Nombre: 'Prueba sintética', Estado: 'Cerrada', Items: { Listado: [] } }] };

describe('Worker v1 request contract', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  async function query(path = `/api/licitacion/${code}`, method = 'GET', ticket = crypto.randomUUID()) {
    const bindings = { ...env, MERCADO_PUBLICO_TICKET: ticket } satisfies Env;
    return worker.fetch(new Request(`https://worker.test${path}`, { method, headers: { Origin: 'https://licita-control-ia.pages.dev' } }), bindings);
  }

  it('normalizes a real-shaped response and includes safe provenance', async () => {
    const ticket = crypto.randomUUID();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(fixture));
    const response = await query(undefined, undefined, ticket);
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { code: string; status: string }; meta: { retrievedAt: string; source: string } }>();
    expect(body.data.code).toBe(code);
    expect(body.data.status).toBe('Cerrada');
    expect(Number.isFinite(Date.parse(body.meta.retrievedAt))).toBe(true);
    expect(body.meta.source).toContain('v1');
    expect(JSON.stringify(body)).not.toContain(ticket);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://licita-control-ia.pages.dev');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const upstream = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(upstream.hostname).toBe('api.mercadopublico.cl');
    expect(upstream.searchParams.get('codigo')).toBe(code);
    expect(upstream.searchParams.get('ticket')).toBe(ticket);
    expect(fetchSpy.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('health confirms configuration only, without contacting the upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await query('/health');
    expect(await response.json()).toMatchObject({ ok: true, ticketConfigured: true, version: '0.4.1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['/api/licitacion/abc', '/api/licitacion/%E0%A4%A', '/api/licitacion/123-45-COT26', '/api/licitacion/123-45-LE26%26ticket%3Dx'])(
    'rejects invalid or wrong purchase type input: %s', async (path) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const response = await query(path);
      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('missing binding is safe and does not call the upstream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await query(undefined, undefined, '');
    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([[401, 503, 'UPSTREAM_ACCESS_DENIED'], [403, 503, 'UPSTREAM_ACCESS_DENIED'], [429, 429, 'UPSTREAM_RATE_LIMIT'], [500, 502, 'UPSTREAM_ERROR'], [302, 502, 'UPSTREAM_ERROR']] as const)(
    'sanitizes HTTP %i', async (upstreamStatus, expectedStatus, errorCode) => {
      const ticket = crypto.randomUUID();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`https://private.test/?ticket=${ticket}`, { status: upstreamStatus }));
      const response = await query(undefined, undefined, ticket);
      expect(response.status).toBe(expectedStatus);
      const body = await response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe(errorCode);
      expect(JSON.stringify(body)).not.toContain(ticket);
      expect(errorLog).toHaveBeenCalled();
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(ticket);
    },
  );

  it('network exceptions cannot leak a ticket-containing URL into logs or output', async () => {
    const ticket = crypto.randomUUID();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(`fetch failed https://private.test/?ticket=${ticket}`));
    const response = await query(undefined, undefined, ticket);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(ticket);
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(ticket);
  });

  it.each([{ Codigo: 'ERROR', Mensaje: 'private upstream error' }, { Listado: [{}] }, { Listado: [{ CodigoExterno: '999-99-LE26' }] }, { Listado: null }])(
    'never labels malformed or error payloads as an absent tender', async (payload) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(payload));
      const response = await query();
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_UPSTREAM_RESPONSE' } });
    },
  );

  it('reports an empty official listing as no result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ Listado: [] }));
    expect((await query()).status).toBe(404);
  });

  it('handles malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>failure</html>'));
    expect((await query()).status).toBe(502);
  });

  it('rejects a declared oversized body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { headers: { 'Content-Length': '5000001' } }));
    const response = await query();
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_RESPONSE_TOO_LARGE' } });
  });

  it('supports preflight and rejects mutation methods', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect((await query(undefined, 'OPTIONS')).status).toBe(204);
    expect((await query(undefined, 'POST')).status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('v2 rejection does not claim a different ticket is required', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
    const response = await query('/api/compra-agil');
    const body = await response.json<{ error: { message: string } }>();
    expect(body.error.message).toContain('causa debe verificarse');
  });

  it('lists published opportunities for one validated day without leaking the ticket', async () => {
    const ticket = crypto.randomUUID();
    const date = new Date().toISOString().slice(0, 10);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ Listado: [{
      CodigoExterno: code,
      Nombre: 'Servicio sintético',
      Estado: 'Publicada',
      FechaCierre: '2026-09-01T15:00:00',
    }] }));
    const response = await query(`/api/oportunidades?fecha=${date}`, 'GET', ticket);
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { items: Array<{ code: string }> }; meta: { source: string } }>();
    expect(body.data.items).toEqual([expect.objectContaining({ code })]);
    expect(body.meta.source).toContain('v1');
    expect(JSON.stringify(body)).not.toContain(ticket);
    const upstream = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(upstream.searchParams.get('estado')).toBe('publicada');
    expect(upstream.searchParams.get('ticket')).toBe(ticket);
  });

  it.each(['', '2026-02-30', '01-01-2026', '2999-01-01'])(
    'rejects invalid radar dates without contacting upstream: %s', async (date) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const response = await query(`/api/oportunidades?fecha=${encodeURIComponent(date)}`);
      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe('bounded JSON reader', () => {
  it('counts actual bytes even with a false Content-Length', async () => {
    const response = new Response('x'.repeat(21), { headers: { 'Content-Length': '1' } });
    await expect(readBoundedJson(response, 20)).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
  });
  it('decodes UTF-8 across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode('{"name":"Ágil"}');
    const response = new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } }));
    expect(await readBoundedJson(response, 100)).toEqual({ name: 'Ágil' });
  });
});
