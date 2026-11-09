# Estado del proyecto

Actualizado: 2026-11-08. Entrega: preparación 2.0. Último incremento verificado: 006-entries, sobre
005-currency-catalog revisado al modelo mixto de monedas, más la convención de API pública por dominio
(barrel `index.ts` en cada dominio).

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

### 005-currency-catalog — `docs/specs/currency-catalog.md`, IC01-IC14, más M05 y M13-M15

- `src/core/domain/money/currency-catalog.ts`: tabla ISO 4217 incorporada, generada desde la lista
  oficial de SIX Group publicada el 2026-09-17, con fuente y huella del XML en el encabezado.
- 165 monedas con unidad menor decimal (17 de escala 0, 139 de 2, 7 de 3 y 2 de 4) y 13 códigos ISO
  sin unidad menor decimal (`XAG XAU XBA XBB XBC XBD XDR XPD XPT XSU XTS XUA XXX`).
- `Currency.create` y `Currency.fromJSON` aplican dos regímenes: rechazan con `INVALID_CURRENCY` la
  escala que no coincide con la oficial y la moneda ISO sin unidad menor decimal, cada motivo con su
  propio mensaje, y aceptan un código ausente del catálogo como moneda propia con la escala declarada.
- `pnpm sync:iso4217` regenera la tabla desde la fuente oficial o desde `--input <archivo>`. Falla
  cerrado sin escribir ante documento truncado, sin fecha, unidad menor fuera de patrón, entrada sin
  código, escalas en conflicto o tabla con menos de 100 monedas; se probó a mano cada caso.
- Cambio de contrato declarado en dos pasos. Primero, `Currency.create('ABC', 2)` y
  `Currency.create('UYU', 0)` dejaron de ser válidos y M05 se reescribió porque el caso "mismo código,
  escalas distintas" dejó de ser representable. Después, el modelo mixto devolvió `Currency.create`
  `('ABC', 2)` a válido como moneda propia, así que IC03 e IC06 se reescribieron y M13 cambió de
  rechazo a aceptación. `Currency.create('UYU', 0)` sigue siendo inválido: ese par no existe.
- La tabla está anclada por IC11: las 26 monedas con escala distinta de 2 y los 13 códigos sin unidad
  menor decimal se comparan código por código, así que un cambio de tabla no puede pasar inadvertido.
- Dos monedas propias con el mismo código y distinta escala son monedas distintas: `equals` las
  distingue y `Money` las rechaza juntas con `CURRENCY_MISMATCH` (IC13). La identidad sigue siendo el
  par `(code, scale)` completo.

### 006-entries — `docs/specs/entries.md`, E01-E11

- `src/core/domain/entries/`: `journal-entry.ts`, `journal-entry-line.ts`, `entry-status.ts`,
  `posting-side.ts`, `entry-errors.ts` y `entry-text.ts` (helper interno de validación de texto).
- `JournalEntryLine`: inmutable con `id`, `accountId`, `side` DEBIT/CREDIT, `amount` Money y
  `description` opcional. Rechaza importe cero o negativo: `Money` admite ambos, la línea no.
- `JournalEntry`: agregado inmutable con identidad (`id`, `ledgerId`, `journalId`, `periodId`),
  `accountingDate`, `description`, estado `DRAFT`/`POSTED`, líneas y `reversalOfEntryId` opcional.
  `addLine`, `removeLine`, `post` y `createReversalDraft` devuelven copias; el receptor nunca cambia.
- `post()` exige estado DRAFT, al menos dos líneas, una sola definición de moneda y débitos iguales a
  créditos en `bigint`. Un post rechazado deja el borrador intacto: no hay estado que deshacer.
- Reversión: solo desde un asiento POSTED; el borrador nuevo recibe id, período y fecha explícitos,
  invierte los lados, conserva los importes y se enlaza con `reversalOfEntryId`. El original sigue
  POSTED y sin cambios, así que revertir no reabre ni reescribe nada.
- `lines` devuelve una copia congelada en cada lectura: empujar, truncar o editar un elemento no
  alcanza al agregado.
- `EntryError` con códigos estables `INVALID_ENTRY`, `INVALID_ENTRY_LINE`, `DUPLICATE_LINE_ID`,
  `ENTRY_LINE_NOT_FOUND`, `ENTRY_STATE`, `ENTRY_INCOMPLETE`, `ENTRY_UNBALANCED` y
  `ENTRY_CURRENCY_MISMATCH`; cada criterio de rechazo se distingue por código.
- Decisión registrada: las líneas de la reversión reutilizan los ids de las líneas originales, que son
  únicos dentro de su asiento. Un id de línea único a nivel global es asunto de la persistencia (007).

### API pública

Cada dominio expone su superficie en su propio `src/core/domain/<dominio>/index.ts` y fuera de esa
carpeta nadie importa los archivos internos. `src/index.ts` solo agrega esos barrels.

- `money/index.ts`: `Currency`, `Money`, `MoneyError`, `ISO_4217_PUBLISHED`, `listIsoCurrencies`,
  `listIsoCurrenciesWithoutMinorUnit` y sus tipos.
- `account/index.ts`: `Account`, `AccountCode`, `AccountType`, `AccountError` y sus tipos.
- `journal/index.ts`: `Journal`, `JournalError` y sus tipos.
- `period/index.ts`: `AccountingDate`, `AccountingPeriod`, `PeriodStatus`, `PeriodError` y sus tipos.
- `entries/index.ts`: `JournalEntry`, `JournalEntryLine`, `EntryError` y sus tipos.

`describeValue` sigue siendo un helper interno del dominio, no forma parte de la API pública.
`pnpm check:project` exige el `index.ts` de los cinco dominios y `tests/public-api.test.mjs` fija la
superficie de cada barrel y la del paquete.

## Comprobaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Correcto: rutas, barrels por dominio, enlaces, configuración y seis skills. |
| `pnpm typecheck` | Correcto sobre `src/`. |
| `pnpm build` | Correcto; emite `dist/` con declaraciones. |
| `pnpm test` | 90 pruebas, 90 correctas, 0 fallos. |

Las pruebas consumen `dist/index.js`, por lo que requieren `pnpm build` antes de `pnpm test`.

Cobertura por criterio: M01-M12 en `tests/money.test.mjs`; A01, A02, A03, A08 y A09 en
`tests/account.test.mjs`, más casos de tipo cerrado, `postingAllowed`, `parentId`, espacios
exteriores, `rename`, `deactivate` y `activate`; J01, J02, desactivación y reactivación con datos
conservados en `tests/journal.test.mjs`; P01-P04, P06, cierre repetido y validación de fechas en
`tests/period.test.mjs`; IC01-IC14 en `tests/currency-catalog.test.mjs`; E01-E11 en
`tests/entries.test.mjs`, más la validación de identidad del borrador, `removeLine` de una línea
inexistente y la reversión rechazada; superficie pública por dominio y agregación del paquete en
`tests/public-api.test.mjs`.

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
división ni reparto. La escala admitida es 0-6; el catálogo ISO 4217 fija la escala oficial de los
códigos que publica y un código ausente del catálogo se acepta como moneda propia con escala
declarada. La escala se persiste junto al importe y nunca se deduce del código. `Money` admite cero y
negativos; la restricción a importes positivos vive en `JournalEntryLine`. `Account` no cambia código,
padre ni tipo: quedan fuera hasta definir reglas de historial. No hay saldo editable ni serialización
JSON de cuentas.
`Journal` no guarda asientos, no numera asientos y no valida pertenencia de asientos al libro;
la numeración secuencial y su ámbito siguen pendientes del contrato de aplicación.
`AccountingPeriod` no verifica solapamientos, no serializa el cierre y no reabre períodos: el cierre
no altera asientos ni borradores, no genera asientos de resultados y no equivale a un cierre fiscal.
`JournalEntry.post()` no verifica cuentas activas ni contabilizables, pertenencia al diario o al libro,
ni la apertura del período: `periodId` no demuestra que la fecha caiga dentro de ese período. No impide
una segunda reversión del mismo asiento ni serializa carreras. No hay edición directa de líneas (se
quita y se añade sobre un borrador), no hay borrado de asientos contabilizados y no hay serialización
JSON del asiento.

## Pendiente de implementar

Casos de uso, adaptadores y la API pública restante.
Sin ORM, HTTP ni interfaz visual.

## Siguiente tarea

`docs/tasks/006-application.md`. Registro, contabilización, cierre, reversión y aislamiento por libro
con un adaptador en memoria. Es la capa donde se verifican A04-A07, J03, J05, P05, P07 y P08, más la
prohibición de una segunda reversión completa por asiento.

## Relevo de sesión

Al terminar, registrar tarea completada, archivos relevantes, comandos ejecutados, errores pendientes
y siguiente incremento. No confundir un criterio de aceptación documentado con uno verificado en código.
