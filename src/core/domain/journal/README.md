# journal

Responsabilidad: diario contable. `JournalEntry` vive en `entries`, no aquí.
Especificación desde la raíz: `docs/specs/journal.md`.
Estado: reglas locales implementadas y probadas (J01-J02 y desactivación) en `tests/journal.test.mjs`.

Archivos:

- `journal.ts` — `Journal` inmutable que identifica un diario dentro de su libro: `id`, `ledgerId`,
  `code`, `name` y estado `ACTIVE`/`INACTIVE`; `deactivate` devuelve una copia que conserva los datos.
- `journal-errors.ts` — `JournalError` con código estable `INVALID_JOURNAL`.

Validaciones que **no** viven aquí y esperan repositorio: código único dentro del libro (J03),
pertenencia del asiento al mismo libro que el diario y rechazo de contabilizar en un diario
inactivo o ajeno (J05). La numeración secuencial de asientos y su ámbito quedan pendientes del
contrato de aplicación, sin `max(numero) + 1`.

No almacena una lista creciente de asientos ni datos de `JournalEntry`.
Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
