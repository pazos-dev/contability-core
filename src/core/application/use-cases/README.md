# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después contabilizar, cerrar y
revertir.

## Organización

Un archivo por caso de uso, agrupados por el área a la que pertenecen. La carpeta no vuelve a crecer en
plano: un caso de uso nuevo entra en el grupo que le corresponde.

| Carpeta | Casos de uso |
| --- | --- |
| `accounts/` | `registerAccount`, `setAccountStatus` |
| `journals/` | `registerJournal`, `setJournalStatus` |
| `periods/` | `registerPeriod`, `closePeriod` |
| `entries/` | `postEntry`, `reversePostedEntry` |
| `shared/` | Ayudantes internos (`fingerprintOf`, `replay`, `remember`). No es API pública. |

Cada carpeta expone su superficie en su `index.ts`; `../../index.ts` solo agrega esos barrels.

Cada caso de uso es una clase con un único método asíncrono: `execute(input)`. Toda la ejecución
—lecturas incluidas— ocurre dentro de una sola llamada a `unitOfWork.run`.

Estas clases son **internas**: no se exportan del paquete. La superficie pública es la fachada `Accounting`
(`src/core/application/accounting.ts`, una carpeta arriba), que las compone y expone un método por caso de
uso. Los barrels de cada área existen para cablear la fachada, no como API.

Especificaciones: `docs/specs/registration.md`, `docs/specs/post-entry.md`,
`docs/specs/close-period.md` y `docs/specs/reverse-entry.md`.
