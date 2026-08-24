# LicitaControl IA

LicitaControl IA es una aplicación independiente para encontrar, entender y priorizar oportunidades de Mercado Público. La meta no es reemplazar el portal oficial: es transformar sus datos en una decisión explicable para cada empresa.

## Estado actual

Este repositorio contiene el primer MVP reconstruido:

- Frontend PWA estático en `frontend/`.
- Entrada raíz `index.html` que dirige a la PWA.
- Cloudflare Worker en `worker/`.
- `GET /health` para comprobar la configuración.
- `GET /api/licitacion/{codigo}` para consultar y normalizar una licitación real.
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

Sirve `frontend/` con cualquier servidor estático. En la pantalla **Conexión API**, usa `http://localhost:8787`.

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

## Límites del MVP

- Consulta una licitación por código; todavía no sincroniza el universo completo.
- No incorpora autenticación, base de datos ni análisis documental.
- El porcentaje de compatibilidad se implementará después de definir el perfil empresarial y reglas auditables.
- La postulación oficial continúa realizándose en Mercado Público.

## Próximos hitos

1. Estabilizar la consulta individual real.
2. Crear búsqueda automática de licitaciones activas y Compra Ágil.
3. Añadir perfil empresarial, favoritos y descartados.
4. Implementar compatibilidad objetiva por servicio, región, monto, equipo y plazo.
5. Incorporar persistencia multiempresa.
6. Analizar bases y anexos con citas al documento y página.
7. Añadir auditor de admisibilidad, simulador y evaluación económica.
