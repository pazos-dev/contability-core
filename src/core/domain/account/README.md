# account

Responsabilidad: cuenta contable y su código.
Especificación desde la raíz: `docs/specs/account.md`.
Estado: reglas locales implementadas y probadas (A01-A03, A08 y A09) en `tests/domain/account/account.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `account.ts` — agregado `Account` inmutable con identidad, plan, código, nombre, tipo, padre opcional,
  `postingAllowed` y estado `ACTIVE`/`INACTIVE`; `rename`, `deactivate` y `activate` devuelven copias.
- `value-objects/account-code.ts` — `AccountCode` como texto inmutable; conserva ceros iniciales y formato del plan.
- `types/account-type.ts` — conjunto cerrado `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
- `types/account-status.ts` — conjunto cerrado `ACTIVE`, `INACTIVE`.
- `errors/account-errors.ts` — `AccountError` con códigos estables.
- `dto/account-dto.ts` — `AccountInput` (entrada de construcción) y `AccountFields` (estado validado que
  recibe el constructor privado). Datos sin comportamiento; `AccountFields` no sale por el barrel.

El agregado queda en la raíz del dominio porque es su puerta de entrada; el resto se agrupa por naturaleza
en `value-objects/`, `types/`, `errors/` y `dto/`.

Identificadores, código y nombre se rechazan si vienen vacíos o con espacios exteriores; no se recortan.

Validaciones que **no** viven aquí y esperan repositorio: padre del mismo plan y ausencia de ciclos
(A04), unicidad del código por plan (A05), agrupadora o inactiva sin nuevas contabilizaciones (A06)
y cuenta usada desactivada en lugar de borrada (A07).

No almacena saldos. Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
