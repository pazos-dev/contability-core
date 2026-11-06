---
name: accounting-implement
description: Implementar casos de uso y reglas del módulo contable desde una especificación lista. Usar al crear o modificar comportamiento contable; excluir definición inicial de reglas, revisión sin cambios y documentación aislada.
---

# Implementar una entrega contable

## Preparación

Leer AGENTS.md, docs/STATUS.md, docs/ARCHITECTURE.md y la especificación de la tarea desde la raíz. Inspeccionar código, scripts y cambios existentes antes de editar. Consultar `docs/DOMAIN.md` para el significado de conceptos.

## Procedimiento

1. Identificar criterios listos, decisiones aceptadas y bloqueos. No interpretar una propuesta documental como una regla aprobada.
2. Localizar responsabilidades equivalentes y reutilizarlas cuando su significado coincida. Evitar duplicación accidental sin unir conceptos distintos.
3. Consultar la skill de proyecto `typescript-best-practices`; consultar `clean-code-architecture` para distribuir responsabilidades o introducir patrones. Consultar `nodejs-best-practices` solo si se modifica el entorno o una integración.
4. Diseñar el cambio más pequeño que complete un resultado útil. Mantener las dependencias indicadas por arquitectura.
5. Implementar reglas y pruebas significativas: valores normales, límites, entradas inválidas y errores. Verificar la ausencia de mutación en objetos de valor.
6. Al modificar un caso de uso con persistencia, respetar la atomicidad definida, el ámbito de idempotencia y los conflictos concurrentes aplicables. No simular garantías de base real con un repositorio en memoria.
7. Ejecutar las comprobaciones reales pertinentes. Si falta configuración necesaria, crear la mínima autorizada y documentarla. No inventar resultados.
8. Revisar el diff, corregir defectos dentro de la tarea y actualizar documentos y STATUS.md.

## Reglas especiales

- Mantener cálculos monetarios exactos y una serialización sin pérdida.
- No añadir redondeos, tipos de cambio o cuentas por defecto sin política definida.
- No colocar imports HTTP, Node.js ni ORM en el dominio.
- No persistir parcialmente un asiento que deba ser atómico.
- No cambiar estados contables o eliminar historial sin especificación.
- No ampliar el alcance por completar carpetas futuras.

## Entregar

Explicar resultado observable, criterios cubiertos, comprobaciones ejecutadas y límites. Si una decisión bloquea una parte, describirla y terminar las partes independientes autorizadas.
