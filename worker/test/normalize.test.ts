import { describe, expect, it } from "vitest";
import { normalizeTenderResponse } from "../src/normalize";

describe("normalizeTenderResponse", () => {
  it("normaliza una licitación y sus ítems", () => {
    const result = normalizeTenderResponse(
      {
        Listado: [
          {
            CodigoExterno: "1003-18-LP26",
            Nombre: "Arriendo de maquinaria",
            Estado: "Publicada",
            Moneda: "CLP",
            DiasCierreLicitacion: "17",
            Comprador: {
              NombreOrganismo: "Ministerio de Obras Públicas",
              NombreUnidad: "Dirección de Vialidad XI Región",
              RegionUnidad: "Región de Aysén",
              ComunaUnidad: "Coyhaique",
            },
            Fechas: { FechaCierre: "2026-09-10T15:00:00" },
            Items: {
              Listado: [
                {
                  CodigoProducto: 22101500,
                  NombreProducto: "Cargadoras de entrada",
                  Descripcion: "Arriendo de maquinaria para faenas de conservación",
                  Cantidad: 1,
                  UnidadMedida: "Unidad",
                  Categoria: "Maquinaria pesada de construcción",
                },
              ],
            },
          },
        ],
      },
      "1003-18-LP26",
    );

    expect(result).not.toBeNull();
    expect(result?.buyer.commune).toBe("Coyhaique");
    expect(result?.dates.daysRemaining).toBe(17);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].code).toBe("22101500");
  });

  it("devuelve null cuando no existe un listado válido", () => {
    expect(normalizeTenderResponse({ Listado: [] }, "NO-EXISTE")).toBeNull();
    expect(normalizeTenderResponse(null, "NO-EXISTE")).toBeNull();
  });

  it("no atribuye al código solicitado una ficha vacía o de otro proceso", () => {
    expect(normalizeTenderResponse({ Listado: [{}] }, "123-45-LE26")).toBeNull();
    expect(normalizeTenderResponse({ Listado: [{ CodigoExterno: "999-99-LE26" }] }, "123-45-LE26")).toBeNull();
  });

  it("conserva ausencias y no inventa productos o cantidades", () => {
    const result = normalizeTenderResponse({ Listado: [{ CodigoExterno: "123-45-LE26", Items: { Listado: [{}, null, { NombreProducto: "Prueba sintética", Cantidad: "" }] } }] }, "123-45-LE26");
    expect(result?.buyer.organization).toBeNull();
    expect(result?.dates.closing).toBeNull();
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].quantity).toBeNull();
  });
});
