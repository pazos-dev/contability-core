# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después crear el borrador, editarlo,
contabilizar, cerrar y revertir.

## Organización

Un archivo por **área**, y dentro las clases de sus casos de uso con sus contratos de entrada y salida al
lado. La regla no es "un archivo por caso de uso": es "un archivo por frontera de módulo". Cuatro archivos
cruzan las mismas cinco fronteras (dominio, errores, puertos, ayudantes compartidos y sus propios contratos),
así que agruparlas evita repetir el mismo encabezado once veces.

| Archivo | Casos de uso | Contratos que define |
| --- | --- | --- |
| `accounts.ts` | `registerAccount`, `setAccountStatus` | `RegisterAccount*`, `SetAccountStatus*` |
| `journals.ts` | `registerJournal`, `setJournalStatus` | `RegisterJournal*`, `SetJournalStatus*` |
| `periods.ts` | `registerPeriod`, `closePeriod` | `RegisterPeriod*`, `ClosePeriod*` |
| `entries.ts` | `createEntryDraft`, `addEntryLine`, `removeEntryLine`, `postEntry`, `reversePostedEntry` | `CreateEntryDraftInput`, `AddEntryLineInput`, `RemoveEntryLineInput`, `EntryDraftResult`, `PostEntry*`, `ReversePostedEntry*`, `EntryLineInput`, `PostedLineResult` |
| `shared/` | Ayudantes internos (`fingerprintOf`, `replay`, `remember`). No es API pública. | — |

Los errores se importan como namespace: `import * as errors from '../errors.js'` y `errors.periodClosed(...)`
en el sitio. El archivo de errores tiene 30 constructores; enumerar once de ellos en cada encabezado era el
grueso del ruido sin aportar nada.

Cada caso de uso es una clase con un único método asíncrono, `execute(input)`, y toda la ejecución
—lecturas incluidas— ocurre dentro de una sola llamada a `unitOfWork.run`.

Estas clases son **internas**: no se exportan del paquete. La superficie pública es la fachada `Accounting`
(`src/core/application/accounting.ts`, una carpeta arriba), que las compone y expone un método por caso de
uso. `../../index.ts` re-exporta los contratos de estas áreas, y nada más.

Especificaciones: `docs/specs/registration.md`, `docs/specs/post-entry.md`, `docs/specs/close-period.md`,
`docs/specs/reverse-entry.md`, `docs/specs/entry-draft.md` y `docs/specs/entry-draft-edit.md`.
