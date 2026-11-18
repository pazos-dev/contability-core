# period

Responsabilidad: fechas de calendario y período abierto/cerrado.
Especificación desde la raíz: `docs/specs/period.md`.
Estado: reglas locales implementadas y probadas (P01-P04 y P06) en `packages/core/tests/domain/period/period.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `accounting-period.ts` — agregado `AccountingPeriod` inmutable con límites inclusivos, `contains` y
  `close`; cerrar un período ya cerrado es un error de estado.
- `value-objects/accounting-date.ts` — `AccountingDate`, fecha `YYYY-MM-DD` inmutable sin `Date`, sin zona
  horaria y sin normalización de fechas inexistentes; incluye años bisiestos reales.
- `types/period-status.ts` — conjunto cerrado `OPEN`, `CLOSED`.
- `errors/period-errors.ts` — `PeriodError` con códigos `INVALID_DATE`, `INVALID_PERIOD`, `PERIOD_ALREADY_CLOSED`.
- `dto/accounting-period-dto.ts` — `AccountingPeriodInput` (entrada de construcción) y
  `AccountingPeriodFields` (estado validado que recibe el constructor privado). Datos sin comportamiento;
  `AccountingPeriodFields` no sale por el barrel.

El agregado queda en la raíz del dominio porque es su puerta de entrada; el resto se agrupa por naturaleza
en `value-objects/`, `types/`, `errors/` y `dto/`.

Validaciones que **no** viven aquí y esperan aplicación/persistencia: contabilizar en período cerrado
(P05), solapamiento de períodos del mismo libro (P07) y cierre concurrente con contabilización (P08).
Reapertura, cierre fiscal, permisos y tratamiento de borradores quedan para sus propios casos de uso.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
