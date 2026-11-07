# 003-journal — Implementar diario

Estado: completada. Evidencia: `tests/journal.test.mjs` (5 pruebas, J01-J02 y desactivación con datos
conservados) y `docs/STATUS.md`, que registra las validaciones pendientes de repositorio (J03, J05).
Leer AGENTS.md y `docs/specs/journal.md`.
Dependencia: respetar el orden en docs/ROADMAP.md.

## Resultado

J01-J02 y desactivación con datos conservados; no duplicar JournalEntry.

## Procedimiento

1. Leer las skills de proyecto accounting-implement y typescript-best-practices; clean-code-architecture al distribuir responsabilidades.
2. Implementar el incremento sin HTTP, ORM ni interfaz.
3. Añadir pruebas `*.test.mjs` bajo tests/ que consuman la salida compilada y verifiquen el comportamiento.
4. Exportar solo API pública implementada desde src/index.ts.
5. Ejecutar pnpm check:project, pnpm typecheck, pnpm build y pnpm test.
6. Actualizar STATUS.md con evidencia real y pendientes.

No marcar esta tarea terminada solo porque estén creadas sus rutas.
