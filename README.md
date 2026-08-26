# LicitaControl IA

LicitaControl IA automatiza la detección y preparación de oportunidades para proveedores del Estado. Consulta las licitaciones publicadas, las contrasta con un perfil comercial mediante reglas deterministas y crea una cola priorizada para abrir su expediente. No sustituye el sistema transaccional: la oferta técnica/económica o cotización se envía y confirma exclusivamente en Mercado Público.

## Estado actual

Este repositorio contiene el primer MVP reconstruido:

- Frontend PWA estático en `frontend/`.
- Entrada raíz `index.html` que dirige a la PWA.
- Cloudflare Worker en `worker/`.
- `GET /health` para comprobar la configuración.
- `GET /api/oportunidades?fecha=AAAA-MM-DD` lista las licitaciones publicadas de un día de los últimos 31 días mediante API v1.
- `GET /api/licitacion/{codigo}` es el flujo principal: código oficial → ficha normalizada → frontend.
- `GET /api/compra-agil` y `GET /api/compra-agil/{codigo}` se conservan en el Worker, pendientes de validación real de acceso v2. El frontend no los consulta automáticamente.
- La ruta Compra Ágil acepta un código COT ingresado por la persona usuaria y genera un checklist manual. No presenta ese código ni sus datos como verificados mientras API2 no esté validada.
- Las dos rutas terminan con una continuación explícita a Mercado Público; la aplicación no maneja credenciales de proveedor ni envía ofertas.
- El perfil comercial (palabras clave, exclusiones, regiones preferidas y plazo mínimo) queda solo en `localStorage`. Al abrir la aplicación se ejecuta automáticamente el radar del día.
- El puntaje se calcula en código: coincidencias positivas, región informada, plazo y estado. Las exclusiones y un plazo insuficiente descartan la oportunidad; cada coincidencia visible explica sus señales.
- Ticket de Mercado Público aislado en el secreto `MERCADO_PUBLICO_TICKET`.
- Pruebas de normalizadores, contrato HTTP, redacción de errores, límites de respuesta y utilidades del frontend; validación TypeScript.

## Arquitectura

```text
Frontend PWA
    ↓
Cloudflare Worker
    ↓
API Mercado Público
    ↓
Datos normalizados y explicables
    ↓
Frontend
```

## Desarrollo local

Requisitos: Node.js 22 o superior.

```bash
npm --prefix worker install
```

Para pruebas unitarias no necesitas el ticket: se usan datos sintéticos y credenciales generadas durante la prueba. Si necesitas consultar localmente, configura el binding `MERCADO_PUBLICO_TICKET` solo en `worker/.dev.vars` (ignorado por Git), sin imprimirlo ni compartirlo. Las consultas de producción reutilizan el secreto ya guardado en Cloudflare.

Inicia la API:

```bash
npm run dev:api
```

Sirve `frontend/` con cualquier servidor estático. El frontend usa por defecto el Worker desplegado. Para desarrollo local, abre **Conexión API** y cambia la URL a `http://localhost:8787`.

## Validación

```bash
npm run check
npm test
```

## Despliegue del Worker

Autentica Wrangler y registra el secreto de forma interactiva:

```bash
cd worker
npx wrangler login
npx wrangler secret put MERCADO_PUBLICO_TICKET
npm run deploy
```

Nunca escribas el ticket en `wrangler.jsonc`, el frontend, un commit, una captura o un mensaje.

API de producción: `https://licita-control-api.alangarcia-apr.workers.dev`.

Frontend de producción: `https://licita-control-ia.pages.dev`.

El frontend se publica como archivos estáticos en Cloudflare Pages. No necesita ni recibe el ticket; todas las consultas pasan por el Worker.

## Contrato y seguridad de la consulta

- El código debe coincidir con `CodigoExterno`; una respuesta vacía o de otro proceso nunca se atribuye al código solicitado.
- Los campos ausentes se muestran como no informados. No se inventan datos empresariales, montos ni probabilidad de adjudicación.
- `meta.retrievedAt` indica cuándo se recibió la ficha; no es una fecha de modificación del proceso.
- Las fechas de Mercado Público sin zona horaria se muestran conservando su hora textual, sin convertirlas usando la zona del navegador. `DiasCierreLicitacion` se etiqueta como dato de la API, no como cálculo propio.
- Región y comuna pertenecen al comprador, no necesariamente al lugar de entrega.
- Solo un listado oficial vacío devuelve 404. Una estructura inválida o error de aplicación con HTTP 200 devuelve 502. 401/403 upstream devuelve 503; 429 conserva el límite temporal.
- Los mensajes de excepción, URLs upstream y cuerpos de error no se registran ni devuelven. Las trazas de fetch están desactivadas porque la API v1 transporta el ticket en la URL upstream. No habilitarlas sin verificar redacción de credenciales.
- La lectura JSON limita los bytes reales a 5 MB, incluso sin `Content-Length`. No se siguen redirecciones upstream que podrían reenviar credenciales.
- `/health` informa disponibilidad/configuración, no autenticación efectiva contra Mercado Público.
- La caché offline conserva solo recursos de la interfaz, nunca consultas ni salud de la API.

## Límites del MVP

- Consulta individual de licitaciones v1; no incluye todavía listados automáticos ni historial de órdenes AG.
- Compra Ágil v2 sigue pendiente de validar: un HTTP 403 no demuestra por sí solo que se necesite un ticket diferente o una habilitación especial.
- El radar automático actual cubre licitaciones v1. No es todavía un servicio en segundo plano ni envía notificaciones cuando el navegador está cerrado.
- No incorpora autenticación, base de datos ni análisis documental.
- El conteo de productos es determinista; el checklist es orientación de revisión y no un dictamen de admisibilidad.
- Los checks son confirmaciones manuales de la persona usuaria, no verificaciones automáticas ni evidencia de que una oferta fue recibida.
- La compatibilidad empresarial se implementará después de definir el perfil y reglas auditables.
- La postulación oficial continúa realizándose en Mercado Público.

## Próximos hitos

1. Validar y publicar la consulta individual v1 con el secreto existente.
2. Añadir búsqueda de licitaciones por fecha/estado y filtros sobre datos oficiales.
3. Incorporar órdenes de compra AG como historial, sin presentarlas como oportunidades abiertas.
4. Resolver la causa del rechazo de API2 y validar datos reales antes de activar el radar de Compra Ágil.
5. Solo después de estabilizar el flujo: perfil empresarial, persistencia y análisis documental con evidencia.

La estrategia de producto y el análisis comparativo están documentados en `docs/PRODUCTO_COMPRA_AGIL.md`.
