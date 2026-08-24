import { describe, expect, it } from "vitest";
import {
  normalizeCompraAgilDetailResponse,
  normalizeCompraAgilListResponse,
} from "../src/normalizeCompraAgil";

const fixedNow = new Date("2026-08-24T12:00:00Z");

describe("Compra Ágil v2 normalizers", () => {
  it("normaliza un listado y calcula la urgencia de forma determinista", () => {
    const result = normalizeCompraAgilListResponse(
      {
        success: "OK",
        payload: {
          items: [
            {
              codigo: "1057539-228-COT26",
              nombre: "Insumos de oficina",
              estado: { codigo: "publicada", glosa: "Publicada" },
              convocatoria: { estado_convocatoria: 1, descripcion: "Primer llamado" },
              fechas: {
                fecha_publicacion: "2026-08-24T09:00:00Z",
                fecha_cierre: "2026-08-25T12:00:00Z",
                fecha_ultimo_cambio: "2026-08-24T09:00:00Z",
              },
              montos: { moneda: "CLP", monto_disponible: 1500000, monto_disponible_clp: 1500000 },
              institucion: {
                organismo_comprador: "Municipalidad de Ejemplo",
                unidad_compra: "Abastecimiento",
                region: 13,
                nombre_region: "Región Metropolitana",
              },
              resumen: { total_ofertas_recibidas: 2 },
              documentos: [{ id: "documento-1", nombre: "Requerimiento.pdf" }],
            },
          ],
          paginacion: { numero_pagina: 1, tamano_pagina: 24, total_paginas: 3, total_resultados: 51 },
        },
      },
      fixedNow,
    );

    expect(result?.items[0].code).toBe("1057539-228-COT26");
    expect(result?.items[0].dates.hoursRemaining).toBe(24);
    expect(result?.items[0].call.number).toBe(1);
    expect(result?.pagination.totalResults).toBe(51);
  });

  it("normaliza detalle, productos y señales verificables", () => {
    const result = normalizeCompraAgilDetailResponse(
      {
        success: "OK",
        payload: {
          codigo: "1057539-228-COT26",
          nombre: "Insumos de oficina",
          descripcion: "Compra de materiales para abastecimiento",
          estado: { codigo: "publicada", glosa: "Publicada" },
          convocatoria: { estado_convocatoria: 1, descripcion: "Primer llamado" },
          fechas: { fecha_cierre: "2026-08-25T12:00:00Z" },
          presupuesto: { moneda: "CLP", monto_disponible: 1500000, monto_disponible_clp: 1500000 },
          institucion: { organismo_comprador: "Municipalidad de Ejemplo", region: 13 },
          entrega: { direccion_entrega: "Santiago", plazo_entrega_dias: 5 },
          resumen: { total_ofertas_recibidas: 2 },
          flags: {
            considera_requisitos_medioambientales: true,
            considera_requisitos_impacto_social_economico: false,
          },
          orden_compra: { id_orden_compra: null },
          productos_solicitados: [
            {
              codigo_producto: "44121618",
              nombre: "Tijeras",
              descripcion: "Tijeras de oficina",
              cantidad: 10,
              unidad_medida: "EA",
            },
          ],
        },
      },
      fixedNow,
    );

    expect(result?.delivery.days).toBe(5);
    expect(result?.flags.environmentalRequirements).toBe(true);
    expect(result?.products[0].quantity).toBe(10);
    expect(result?.purchaseOrderIssued).toBe(false);
  });

  it("rechaza estructuras que no confirman éxito oficial", () => {
    expect(normalizeCompraAgilListResponse({ success: "NOK", payload: null })).toBeNull();
    expect(normalizeCompraAgilDetailResponse(null)).toBeNull();
  });
});
