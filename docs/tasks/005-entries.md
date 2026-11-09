# 005-entries — Implementar asientos y líneas

Estado: completada y verificada el 2026-11-08. Leer AGENTS.md y `docs/specs/entries.md`.
Dependencia: respetar el orden en docs/ROADMAP.md.

## Resultado

E01-E11; no permitir mutaciones fuera del agregado; reversión crea borrador.

## Procedimiento

1. Leer las skills de proyecto accounting-implement y typescript-best-practices; clean-code-architecture al distribuir responsabilidades.
2. Implementar el incremento sin HTTP, ORM ni interfaz.
3. Añadir pruebas `*.test.mjs` bajo tests/ que consuman la salida compilada y verifiquen el comportamiento.
4. Exportar solo API pública implementada desde src/index.ts.
5. Ejecutar pnpm check:project, pnpm typecheck, pnpm build y pnpm test.
6. Actualizar STATUS.md con evidencia real y pendientes.

No marcar esta tarea terminada solo porque estén creadas sus rutas.

## Entregado

Archivos en `src/core/domain/entries/`: `journal-entry.ts`, `journal-entry-line.ts`, `entry-status.ts`,
`posting-side.ts`, `entry-errors.ts`, `entry-text.ts` e `index.ts` (barrel publicado).

Criterios cubiertos por `tests/entries.test.mjs`: E01, E02, E03, E04, E05, E06, E07, E08, E09, E10 y
E11, más la validación de identidad del borrador, `removeLine` de una línea inexistente y la reversión
rechazada fuera de POSTED. La superficie pública queda fijada en `tests/public-api.test.mjs`.

## Decisiones registradas

- `lines` devuelve `Object.freeze([...])` en cada lectura. Sin eso, E10 no se puede cumplir: un array
  interno expuesto permite cambiar el agregado por fuera de sus métodos.
- La reversión reutiliza los ids de las líneas originales. Son únicos dentro de su asiento, que es la
  regla que la especificación impone; un id de línea único a nivel global pertenece a la persistencia.
- `createReversalDraft` exige el original en POSTED y un id distinto del original. Revertir un borrador
  no significa nada y reutilizar el id rompería la identidad del asiento.
- El orden de rechazo de `post()` es estado, cantidad de líneas, moneda y equilibrio. Así cada criterio
  (E02, E05, E03) recibe el código que le corresponde sin ambigüedad.

## Evidencia

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Correcto. |
| `pnpm typecheck` | Correcto. |
| `pnpm build` | Correcto. |
| `pnpm test` | 90 pruebas, 90 correctas, 0 fallos (15 nuevas). |

## Pendiente fuera de esta tarea

Cuentas activas y contabilizables, pertenencia a diario y libro, apertura del período, doble reversión
y carreras: `docs/tasks/006-application.md`.
