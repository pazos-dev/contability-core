# ledger

Responsabilidad: libro contable como ámbito de aislamiento y dueño de **un** plan de cuentas y **una** moneda
funcional.
Especificación desde la raíz: `docs/specs/ledger.md`.
Estado: incrementos 006e y 006f completos y verificados. Reglas locales probadas (R1-R5, L01, L03, L14, L17, L19,
L21) en `packages/core/tests/domain/ledger/ledger.test.mjs`, puerto `LedgerRepository`, adaptador en memoria y casos de uso
implementados; el detalle por tarea vive en `docs/tasks/006e-ledger.md` y `docs/tasks/006f-ledger-currency.md`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `ledger.ts` — agregado `Ledger` inmutable: `id`, `name`, `chartOfAccountsId`, `currency` y estado
  `ACTIVE`/`INACTIVE`; `rename`, `deactivate` y `activate` devuelven copias que conservan identidad,
  plan, moneda y el estado no afectado.
- `types/ledger-status.ts` — conjunto cerrado `ACTIVE`, `INACTIVE`.
- `errors/ledger-errors.ts` — `LedgerError` con código estable `INVALID_LEDGER`.
- `dto/ledger-dto.ts` — `LedgerInput` (entrada de construcción) y `LedgerFields` (estado validado que
  recibe el constructor privado). Datos sin comportamiento; `LedgerFields` no sale por el barrel.

`chartOfAccountsId` es un identificador **opaco** que aporta el anfitrión: no hay entidad de plan de
cuentas y el dominio no verifica que exista (Q07). No hay operación para cambiarlo, porque el plan es la
identidad contable del libro; un libro con otro plan es otro libro.

`currency` es la moneda funcional del libro y también es inmutable (Q08, resuelta como una moneda por libro). Es
un `Currency` y no un código suelto porque la identidad monetaria es código **y** escala, y la escala se
persiste con el importe en lugar de deducirse del código: `UYU`/2 no es `UYU`/4. Cambiarla dejaría asientos
contabilizados en una moneda que el libro ya no tiene, sin operación que los migre. El dominio no convierte:
`Money` sigue siendo el único que conoce la moneda y rechaza las operaciones cruzadas. La hidratación desde el
contrato serializable `CurrencyJSON` es de la capa de aplicación, como en las líneas de un asiento.

Un libro inactivo no admite ninguna escritura del módulo (`LEDGER_INACTIVE`), pero se puede reactivar.
No hay borrado: desactivar conserva identidad, nombre, plan y moneda. No guarda cuentas, diarios, períodos,
asientos ni saldos.

El agregado queda en la raíz del dominio porque es su puerta de entrada; el resto se agrupa por naturaleza
en `types/`, `errors/` y `dto/`. No hay `value-objects/`: el libro no tiene valores propios fuera del agregado.

Identificadores, nombre y plan se rechazan si vienen vacíos o con espacios exteriores; no se recortan. La
moneda se rechaza si no es un `Currency`: un JSON suelto o un código no pasan, porque aceptarlos permitiría
saltarse las reglas del catálogo.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
