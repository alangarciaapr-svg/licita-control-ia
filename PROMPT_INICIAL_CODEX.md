# Prompt inicial para Codex — LicitaControl IA

Lee primero `AGENTS.md` y `README.md` completos y luego inspecciona todo el repositorio.

Quiero continuar el desarrollo de **LicitaControl IA**, una aplicación independiente para mejorar el proceso de Mercado Público en Chile mediante automatización e inteligencia artificial.

## Situación actual

Existe un frontend HTML V3 y un Cloudflare Worker inicial. El Worker debe mantener el ticket de Mercado Público como Secret `MERCADO_PUBLICO_TICKET` y nunca exponerlo al frontend.

Ya se comprobó manualmente que la API oficial funciona y que podemos consultar licitaciones activas y detalle por código.

## Tu primera tarea

Audita el estado actual del repositorio y deja funcionando de forma robusta el flujo:

`Frontend → Cloudflare Worker → API Mercado Público → respuesta normalizada → frontend`.

Debes garantizar que:

1. `/health` permita comprobar el backend sin revelar secretos.
2. `/api/licitacion/{codigo}` consulte una licitación real por código.
3. La respuesta quede normalizada en una estructura estable.
4. El frontend permita introducir un código y cargarlo.
5. Se muestren estados de carga, éxito, vacío y error.
6. No se exponga el ticket de Mercado Público en ninguna parte.
7. No inventes información no entregada por la API.
8. Mantengas el diseño y funcionalidad actual salvo cambios necesarios.
9. Hagas pruebas razonables y documentes cómo ejecutar/probar el proyecto.

No construyas todavía Supabase, análisis documental ni el motor IA completo. Primero deja sólido este hito.

Al finalizar, informa:
- qué encontraste,
- qué archivos modificaste,
- qué pruebas realizaste,
- qué problemas quedan pendientes,
- y cuál sería el siguiente paso mínimo recomendado.
