# LicitaControl IA

LicitaControl IA es un radar operativo especializado en Compra Ágil para encontrar, entender y priorizar oportunidades de Mercado Público. La meta no es reemplazar el portal oficial: es transformar sus datos en una decisión explicable para cada empresa.

## Estado actual

Este repositorio contiene el primer MVP reconstruido:

- Frontend PWA estático en `frontend/`.
- Entrada raíz `index.html` que dirige a la PWA.
- Cloudflare Worker en `worker/`.
- `GET /health` para comprobar la configuración.
- `GET /api/compra-agil` para buscar oportunidades abiertas por palabra clave, región y página.
- `GET /api/compra-agil/{codigo}` para consultar el detalle oficial de una Compra Ágil.
- `GET /api/licitacion/{codigo}` se conserva para compatibilidad con la consulta individual anterior.
- Ticket de Mercado Público aislado en el secreto `MERCADO_PUBLICO_TICKET`.
- Pruebas unitarias del normalizador y validación TypeScript.

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

Crea `worker/.dev.vars` —está ignorado por Git— con:

```dotenv
MERCADO_PUBLICO_TICKET=tu_ticket_real
```

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

## Límites del MVP

- Consulta en tiempo real la API beta de Compra Ágil; todavía no mantiene una sincronización histórica propia.
- No incorpora autenticación, base de datos ni análisis documental.
- La urgencia se calcula de forma determinista desde la fecha de cierre; no representa probabilidad de adjudicación.
- La compatibilidad empresarial se implementará después de definir el perfil y reglas auditables.
- La postulación oficial continúa realizándose en Mercado Público.

## Próximos hitos

1. Estabilizar el radar real de Compra Ágil.
2. Añadir perfil empresarial, favoritos y descartados.
3. Implementar alertas de cierre y nuevas coincidencias.
4. Implementar compatibilidad objetiva por servicio, región, monto, equipo y plazo.
5. Incorporar persistencia multiempresa.
6. Analizar bases y anexos con citas al documento y página.
7. Añadir auditor de admisibilidad, simulador y evaluación económica.

La estrategia de producto y el análisis comparativo están documentados en `docs/PRODUCTO_COMPRA_AGIL.md`.
