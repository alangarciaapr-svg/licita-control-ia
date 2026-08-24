# Instrucciones del proyecto

## Propósito

LicitaControl IA ayuda a una empresa a decidir si una oportunidad de Mercado Público merece revisión o postulación. Debe responder con evidencia: qué se compra, dónde, cuándo cierra, qué coincide con el perfil y qué falta verificar.

## Prioridad actual

Mantener estable este flujo antes de ampliar módulos:

```text
Frontend → Cloudflare Worker → Mercado Público → normalización → frontend
```

La primera tarea está en `PROMPT_INICIAL_CODEX.md`.

## Reglas obligatorias

1. Nunca solicitar, mostrar, registrar ni confirmar el valor del ticket real.
2. Usar exclusivamente el binding secreto `MERCADO_PUBLICO_TICKET`.
3. Nunca guardar secretos en código, configuración versionada, pruebas o ejemplos.
4. No inventar datos de una licitación ni antecedentes empresariales.
5. Diferenciar siempre entre datos oficiales, cálculo determinista e interpretación de IA.
6. Todo análisis documental futuro debe citar archivo, página y fragmento de respaldo.
7. Los cálculos de puntaje, costos y margen deben ejecutarse en código determinista.
8. No implementar Supabase, IA documental o módulos secundarios hasta estabilizar la consulta real.
9. Mantener la aplicación independiente de SEGAV, aunque pueda integrarse en el futuro.
10. Mercado Público sigue siendo el canal oficial de presentación de ofertas.

## Convenciones técnicas

- Worker TypeScript en `worker/src/`.
- Configuración Cloudflare en `worker/wrangler.jsonc`.
- Tipos de bindings generados con `wrangler types`; no crear manualmente `Env`.
- Manejar errores con respuestas JSON estructuradas.
- No registrar URLs upstream completas porque contienen el ticket.
- Validar toda entrada externa y normalizar la respuesta de Mercado Público.
- Mantener estado por solicitud; no usar variables globales mutables.
- Añadir pruebas para normalizadores y reglas de negocio.

## Definición de terminado para cambios de API

- TypeScript compila.
- Las pruebas pasan.
- No aparecen secretos en el diff.
- `/health` responde sin revelar credenciales.
- Los errores upstream no filtran URLs ni respuestas sensibles.
- La documentación queda actualizada.

