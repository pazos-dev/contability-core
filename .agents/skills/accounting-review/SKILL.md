---
name: accounting-review
description: Revisar cambios del módulo contable contra especificaciones y contratos. Usar al solicitar revisión o auditoría de un diff o comportamiento contable; excluir implementación habitual sin revisión solicitada y preferencias estéticas aisladas.
---

# Revisar un cambio contable

## Preparación

Leer AGENTS.md, la especificación y `docs/ARCHITECTURE.md` desde la raíz. Inspeccionar el diff real y las partes relacionadas. Distinguir el comportamiento existente del introducido por el cambio.

## Comprobaciones

1. Relacionar cada criterio de aceptación con código y evidencia.
2. Comprobar exactitud monetaria, precisión, incompatibilidad de monedas, negativos, límites y serialización según las decisiones aceptadas.
3. Revisar invariantes, transiciones y ausencia de efectos parciales. Verificar atomicidad, duplicados y concurrencia cuando correspondan.
4. Comprobar que entradas externas se validan en ejecución y que errores de infraestructura no se presentan como éxito.
5. Revisar dependencias entre capas, API pública y compatibilidad. No exigir patrones por preferencia.
6. Inspeccionar pruebas para detectar casos sin cobertura y verificaciones que solo repiten la implementación.
7. Ejecutar comprobaciones pertinentes existentes. Distinguir ejecución propia, evidencia aportada y aspectos sin verificar.

Consultar `typescript-best-practices` para contratos y tipos; `nodejs-best-practices` para integraciones; `clean-code-architecture` para límites o abstracciones. Leer únicamente la parte relevante.

## Informar hallazgos

Usar `docs/templates/REVIEW.md`. Para cada defecto indicar gravedad, archivo y línea reales, escenario reproducible y consecuencia. Priorizar defectos de comportamiento. Separar sugerencias de los problemas que afectan la entrega.

No afirmar que no hay errores porque las pruebas pasan. Si no se encuentran hallazgos, decirlo e indicar las limitaciones relevantes de la revisión. No corregir ni expandir el cambio durante una revisión de solo lectura sin autorización.
