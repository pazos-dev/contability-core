# ledger

Responsabilidad: libro contable como ámbito de aislamiento y dueño de **un** plan de cuentas.
Especificación desde la raíz: `docs/specs/ledger.md`.
Estado: reglas locales implementadas y probadas (R1-R5, L01, L03, L14) en
`tests/domain/ledger/ledger.test.mjs`; casos de uso, puerto y adaptador en curso (T2-T6 de
`docs/tasks/006e-ledger.md`).

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `ledger.ts` — agregado `Ledger` inmutable: `id`, `name`, `chartOfAccountsId` y estado
  `ACTIVE`/`INACTIVE`; `rename`, `deactivate` y `activate` devuelven copias que conservan identidad,
  plan y el estado no afectado.
- `types/ledger-status.ts` — conjunto cerrado `ACTIVE`, `INACTIVE`.
- `errors/ledger-errors.ts` — `LedgerError` con código estable `INVALID_LEDGER`.
- `dto/ledger-dto.ts` — `LedgerInput` (entrada de construcción) y `LedgerFields` (estado validado que
  recibe el constructor privado). Datos sin comportamiento; `LedgerFields` no sale por el barrel.

`chartOfAccountsId` es un identificador **opaco** que aporta el anfitrión: no hay entidad de plan de
cuentas y el dominio no verifica que exista (Q07). No hay operación para cambiarlo, porque el plan es la
identidad contable del libro; un libro con otro plan es otro libro.

Un libro inactivo no admite ninguna escritura del módulo (`LEDGER_INACTIVE`), pero se puede reactivar.
No hay borrado: desactivar conserva identidad, nombre y plan. No guarda cuentas, diarios, períodos,
asientos ni saldos, y no declara moneda funcional: Q08 sigue abierta.

El agregado queda en la raíz del dominio porque es su puerta de entrada; el resto se agrupa por naturaleza
en `types/`, `errors/` y `dto/`. No hay `value-objects/`: el libro no tiene valores propios fuera del agregado.

Identificadores, nombre y plan se rechazan si vienen vacíos o con espacios exteriores; no se recortan.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
