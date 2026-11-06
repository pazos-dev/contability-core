# Workflow de desarrollo con IA

## 1. Recuperar contexto

Leer AGENTS.md, STATUS.md y la especificación afectada. Inspeccionar el código y los scripts existentes. Identificar qué parte de la tarea está autorizada y qué decisiones continúan pendientes. No dar por implementado un elemento por estar en el roadmap.

## 2. Especificar

Aplicar `accounting-spec`. Definir objetivo, alcance, reglas, ejemplos, errores y criterios de aceptación. Registrar las dudas que alteran resultados o contratos. Resolver elecciones técnicas internas de forma autónoma cuando no cambian el comportamiento aprobado.

Una especificación está lista cuando cada comportamiento a implementar tiene resultados verificables y no quedan decisiones que lo bloqueen. La aprobación del contenido puede venir de la instrucción actual del usuario; no solicitar un trámite adicional de aprobación por rutina.

## 3. Planificar una entrega pequeña

Aplicar `clean-code-architecture` cuando haya que distribuir responsabilidades. Identificar archivos, contratos y pruebas afectados. Preferir un cambio que se pueda revisar de una vez. No crear infraestructura que el incremento no necesita.

## 4. Implementar y verificar

Aplicar `accounting-implement` y `typescript-best-practices`. Aplicar `nodejs-best-practices` solo si se modifica código del entorno o integraciones. Escribir pruebas de reglas y casos límite; implementarlas junto al comportamiento. Ejecutar tipos, lint y pruebas disponibles pertinentes.

Si faltan scripts, informar de ello y configurar únicamente los necesarios para la entrega. No reportar un comando sugerido como ejecutado.

## 5. Revisar

Aplicar `accounting-review`. Comparar cada criterio de aceptación con código y evidencia. Evaluar errores, precisión, consistencia y límites de arquitectura. Revisar el diff y corregir los fallos dentro de la tarea autorizada. No exigir otro agente para cada cambio.

## 6. Entregar y continuar

Explicar el comportamiento final, las comprobaciones reales y las limitaciones. Actualizar STATUS.md y las decisiones modificadas. Usar la plantilla de relevo cuando una sesión vaya a terminar con trabajo pendiente.

## Una fuente por decisión

- Alcance: SCOPE.md.
- Arquitectura vigente: ARCHITECTURE.md; motivo e historia: ADR.
- Significado de conceptos: DOMAIN.md.
- Comportamiento de una función: su especificación.
- Estado: STATUS.md.
- Procedimientos reutilizables: skills.

Ante contradicciones, contrastar con la instrucción vigente del usuario y registrar qué decisión sustituye a cuál. No resolver un conflicto contable eligiendo arbitrariamente el archivo más reciente.
