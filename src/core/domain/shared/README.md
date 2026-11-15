# shared

Responsabilidad: kernel compartido del dominio. Reúne los conceptos que no pertenecen a un contexto acotado
y que varios dominios necesitan, sin ser ellos mismos un dominio con agregado propio.

Es la única carpeta de `domain/` que otro dominio importa sin que exista una relación de negocio entre
ellos, y siempre por el barrel del concepto compartido, nunca por sus archivos internos.

Archivos:

- `money/` — `Currency` y `Money` exactos, su catálogo ISO y su error. Especificación: `docs/specs/money.md`.
- `describe-value.ts` — ayudante interno que describe un valor recibido en un mensaje de error. No tiene
  barrel: lo importan los archivos internos de cada dominio.

Los contextos acotados quedan fuera de esta carpeta: `account`, `journal`, `entries` y `period`, cada uno con
su agregado en la raíz y sus carpetas por naturaleza. `money/` no usa esas carpetas porque es todo valores y
no tiene agregado; el motivo está en `money/README.md`.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
