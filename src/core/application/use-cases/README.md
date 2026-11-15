# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después crear el borrador, editarlo,
contabilizar, cerrar y revertir.

## Organización

Cada área es una carpeta con un archivo por caso de uso, un `rules.ts` con las precondiciones que sólo esa área
usa y, en `entries/`, un `result.ts` con la serialización. Las entradas y salidas serializables no están acá:
viven en `../dto.ts`, porque son datos y no casos de uso.

| Ruta | Responsabilidad |
| --- | --- |
| `accounts/register-account.ts` | `RegisterAccount` |
| `accounts/set-account-status.ts` | `SetAccountStatus` |
| `accounts/rules.ts` | Código único por plan (A05) y reglas del padre (A04, A06) |
| `journals/register-journal.ts` | `RegisterJournal` |
| `journals/set-journal-status.ts` | `SetJournalStatus` |
| `periods/register-period.ts` | `RegisterPeriod` |
| `periods/close-period.ts` | `ClosePeriod` |
| `entries/create-entry-draft.ts` | `CreateEntryDraft` |
| `entries/add-entry-line.ts` | `AddEntryLine` |
| `entries/remove-entry-line.ts` | `RemoveEntryLine` |
| `entries/post-entry.ts` | `PostEntry` |
| `entries/reverse-posted-entry.ts` | `ReversePostedEntry` |
| `entries/rules.ts` | Precondiciones propias del área: diario y período del borrador, reversión previa |
| `entries/result.ts` | Serialización de líneas, borradores y asientos; `lineOf` y `normalizedLine` |
| `../dto.ts` | Las 22 entradas/salidas serializables de la capa. No vive en esta carpeta: son datos, no casos de uso |
| `guards.ts` | Precondiciones compartidas por dos o más áreas: libro, asiento, id libre, diario activo, período abierto que contiene la fecha, cuenta del plan y cuenta contabilizable |
| `shared/` | Idempotencia (`fingerprintOf`, `Idempotency`). No es API pública |

Por qué las guardas: un caso de uso se lee como su especificación. Cada `requireX` devuelve el valor que
necesita la regla siguiente o lanza el error de esa regla, y el orden en que se invocan es el orden numerado
de la spec — con dos condiciones inválidas a la vez gana la de menor número. Eso reemplaza las cadenas de
`if` repetidas sin esconder el orden.

Por qué no hay un objeto o arreglo de reglas: las reglas son heterogéneas (algunas necesitan un valor
calculado por la anterior, otras dos lecturas `await`, y cada una lanza un error distinto con otro payload).
Una tabla de predicados escondería el orden y los errores detrás de clausuras. Se evaluó y se descartó; ver
`docs/tasks/readable-use-cases.md`.

Los errores se importan como namespace: `import * as errors from '../errors.js'` y `errors.periodClosed(...)`
en el sitio.

Cada caso de uso es una clase con un único método asíncrono, `execute(input)`, y toda la ejecución
—lecturas incluidas— ocurre dentro de una sola llamada a `unitOfWork.run`. Las clases son **internas**: la
superficie pública es la fachada `Accounting` (`../facade/accounting.ts`), que las compone y expone un método por
caso de uso. `../index.ts` re-exporta los datos y los puertos.

Especificaciones: `docs/specs/registration.md`, `docs/specs/post-entry.md`, `docs/specs/close-period.md`,
`docs/specs/reverse-entry.md`, `docs/specs/entry-draft.md` y `docs/specs/entry-draft-edit.md`.
