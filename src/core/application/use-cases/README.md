# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después crear el borrador, editarlo,
contabilizar, cerrar y revertir.

## Organización

Un archivo por **área** con el comportamiento, un archivo de **contratos** con las entradas y salidas, y un
archivo de **guardas** con las precondiciones que comparten los casos de uso.

| Archivo | Responsabilidad |
| --- | --- |
| `accounts.ts` | `RegisterAccount`, `SetAccountStatus` y sus reglas propias (código único, jerarquía) |
| `journals.ts` | `RegisterJournal`, `SetJournalStatus` |
| `periods.ts` | `RegisterPeriod`, `ClosePeriod` |
| `entries.ts` | `CreateEntryDraft`, `AddEntryLine`, `RemoveEntryLine`, `PostEntry`, `ReversePostedEntry` y la serialización |
| `contracts.ts` | Las 22 entradas/salidas serializables de la capa. Sin lógica: es el contrato con el anfitrión |
| `guards.ts` | Precondiciones compartidas por dos o más casos de uso: libro, asiento, id libre, diario activo, período abierto que contiene la fecha, cuenta del plan y cuenta contabilizable |
| `shared/` | Idempotencia (`fingerprintOf`, `replay`, `remember`). No es API pública |

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
superficie pública es la fachada `Accounting` (`../accounting.ts`), que las compone y expone un método por
caso de uso. `../index.ts` re-exporta los contratos.

Especificaciones: `docs/specs/registration.md`, `docs/specs/post-entry.md`, `docs/specs/close-period.md`,
`docs/specs/reverse-entry.md`, `docs/specs/entry-draft.md` y `docs/specs/entry-draft-edit.md`.
