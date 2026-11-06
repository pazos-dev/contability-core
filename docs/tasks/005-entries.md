# 005-entries — Implementar asientos y líneas

Estado: pendiente. Leer AGENTS.md y `docs/specs/entries.md`.
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
