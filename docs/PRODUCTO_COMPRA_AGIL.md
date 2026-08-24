# Estrategia de producto: Compra Ágil

## Enfoque

LicitaControl IA se especializa en la decisión previa a cotizar: descubrir oportunidades abiertas, ordenarlas por urgencia y separar claramente datos oficiales, cálculos deterministas y verificaciones pendientes. Mercado Público sigue siendo el único canal de envío de cotizaciones.

## Referentes revisados

- **LicitaLAB:** conexión con distintas modalidades, estudios de mercado, historial de compradores y consultas asistidas sobre bases.
- **LicitX:** monitoreo frecuente, reglas de priorización, alertas multicanal, gestión del ciclo comercial e inteligencia histórica.
- **LiciMatch:** cruce semántico con catálogo, explicación del resultado y validación humana antes de actuar.
- **Vendify:** panel centralizado, alertas filtradas y análisis específico de Compra Ágil.
- **AdjudicaPro:** checklist de requisitos con estados de cumplimiento, verificación y problema.
- **Licitaquí:** compatibilidad con perfil empresarial, alertas y predicción de demanda por comprador.

## Síntesis propia

La propuesta no replica una suite generalista. Combina cuatro ideas en un flujo corto:

1. **Radar oficial:** procesos publicados desde la API Compra Ágil v2.
2. **Urgencia auditable:** horas restantes calculadas exclusivamente desde la fecha oficial de cierre.
3. **Semáforo de verificación:** distingue lo confirmado por ChileCompra de lo que la empresa debe acreditar.
4. **Salida operativa:** cada oportunidad termina en cotizar, revisar o descartar, pero la acción oficial ocurre en Mercado Público.

## Fuente oficial y supuestos

- La API Compra Ágil v2 está publicada como beta y usa `https://api2.mercadopublico.cl`.
- El listado permite filtrar por estado, región, texto y paginación.
- El detalle puede incluir productos, documentos, entrega, presupuesto, convocatoria y señales medioambientales o sociales.
- `estado=publicada` se interpreta como oportunidad abierta según la documentación oficial.
- Primer llamado implica una verificación empresarial: la aplicación no afirma que una empresa sea EMT ni que esté hábil.
- El conteo de cotizaciones corresponde al llamado vigente informado por la API.
- Los campos ausentes se muestran como “No informado”; nunca se completan por inferencia.

## Fuentes consultadas

- ChileCompra, API de Mercado Público: https://www.chilecompra.cl/api/
- ChileCompra, Guía API Compra Ágil v2: https://www.chilecompra.cl/wp-content/uploads/2026/05/Documentacion_API_Compra_Agil-2-1.pdf
- ChileCompra, Compra Ágil para proveedores: https://www.chilecompra.cl/compra-agil-proveedor/
- ChileCompra, Ley y Compra Ágil: https://www.chilecompra.cl/ley-compra-agil/
- LicitaLAB: https://www.licitalab.cl/
- LicitX: https://licitx.cl/
- LiciMatch: https://licimatch.cl/
- Vendify: https://vendify.cl/
- AdjudicaPro: https://adjudicapro.cl/
- Licitaquí: https://licitaqui.cl/
