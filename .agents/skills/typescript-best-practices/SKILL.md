---
name: typescript-best-practices
description: Escribir o refactorizar TypeScript con contratos seguros, validación y estados explícitos. Usar al modificar tipos, funciones, clases, casos de uso o serialización en TS; excluir contenido, estilos y tareas sin código TypeScript.
---

# TypeScript seguro y claro

## Preparación

Leer la arquitectura y la especificación del proyecto. Inspeccionar tsconfig, package.json, versiones, exports y convenciones existentes. Consultar documentación oficial compatible con la versión real cuando una API sea incierta.

Leer [criterios y ejemplos](references/typescript.md) al diseñar entradas externas, estados, resultados o serialización monetaria.

## Procedimiento

1. Modelar el comportamiento antes que los tipos. Representar estados válidos de forma explícita.
2. Usar configuración estricta en la base nueva. En código existente, respetar su alcance y proponer migraciones separadas si afectan partes ajenas.
3. Recibir datos no confiables como `unknown`, validarlos en ejecución y estrechar sus tipos. No tratar un cast como validación.
4. Preferir uniones discriminadas cuando distintas variantes tengan datos obligatorios diferentes.
5. Evitar `any`, `@ts-ignore`, casts dobles y `!` usados para ocultar un error. Justificar excepciones puntuales en límites externos y acotarlas.
6. Mantener firmas públicas claras; permitir inferencia local cuando mejora la lectura. Utilizar genéricos solo si preservan una relación real entre tipos.
7. Respetar el convenio de errores del proyecto. No introducir a la vez un segundo modelo de resultados para una función aislada.
8. Mantener valores de dominio inmutables por diseño. Recordar que `readonly` no garantiza por sí solo inmutabilidad profunda en ejecución.
9. Preservar precisión y contrato de serialización; no convertir dinero de forma intermedia a `number` si implica pérdida.
10. Ejecutar el chequeo de tipos y las pruebas de comportamiento pertinentes. Verificar módulos y extensiones de imports según la configuración real.

## Evitar

Crear una interfaz por cada clase; tipos condicionales complejos sin necesidad; genéricos sin relación entre parámetros y resultado; exportar todos los internos; usar el modelo ORM como contrato del dominio; afirmar que un tipo estático valida JSON.

## Entregar

Indicar decisiones relevantes de contrato y evidencia de las comprobaciones. Mantener reglas específicas del negocio en su especificación, sin copiarlas a esta skill.
