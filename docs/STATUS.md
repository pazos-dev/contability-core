# Estado del proyecto

Actualizado: 2026-11-06. Entrega: preparación 2.0. Último incremento verificado: 004-period.

## Implementado y verificado

### 001-money — `docs/specs/money.md`, M01-M12

- `src/core/domain/money/`: `currency.ts`, `money.ts`, `money-errors.ts`.
- `Currency`: código de tres letras A-Z y escala entera de 0 a 6; inmutable, `equals`, `toJSON`/`fromJSON`.
- `Money`: `bigint` en unidades mínimas, parser decimal exacto sin redondeo, `add`, `subtract`,
  `compare`, `equals`, `toDecimal`, `toJSON`/`fromJSON`.
- `MoneyError` con códigos estables `INVALID_CURRENCY`, `INVALID_MONEY`, `CURRENCY_MISMATCH`.

### 002-account — `docs/specs/account.md`, A01-A03, A08 y A09

- `src/core/domain/account/`: `account.ts`, `account-code.ts`, `account-type.ts`, `account-errors.ts`.
- `AccountCode`: valor inmutable de texto; conserva ceros iniciales y formato; rechaza vacío y
  espacios exteriores en lugar de recortarlos.
- `Account`: inmutable, creado desde un DTO copiado; expone `id`, `chartOfAccountsId`, `code`,
  `name`, `type`, `parentId`, `postingAllowed` y `status`; `rename`, `deactivate` y `activate`
  devuelven copias.
- Reglas locales: identificadores, código y nombre no vacíos y sin espacios exteriores (se rechazan,
  no se recortan), tipo dentro de `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE`, `postingAllowed`
  booleano explícito y padre distinto de la propia cuenta.
- `AccountError` con códigos estables `INVALID_ACCOUNT`, `INVALID_ACCOUNT_CODE`, `ACCOUNT_SELF_PARENT`.

### 003-journal — `docs/specs/journal.md`, J01-J02, J04 y J06

- `src/core/domain/journal/`: `journal.ts`, `journal-errors.ts`.
- `Journal`: inmutable con `id`, `ledgerId`, `code`, `name` y estado `ACTIVE`/`INACTIVE`; nace activo
  en el libro indicado y `deactivate`/`activate` devuelven copias que conservan identidad, libro,
  código y nombre.
- No almacena asientos: `JournalEntry` vive en `entries` y referencia al diario.
- Validación local: identificadores, código y nombre no vacíos y sin espacios exteriores, alineado con
  `Account` y `AccountCode`; se rechazan, no se recortan.
- `JournalError` con código estable `INVALID_JOURNAL`.

### 004-period — `docs/specs/period.md`, P01-P04 y P06

- `src/core/domain/period/`: `accounting-date.ts`, `accounting-period.ts`, `period-status.ts`,
  `period-errors.ts`.
- `AccountingDate`: fecha de calendario `YYYY-MM-DD` sin `Date`, sin zona horaria y sin normalización;
  rechaza meses y días inexistentes, incluidos los 29 de febrero no bisiestos (1900, 2026).
- `AccountingPeriod`: inmutable con `id`, `ledgerId`, `name`, `startDate`, `endDate` y estado
  `OPEN`/`CLOSED`; `contains` incluye ambos extremos y `close` devuelve una copia CLOSED, fallando con
  `PERIOD_ALREADY_CLOSED` en el segundo cierre.
- Identificadores y nombre no vacíos y sin espacios exteriores, alineado con las otras áreas.
- `PeriodError` con códigos estables `INVALID_DATE`, `INVALID_PERIOD`, `PERIOD_ALREADY_CLOSED`.

### API pública

`src/index.ts` exporta `Currency`, `Money`, `MoneyError`, `Account`, `AccountCode`, `AccountError`,
`Journal`, `JournalError`, `AccountingDate`, `AccountingPeriod`, `PeriodError` y sus tipos.
`describeValue` es un helper interno del dominio, no forma parte de la API pública.

## Comprobaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Correcto: rutas, enlaces, configuración y seis skills. |
| `pnpm typecheck` | Correcto sobre `src/`. |
| `pnpm build` | Correcto; emite `dist/` con declaraciones. |
| `pnpm test` | 46 pruebas, 46 correctas, 0 fallos. |

Las pruebas consumen `dist/index.js`, por lo que requieren `pnpm build` antes de `pnpm test`.

Cobertura por criterio: M01-M12 en `tests/money.test.mjs`; A01, A02, A03, A08 y A09 en
`tests/account.test.mjs`, más casos de tipo cerrado, `postingAllowed`, `parentId`, espacios
exteriores, `rename`, `deactivate` y `activate`; J01, J02, desactivación y reactivación con datos
conservados en `tests/journal.test.mjs`; P01-P04, P06, cierre repetido y validación de fechas en
`tests/period.test.mjs`.

## Validaciones que esperan la capa de aplicación

Registradas explícitamente para no prometerlas desde el dominio:

| Regla | Dónde se verifica |
| --- | --- |
| A04 — padre de otro plan o ciclo | Caso de uso con repositorio de cuentas. |
| A05 — código único dentro del plan, permitido en otro plan | Caso de uso y restricción única de BD. |
| A06 — agrupadora o inactiva no recibe contabilizaciones | Caso de uso contabilizar. |
| A07 — cuenta usada se desactiva, no se borra | Caso de uso con historial. |
| J03 — código de diario único dentro del libro | Caso de uso y restricción única de BD. |
| J05 — contabilizar en diario inactivo o de otro libro | Caso de uso contabilizar; rechazo sin escrituras. |
| P05 — contabilizar en período CLOSED | Caso de uso contabilizar; rechazo sin cambios. |
| P07 — dos períodos solapados del mismo libro | Caso de uso y consulta/restricción en BD. |
| P08 — cierre y contabilización simultáneos | Persistencia serializa o detecta conflicto. |
| Hijo de cuenta con movimientos | Política posterior; inicialmente rechazar en aplicación. |

## Límites de esta entrega

Sin redondeo (`rounding-mode.ts` no existe aún), sin conversión de moneda, sin multiplicación,
división ni reparto. La escala admitida es 0-6 y el código de moneda es la forma A-Z de tres letras,
no un catálogo oficial. `Money` admite cero y negativos; la restricción a importes positivos
pertenece a las líneas de asiento (tarea 005). `Account` no cambia código, padre ni tipo: quedan
fuera hasta definir reglas de historial. No hay saldo editable ni serialización JSON de cuentas.
`Journal` no guarda asientos, no numera asientos y no valida pertenencia de asientos al libro;
la numeración secuencial y su ámbito siguen pendientes del contrato de aplicación.
`AccountingPeriod` no verifica solapamientos, no serializa el cierre y no reabre períodos: el cierre
no altera asientos ni borradores, no genera asientos de resultados y no equivale a un cierre fiscal.

## Pendiente de implementar

Diario, períodos, asientos, casos de uso, adaptadores y la API pública restante.
Sin ORM, HTTP ni interfaz visual.

## Siguiente tarea

`docs/tasks/005-entries.md`. `JournalEntry` y sus líneas con E01-E11, reversión como borrador y sin
mutación externa; la restricción de importes positivos y el equilibrio pertenecen al asiento.

## Relevo de sesión

Al terminar, registrar tarea completada, archivos relevantes, comandos ejecutados, errores pendientes
y siguiente incremento. No confundir un criterio de aceptación documentado con uno verificado en código.
