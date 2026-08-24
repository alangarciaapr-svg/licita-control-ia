type UnknownRecord = Record<string, unknown>;

export interface CompraAgilSummary {
  budget: {
    amount: number | null;
    amountClp: number | null;
    currency: string | null;
  };
  buyer: {
    organization: string | null;
    region: string | null;
    regionCode: number | null;
    unit: string | null;
  };
  call: {
    label: string | null;
    number: number | null;
  };
  code: string;
  dates: {
    closing: string | null;
    hoursRemaining: number | null;
    lastChange: string | null;
    published: string | null;
  };
  documents: Array<{ id: string | null; name: string | null }>;
  name: string | null;
  quoteCount: number | null;
  status: {
    code: string | null;
    label: string | null;
  };
}

export interface CompraAgilDetail extends CompraAgilSummary {
  description: string | null;
  delivery: {
    address: string | null;
    days: number | null;
  };
  flags: {
    environmentalRequirements: boolean | null;
    socialEconomicRequirements: boolean | null;
  };
  products: Array<{
    code: string | null;
    description: string | null;
    name: string | null;
    quantity: number | null;
    unit: string | null;
  }>;
  purchaseOrderIssued: boolean;
}

export interface CompraAgilPage {
  items: CompraAgilSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalResults: number;
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(record: UnknownRecord, key: string): UnknownRecord {
  return isRecord(record[key]) ? record[key] : {};
}

function arrayAt(record: UnknownRecord, key: string): unknown[] {
  return Array.isArray(record[key]) ? record[key] : [];
}

function stringAt(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function numberAt(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanAt(record: UnknownRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function hoursUntil(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 3_600_000));
}

function normalizeDocuments(record: UnknownRecord): CompraAgilSummary["documents"] {
  return arrayAt(record, "documentos")
    .filter(isRecord)
    .map((document) => ({ id: stringAt(document, "id"), name: stringAt(document, "nombre") }));
}

function normalizeSummary(record: UnknownRecord, now: Date): CompraAgilSummary | null {
  const code = stringAt(record, "codigo");
  if (!code) return null;

  const state = recordAt(record, "estado");
  const call = recordAt(record, "convocatoria");
  const dates = recordAt(record, "fechas");
  const amounts = recordAt(record, "montos");
  const buyer = recordAt(record, "institucion");
  const summary = recordAt(record, "resumen");
  const closing = stringAt(dates, "fecha_cierre");

  return {
    budget: {
      amount: numberAt(amounts, "monto_disponible"),
      amountClp: numberAt(amounts, "monto_disponible_clp"),
      currency: stringAt(amounts, "moneda"),
    },
    buyer: {
      organization: stringAt(buyer, "organismo_comprador"),
      region: stringAt(buyer, "nombre_region"),
      regionCode: numberAt(buyer, "region"),
      unit: stringAt(buyer, "unidad_compra"),
    },
    call: {
      label: stringAt(call, "descripcion"),
      number: numberAt(call, "estado_convocatoria"),
    },
    code,
    dates: {
      closing,
      hoursRemaining: hoursUntil(closing, now),
      lastChange: stringAt(dates, "fecha_ultimo_cambio"),
      published: stringAt(dates, "fecha_publicacion"),
    },
    documents: normalizeDocuments(record),
    name: stringAt(record, "nombre"),
    quoteCount: numberAt(summary, "total_ofertas_recibidas"),
    status: {
      code: stringAt(state, "codigo"),
      label: stringAt(state, "glosa"),
    },
  };
}

function apiPayload(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload) || stringAt(payload, "success") !== "OK") return null;
  return isRecord(payload.payload) ? payload.payload : null;
}

export function normalizeCompraAgilListResponse(payload: unknown, now = new Date()): CompraAgilPage | null {
  const root = apiPayload(payload);
  if (!root) return null;
  const pagination = recordAt(root, "paginacion");

  return {
    items: arrayAt(root, "items")
      .filter(isRecord)
      .map((item) => normalizeSummary(item, now))
      .filter((item): item is CompraAgilSummary => item !== null),
    pagination: {
      page: numberAt(pagination, "numero_pagina") || 1,
      pageSize: numberAt(pagination, "tamano_pagina") || 0,
      totalPages: numberAt(pagination, "total_paginas") || 0,
      totalResults: numberAt(pagination, "total_resultados") || 0,
    },
  };
}

export function normalizeCompraAgilDetailResponse(payload: unknown, now = new Date()): CompraAgilDetail | null {
  const root = apiPayload(payload);
  if (!root) return null;
  const summary = normalizeSummary(root, now);
  if (!summary) return null;

  const delivery = recordAt(root, "entrega");
  const flags = recordAt(root, "flags");
  const purchaseOrder = recordAt(root, "orden_compra");

  return {
    ...summary,
    budget: {
      amount: numberAt(recordAt(root, "presupuesto"), "monto_disponible") ?? summary.budget.amount,
      amountClp: numberAt(recordAt(root, "presupuesto"), "monto_disponible_clp") ?? summary.budget.amountClp,
      currency: stringAt(recordAt(root, "presupuesto"), "moneda") ?? summary.budget.currency,
    },
    description: stringAt(root, "descripcion"),
    delivery: {
      address: stringAt(delivery, "direccion_entrega"),
      days: numberAt(delivery, "plazo_entrega_dias"),
    },
    flags: {
      environmentalRequirements: booleanAt(flags, "considera_requisitos_medioambientales"),
      socialEconomicRequirements: booleanAt(flags, "considera_requisitos_impacto_social_economico"),
    },
    products: arrayAt(root, "productos_solicitados")
      .filter(isRecord)
      .map((product) => ({
        code: stringAt(product, "codigo_producto"),
        description: stringAt(product, "descripcion"),
        name: stringAt(product, "nombre"),
        quantity: numberAt(product, "cantidad"),
        unit: stringAt(product, "unidad_medida"),
      })),
    purchaseOrderIssued: numberAt(purchaseOrder, "id_orden_compra") !== null,
  };
}
