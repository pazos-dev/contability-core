# SPEC — Registro de cuentas, diarios y períodos

Estado: lista para implementar (incremento 006a).
Ruta: `src/core/application/use-cases/`.
Depende de: `account.md` (A04, A05, A07, A09), `journal.md` (J03), `period.md` (P07).
Ver `docs/tasks/006-application.md` para el orden de entrega.

## Objetivo

Permitir que la aplicación anfitriona dé de alta cuentas, diarios y períodos dentro de un libro, y
cambie su estado, con las validaciones que requieren repositorio y sin ninguna escritura parcial.

Este incremento es el único lugar donde se verifican A04, A05, A07, A09 (lado aplicación), J03 y P07.

## Alcance y exclusiones

Incluye:

- `registerAccount`, `setAccountStatus` (activar/desactivar).
- `registerJournal`, `setJournalStatus`.
- `registerPeriod`.
- Los puertos que estos casos usan, la unidad de trabajo y su adaptador en memoria.

Excluye:

- Contabilizar, cerrar y revertir: incremento 006b.
- Modificar código, padre o tipo de una cuenta ya creada; hoy no existe operación y no se promete.
- Borrar cuentas, diarios o períodos. A07 se cumple por ausencia de la operación, no por un test.
- Renombrar cuentas y diarios: `rename` existe en el dominio pero ningún caso de uso lo expone todavía.
- Jerarquía de planes, varios libros por empresa (Q07) y numeración de asientos (Q11).
- HTTP, ORM, autenticación y auditoría de quién hizo cada cambio.

## Contrato general de los casos de uso

Un caso de uso es una fábrica de funciones asíncronas, sin clases ni decoradores:

```ts
export function makeRegisterAccount(deps: RegistrationDeps): RegisterAccount;
type RegisterAccount = (input: RegisterAccountInput) => Promise<RegisterAccountResult>;
interface RegistrationDeps { readonly unitOfWork: UnitOfWork; }
```

Reglas de contrato:

1. Toda la ejecución —lecturas y escrituras— ocurre dentro de **una** llamada a `unitOfWork.run`. El
   alcance de la unidad de trabajo es el único lugar de donde salen los repositorios, así que no existe
   una conexión independiente disfrazada de unidad de trabajo.
2. Las entradas son serializables: cadenas y booleanos. Los casos de uso construyen los objetos de
   valor; el anfitrión no puede saltarse una validación de dominio pasando instancias ya armadas.
3. `chartOfAccountsId` **no** es una entrada. Lo resuelve `ledgerDirectory.chartOfAccountsIdOf(ledgerId)`
   dentro de la unidad de trabajo, así que el anfitrión no puede declarar un plan distinto al del libro (Q07).
4. Las salidas son serializables y sin instancias de dominio. `Money` viaja como
   `{ minorUnits: string, code: string, scale: number }`.
5. No hay reloj ni generador de identificadores: los ids y las fechas llegan en la entrada.

### Puertos

```ts
interface UnitOfWork {
  run<T>(work: (scope: UnitOfWorkScope) => Promise<T>): Promise<T>;
}

interface UnitOfWorkScope {
  readonly ledgers: LedgerDirectory;
  readonly accounts: AccountRepository;
  readonly journals: JournalRepository;
  readonly periods: PeriodRepository;
  readonly idempotency: IdempotencyRegistry;
}

interface LedgerDirectory {
  chartOfAccountsIdOf(ledgerId: string): Promise<string | undefined>;
}

interface AccountRepository {
  findById(accountId: string): Promise<Account | undefined>;
  findByCode(chartOfAccountsId: string, code: AccountCode): Promise<Account | undefined>;
  save(account: Account): Promise<void>;
}

interface JournalRepository {
  findById(ledgerId: string, journalId: string): Promise<Journal | undefined>;
  findByCode(ledgerId: string, code: string): Promise<Journal | undefined>;
  save(journal: Journal): Promise<void>;
}

interface PeriodRepository {
  findById(ledgerId: string, periodId: string): Promise<AccountingPeriod | undefined>;
  findOverlapping(
    ledgerId: string,
    startDate: AccountingDate,
    endDate: AccountingDate,
  ): Promise<readonly AccountingPeriod[]>;
  save(period: AccountingPeriod): Promise<void>;
}

interface IdempotencyRegistry {
  find(ledgerId: string, operation: string, key: string): Promise<StoredOperation | undefined>;
  record(ledgerId: string, operation: string, key: string, entry: StoredOperation): Promise<void>;
}

interface StoredOperation {
  readonly fingerprint: string;
  readonly result: unknown;
}

interface PostedMovementsQuery {
  hasPostedLines(accountId: string): Promise<boolean>;
}
```

`PostedMovementsQuery` se declara en 006a y se conecta al repositorio de asientos en 006b: hasta que
existan asientos contabilizados, su adaptador en memoria sólo puede responder `false`. La regla del caso
de uso se verifica en 006a con un doble explícito.

Los repositorios de cuentas son globales por id y la unicidad de código es por plan; los de diarios y
períodos están acotados por libro desde su firma.

### Errores

```ts
class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details?: Readonly<Record<string, string>>;
}
```

Los errores de dominio burbujean sin envolver: ya tienen códigos estables. `ApplicationError` sólo cubre
las reglas que cruzan entidades. Códigos de este incremento:

`LEDGER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_ALREADY_EXISTS`, `ACCOUNT_CODE_DUPLICATE`,
`ACCOUNT_PARENT_CYCLE`, `ACCOUNT_PARENT_NOT_GROUPING`, `ACCOUNT_HAS_MOVEMENTS`,
`JOURNAL_NOT_FOUND`, `JOURNAL_ALREADY_EXISTS`, `JOURNAL_CODE_DUPLICATE`,
`PERIOD_NOT_FOUND`, `PERIOD_ALREADY_EXISTS`, `PERIOD_OVERLAP`, `IDEMPOTENCY_CONFLICT`.

Un error siempre deja el estado previo intacto: no se escribe nada antes de validar todo.

## Casos de uso

### registerAccount

Entrada: `{ ledgerId, accountId, code, name, type, parentId?, postingAllowed, idempotencyKey? }`.
Salida: `{ ledgerId, chartOfAccountsId, accountId, code, status }`.

Orden de validación:

1. `idempotencyKey` repetida con la misma huella devuelve el resultado guardado, sin segundo efecto;
   con huella distinta es `IDEMPOTENCY_CONFLICT`. La huella es `ledgerId` + `accountId`.
2. Plan del libro: `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. Id repetido: `findById(accountId)` presente es `ACCOUNT_ALREADY_EXISTS` (nunca se sobrescribe).
4. Código repetido en el plan: `findByCode(chart, code)` presente es `ACCOUNT_CODE_DUPLICATE` (A05).
   El mismo código en otro plan es válido.
5. Padre: si hay `parentId`, el padre debe existir y pertenecer al mismo plan; si no, `ACCOUNT_NOT_FOUND`
   (A04). Un padre de otro plan no se distingue de uno inexistente: el aislamiento pesa más que el
   diagnóstico.
6. Ciclo: recorrer `parentId` desde el padre; alcanzar `accountId` o repetir un nodo visitado es
   `ACCOUNT_PARENT_CYCLE` (A04).
7. Padre agrupador: `parent.postingAllowed` debe ser `false`; si no, `ACCOUNT_PARENT_NOT_GROUPING`.
   Una cuenta con hijos actúa como agrupadora porque no puede tener hijos si admite movimientos.
8. Movimientos: si `hasPostedLines(accountId)` para el padre, `ACCOUNT_HAS_MOVEMENTS`.
9. `Account.create` con el plan resuelto; sus errores burbujean.
10. Guardar la cuenta y registrar la idempotencia en la misma unidad de trabajo.

La cuenta nace `ACTIVE`. `accountId`, `code` y `name` vacíos o con espacios exteriores son error de
dominio (`INVALID_ACCOUNT`).

### setAccountStatus

Entrada: `{ ledgerId, accountId, status: 'ACTIVE' | 'INACTIVE' }`.
Salida: `{ ledgerId, accountId, status }`.

- Plan del libro, id existente y pertenencia al plan: si no, `ACCOUNT_NOT_FOUND` o `LEDGER_NOT_FOUND`.
- `INACTIVE` aplica `deactivate()`; `ACTIVE` aplica `activate()` (A09). Los dos devuelven copia y conservan
  identidad, plan, código, nombre, padre y `postingAllowed`.
- Repetir el mismo estado no es error: es un no-op que devuelve el resultado. Por eso este caso de uso no
  pide `idempotencyKey`.
- No existe desactivar en cascada ni comprobar hijos activos: fuera de alcance.

### registerJournal

Entrada: `{ ledgerId, journalId, code, name, idempotencyKey? }`.
Salida: `{ ledgerId, journalId, code, status }`.

1. Idempotencia como en `registerAccount`, con huella `ledgerId` + `journalId`.
2. `chartOfAccountsIdOf(ledgerId)` presente, o `LEDGER_NOT_FOUND`. El diario no guarda plan, pero exige
  libro conocido.
3. `findById(ledgerId, journalId)` presente es `JOURNAL_ALREADY_EXISTS`.
4. `findByCode(ledgerId, code)` presente es `JOURNAL_CODE_DUPLICATE` (J03).
5. `Journal.create` y guardar. Nace `ACTIVE`.

### setJournalStatus

Entrada: `{ ledgerId, journalId, status }`. Salida: `{ ledgerId, journalId, status }`.
Mismas reglas que `setAccountStatus`, con `JOURNAL_NOT_FOUND`. Desactivar un diario usado conserva su
historial (J04) y no toca asientos.

### registerPeriod

Entrada: `{ ledgerId, periodId, name, startDate, endDate, idempotencyKey? }`, con fechas `YYYY-MM-DD`.
Salida: `{ ledgerId, periodId, startDate, endDate, status }`.

1. Idempotencia con huella `ledgerId` + `periodId`.
2. `chartOfAccountsIdOf(ledgerId)` presente, o `LEDGER_NOT_FOUND`.
3. `findById(ledgerId, periodId)` presente es `PERIOD_ALREADY_EXISTS`.
4. `AccountingDate.create` para ambas fechas y `AccountingPeriod.create`; sus errores burbujean
   (`INVALID_DATE`, `INVALID_PERIOD`).
5. Solapamiento: `findOverlapping(ledgerId, startDate, endDate)` no vacío es `PERIOD_OVERLAP` (P07).
   La consulta y el guardado comparten la unidad de trabajo para que 007 pueda apoyarse en una
   restricción de base.
6. Guardar. Nace `OPEN`.

El cierre no está acá: ver `close-period.md`.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| R01 | — | Un libro con plan resuelto por el puerto | `registerAccount` con datos válidos | Devuelve `status: ACTIVE` y la cuenta queda guardada con el plan del libro |
| R02 | — | Un libro desconocido | `registerAccount` | `LEDGER_NOT_FOUND`; nada guardado |
| R03 | A05 | Una cuenta con código `1.1.01` en el plan | `registerAccount` con el mismo código | `ACCOUNT_CODE_DUPLICATE`; nada guardado |
| R04 | A05 | Dos libros con planes distintos | El mismo código en cada plan | Las dos cuentas se registran |
| R05 | A04 | Un padre en otro plan | `registerAccount` con ese `parentId` | `ACCOUNT_NOT_FOUND`; nada guardado |
| R06 | A04 | A→B→C ya registradas | `registerAccount` de A con padre C | `ACCOUNT_PARENT_CYCLE`; nada guardado |
| R07 | — | Un padre con `postingAllowed: true` | `registerAccount` de un hijo suyo | `ACCOUNT_PARENT_NOT_GROUPING`; nada guardado |
| R08 | — | Un `accountId` ya registrado | `registerAccount` con otro código | `ACCOUNT_ALREADY_EXISTS`; la cuenta original queda intacta |
| R09 | — | Un doble que informa movimientos contabilizados en el padre | `registerAccount` de un hijo | `ACCOUNT_HAS_MOVEMENTS`; nada guardado |
| R10 | A07 | Una cuenta con asientos | `setAccountStatus` a `INACTIVE` | Queda `INACTIVE` con identidad y datos intactos; no existe operación de borrado |
| R11 | A09 | Una cuenta `INACTIVE` | `setAccountStatus` a `ACTIVE` | Vuelve a `ACTIVE` conservando identidad |
| R12 | J03 | Un diario con código `VENTAS` en el libro | `registerJournal` con el mismo código | `JOURNAL_CODE_DUPLICATE`; nada guardado |
| R13 | P07 | Un período `2026-01-01`–`2026-12-31` | `registerPeriod` de `2026-06-01`–`2026-06-30` | `PERIOD_OVERLAP`; nada guardado |
| R14 | — | Un repositorio que falla al guardar | Cualquier caso de uso de este incremento | El error sube y no queda ninguna escritura previa |
| R15 | — | Un `idempotencyKey` ya usado con la misma petición | Repetir el caso de uso | Mismo resultado, sin segunda escritura |
| R16 | — | Un `idempotencyKey` ya usado con otra petición | Repetir con otro `accountId` o `journalId` | `IDEMPOTENCY_CONFLICT`; nada guardado |

## Decisiones pendientes

| ID | Tema | Impacto |
| --- | --- | --- |
| Q07 | Relación empresa/libros y varios libros por plan | Hoy un libro tiene exactamente un plan y lo declara el puerto. Un libro con dos planes o un plan compartido entre libros requiere cambiar `LedgerDirectory`. |
| — | Desactivar una cuenta con hijos activos | Sin regla: se permite. Bloquearlo exige una consulta de hijos y una decisión de negocio. |
| — | Renombrar cuentas y diarios | `rename` existe en el dominio y ningún caso de uso lo expone todavía. |

## Integración y consistencia

- El adaptador en memoria no prueba durabilidad ni aislamiento de producción; el contrato de
  `UnitOfWork` sí queda fijado para que 007 lo implemente sobre una transacción real.
- La comprobación de código único y de solapamiento vive dentro de la unidad de trabajo, no antes, para
  que una restricción de base pueda sustituirla sin mover el caso de uso.
- `LedgerDirectory` es el único punto que conoce la relación libro–plan. No se crea una entidad `Ledger`
  en esta fase.
- Autenticación y autorización pertenecen al anfitrión. El caso de uso no recibe usuario.

## Verificación

- Pruebas nuevas: `tests/registration.test.mjs`, consumiendo `dist/` como el resto de la suite.
- Una prueba por criterio de R01 a R16, más el caso límite de cada regla: período de un solo día válido,
  padre del mismo plan aceptado, código repetido en otro plan aceptado.
- R14 se verifica con una unidad de trabajo real del adaptador en memoria y un repositorio que falla en
  `save`: el estado anterior debe quedar idéntico.
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
