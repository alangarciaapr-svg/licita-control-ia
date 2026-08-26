type UnknownRecord = Record<string, unknown>;

export interface NormalizedItem {
  category: string | null;
  code: string | null;
  description: string | null;
  name: string | null;
  quantity: number | string | null;
  unit: string | null;
}

export interface NormalizedTender {
  buyer: {
    commune: string | null;
    organization: string | null;
    region: string | null;
    unit: string | null;
  };
  code: string;
  currency: string | null;
  dates: {
    award: string | null;
    closing: string | null;
    daysRemaining: number | null;
    economicOpening: string | null;
    technicalOpening: string | null;
  };
  description: string | null;
  items: NormalizedItem[];
  name: string | null;
  status: string | null;
  type: string | null;
}

export interface NormalizedOpportunity {
  buyer: string | null;
  closing: string | null;
  code: string;
  description: string | null;
  name: string | null;
  region: string | null;
  status: string | null;
  type: string | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function stringAt(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberAt(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function arrayAt(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function normalizeItem(value: unknown): NormalizedItem | null {
  if (!isRecord(value)) return null;
  const quantity = numberAt(value, "Cantidad");
  const name = stringAt(value, "NombreProducto");
  const code = stringAt(value, "CodigoProducto");
  const description = stringAt(value, "Descripcion");
  if (!name && !code && !description) return null;

  return {
    category: stringAt(value, "Categoria"),
    code,
    description,
    name,
    quantity,
    unit: stringAt(value, "UnidadMedida"),
  };
}

export function normalizeTenderResponse(payload: unknown, requestedCode: string): NormalizedTender | null {
  if (!isRecord(payload)) return null;
  const listing = arrayAt(payload, "Listado");
  const first = listing.find((entry): entry is UnknownRecord => isRecord(entry) && stringAt(entry, "CodigoExterno")?.toUpperCase() === requestedCode.toUpperCase());
  if (!first) return null;

  const buyer = recordAt(first, "Comprador");
  const dates = recordAt(first, "Fechas");
  const items = recordAt(first, "Items");

  return {
    buyer: {
      commune: stringAt(buyer, "ComunaUnidad"),
      organization: stringAt(buyer, "NombreOrganismo"),
      region: stringAt(buyer, "RegionUnidad"),
      unit: stringAt(buyer, "NombreUnidad"),
    },
    code: String(first.CodigoExterno).trim().toUpperCase(),
    currency: stringAt(first, "Moneda"),
    dates: {
      award: stringAt(dates, "FechaAdjudicacion"),
      closing: stringAt(dates, "FechaCierre"),
      daysRemaining: numberAt(first, "DiasCierreLicitacion"),
      economicOpening: stringAt(dates, "FechaAperturaEconomica"),
      technicalOpening: stringAt(dates, "FechaAperturaTecnica"),
    },
    description: stringAt(first, "Descripcion"),
    items: arrayAt(items, "Listado").map(normalizeItem).filter((item): item is NormalizedItem => item !== null),
    name: stringAt(first, "Nombre"),
    status: stringAt(first, "Estado"),
    type: stringAt(first, "Tipo"),
  };
}

export function normalizeTenderListResponse(payload: unknown): NormalizedOpportunity[] | null {
  if (!isRecord(payload) || "Codigo" in payload || "Mensaje" in payload || !Array.isArray(payload.Listado)) return null;

  return payload.Listado.flatMap((value): NormalizedOpportunity[] => {
    if (!isRecord(value)) return [];
    const code = stringAt(value, "CodigoExterno")?.toUpperCase();
    if (!code) return [];
    const buyer = recordAt(value, "Comprador");
    const dates = recordAt(value, "Fechas");
    return [{
      buyer: stringAt(buyer, "NombreOrganismo"),
      closing: stringAt(value, "FechaCierre") || stringAt(dates, "FechaCierre"),
      code,
      description: stringAt(value, "Descripcion"),
      name: stringAt(value, "Nombre"),
      region: stringAt(buyer, "RegionUnidad"),
      status: stringAt(value, "Estado"),
      type: stringAt(value, "Tipo"),
    }];
  });
}
