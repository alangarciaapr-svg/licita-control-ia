import { normalizeTenderResponse } from "./normalize";
import {
  normalizeCompraAgilDetailResponse,
  normalizeCompraAgilListResponse,
} from "./normalizeCompraAgil";

const SERVICE_NAME = "LicitaControl IA API";
const VERSION = "0.2.0";
const TENDER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const COMPRA_AGIL_CODE_PATTERN = /^\d+-\d+-COT\d{2}$/;

interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function errorResponse(
  request: Request,
  requestId: string,
  status: number,
  code: string,
  message: string,
): Response {
  const body: ApiError = { error: { code, message, requestId } };
  return jsonResponse(request, body, status);
}

type UpstreamResult = { payload: unknown; response?: never } | { payload?: never; response: Response };

async function fetchCompraAgilUpstream(
  request: Request,
  env: Env,
  requestId: string,
  path: string,
  params?: URLSearchParams,
): Promise<UpstreamResult> {
  if (!env.MERCADO_PUBLICO_TICKET) {
    return {
      response: errorResponse(request, requestId, 503, "TICKET_NOT_CONFIGURED", "La integración aún no está configurada."),
    };
  }

  const baseUrl = env.MERCADO_PUBLICO_COMPRA_AGIL_BASE_URL.replace(/\/$/, "");
  const upstreamUrl = new URL(`${baseUrl}${path}`);
  if (params) upstreamUrl.search = params.toString();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json", ticket: env.MERCADO_PUBLICO_TICKET },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "compra_agil_request_failed",
        message: error instanceof Error ? error.message : "Unknown upstream error",
        requestId,
      }),
    );
    return {
      response: errorResponse(request, requestId, 502, "UPSTREAM_UNAVAILABLE", "Compra Ágil no está disponible temporalmente."),
    };
  }

  if (!upstream.ok) {
    console.error(JSON.stringify({ event: "compra_agil_bad_status", requestId, status: upstream.status }));
    if (upstream.status === 401 || upstream.status === 403) {
      return {
        response: errorResponse(
          request,
          requestId,
          503,
          "COMPRA_AGIL_NOT_AUTHORIZED",
          "La integración necesita un ticket habilitado para Compra Ágil v2.",
        ),
      };
    }
    if (upstream.status === 404) {
      return { response: errorResponse(request, requestId, 404, "COMPRA_AGIL_NOT_FOUND", "No se encontró esa Compra Ágil.") };
    }
    if (upstream.status === 429) {
      return { response: errorResponse(request, requestId, 429, "UPSTREAM_RATE_LIMIT", "La fuente oficial alcanzó temporalmente su límite de consultas.") };
    }
    return { response: errorResponse(request, requestId, 502, "UPSTREAM_ERROR", "La fuente oficial rechazó la consulta.") };
  }

  const contentLength = Number(upstream.headers.get("Content-Length") || "0");
  if (contentLength > 5_000_000) {
    return { response: errorResponse(request, requestId, 502, "UPSTREAM_RESPONSE_TOO_LARGE", "La respuesta recibida es demasiado grande.") };
  }

  try {
    return { payload: await upstream.json() };
  } catch {
    return { response: errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "La fuente oficial devolvió una respuesta inválida.") };
  }
}

async function fetchCompraAgilList(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const query = (url.searchParams.get("q") || "").trim();
  const regionRaw = (url.searchParams.get("region") || "").trim();
  const pageRaw = (url.searchParams.get("pagina") || "1").trim();

  if (query.length > 120 || /[\u0000-\u001f\u007f]/.test(query)) {
    return errorResponse(request, requestId, 400, "INVALID_QUERY", "La búsqueda no es válida.");
  }

  const region = regionRaw ? Number(regionRaw) : null;
  if (region !== null && (!Number.isInteger(region) || region < 1 || region > 16)) {
    return errorResponse(request, requestId, 400, "INVALID_REGION", "La región seleccionada no es válida.");
  }

  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1 || page > 1_000) {
    return errorResponse(request, requestId, 400, "INVALID_PAGE", "La página solicitada no es válida.");
  }

  const params = new URLSearchParams({
    estado: "publicada",
    numero_pagina: String(page),
    ordenar_por: "FechaPublicacion",
    tamano_pagina: "24",
  });
  if (query) params.set("q", query);
  if (region !== null) params.set("region", String(region));

  const upstream = await fetchCompraAgilUpstream(request, env, requestId, "/v2/compra-agil", params);
  if (upstream.response) return upstream.response;
  const data = normalizeCompraAgilListResponse(upstream.payload);
  if (!data) {
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "La fuente oficial devolvió datos inesperados.");
  }

  console.log(JSON.stringify({ event: "compra_agil_list_loaded", requestId, resultCount: data.items.length }));
  return jsonResponse(request, { data, meta: { requestId, source: "Dirección ChileCompra · API Compra Ágil v2" } });
}

async function fetchCompraAgilDetail(
  request: Request,
  env: Env,
  requestId: string,
  code: string,
): Promise<Response> {
  if (!COMPRA_AGIL_CODE_PATTERN.test(code)) {
    return errorResponse(request, requestId, 400, "INVALID_COMPRA_AGIL_CODE", "El código de Compra Ágil no es válido.");
  }

  const upstream = await fetchCompraAgilUpstream(
    request,
    env,
    requestId,
    `/v2/compra-agil/${encodeURIComponent(code)}`,
  );
  if (upstream.response) return upstream.response;
  const data = normalizeCompraAgilDetailResponse(upstream.payload);
  if (!data) {
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "La fuente oficial devolvió datos inesperados.");
  }

  console.log(JSON.stringify({ event: "compra_agil_detail_loaded", requestId, purchaseCode: data.code }));
  return jsonResponse(request, { data, meta: { requestId, source: "Dirección ChileCompra · API Compra Ágil v2" } });
}

async function fetchTender(request: Request, env: Env, requestId: string, code: string): Promise<Response> {
  if (!TENDER_CODE_PATTERN.test(code)) {
    return errorResponse(request, requestId, 400, "INVALID_TENDER_CODE", "El código de licitación no es válido.");
  }

  if (!env.MERCADO_PUBLICO_TICKET) {
    return errorResponse(request, requestId, 503, "TICKET_NOT_CONFIGURED", "La integración aún no está configurada.");
  }

  const baseUrl = env.MERCADO_PUBLICO_BASE_URL.replace(/\/$/, "");
  const upstreamUrl = new URL(`${baseUrl}/licitaciones.json`);
  upstreamUrl.searchParams.set("codigo", code);
  upstreamUrl.searchParams.set("ticket", env.MERCADO_PUBLICO_TICKET);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "mercado_publico_request_failed",
        message: error instanceof Error ? error.message : "Unknown upstream error",
        requestId,
      }),
    );
    return errorResponse(request, requestId, 502, "UPSTREAM_UNAVAILABLE", "Mercado Público no está disponible temporalmente.");
  }

  if (!upstream.ok) {
    console.error(
      JSON.stringify({ event: "mercado_publico_bad_status", requestId, status: upstream.status }),
    );
    return errorResponse(request, requestId, 502, "UPSTREAM_ERROR", "Mercado Público rechazó la consulta.");
  }

  const contentLength = Number(upstream.headers.get("Content-Length") || "0");
  if (contentLength > 5_000_000) {
    return errorResponse(request, requestId, 502, "UPSTREAM_RESPONSE_TOO_LARGE", "La respuesta recibida es demasiado grande.");
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "Mercado Público devolvió una respuesta inválida.");
  }

  const tender = normalizeTenderResponse(payload, code);
  if (!tender) {
    return errorResponse(request, requestId, 404, "TENDER_NOT_FOUND", "No se encontró una licitación con ese código.");
  }

  console.log(JSON.stringify({ event: "tender_loaded", requestId, tenderCode: tender.code }));
  return jsonResponse(request, { data: tender, meta: { requestId, source: "Mercado Público" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      if (request.method !== "GET") {
        return errorResponse(request, requestId, 405, "METHOD_NOT_ALLOWED", "Método no permitido.");
      }

      if (url.pathname === "/health") {
        return jsonResponse(request, {
          ok: true,
          service: SERVICE_NAME,
          ticketConfigured: Boolean(env.MERCADO_PUBLICO_TICKET),
          version: VERSION,
        });
      }

      const match = url.pathname.match(/^\/api\/licitacion\/([^/]+)$/);
      if (match) {
        const code = decodeURIComponent(match[1]).trim().toUpperCase();
        return await fetchTender(request, env, requestId, code);
      }

      if (url.pathname === "/api/compra-agil") {
        return await fetchCompraAgilList(request, env, requestId, url);
      }

      const compraAgilMatch = url.pathname.match(/^\/api\/compra-agil\/([^/]+)$/);
      if (compraAgilMatch) {
        const code = decodeURIComponent(compraAgilMatch[1]).trim().toUpperCase();
        return await fetchCompraAgilDetail(request, env, requestId, code);
      }

      return errorResponse(request, requestId, 404, "ROUTE_NOT_FOUND", "Ruta no encontrada.");
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "unhandled_request_error",
          message: error instanceof Error ? error.message : "Unknown error",
          path: url.pathname,
          requestId,
        }),
      );
      return errorResponse(request, requestId, 500, "INTERNAL_ERROR", "Ocurrió un error inesperado.");
    }
  },
} satisfies ExportedHandler<Env>;
