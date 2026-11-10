# Estado del proyecto

Actualizado: 2026-11-09. Entrega: preparación 2.0. Último incremento verificado: 006d-application
(edición de las líneas de un borrador), sobre 006c, 006b y 006a-application, 006-entries y
005-currency-catalog revisado al modelo mixto de monedas.

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

### 006a-application — `docs/specs/registration.md`, R01-R17

- `src/core/application/`: `errors.ts` (`ApplicationError` con códigos estables), `ports/index.ts`
  (`UnitOfWork` y su alcance, `LedgerDirectory`, repositorios de cuentas, diarios y períodos,
  `IdempotencyRegistry`, `PostedMovementsQuery`), los contratos y cinco casos de uso.
- `src/adapters/memory/`: mapas de valores inmutables, `snapshot()` de lectura y una unidad de trabajo
  que restaura el estado anterior completo cuando el trabajo falla. Sin durabilidad ni aislamiento, dicho
  en el README del adaptador.
- Casos de uso: `registerAccount`, `setAccountStatus`, `registerJournal`, `setJournalStatus`,
  `registerPeriod`. Cada uno es una fábrica de función asíncrona y corre entero dentro de una sola
  llamada a `unitOfWork.run`, lecturas incluidas: los repositorios solo existen en el alcance de la
  unidad de trabajo, así que no hay conexiones independientes disfrazadas de transacción.
- `chartOfAccountsId` no es una entrada: lo resuelve `LedgerDirectory` desde el libro (Q07). El anfitrión
  no puede declarar un plan distinto al del libro, y una cuenta de otro plan se reporta como
  `ACCOUNT_NOT_FOUND`, sin distinguirla de una inexistente.
- A05 y J03 verificadas: código único por plan y por libro, permitido en otro plan o en otro libro. P07
  verificada con solapamiento de un solo día y con períodos contiguos aceptados.
- Regla de jerarquía: un hijo solo se registra bajo un padre con `postingAllowed: false`
  (`ACCOUNT_PARENT_NOT_GROUPING`) y sin movimientos contabilizados (`ACCOUNT_HAS_MOVEMENTS`). El dominio
  no gana ninguna operación nueva para esto.
- A04 se cumple por construcción en su parte de ciclos: cerrar un ciclo exigiría volver a registrar un id
  existente, que se rechaza. No hay paso de detección de ciclos porque nunca podría fallar, y así queda
  registrado en la spec.
- A07 se cumple por ausencia de operación: no existe borrar cuenta, y desactivar conserva identidad,
  plan, código, nombre, padre y `postingAllowed`.
- Idempotencia opcional por libro y por operación: misma clave con la misma petición devuelve el
  resultado guardado sin segunda escritura; con otra petición devuelve `IDEMPOTENCY_CONFLICT`.
- `postedMovements` se consulta a través de un puerto y en 006a responde siempre `false`, porque todavía
  no existe una operación que contabilice. Su adaptador real llega con 006b.

### 006b-application — `docs/specs/post-entry.md`, `close-period.md` y `reverse-entry.md`

- Casos de uso nuevos: `postEntry`, `closePeriod`, `reversePostedEntry`, con
  un `EntryRepository` en el alcance de la unidad de trabajo.
- `postEntry` resuelve el plan del libro (Q07) y exige, en este orden: diario activo del mismo libro (J05),
  período `OPEN` que además contenga la fecha contable, cuentas activas y contabilizables del plan (A06), y
  las invariantes del agregado. Un `periodId` que no contiene la fecha es `PERIOD_DATE_OUTSIDE`: el id no
  demuestra pertenencia.
- `closePeriod` cambia sólo el estado del período: no convierte borradores, no toca asientos y no genera
  resultados. Cerrar dos veces con claves distintas es `PERIOD_ALREADY_CLOSED`; repetirlo con la misma clave
  es un replay sin segundo efecto.
- `reversePostedEntry` crea y contabiliza el asiento espejado en una sola unidad de trabajo, reutilizando los
  ids de línea del original y enlazándolo con `reversalOfEntryId`. El original nunca se guarda. El período
  **destino** debe estar abierto aunque el del original esté cerrado, y las cuentas deben seguir admitiendo
  movimientos. La comprobación de reversión previa vive justo antes de escribir, para que 007 la sustituya
  por una restricción única.
- `PostedMovementsQuery` deja de ser un doble: `hasPostedLines` lee del repositorio de asientos y devuelve
  `true` en las cuentas con líneas contabilizadas (probado con datos reales en `tests/post-entry.test.mjs`).
  Pero `ACCOUNT_HAS_MOVEMENTS` es una guarda de defensa y no una regla alcanzable: sólo una cuenta
  contabilizable puede recibir movimientos, y esa misma cuenta se rechaza antes como padre con
  `ACCOUNT_PARENT_NOT_GROUPING`. El orden de comprobación es deliberado y la prueba fija cuál de los dos
  códigos se reporta.
- Los importes de salida usan `MoneyJSON`, el tipo que ya publica el dominio; no hay un contrato paralelo de
  dinero ni `bigint` crudo en el resultado.
- `U03a` verificada: si el registro de idempotencia falla después de guardar el asiento, la unidad de trabajo
  restaura el estado y el borrador sigue `DRAFT`.
- Corrección de la revisión nativa: el guardado de asientos es un *upsert* por `(ledgerId, entryId)`, así que
  `reversePostedEntry` ahora exige que el id de la reversión esté libre (`ENTRY_ALREADY_EXISTS`) y `postEntry`
  aplica la regla de una sola reversión también a un borrador de reversión guardado por el anfitrión
  (`ENTRY_ALREADY_REVERSED`). Sin esas dos guardas, un id repetido sobrescribía un asiento y una segunda
  reversión se colaba por `postEntry`.

### 006c-application — `docs/specs/entry-draft.md`, D01-D13

- `createEntryDraft` en `src/core/application/use-cases/entries/create-entry-draft.ts`: alta de un
  borrador con cabecera y líneas en una sola unidad de trabajo.
- Cierra el circuito. Hasta 006b, `postEntry` exigía un borrador persistido y **ninguna operación del core
  lo producía**; el hueco quedó registrado como decisión pendiente y ahora está resuelto.
- Valida sólo lo que hace coherente al borrador: libro conocido, id libre (`ENTRY_ALREADY_EXISTS`), diario,
  período y cuentas del plan existentes. **No** exige diario activo, período abierto ni asiento equilibrado:
  eso es asunto de `postEntry`, que vuelve a comprobarlo todo al contabilizar.
- No devuelve totales: un borrador puede estar vacío o desbalanceado, así que un total es una noción de la
  contabilización. El anfitrión los calcula de las líneas si los necesita.
- `serializeLine` y `sumSide` viven en `entries/entry-result.ts`, compartidos con `postEntry`, para que haya
  una sola definición de "cómo se serializa una línea".
- Sigue sin existir **edición** de borradores (`addEntryLine`, `removeEntryLine`, cambiar cabecera). El
  dominio sabe hacerlo sobre copias; exponerlo necesita su propia spec.

### 006d-application — `docs/specs/entry-draft-edit.md`, L01-L13

- `addEntryLine` y `removeEntryLine` en `src/core/application/use-cases/entries/`: corrigen un borrador
  entregado al puerto sin borrarlo y sin que el anfitrión toque el repositorio de asientos.
- Son cálculo puro sobre el agregado: `addLine` y `removeLine` ya existían y son los que deciden. Una
  edición no agrega ningún puerto ni toca el adaptador.
- Sólo se valida la coherencia de la línea que entra (la cuenta existe y es del plan); no se exige activa ni
  contabilizable, y el resto del borrador no se revalida: sigue siendo un borrador, con las reglas de
  contabilización diferidas a `postEntry`.
- `removeEntryLine` no consulta cuentas: la línea que sale no necesita validarse.
- `draftResultOf` en `entries/entry-result.ts` serializa el borrador resultante y lo comparten las tres
  operaciones de borrador; `EntryDraftResult` reemplaza al antiguo `CreateEntryDraftResult`, que ya no
  describía sólo un alta.
- Cambiar la cabecera (diario, período, fecha, descripción) sigue fuera: el agregado no tiene operación para
  eso y exponerla exige una decisión de dominio con sus reglas.
- El core no persiste nada: calcula sobre valores inmutables y entrega el resultado al puerto que le da el
  anfitrión. Sin conexiones, sin almacenamiento, sin sistema de archivos.

### API pública

Cada dominio expone su superficie en su propio `src/core/domain/<dominio>/index.ts` y fuera de esa
carpeta nadie importa los archivos internos. `src/index.ts` solo agrega esos barrels.

- `money/index.ts`: `Currency`, `Money`, `MoneyError`, `ISO_4217_PUBLISHED`, `listIsoCurrencies`,
  `listIsoCurrenciesWithoutMinorUnit` y sus tipos.
- `account/index.ts`: `Account`, `AccountCode`, `AccountType`, `AccountError` y sus tipos.
- `journal/index.ts`: `Journal`, `JournalError` y sus tipos.
- `period/index.ts`: `AccountingDate`, `AccountingPeriod`, `PeriodStatus`, `PeriodError` y sus tipos.
- `entries/index.ts`: `JournalEntry`, `JournalEntryLine`, `EntryError` y sus tipos.
- `core/application/index.ts`: `ApplicationError`, `makeRegisterAccount`, `makeSetAccountStatus`,
  `makeRegisterJournal`, `makeSetJournalStatus`, `makeRegisterPeriod`, `makePostEntry`, `makeClosePeriod`,
  `makeReversePostedEntry`, `makeCreateEntryDraft`, `makeAddEntryLine`, `makeRemoveEntryLine` y sus tipos.
- `adapters/memory/index.ts`: `createInMemoryAccounting` y sus tipos. Expone además el adaptador de
  asientos para que el anfitrión persista borradores: crear borradores por caso de uso no está especificado
  todavía, así que hoy es responsabilidad del anfitrión (ver Decisiones pendientes).

`describeValue` sigue siendo un helper interno del dominio, no forma parte de la API pública.
`pnpm check:project` exige el `index.ts` de los cinco dominios y los dos barrels nuevos;
`tests/public-api.test.mjs` fija la superficie de cada barrel y la del paquete, y falla si el paquete
exporta algo fuera de ellos.

## Comprobaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Correcto: rutas, barrels por dominio, enlaces, configuración y seis skills. |
| `pnpm typecheck` | Correcto sobre `src/`. |
| `pnpm build` | Correcto; emite `dist/` con declaraciones. |
| `pnpm test` | 211 pruebas, 211 correctas, 0 fallos. |

Las pruebas consumen `dist/index.js`, por lo que requieren `pnpm build` antes de `pnpm test`.

Cobertura por criterio: M01-M12 en `tests/money.test.mjs`; A01, A02, A03, A08 y A09 en
`tests/account.test.mjs`, más casos de tipo cerrado, `postingAllowed`, `parentId`, espacios
exteriores, `rename`, `deactivate` y `activate`; J01, J02, desactivación y reactivación con datos
conservados en `tests/journal.test.mjs`; P01-P04, P06, cierre repetido y validación de fechas en
`tests/period.test.mjs`; IC01-IC14 en `tests/currency-catalog.test.mjs`; E01-E11 en
`tests/entries.test.mjs`, más la validación de identidad del borrador, `removeLine` de una línea
inexistente y la reversión rechazada; R01-R17 en `tests/registration.test.mjs`, incluidos el fallo de
guardado que no deja escritura previa, el corte por libro y la idempotencia; superficie de cada barrel y
agregación del paquete en `tests/public-api.test.mjs`; U01-U05 y U08-U17 en `tests/post-entry.test.mjs`;
C01-C04, C06 y C07 en `tests/close-period.test.mjs`; V01-V15 en `tests/reverse-entry.test.mjs`; D01-D13 en
`tests/entry-draft.test.mjs`, más el borrador vacío y el circuito completo crear → contabilizar; L01-L13 en
`tests/entry-draft-edit.test.mjs`, incluido el borrador incompleto que queda postable al agregarle la línea
que faltaba.

## Validaciones que esperan la capa de aplicación

Registradas explícitamente para no prometerlas desde el dominio:

| Regla | estado |
| --- | --- |
| A04 — padre de otro plan | Verificada en `tests/registration.test.mjs` (R05). |
| A04 — ciclo | Cumplida por construcción: no existe operación que cambie `parentId` y re-registrar un id se rechaza (A04 en la suite). Sin comprobación propia porque no podría fallar. |
| A05 — código único dentro del plan, permitido en otro plan | Verificada (R03, R04). La restricción única de BD queda para 007. |
| A07 — cuenta usada se desactiva, no se borra | Verificada por ausencia de operación de borrado (R10). |
| J03 — código de diario único dentro del libro | Verificada (R12). La restricción única de BD queda para 007. |
| P07 — dos períodos solapados del mismo libro | Verificada (R13). La consulta y el guardado comparten la unidad de trabajo. |
| Hijo de cuenta con movimientos | La regla existe (`ACCOUNT_HAS_MOVEMENTS`) y el puerto lee movimientos reales, pero no es alcanzable por la API: la cuenta que tiene movimientos es contabilizable y por lo tanto se rechaza antes como padre con `ACCOUNT_PARENT_NOT_GROUPING`. Verificado con un doble en R09 y documentado en 006b. |
| A06 — agrupadora o inactiva no recibe contabilizaciones | Verificada (U11, U12, U13). |
| J05 — contabilizar en diario inactivo o de otro libro | Verificada (U14). |
| P05 — contabilizar en período CLOSED | Verificada (U09). |
| P08 — cierre y contabilización simultáneos | Pendiente de persistencia real (007). |

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

## Decisiones pendientes

| Tema | Impacto |
| --- | --- |
| Cambiar la cabecera de un borrador | Diario, período, fecha contable y descripción: `JournalEntry` no tiene operación y agregarla es un cambio de contrato del dominio con sus propias reglas. |
| Reversión parcial y cancelación de una reversión | Fuera de alcance por spec. |

## Pendiente de implementar

Persistencia real con transacciones, unicidad y concurrencia (007); consultas e informes (008). Sin ORM, HTTP
ni interfaz visual.

## Especificado y sin implementar

El alcance del incremento 006 se revisó con el usuario y quedó congelado en `docs/tasks/006-application.md`:
dos entregas, `LedgerDirectory` como única fuente de la relación libro-plan, `periodId` como autoridad con
validación de fecha, idempotencia en memoria con la concurrencia diferida, y padre agrupador exigido al
registrar un hijo. Cuatro specs escritas y sin código todavía:

| Spec | Criterios | Entrega |
| --- | --- | --- |
| `docs/specs/registration.md` | R01-R16 | 006a |
| `docs/specs/post-entry.md` | U01-U05, U08-U17; U03b, U06 y U07 diferidos a 007 | 006b |
| `docs/specs/close-period.md` | C01-C04, C06, C07; C05 diferido a 007 | 006b |
| `docs/specs/reverse-entry.md` | V01-V13 | 006b |

Diferido explícitamente a 007, sin pruebas verdes que lo aparenten: rollback de base real (U03b), dos
contabilizaciones simultáneas (U06), cierre concurrente con contabilización (U07, P08, C05) y unicidad
durable de la reversión.

## Siguiente tarea

Especificar y construir el incremento **007** o el registro de borradores, según se decida. Las garantías
que exigen base real siguen diferidas y sin pruebas verdes que las aparenten: U03b, U06, U07, C05 y P08.

## Relevo de sesión

Al terminar, registrar tarea completada, archivos relevantes, comandos ejecutados, errores pendientes
y siguiente incremento. No confundir un criterio de aceptación documentado con uno verificado en código.
