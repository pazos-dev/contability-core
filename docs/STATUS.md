# Estado del proyecto

Actualizado: 2026-11-15. Entrega: preparación 2.0. Último incremento verificado: 006f, la moneda funcional del
libro (`docs/specs/ledger.md`, L17-L24; cierra Q08 como moneda única por libro); antes, 006e, el libro contable
como agregado (`docs/specs/ledger.md`); antes, una carpeta por área en
`use-cases/`, con las precondiciones de cada área en su `rules.ts` y las compartidas en `shared/rules.ts`;
antes, nombres de módulo unificados
en todas las capas (`dto` para datos, `ports` para comportamiento), sobre `money` como kernel compartido en
`domain/shared/money/` (ADR 0003), el DTO por dominio y las pruebas en espejo de `src/`, el refactor de la
idempotencia (`Idempotency`), el contrato de clases y la fachada `Accounting`, 006d-application (edición de las
líneas de un borrador), 006c, 006b y 006a-application, 006-entries y 005-currency-catalog revisado al modelo
mixto de monedas.

## Implementado y verificado

### 001-money — `docs/specs/money.md`, M01-M12

- `src/core/domain/shared/money/`: `currency.ts`, `money.ts`, `money-errors.ts`.
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

- `src/core/domain/shared/money/currency-catalog.ts`: tabla ISO 4217 incorporada, generada desde la lista
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
  únicos dentro de su asiento. Un id de línea único a nivel global es asunto del adaptador del anfitrión.

### 006a-application — `docs/specs/registration.md`, R01-R17

- `src/core/application/`: `errors.ts` (`ApplicationError` con códigos estables), `ports/index.ts`
  (`UnitOfWork` y su alcance, `LedgerRepository` — `LedgerDirectory` en 006a, reemplazado en 006e —,
  repositorios de cuentas, diarios y períodos,
  `IdempotencyRegistry`, `PostedMovementsQuery`), los contratos y cinco casos de uso.
- `src/adapters/memory/`: mapas de valores inmutables, `snapshot()` de lectura y una unidad de trabajo
  que restaura el estado anterior completo cuando el trabajo falla. Sin durabilidad ni aislamiento, dicho
  en el README del adaptador.
- Casos de uso: `registerAccount`, `setAccountStatus`, `registerJournal`, `setJournalStatus`,
  `registerPeriod`. Cada uno es una fábrica de función asíncrona y corre entero dentro de una sola
  llamada a `unitOfWork.run`, lecturas incluidas: los repositorios solo existen en el alcance de la
  unidad de trabajo, así que no hay conexiones independientes disfrazadas de transacción.
- `chartOfAccountsId` no es una entrada: lo resuelve el libro (Q07). En 006a lo resolvía el puerto
  `LedgerDirectory`; desde 006e lo resuelve `LedgerRepository`, que devuelve el `Ledger` con nombre y estado,
  así que un libro inactivo se rechaza antes con `LEDGER_INACTIVE`. El anfitrión
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
- Corrección de la revisión R4: el registro de idempotencia copia el resultado al guardarlo y al
  entregarlo. Antes guardaba la misma referencia que recibía el consumidor, así que mutar el resultado de
  una respuesta reescribía lo que respondía el siguiente reintento; `readonly` sólo lo impedía en
  compilación. Regla 7 de `docs/specs/registration.md`, prueba `U04b` en `tests/application/post-entry.test.mjs`.
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
  movimientos. La comprobación de reversión previa vive justo antes de entregar al puerto, para que un adaptador durable la sustituya
  por una restricción única.
- `PostedMovementsQuery` deja de ser un doble: `hasPostedLines` lee del repositorio de asientos y devuelve
  `true` en las cuentas con líneas contabilizadas (probado con datos reales en `tests/application/post-entry.test.mjs`).
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
- Corrección de la revisión R4: `EntryRepository.findByReversalOf` pasa a `findReversalsOf` y devuelve
  **todas** las reversiones de un original. Con una sola respuesta, un borrador de reversión guardado antes
  que una reversión contabilizada la tapaba y `postEntry` aceptaba una segunda reversión: dos asientos
  `POSTED` revirtiendo el mismo original, sin concurrencia. Ahora `postEntry` sólo cuenta reversiones
  `POSTED` distintas de sí mismo (`U18b`) y `reversePostedEntry` sigue contando cualquier estado (`V16`).
  La unicidad durable sigue siendo del anfitrión, con una restricción sobre `reversalOfEntryId`.

### 006c-application — `docs/specs/entry-draft.md`, D01-D13

- `createEntryDraft` en `src/core/application/use-cases/entries.ts`: alta de un borrador con cabecera y
  líneas en una sola unidad de trabajo.
- Cierra el circuito. Hasta 006b, `postEntry` exigía un borrador persistido y **ninguna operación del core
  lo producía**; el hueco quedó registrado como decisión pendiente y ahora está resuelto.
- Valida sólo lo que hace coherente al borrador: libro conocido, id libre (`ENTRY_ALREADY_EXISTS`), diario,
  período y cuentas del plan existentes. **No** exige diario activo, período abierto ni asiento equilibrado:
  eso es asunto de `postEntry`, que vuelve a comprobarlo todo al contabilizar.
- No devuelve totales: un borrador puede estar vacío o desbalanceado, así que un total es una noción de la
  contabilización. El anfitrión los calcula de las líneas si los necesita.
- `serializeLine` y `sumSide` tienen una sola definición, junto a los casos de uso del área, para que no haya
  dos formas de serializar una línea.
- Sigue sin existir **edición** de borradores (`addEntryLine`, `removeEntryLine`, cambiar cabecera). El
  dominio sabe hacerlo sobre copias; exponerlo necesita su propia spec.

### 006d-application — `docs/specs/entry-draft-edit.md`, L01-L13

- `addEntryLine` y `removeEntryLine` en `src/core/application/use-cases/entries.ts`: corrigen un borrador
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

### 006e-ledger — `docs/specs/ledger.md`, L01-L16

- `src/core/domain/ledger/`: `ledger.ts` (agregado `Ledger` con `id`, `name`, `chartOfAccountsId` y estado
  `ACTIVE`/`INACTIVE`; `rename`, `deactivate` y `activate` devuelven copias y el plan nunca cambia),
  `types/ledger-status.ts`, `errors/ledger-errors.ts`, `dto/ledger-dto.ts` y su `README.md`. El barrel publica
  `Ledger`, `LedgerError`, `LedgerInput`, `LedgerErrorCode` y `LedgerStatus`.
- El puerto `LedgerRepository` (`findById`, `save`) reemplaza a `LedgerDirectory` en el alcance de la unidad de
  trabajo y `LEDGER_NOT_FOUND` pasa a decir «is not registered». El plan sigue siendo un identificador
  opaco: el core no verifica que exista (Q07) y no hay operación para cambiarlo.
- `Ledgers.register`: idempotencia, id libre (`LEDGER_ALREADY_EXISTS`), validación del dominio y escritura de
  libro y registro de idempotencia en una sola unidad de trabajo.
- `Ledgers.setStatus`: guarda de valor, libro (`LEDGER_NOT_FOUND`) y copia con el estado nuevo. Repetir el
  estado actual es un no-op, y por eso no lleva clave de idempotencia.
- La fachada `Accounting` expone **trece** métodos; `tests/public-api.test.mjs` los fija junto con el barrel
  `core/domain/ledger`.
- `requireActiveLedger` en `use-cases/shared/rules.ts` es la primera regla de los once casos de uso existentes,
  en la misma posición donde antes se resolvía el plan: ausente es `LEDGER_NOT_FOUND` e inactivo es
  `LEDGER_INACTIVE`. `requireChartOfAccountsId` delega en ella y devuelve el plan del libro.
- El adaptador en memoria elimina `options.chartOfAccountsByLedger`: `MemoryMaps` tiene un mapa `ledgers`,
  `snapshot()` los expone y los arneses siembran los libros que necesitan con `registerLedger`
  (`tests/application/seed.mjs`). Un libro inexistente ya no puede aparecer por configuración.
- Pruebas: `tests/domain/ledger/ledger.test.mjs` (reglas locales, L03 y L14), `tests/application/ledger.test.mjs`
  (L01-L10, L12, L15 y L16), L13 por R04 en `tests/application/registration.test.mjs`, y L11 **una prueba por
  área, no una por caso de uso**: cuentas, diarios y períodos en `registration.test.mjs`, asientos en
  `entry-draft.test.mjs`.

### 006f-ledger-currency — `docs/specs/ledger.md`, L17-L24 y `docs/specs/entries.md`, E12

Resuelve Q08 con la opción A: **una moneda funcional por libro**, sin conversión.

- `Ledger` gana `currency: Currency` —el value object, no un código suelto, porque la escala forma parte de la
  identidad monetaria y se persiste con el importe—, `requireCurrency` rechaza con `INVALID_LEDGER` cualquier
  cosa que no sea un `Currency`, y `#copyWith` la conserva: no hay operación para cambiarla.
- `RegisterLedgerInput.currency` viaja como `CurrencyJSON { code, scale }` y el caso de uso la hidrata con
  `Currency.fromJSON`; el dominio nunca ve JSON, igual que las líneas de un asiento con `Money`. `currency`
  entra en la **huella de idempotencia** y en `RegisterLedgerResult`: la misma clave con otra moneda es
  `IDEMPOTENCY_CONFLICT` y no un resultado guardado.
- Contabilizar exige que el asiento esté en la moneda del libro: `requireLedgerCurrency` en
  `use-cases/entries/rules.ts`, invocada desde `post` y desde `reverse` —las dos vías que dejan un asiento en
  `POSTED`—, con el código nuevo `LEDGER_CURRENCY_MISMATCH` y `details` como `code/scale`.
- Los **borradores no se validan por moneda**, igual que no se validan por balance ni por período abierto: el
  reparto ya establecido es borrador tolerante y `post` estricto (L23).
- `requireActiveLedger` ya devolvía el `Ledger`, así que la guarda no agrega una lectura: en `post` y `reverse`
  se reemplaza `requireChartOfAccountsId` por `requireActiveLedger` y se usa `ledger.chartOfAccountsId`.
- La moneda entra en la huella en forma canónica `code/scale` y se hidrata **antes** de mirar el registro de
  idempotencia: el orden de las claves de un objeto no es parte de la petición, y un llamador que ya no manda
  moneda recibe `INVALID_CURRENCY` en lugar de un resultado guardado sin moneda.
- `LEDGER_CURRENCY_MISMATCH` lleva `details` como `ledgerCurrency` y `entryCurrency` en formato `code/scale`,
  porque `ApplicationError.details` es un mapa de strings por contrato y la escala es parte de la identidad.
- Sin conversión: `Money` no gana API de tasas y `CURRENCY_MISMATCH` sigue igual. Multimoneda operativa en un
  mismo libro queda fuera y necesitaría tasa, fecha de tasa, importe funcional por línea y cuentas de
  diferencia de cambio.
- Migración a cargo del anfitrión: los libros ya persistidos no tienen moneda y el core no inventa una por
  defecto (Q09). Los registros de idempotencia guardados por un alta anterior tampoco coinciden con la huella
  nueva: el anfitrión decide si los descarta al migrar o acepta que un reintento con la misma clave falle.
- Pruebas nuevas: L17-L21 y la regla 18 en `tests/application/ledger.test.mjs` y el agregado en
  `tests/domain/ledger/ledger.test.mjs`; L22 y L24 en `tests/application/post-entry.test.mjs`, incluida la vía
  de `reverse`; L23 en `tests/application/entry-draft.test.mjs`. El arnés `tests/application/seed.mjs` siembra
  los libros en `TEST_CURRENCY` (`UYU`/2) y acepta otra moneda como tercer argumento.

### Contrato de la capa de aplicación — fachada `Accounting`

- `Accounting` (`src/core/application/facade/accounting.ts`) es la **única** superficie pública de la capa: un
  objeto con un método por caso de uso (`app.postEntry(input)`). El barrel exporta `Accounting` y
  `ApplicationError`, nada más; las cinco clases de área no salen del paquete.
- Por dentro, cada caso de uso es una clase con `execute(input)` que recibe `ApplicationDeps` (sólo
  `unitOfWork`) y no guarda nada más. La fachada las compone en el constructor y sólo delega: no agrega
  validación, estado ni traducción de errores. Esa separación es lo que deja el objeto como contrato y
  las clases como implementación reemplazable.
- No se convirtieron en clases los ayudantes puros (`fingerprintOf`, `serializeLine`, `sumSide`,
  `draftResultOf`): una clase alrededor de un cálculo no aporta.
- La idempotencia sí es un objeto con comportamiento. `Idempotency.of(scope, operation, ledgerId)`
  (`use-cases/shared/idempotency.ts`) lleva la identidad de la operación y expone `replay(key, fingerprint)`
  y `remember(key, fingerprint, result)`. Antes eran dos funciones de cinco y seis parámetros, con `scope`,
  `operation` y `ledgerId` repetidos en las ocho llamadas: dos `string` adyacentes e intercambiables sin que
  el compilador dijera nada. Sigue siendo interno y el comportamiento es idéntico.
- Sin cambios de comportamiento: `ApplicationDeps`, contratos, códigos de error, unidad de trabajo, dominio
  y adaptadores quedaron igual.
- Corte limpio, sin alias: el paquete es `private` en 0.0.0 y no hay consumidores registrados. Un anfitrión
  migra `makePostEntry(deps)(input)` → `new Accounting(deps).postEntry(input)`.
- `tests/application/application-facade.test.mjs` recorre el circuito completo a través de la fachada, la
  propagación de errores sin escritura parcial y que dos fachadas sobre las mismas dependencias compartan los
  almacenes. Los siete archivos de test que antes componían casos de uso ahora hablan sólo con la fachada: la
  suite completa pasa por la superficie pública, así que un export de más rompe `public-api` y un método
  faltante rompe el resto.

### Refactor de dominio — DTO y organización de pruebas

- Los cuatro contextos acotados agrupan por naturaleza y dejan en su raíz sólo el agregado: `value-objects/`,
  `dto/`, `errors/` y `types/`. La frontera entre `types/` y `dto/` es de intención, no de forma: `types/` dice
  de qué está hecho el modelo y no tiene campos; `dto/` son formas de datos que cruzan un límite.
- `money` no es un contexto acotado: es el kernel compartido del dominio y vive en `domain/shared/money/`,
  plano y sin `value-objects/` ni `errors/`, porque es todo valores. `describe-value.ts` lo acompaña en
  `shared/`. Motivo y alternativas descartadas: ADR 0003.
- Cada dominio tiene `dto/` con las formas de datos del dominio y una por archivo de objeto de valor: las
  entradas de construcción (`*Input`), las representaciones serializadas (`*JSON`) y el estado ya validado
  que recibe el constructor privado (`*Fields`, `*Changes`). Ninguna tiene comportamiento, y los archivos de
  objeto de valor contienen sólo su clase.
- Los `*Fields` y `*Changes` se exportan desde su módulo para que la clase los importe, pero nunca desde el
  barrel: siguen siendo internos.
- La superficie pública no perdió ni renombró un símbolo: los seis `*Input` se siguen exportando con el mismo
  nombre desde el barrel de su dominio, y `tests/public-api.test.mjs` no necesitó una sola edición.
  `AccountStatus` y `JournalStatus` viven ahora en `account-status.ts` y `journal-status.ts`, como
  `period-status.ts` y `entry-status.ts`.
- `currency-catalog.ts` queda fuera de la regla: lo genera `pnpm sync:iso4217`, conserva `IsoCurrencyEntry` y
  vive junto a `currency.ts` en `shared/money/`, porque editarlo a mano lo perdería en la próxima
  regeneración. `entry-text.ts` queda en la raíz de `entries/` como el ayudante interno que es.
- Las pruebas espejan `src/`: `tests/domain/<dominio>/`, `tests/application/` y `tests/public-api.test.mjs`.
  `scripts/run-tests.mjs` ya descubría `*.test.mjs` de forma recursiva, así que no cambió.
- Sin cambio de comportamiento: 217 pruebas y `pnpm check` en verde, sin una expectativa editada. Las specs y
  los README apuntan a las rutas nuevas.
- Un mismo nombre para la misma naturaleza en todas las capas: `dto` para datos y `ports` para comportamiento.
  `use-cases/contracts.ts` pasó a `application/dto.ts` —era lo mismo con otro nombre— y `StoredOperation` salió
  de `ports/` a ese módulo, porque es un dato y no un contrato de comportamiento. La regla y su tabla están en
  `ARCHITECTURE.md`, sección «Nombres de módulos».
- `ports/` era una carpeta con un solo `index.ts`; por la regla de empaquetado es `ports.ts`, y su README se
  integró al de la capa. Los README de la capa y de `use-cases/` ya no usan «contratos» para nombrar datos.
- `Idempotency` es dueña del ciclo completo (`execute`), con `replay` y `remember` privados: olvidar el
  `remember` ya no compila en silencio. El total de líneas no bajó —728 → 719 en los casos de uso y la clase
  74 → 87—, porque el callback cuesta lo que el esqueleto ahorra; la ganancia es el invariante.
- Los casos de uso son un archivo por caso en `use-cases/<área>/`, con el `rules.ts` de cada área y el
  `result.ts` de `entries/`; la fachada vive en `facade/accounting.ts` y **conserva su nombre**, porque lo
  confuso era la ubicación y no la palabra. 719 → 773 líneas: la navegabilidad se paga con cabeceras de import.
- Los casos de uso son **cuatro clases de área con operaciones estáticas** (`Accounts.register`,
  `Entries.post`, …): once objetos que sólo cerraban sobre las dependencias desaparecieron, porque el invariante
  del mundo compartido vive en `Accounting`, que sigue instanciable y con `#deps` privado. **940 → 759 líneas
  (−19%) y 15 → 7 archivos.** Esto revierte en parte el split anterior, que es el precio de comparar en serio.
  Un campo estático en esas clases queda prohibido y escrito: sería estado global mutable.
- Una carpeta por área en `use-cases/` —`accounts/`, `journals/`, `periods/`, `entries/`—, cada una con la
  clase de operaciones y su propio `rules.ts`. `entries/` dejó de ser la excepción: la carpeta agrupa la clase
  y las reglas que esa clase invoca, y las cuatro áreas se leen igual.
- Las precondiciones tienen un solo nombre: `guards` y `rules` describían la misma naturaleza, así que el
  antiguo `guards.ts` es `shared/rules.ts`. Una regla vive en el área que la decide y sube a `shared/` sólo
  cuando dos o más áreas la invocan.
- `requireJournalInLedger` y `requirePeriodInLedger` de `entries/rules.ts` eran las mismas reglas que
  `Journals.setStatus` y `Periods.close` ya repetían en línea: ahora son `requireJournal` y `requirePeriod`
  compartidas, y `requireActiveJournal` y `requireOpenPeriodContaining` se apoyan en ellas en vez de releer.
  Las demás reglas locales —id libre y código único por plan y por diario, solapamiento de períodos— salieron de
  las clases a su `rules.ts`, así que la clase quedó sólo con el caso de uso.
- **856 → 936 líneas y 9 → 11 archivos**, casi todo cabeceras de módulo y la deduplicación de los dos
  `require` repetidos. Sin cambio de comportamiento ni de orden de reglas: 217 pruebas y `pnpm check` en verde,
  sin una expectativa editada, más `scripts/check-project.mjs` al día con las rutas nuevas.

### API pública

Cada contexto acotado expone su superficie en su propio `src/core/domain/<dominio>/index.ts`, y el kernel
compartido en `shared/money/index.ts`; fuera de esa carpeta nadie importa los archivos internos. `src/index.ts`
solo agrega esos barrels.

- `shared/money/index.ts`: `Currency`, `Money`, `MoneyError`, `ISO_4217_PUBLISHED`, `listIsoCurrencies`,
  `listIsoCurrenciesWithoutMinorUnit` y sus tipos.
- `ledger/index.ts`: `Ledger`, `LedgerError`, `LedgerInput`, `LedgerErrorCode`, `LedgerStatus`.
- `account/index.ts`: `Account`, `AccountCode`, `AccountType`, `AccountError` y sus tipos.
- `journal/index.ts`: `Journal`, `JournalError` y sus tipos.
- `period/index.ts`: `AccountingDate`, `AccountingPeriod`, `PeriodStatus`, `PeriodError` y sus tipos.
- `entries/index.ts`: `JournalEntry`, `JournalEntryLine`, `EntryError` y sus tipos.
- `core/application/index.ts`: `Accounting`, `ApplicationError` y los tipos de dato (`dto`) y de puerto. Las
  trece operaciones de caso de uso viven en `use-cases/` como implementación interna y no se exportan.
- `adapters/memory/index.ts`: `createInMemoryAccounting` y sus tipos. Expone además el adaptador de
  asientos (`entries`) como costura de composición: es el único adaptador que existe en esta fase y un
  anfitrión que arme asientos con el dominio necesita poder guardarlos. Crear y editar borradores por caso
  de uso ya está especificado e implementado (`createEntryDraft`, `addEntryLine`, `removeEntryLine`), así
  que ese es el camino normal; la costura queda para lo que el core todavía no ofrece, como borrar un
  borrador.

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
| `pnpm test` | 243 pruebas, 243 correctas, 0 fallos. |

Las pruebas consumen `dist/index.js`, por lo que requieren `pnpm build` antes de `pnpm test`.

Cobertura por criterio: M01-M12 en `tests/domain/shared/money/money.test.mjs`; A01, A02, A03, A08 y A09 en
`tests/domain/account/account.test.mjs`, más casos de tipo cerrado, `postingAllowed`, `parentId`, espacios
exteriores, `rename`, `deactivate` y `activate`; J01, J02, desactivación y reactivación con datos
conservados en `tests/domain/journal/journal.test.mjs`; P01-P04, P06, cierre repetido y validación de fechas en
`tests/domain/period/period.test.mjs`; IC01-IC14 en `tests/domain/shared/money/currency-catalog.test.mjs`; E01-E11 en
`tests/domain/entries/entries.test.mjs`, más la validación de identidad del borrador, `removeLine` de una línea
inexistente y la reversión rechazada; R01-R17 en `tests/application/registration.test.mjs`, incluidos el fallo de
guardado que no deja escritura previa, el corte por libro y la idempotencia; superficie de cada barrel y
agregación del paquete en `tests/public-api.test.mjs`; U01-U05 y U08-U18b en
`tests/application/post-entry.test.mjs`, más la copia del resultado de idempotencia (U04b);
C01-C04, C06 y C07 en `tests/application/close-period.test.mjs`; V01-V16 en `tests/application/reverse-entry.test.mjs`; D01-D13 en
`tests/application/entry-draft.test.mjs`, más el borrador vacío y el circuito completo crear → contabilizar; L01-L13 en
`tests/application/entry-draft-edit.test.mjs`, incluido el borrador incompleto que queda postable al agregarle la línea
que faltaba; L01-L16 del libro en `tests/domain/ledger/ledger.test.mjs` y `tests/application/ledger.test.mjs`, con L11
una prueba por área y L13 cubierto por R04; `tests/application/application-facade.test.mjs` para el circuito completo a
través de `Accounting`, la propagación de errores y dos fachadas sobre las mismas dependencias compartiendo los
almacenes.

## Validaciones que esperan la capa de aplicación

Registradas explícitamente para no prometerlas desde el dominio:

| Regla | estado |
| --- | --- |
| A04 — padre de otro plan | Verificada en `tests/application/registration.test.mjs` (R05). |
| A04 — ciclo | Cumplida por construcción: no existe operación que cambie `parentId` y re-registrar un id se rechaza (A04 en la suite). Sin comprobación propia porque no podría fallar. |
| A05 — código único dentro del plan, permitido en otro plan | Verificada (R03, R04). La restricción única de BD es del anfitrión. |
| A07 — cuenta usada se desactiva, no se borra | Verificada por ausencia de operación de borrado (R10). |
| J03 — código de diario único dentro del libro | Verificada (R12). La restricción única de BD es del anfitrión. |
| P07 — dos períodos solapados del mismo libro | Verificada (R13). La consulta y el guardado comparten la unidad de trabajo. |
| Hijo de cuenta con movimientos | La regla existe (`ACCOUNT_HAS_MOVEMENTS`) y el puerto lee movimientos reales, pero no es alcanzable por la API: la cuenta que tiene movimientos es contabilizable y por lo tanto se rechaza antes como padre con `ACCOUNT_PARENT_NOT_GROUPING`. Verificado con un doble en R09 y documentado en 006b. |
| A06 — agrupadora o inactiva no recibe contabilizaciones | Verificada (U11, U12, U13). |
| J05 — contabilizar en diario inactivo o de otro libro | Verificada (U14). |
| P05 — contabilizar en período CLOSED | Verificada (U09). |
| P08 — cierre y contabilización simultáneos | Del anfitrión: requiere serialización en su persistencia. |

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

## Contrato del anfitrión

Este repositorio es un motor embebible: no incluye base de datos, ORM, migraciones, HTTP ni procesos. Las
garantías que dependen del almacenamiento —rollback real (U03b), dos contabilizaciones simultáneas (U06),
cierre concurrente (U07, P08, C05), unicidad durable de la reversión y claves primarias— no son un incremento
pendiente del core: son lo que debe aportar quien lo integra. Tabla completa en `docs/INTEGRATION.md`.

## Pendiente de implementar

**008: consultas e informes** — saldos por cuenta, mayor y balance de comprobación, con especificaciones
propias: no hay spec escrita ni código. Después, el **contrato escrito del adaptador del anfitrión (007)**, que
documenta las garantías que hoy no vienen del core (transacción, aislamiento, unicidad durable, claves
primarias), y **009: extensiones** según necesidad demostrada. Sin ORM, HTTP ni interfaz visual en este
repositorio.

## Siguiente tarea

El core tiene el ciclo completo de asientos (crear borrador, editar líneas, contabilizar, cerrar, revertir),
consulta de referencias y el libro como agregado con su plan y su estado, así que ya no hay conceptos del
módulo que sólo existan por configuración del adaptador.
El siguiente incremento es **008: consultas e informes** — saldos por cuenta, mayor y balance de comprobación,
con especificaciones propias, donde el libro es el sujeto natural: es el ámbito de aislamiento y el dueño del
plan de cuentas. Alternativa posterior: el contrato escrito del adaptador del anfitrión (007).

Lo que **no** se promete: no hay multimoneda operativa dentro de un mismo libro, porque Q08 quedó resuelta como
una moneda funcional inmutable por libro y el core no convierte tasas; no hay consolidación entre libros; y el
plan de cuentas no es una entidad del core (Q07), sino un identificador del anfitrión que el libro guarda sin
verificar.

## Relevo de sesión

Al terminar, registrar tarea completada, archivos relevantes, comandos ejecutados, errores pendientes
y siguiente incremento. No confundir un criterio de aceptación documentado con uno verificado en código.
