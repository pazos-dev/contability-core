# Pruebas de comportamiento

Archivos `*.test.mjs` con `node:test` y `node:assert/strict`; importan módulos de `dist/index.js`, es decir
la superficie pública del paquete, nunca un archivo interno. Ejecutar `pnpm build` antes de `pnpm test` para
verificar el código recién compilado.

La organización espeja `src/`, así que la capa que ejercita un archivo de prueba se lee en su ruta:

| Ruta | Contenido |
| --- | --- |
| `tests/domain/<dominio>/` | Reglas locales de un dominio: `money/`, `account/`, `journal/`, `period/`, `entries/`. |
| `tests/application/` | Casos de uso y fachada `Accounting`; se habla sólo con la fachada. |
| `tests/public-api.test.mjs` | Superficie pública de cada barrel y del paquete. |

`scripts/run-tests.mjs` descubre `*.test.mjs` de forma recursiva, así que agregar una carpeta no requiere
tocar el runner. El runner termina con código 1 si no encuentra pruebas; esto hace visible el trabajo
pendiente. No añadir pruebas vacías ni convertir los criterios documentados en `todo` para simular cobertura.
