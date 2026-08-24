/**
 * LicitaControl IA - Cloudflare Worker V1
 * Backend seguro para consultar la API pública de Mercado Público.
 *
 * SECRET REQUERIDO EN CLOUDFLARE:
 *   MERCADO_PUBLICO_TICKET
 *
 * Rutas:
 *   GET /health
 *   GET /api/licitacion/1003-18-LP26
 *
 * IMPORTANTE:
 * - No pegues el ticket en este archivo.
 * - Guárdalo como Secret en Cloudflare Workers.
 * - Para el prototipo se habilita CORS '*'. En producción se debe restringir
 *   al dominio real de LicitaControl IA.
 */

const MP_BASE = 'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return json({ ok: false, error: 'Método no permitido' }, 405);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'LicitaControl IA API',
        version: '1.0.0',
        mercadoPublicoTicketConfigured: Boolean(env.MERCADO_PUBLICO_TICKET)
      });
    }

    const match = url.pathname.match(/^\/api\/licitacion\/([^/]+)$/i);
    if (!match) {
      return json({
        ok: false,
        error: 'Ruta no encontrada',
        routes: ['/health', '/api/licitacion/{codigo}']
      }, 404);
    }

    if (!env.MERCADO_PUBLICO_TICKET) {
      return json({
        ok: false,
        error: 'Falta configurar el Secret MERCADO_PUBLICO_TICKET en Cloudflare.'
      }, 500);
    }

    const codigo = decodeURIComponent(match[1]).trim().toUpperCase();
    if (!/^[0-9A-Z-]{4,40}$/.test(codigo)) {
      return json({ ok: false, error: 'Código de licitación inválido.' }, 400);
    }

    try {
      const apiUrl = new URL(MP_BASE);
      apiUrl.searchParams.set('codigo', codigo);
      apiUrl.searchParams.set('ticket', env.MERCADO_PUBLICO_TICKET);

      const mpResponse = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cf: { cacheTtl: 60, cacheEverything: false }
      });

      if (!mpResponse.ok) {
        return json({
          ok: false,
          error: 'Mercado Público respondió con un error.',
          upstreamStatus: mpResponse.status
        }, 502);
      }

      const raw = await mpResponse.json();
      const licitaciones = toArray(raw?.Listado);

      if (!licitaciones.length) {
        return json({
          ok: false,
          error: `No se encontró la licitación ${codigo}.`
        }, 404);
      }

      const lic = licitaciones[0];
      const comprador = lic?.Comprador || {};
      const fechas = lic?.Fechas || {};
      const itemsRaw = lic?.Items?.Listado ?? lic?.Items ?? [];
      const items = toArray(itemsRaw).map(normalizeItem);

      const normalized = {
        codigo: lic?.CodigoExterno ?? codigo,
        nombre: lic?.Nombre ?? '',
        estado: lic?.Estado ?? '',
        descripcion: lic?.Descripcion ?? '',
        tipo: lic?.Tipo ?? '',
        moneda: lic?.Moneda ?? '',
        diasCierre: numberOrNull(lic?.DiasCierreLicitacion),
        comprador: {
          codigoOrganismo: comprador?.CodigoOrganismo ?? null,
          nombreOrganismo: comprador?.NombreOrganismo ?? '',
          rutUnidad: comprador?.RutUnidad ?? '',
          codigoUnidad: comprador?.CodigoUnidad ?? null,
          nombreUnidad: comprador?.NombreUnidad ?? '',
          direccionUnidad: comprador?.DireccionUnidad ?? '',
          comuna: comprador?.ComunaUnidad ?? '',
          region: comprador?.RegionUnidad ?? ''
        },
        fechas: {
          creacion: fechas?.FechaCreacion ?? null,
          inicio: fechas?.FechaInicio ?? null,
          final: fechas?.FechaFinal ?? null,
          publicacion: fechas?.FechaPublicacion ?? null,
          cierre: fechas?.FechaCierre ?? lic?.FechaCierre ?? null,
          aperturaTecnica: fechas?.FechaActoAperturaTecnica ?? null,
          aperturaEconomica: fechas?.FechaActoAperturaEconomica ?? null,
          adjudicacion: fechas?.FechaAdjudicacion ?? null,
          adjudicacionEstimada: fechas?.FechaEstimadaAdjudicacion ?? null,
          publicacionRespuestas: fechas?.FechaPubRespuestas ?? null,
          visitaTerreno: fechas?.FechaVisitaTerreno ?? null
        },
        items,
        meta: {
          fuente: 'API Mercado Público',
          consultadoEn: new Date().toISOString(),
          cantidadResultados: raw?.Cantidad ?? licitaciones.length,
          versionApi: raw?.Version ?? null
        }
      };

      return json({ ok: true, licitacion: normalized });
    } catch (error) {
      return json({
        ok: false,
        error: 'No fue posible consultar Mercado Público.',
        detail: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  }
};

function normalizeItem(item = {}) {
  return {
    correlativo: item?.Correlativo ?? null,
    codigoProducto: item?.CodigoProducto ?? '',
    codigoCategoria: item?.CodigoCategoria ?? '',
    categoria: item?.Categoria ?? '',
    nombreProducto: item?.NombreProducto ?? '',
    descripcion: item?.Descripcion ?? '',
    unidadMedida: item?.UnidadMedida ?? '',
    cantidad: numberOrNull(item?.Cantidad)
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
