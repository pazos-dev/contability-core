# account

Responsabilidad: cuenta contable y su código.
Especificación desde la raíz: `docs/specs/account.md`.
Estado: reglas locales implementadas y probadas (A01-A03, A08) en `tests/account.test.mjs`.

Archivos:

- `account.ts` — `Account` inmutable con identidad, plan, código, nombre, tipo, padre opcional,
  `postingAllowed` y estado `ACTIVE`/`INACTIVE`; `rename` y `deactivate` devuelven copias.
- `account-code.ts` — `AccountCode` como texto inmutable; conserva ceros iniciales y formato del plan.
- `account-type.ts` — conjunto cerrado `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
- `account-errors.ts` — `AccountError` con códigos estables.

Validaciones que **no** viven aquí y esperan repositorio: padre del mismo plan y ausencia de ciclos
(A04), unicidad del código por plan (A05), agrupadora o inactiva sin nuevas contabilizaciones (A06)
y cuenta usada desactivada en lugar de borrada (A07).

No almacena saldos. Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
