import { normalizeTenderResponse } from "./normalize";

const SERVICE_NAME = "LicitaControl IA API";
const VERSION = "0.1.0";
const TENDER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

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
