# LicitaControl IA

Aplicación para mejorar el proceso de Mercado Público en Chile mediante automatización, análisis estructurado e inteligencia artificial.

## Qué buscamos resolver

Mercado Público entrega la información oficial, pero el proveedor todavía debe revisar miles de oportunidades, leer bases extensas, identificar requisitos, entender fórmulas de evaluación, preparar documentos y decidir si una licitación realmente le conviene.

LicitaControl IA busca transformar ese proceso en un flujo asistido:

**Buscar → filtrar → entender → verificar → calcular → decidir → preparar.**

## Estado del proyecto

Actualmente existe:

- Prototipo HTML V3.
- Consulta API oficial comprobada manualmente.
- Cloudflare Worker inicial.
- Endpoint `/health`.
- Endpoint `/api/licitacion/{codigo}`.
- Normalización básica de licitación, comprador, fechas e ítems.
- Compatibilidad preliminar por reglas en el frontend.

## Archivos iniciales

- `index.html`: frontend actual.
- `worker/worker.js`: backend Cloudflare Worker.
- `AGENTS.md`: instrucciones principales para Codex.

## Seguridad

El ticket de Mercado Público no debe estar nunca en el repositorio.

En Cloudflare debe guardarse como Secret:

`MERCADO_PUBLICO_TICKET`

## Primer objetivo de Codex

Estabilizar la conexión real Frontend → Cloudflare Worker → Mercado Público y preparar el código para evolucionar hacia React/PWA, manteniendo el prototipo funcional.

## Roadmap resumido

1. Consulta real por código.
2. Radar automático de licitaciones activas.
3. Perfil configurable de empresa.
4. Motor de compatibilidad basado en reglas.
5. Supabase.
6. IA semántica.
7. Análisis documental y trazabilidad.
8. Auditor de admisibilidad.
9. Simulador de ponderaciones.
10. Evaluación económica.
11. Recomendación POSTULAR / REVISAR / DESCARTAR.
