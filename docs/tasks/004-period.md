# 004-period — Implementar fecha y período

Estado: pendiente. Leer AGENTS.md y `docs/specs/period.md`.
Dependencia: respetar el orden en docs/ROADMAP.md.

## Resultado

P01-P04 y P06; comprobar fechas reales, límites inclusivos y transición de estado.

## Procedimiento

1. Leer las skills de proyecto accounting-implement y typescript-best-practices; clean-code-architecture al distribuir responsabilidades.
2. Implementar el incremento sin HTTP, ORM ni interfaz.
3. Añadir pruebas `*.test.mjs` bajo tests/ que consuman la salida compilada y verifiquen el comportamiento.
4. Exportar solo API pública implementada desde src/index.ts.
5. Ejecutar pnpm check:project, pnpm typecheck, pnpm build y pnpm test.
6. Actualizar STATUS.md con evidencia real y pendientes.

No marcar esta tarea terminada solo porque estén creadas sus rutas.
