# AGENTS.md — LicitaControl IA

## 1. Objetivo del proyecto

LicitaControl IA es una aplicación independiente orientada a mejorar el proceso de análisis y decisión en Mercado Público de Chile mediante automatización e inteligencia artificial.

La aplicación NO reemplaza Mercado Público ni realiza la presentación oficial de ofertas. Su función es mejorar todo el trabajo previo:

1. Buscar oportunidades automáticamente.
2. Filtrar licitaciones relevantes según el perfil de cada empresa.
3. Consultar y normalizar información oficial desde la API de Mercado Público.
4. Analizar bases y anexos sin inventar información.
5. Auditar requisitos de admisibilidad.
6. Interpretar criterios y fórmulas de evaluación.
7. Simular puntajes.
8. Evaluar costos, margen y conveniencia económica.
9. Entregar una recomendación POSTULAR / REVISAR / DESCARTAR con fundamentos trazables.

## 2. Estado actual

El proyecto está en fase de prototipo funcional inicial.

Ya se comprobó manualmente que la API oficial de Mercado Público funciona con ticket válido y devuelve licitaciones activas y detalle por código.

Se verificó una licitación real:
- Código: `1003-18-LP26`
- Nombre: `ARRIENDO DE MAQUINARIA PARA FAENAS CONSERVACIÓN`
- Estado: Publicada
- Organismo: Ministerio de Obras Públicas / Dirección de Vialidad
- Región: Aysén
- Comuna: Coyhaique
- Producto: Cargadoras de entrada
- Código producto UNSPSC: `22101501`
- Código categoría: `22101500`

El frontend actual es un HTML autocontenido de demostración con navegación, Radar, ficha, datos API y un motor de compatibilidad inicial basado en reglas.

Existe además un Cloudflare Worker inicial preparado para consultar una licitación por código y ocultar el ticket de Mercado Público.

## 3. Arquitectura objetivo

```text
Frontend / PWA
    ↓
Backend seguro (Cloudflare Worker)
    ↓
API Mercado Público
    ↓
Normalización de datos
    ↓
Supabase
    ↓
Motor de reglas + Motor IA
    ↓
Radar / análisis / simulación / decisión
```

### Frontend objetivo
- React + Vite.
- PWA instalable.
- Responsive para computador y móvil.
- Mantener el diseño visual actual como referencia.

### Backend
- Cloudflare Worker para proteger credenciales y consumir API Mercado Público.
- Nunca exponer el ticket en frontend, repositorio, logs ni respuestas.
- CORS debe restringirse al dominio real en producción.

### Base de datos futura
- Supabase/PostgreSQL.
- Autenticación.
- RLS.
- Storage para bases y anexos.

## 4. Reglas críticas de seguridad

1. NUNCA escribir, solicitar ni commitear el ticket real de Mercado Público.
2. La credencial se llama `MERCADO_PUBLICO_TICKET` y debe existir solo como Secret del entorno.
3. No crear `.env` con secretos reales dentro del repositorio.
4. No exponer secretos en mensajes de error, consola, respuestas JSON o logs.
5. Mantener separación frontend/backend.
6. Validar códigos y parámetros recibidos por el Worker.
7. Aplicar límites de uso/rate limiting antes de producción.

## 5. Regla fundamental sobre IA

La IA puede interpretar y clasificar, pero NO debe inventar requisitos ni afirmar que una condición existe si no se encuentra en una fuente verificable.

Si falta información debe indicarse explícitamente:

`Pendiente de análisis documental` o `Dato no disponible`.

Cuando se analicen documentos, toda conclusión importante debe poder mostrar:
- documento fuente,
- página/sección,
- fragmento o referencia,
- nivel de confianza.

Los cálculos de puntajes, costos y márgenes deben ejecutarse mediante código determinista, no mediante cálculos libres de un modelo de lenguaje.

## 6. Motor de compatibilidad

No limitarse a palabras clave.

El objetivo es combinar:
- título,
- descripción,
- productos,
- códigos UNSPSC,
- región,
- comprador,
- fechas,
- perfil de empresa,
- reglas objetivas,
- análisis semántico posterior.

Ejemplo de por qué esto importa:

`ADQUISICION DE NEUMATICOS PARA MAQUINARIA PESADA`

contiene la palabra maquinaria, pero no necesariamente es una oportunidad relevante para una empresa que presta servicios de maquinaria forestal.

El puntaje siempre debe ser explicable mediante factores visibles.

## 7. Perfil de empresa objetivo

La futura app debe permitir configurar por empresa:
- rubros y servicios,
- regiones y comunas,
- productos/categorías UNSPSC,
- maquinaria y equipos,
- experiencia acreditable,
- personal y certificaciones,
- documentos disponibles y vencimientos,
- monto mínimo/máximo,
- margen mínimo,
- palabras de interés y exclusión.

## 8. Módulos previstos

1. Dashboard.
2. Radar automático.
3. Perfil de empresa.
4. Ficha de licitación.
5. Análisis IA.
6. Auditor de admisibilidad.
7. Simulador de ponderaciones.
8. Evaluación económica.
9. Documentos.
10. Postulaciones.
11. Calendario y alertas.
12. Competidores e histórico.

## 9. Prioridad de desarrollo actual

No intentar implementar todo a la vez.

### Hito inmediato
Convertir la V3 en una aplicación capaz de:

1. Configurarse con una URL de backend.
2. Consultar `GET /health`.
3. Consultar `GET /api/licitacion/{codigo}`.
4. Mostrar los datos normalizados de una licitación real.
5. Manejar errores de forma clara.
6. Mantener el ticket fuera del frontend.

### Siguiente hito
Crear endpoint de Radar para licitaciones activas:
- consultar API oficial,
- normalizar,
- filtrar en backend,
- paginar,
- evitar duplicados,
- devolver candidatos relevantes.

Luego crear perfil de empresa y motor de compatibilidad V1.

## 10. Forma de trabajo esperada de Codex

Antes de modificar:
1. Leer este `AGENTS.md` completo.
2. Leer `README.md`.
3. Inspeccionar los archivos existentes.
4. Explicar brevemente el cambio a realizar.
5. Mantener lo que ya funciona salvo que el cambio requiera modificarlo.

Después de modificar:
1. Ejecutar verificaciones razonables.
2. Informar archivos modificados.
3. Informar pruebas realizadas.
4. Indicar cualquier pendiente o riesgo.

No realizar refactors grandes sin una razón técnica clara.
No agregar dependencias innecesarias.
No sustituir datos reales por ficticios salvo datos demo explícitamente marcados como tales.

## 11. Convenciones

- Interfaz y mensajes de usuario en español.
- Código y nombres técnicos pueden estar en inglés o español, pero mantener consistencia.
- Funciones pequeñas y legibles.
- Separar normalización de API, reglas de negocio y presentación.
- Evitar lógica crítica duplicada entre frontend y backend.
