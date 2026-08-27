import { normalizeTenderListResponse, normalizeTenderResponse } from "./normalize";
import { readBoundedJson, UpstreamBodyError } from "./upstream";
import {
  normalizeCompraAgilDetailResponse,
  normalizeCompraAgilListResponse,
} from "./normalizeCompraAgil";

const SERVICE_NAME = "LicitaControl IA API";
const VERSION = "0.5.0";
const TENDER_CODE_PATTERN = /^\d{1,12}-\d{1,12}-[A-Z][A-Z0-9]{0,3}\d{2}$/;
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
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    console.error(
      JSON.stringify({
        event: "compra_agil_request_failed",
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
          "La fuente oficial rechazó el acceso a Compra Ágil v2. La causa debe verificarse; no implica necesariamente solicitar otro ticket.",
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

  try {
    return { payload: await readBoundedJson(upstream) };
  } catch (error) {
    if (error instanceof UpstreamBodyError && error.code === "UPSTREAM_RESPONSE_TOO_LARGE") {
      return { response: errorResponse(request, requestId, 502, error.code, "La respuesta recibida es demasiado grande.") };
    }
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
  if (COMPRA_AGIL_CODE_PATTERN.test(code)) {
    return errorResponse(request, requestId, 400, "WRONG_PURCHASE_TYPE", "Ese código corresponde a Compra Ágil. Este módulo consulta licitaciones; la conexión Compra Ágil v2 está pendiente de validación.");
  }
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
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    console.error(
      JSON.stringify({
        event: "mercado_publico_request_failed",
        requestId,
      }),
    );
    return errorResponse(request, requestId, 502, "UPSTREAM_UNAVAILABLE", "Mercado Público no está disponible temporalmente.");
  }

  if (!upstream.ok) {
    console.error(
      JSON.stringify({ event: "mercado_publico_bad_status", requestId, status: upstream.status }),
    );
    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse(request, requestId, 503, "UPSTREAM_ACCESS_DENIED", "La fuente oficial rechazó el acceso. Debe revisarse la integración; no se pudo consultar la licitación.");
    }
    if (upstream.status === 429) {
      return errorResponse(request, requestId, 429, "UPSTREAM_RATE_LIMIT", "Mercado Público alcanzó temporalmente su límite de consultas. Intenta más tarde.");
    }
    return errorResponse(request, requestId, 502, "UPSTREAM_ERROR", "Mercado Público rechazó la consulta.");
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(upstream);
  } catch (error) {
    if (error instanceof UpstreamBodyError && error.code === "UPSTREAM_RESPONSE_TOO_LARGE") {
      return errorResponse(request, requestId, 502, error.code, "La respuesta recibida es demasiado grande.");
    }
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "Mercado Público devolvió una respuesta inválida.");
  }

  // Legacy API application errors may arrive with HTTP 200. Never expose their body.
  if (typeof payload !== "object" || payload === null || !("Listado" in payload) || !Array.isArray(payload.Listado) || "Codigo" in payload || "Mensaje" in payload) {
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "La fuente oficial no devolvió un listado válido. No es posible confirmar si la licitación existe.");
  }
  if (payload.Listado.length === 0) {
    return errorResponse(request, requestId, 404, "TENDER_NOT_FOUND", "La fuente oficial no devolvió resultados para ese código. Verifica el código en Mercado Público.");
  }

  const tender = normalizeTenderResponse(payload, code);
  if (!tender) {
    return errorResponse(request, requestId, 502, "INVALID_UPSTREAM_RESPONSE", "La respuesta oficial no coincide con la licitación solicitada.");
  }

  console.log(JSON.stringify({ event: "tender_loaded", requestId, tenderCode: tender.code }));
  return jsonResponse(request, { data: tender, meta: { requestId, source: "Dirección ChileCompra · API Mercado Público v1", retrievedAt: new Date().toISOString() } });
}

async function fetchPublishedOpportunities(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const scope = (url.searchParams.get("alcance") || "").trim();
  const dateValue = (url.searchParams.get("fecha") || "").trim();
  const activeScope = scope === "activas";
  const recentScope = scope === "recientes";
  if (scope && !activeScope && !recentScope) {
    return errorResponse(request, requestId, 400, "INVALID_SCOPE", "El alcance solicitado no es válido.");
  }
  const daysRaw = (url.searchParams.get("dias") || "10").trim();
  const daysRequested = Number(daysRaw);
  if (recentScope && (!Number.isInteger(daysRequested) || daysRequested < 1 || daysRequested > 14)) {
    return errorResponse(request, requestId, 400, "INVALID_DAYS", "La ventana debe estar entre 1 y 14 días.");
  }
  if (!activeScope && !recentScope && !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return errorResponse(request, requestId, 400, "INVALID_DATE", "La fecha debe usar el formato AAAA-MM-DD.");
  }
  let year = 0;
  let month = 0;
  let day = 0;
  if (!activeScope && !recentScope) {
    [year, month, day] = dateValue.split("-").map(Number);
    const requestedDate = new Date(Date.UTC(year, month - 1, day));
    if (requestedDate.getUTCFullYear() !== year || requestedDate.getUTCMonth() !== month - 1 || requestedDate.getUTCDate() !== day) {
      return errorResponse(request, requestId, 400, "INVALID_DATE", "La fecha indicada no existe.");
    }
    const today = new Date();
    const currentDate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const ageInDays = Math.floor((currentDate - requestedDate.getTime()) / 86_400_000);
    if (ageInDays < 0 || ageInDays > 31) {
      return errorResponse(request, requestId, 400, "DATE_OUT_OF_RANGE", "El radar permite revisar hoy y los últimos 31 días.");
    }
  }
  if (!env.MERCADO_PUBLICO_TICKET) {
    return errorResponse(request, requestId, 503, "TICKET_NOT_CONFIGURED", "La integración aún no está configurada.");
  }

  const dateQueries: Array<{ iso: string | null; upstream: string | null }> = [];
  if (recentScope) {
    const chileDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [currentYear, currentMonth, currentDay] = chileDate.split("-").map(Number);
    const cursor = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay));
    for (let offset = 0; offset < daysRequested; offset += 1) {
      const iso = cursor.toISOString().slice(0, 10);
      dateQueries.push({ iso, upstream: `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` });
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  } else if (activeScope) {
    dateQueries.push({ iso: null, upstream: null });
  } else {
    dateQueries.push({ iso: dateValue, upstream: `${String(day).padStart(2, "0")}${String(month).padStart(2, "0")}${year}` });
  }

  const byCode = new Map<string, NonNullable<ReturnType<typeof normalizeTenderListResponse>>[number]>();
  let daysLoaded = 0;
  let daysFailed = 0;
  for (const dateQuery of dateQueries) {
    const upstreamUrl = new URL(`${env.MERCADO_PUBLICO_BASE_URL.replace(/\/$/, "")}/licitaciones.json`);
    if (dateQuery.upstream) upstreamUrl.searchParams.set("fecha", dateQuery.upstream);
    upstreamUrl.searchParams.set("estado", "publicada");
    upstreamUrl.searchParams.set("ticket", env.MERCADO_PUBLICO_TICKET);

    const cacheKey = recentScope && dateQuery.iso ? new Request(`https://radar-cache.licitacontrol.invalid/v1/${dateQuery.iso}`) : null;
    let upstream = cacheKey ? await caches.default.match(cacheKey) : undefined;
    let cacheCopy: Response | undefined;
    if (!upstream) {
      try {
        upstream = await fetch(upstreamUrl, {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        });
        if (upstream.ok && cacheKey) cacheCopy = upstream.clone();
      } catch {
        console.error(JSON.stringify({ event: "opportunity_radar_request_failed", requestId, date: dateQuery.iso }));
        daysFailed += 1;
        continue;
      }
    }
    if (!upstream.ok) {
      console.error(JSON.stringify({ event: "opportunity_radar_bad_status", requestId, status: upstream.status, date: dateQuery.iso }));
      if (upstream.status === 401 || upstream.status === 403) {
        return errorResponse(request, requestId, 503, "UPSTREAM_ACCESS_DENIED", "La fuente oficial rechazó el acceso al radar.");
      }
      daysFailed += 1;
      continue;
    }

    try {
      const opportunities = normalizeTenderListResponse(await readBoundedJson(upstream));
      if (!opportunities) {
        daysFailed += 1;
        continue;
      }
      if (cacheKey && cacheCopy) {
        try {
          const headers = new Headers(cacheCopy.headers);
          headers.set("Cache-Control", "public, max-age=21600");
          await caches.default.put(cacheKey, new Response(cacheCopy.body, { status: cacheCopy.status, headers }));
        } catch {
          console.error(JSON.stringify({ event: "opportunity_radar_cache_write_failed", requestId, date: dateQuery.iso }));
        }
      }
      daysLoaded += 1;
      for (const opportunity of opportunities) if (!byCode.has(opportunity.code)) byCode.set(opportunity.code, opportunity);
    } catch {
      daysFailed += 1;
    }
  }
  if (!daysLoaded) {
    return errorResponse(request, requestId, 502, "UPSTREAM_UNAVAILABLE", "No fue posible cargar ningún día desde Mercado Público.");
  }
  const opportunities = [...byCode.values()];
  const limited = opportunities.slice(0, 5_000);
  const responseScope = recentScope ? "recent" : activeScope ? "active" : "date";
  console.log(JSON.stringify({ event: "opportunity_radar_loaded", requestId, resultCount: limited.length, scope: responseScope, daysLoaded, daysFailed }));
  return jsonResponse(request, {
    data: { scope: responseScope, date: activeScope || recentScope ? null : dateValue, items: limited },
    meta: {
      requestId,
      source: "Dirección ChileCompra · API Mercado Público v1",
      retrievedAt: new Date().toISOString(),
      totalOfficialResults: opportunities.length,
      truncated: opportunities.length > limited.length,
      daysRequested: dateQueries.length,
      daysLoaded,
      daysFailed,
    },
  });
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
        let code: string;
        try { code = decodeURIComponent(match[1]).trim().toUpperCase(); }
        catch { return errorResponse(request, requestId, 400, "INVALID_TENDER_CODE", "El código de licitación no es válido."); }
        return await fetchTender(request, env, requestId, code);
      }

      if (url.pathname === "/api/oportunidades") {
        return await fetchPublishedOpportunities(request, env, requestId, url);
      }

      if (url.pathname === "/api/compra-agil") {
        return await fetchCompraAgilList(request, env, requestId, url);
      }

      const compraAgilMatch = url.pathname.match(/^\/api\/compra-agil\/([^/]+)$/);
      if (compraAgilMatch) {
        let code: string;
        try { code = decodeURIComponent(compraAgilMatch[1]).trim().toUpperCase(); }
        catch { return errorResponse(request, requestId, 400, "INVALID_COMPRA_AGIL_CODE", "El código de Compra Ágil no es válido."); }
        return await fetchCompraAgilDetail(request, env, requestId, code);
      }

      return errorResponse(request, requestId, 404, "ROUTE_NOT_FOUND", "Ruta no encontrada.");
    } catch {
      console.error(
        JSON.stringify({
          event: "unhandled_request_error",
          requestId,
        }),
      );
      return errorResponse(request, requestId, 500, "INTERNAL_ERROR", "Ocurrió un error inesperado.");
    }
  },
} satisfies ExportedHandler<Env>;
