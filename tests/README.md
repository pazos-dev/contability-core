# Pruebas de comportamiento

Todavía no hay pruebas ni implementación de negocio.
Crear archivos `*.test.mjs` con `node:test` y `node:assert/strict`; importar módulos de `dist/`.
Ejecutar `pnpm build` antes de `pnpm test` para verificar el código recién compilado.
Agrupar pruebas por money, account, journal, entries, period y application cuando se implementen.
El runner termina con código 1 si no encuentra pruebas; esto hace visible el trabajo pendiente.
No añadir pruebas vacías ni convertir los criterios documentados en `todo` para simular cobertura.
