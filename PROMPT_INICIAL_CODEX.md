# Primera tarea para Codex

Lee completos `AGENTS.md`, `README.md`, `frontend/app.js` y `worker/src/index.ts`.

Después:

1. Ejecuta `npm --prefix worker install`, `npm run check` y `npm test`.
2. Revisa que el Worker implemente correctamente `/health` y `/api/licitacion/{codigo}`.
3. Comprueba que el ticket nunca llegue al navegador, logs o mensajes de error.
4. Corrige únicamente problemas que afecten el flujo real frontend → Worker → Mercado Público.
5. No agregues todavía Supabase, autenticación, análisis documental ni IA generativa.
6. Documenta cualquier supuesto sobre la respuesta de la API y añade una prueba de regresión.

Resultado esperado: una consulta individual estable, segura y verificable antes de construir el Radar automático.

