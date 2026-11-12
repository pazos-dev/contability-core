# Capa de aplicación con clases y fachada

Migrar los 11 casos de uso de fábrica de función (`makeX(deps)`) a clase con `execute(input)`, agregar la
fachada `Accounting` con un método por caso de uso y eliminar las fábricas. Rama `refactor/application-classes`;
`main` queda en `b9b5c11` hasta el merge.

## Specs

S1. Pedido original, textual: «la capa de aplicacion esta heca con funciones quiero migrarla a clases y
objeta para que sea mas comodo».

S2. Forma elegida, textual del preview aprobado:

```ts
// DI / test unitario
const postEntry = new PostEntry({ unitOfWork });
await postEntry.execute({ ledgerId, entryId, idempotencyKey });

// anfitrión que usa todo
const app = new Accounting({ unitOfWork });
await app.registerAccount(input);
await app.postEntry(input);

// 11 clases con `execute` + 1 fachada con nombres de caso de uso
```

S3. Compatibilidad, textual: «Corte limpio: se eliminan; paquete `private` 0.0.0 sin consumidores
registrados», con este antes/después:

```ts
// se borra
export { makeRegisterAccount } from './use-cases/accounts/index.js';

// queda
export { RegisterAccount } from './use-cases/accounts/index.js';
```

S4. Entrega, textual: «Igual que la anterior pero en `feat/007-application-api`, con `main` estable hasta el
final», con `git switch -c ...` y «`main` queda en `74cc09c` hasta el merge». La rama se llama
`refactor/application-classes` y sale de `b9b5c11`, que es `74cc09c` más el commit `fix(application)` de la
revisión R4: `main` sigue estable y el nombre no ocupa el número 007, reservado al contrato del adaptador del
anfitrión en `docs/STATUS.md`.

S5. Invariante de la migración: no cambia nada del comportamiento. `ApplicationDeps` sigue siendo
`{ readonly unitOfWork: UnitOfWork }`; los contratos de entrada y salida, los códigos de error, la unidad de
trabajo, el dominio y los adaptadores quedan igual. Los criterios de aceptación de las seis specs se siguen
verificando con las mismas 214 pruebas.

S6. Lo que **no** se convierte en clase: los ayudantes internos (`fingerprintOf`, `replay`, `remember` en
`use-cases/shared/`, `serializeLine`, `draftResultOf`, `sumSide` en `entries/entry-result.ts`) siguen siendo
funciones. Una clase alrededor de un cálculo puro no aporta y el proyecto no agrega patrones sin necesidad.

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2, S5 | Clases `RegisterAccount`, `SetAccountStatus`, `RegisterJournal`, `SetJournalStatus`, `RegisterPeriod`, `ClosePeriod` con `execute(input)` y su `index.ts` por área | `refactor(application): use case classes for accounts, journals and periods` |
| T2 | S2, S5 | Clases `CreateEntryDraft`, `AddEntryLine`, `RemoveEntryLine`, `PostEntry`, `ReversePostedEntry` y su `index.ts` | `refactor(application): use case classes for entry drafts, posting and reversal` |
| T3 | S2, S5 | Fachada `Accounting` con un método por caso de uso, un `index.ts` que exporta las clases y el test de la fachada | `feat(application): add the Accounting facade over the use case classes` |
| T4 | S3 | Borrar las fábricas `makeX` y sus alias de tipo; migrar los 9 archivos de test y `public-api` a clases y fachada | `refactor(application)!: remove the makeX factories` |
| T5 | S1, S5 | Specs (contrato de casos de uso, quince menciones a `makeX`), `ARCHITECTURE.md`, `STATUS.md` y READMEs de la capa | `docs(application): document the class contract and the facade` |

## Log

L1. «la capa de aplicacion esta heca con funciones quiero migrarla a clases y objeta para que sea mas comodo»

L2. Exploración previa a la decisión: 11 fábricas exportadas en `src/core/application/index.ts`, ~60 llamadas
en 9 archivos de test, y el contrato documentado como decisión explícita en `docs/specs/registration.md`
(«un caso de uso es una fábrica de funciones asíncronas, sin clases ni decoradores»). Por eso la migración se
trata como cambio de contrato público, con spec primero y sin alias.

L3. Decisiones del usuario: clases por caso de uso **más** fachada; corte limpio sin `makeX`; una sola entrega
en rama.

L4. Decisiones internas (rutinarias, no consultadas): la fachada se llama `Accounting` porque así está escrito
en el preview aprobado de S2, aunque el adaptador se llame `InMemoryAccounting`; la fachada compone las 11
clases en el constructor y no tiene estado propio; cada clase guarda `ApplicationDeps` en un campo privado
`#deps` y expone sólo `execute`; el orden de la cadena de commits es «agregar clases y fachada, migrar tests»
y después «borrar las fábricas», para que cada commit quede verde.
