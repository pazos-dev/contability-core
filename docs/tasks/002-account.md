# 002-account — Implementar cuenta contable

Estado: completada. Evidencia: `tests/account.test.mjs` (13 pruebas, A01-A03, A08 y A09 en verde) y
`docs/STATUS.md`, que registra las validaciones pendientes de repositorio (A04-A07).
Leer AGENTS.md y `docs/specs/account.md`.
Dependencia: respetar el orden en docs/ROADMAP.md.

## Resultado

A01-A03 y A08; anotar explícitamente las validaciones que esperan repositorios.

## Procedimiento

1. Leer las skills de proyecto accounting-implement y typescript-best-practices; clean-code-architecture al distribuir responsabilidades.
2. Implementar el incremento sin HTTP, ORM ni interfaz.
3. Añadir pruebas `*.test.mjs` bajo tests/ que consuman la salida compilada y verifiquen el comportamiento.
4. Exportar solo API pública implementada desde src/index.ts.
5. Ejecutar pnpm check:project, pnpm typecheck, pnpm build y pnpm test.
6. Actualizar STATUS.md con evidencia real y pendientes.

No marcar esta tarea terminada solo porque estén creadas sus rutas.
