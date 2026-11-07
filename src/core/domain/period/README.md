# period

Responsabilidad: fechas de calendario y período abierto/cerrado.
Especificación desde la raíz: `docs/specs/period.md`.
Estado: reglas locales implementadas y probadas (P01-P04 y P06) en `tests/period.test.mjs`.

Archivos:

- `accounting-date.ts` — `AccountingDate`, fecha `YYYY-MM-DD` inmutable sin `Date`, sin zona horaria y
  sin normalización de fechas inexistentes; incluye años bisiestos reales.
- `accounting-period.ts` — `AccountingPeriod` inmutable con límites inclusivos, `contains` y `close`;
  cerrar un período ya cerrado es un error de estado.
- `period-status.ts` — conjunto cerrado `OPEN`, `CLOSED`.
- `period-errors.ts` — `PeriodError` con códigos `INVALID_DATE`, `INVALID_PERIOD`, `PERIOD_ALREADY_CLOSED`.

Validaciones que **no** viven aquí y esperan aplicación/persistencia: contabilizar en período cerrado
(P05), solapamiento de períodos del mismo libro (P07) y cierre concurrente con contabilización (P08).
Reapertura, cierre fiscal, permisos y tratamiento de borradores quedan para sus propios casos de uso.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
