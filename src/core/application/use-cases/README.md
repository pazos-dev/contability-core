# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después crear el borrador, editarlo,
contabilizar, cerrar y revertir.

## Organización

Una clase por **área** con una operación estática por caso de uso. Las operaciones no tienen estado: reciben
las dependencias como primer parámetro, porque un método estático no tiene otro lugar donde guardarlas, y la
fachada es la única que las ata una vez. Las entradas y salidas serializables no están acá: viven en
`../dto.ts`, porque son datos y no casos de uso.

| Ruta | Responsabilidad |
| --- | --- |
| `accounts/accounts.ts` | `Accounts.register`, `Accounts.setStatus` |
| `accounts/rules.ts` | Precondiciones del área: id libre, código único por plan (A05) y reglas del padre (A04, A06) |
| `journals/journals.ts` | `Journals.register`, `Journals.setStatus` |
| `journals/rules.ts` | Precondiciones del área: id libre y código único por diario (J03) |
| `periods/periods.ts` | `Periods.register`, `Periods.close` |
| `periods/rules.ts` | Precondiciones del área: id libre y ningún día compartido entre períodos (P07) |
| `entries/entries.ts` | `Entries.createDraft`, `Entries.addLine`, `Entries.removeLine`, `Entries.post`, `Entries.reverse` |
| `entries/rules.ts` | Precondiciones del área: reversión previa, en cualquier estado (al revertir) o ya contabilizada (al contabilizar) |
| `entries/result.ts` | Serialización de líneas, borradores y asientos; `lineOf` y `normalizedLine` |
| `../dto.ts` | Las 22 entradas/salidas serializables de la capa. No vive en esta carpeta: son datos, no casos de uso |
| `shared/rules.ts` | Precondiciones compartidas por dos o más áreas: libro, asiento, id libre de asiento, diario, período, cuenta del plan y cuenta contabilizable |
| `shared/idempotency.ts` | Idempotencia (`fingerprintOf`, `Idempotency`). No es API pública |

El nombre de la clase da el sustantivo y el método el verbo: `Entries.post(deps, input)` se lee mejor que
`Entries.postEntry(deps, input)` y que el antiguo `PostEntry.execute(input)`.

`entries/` no es la excepción: **cada área tiene su carpeta** con la clase de operaciones y su `rules.ts`. La
carpeta no decora nada —agrupa la clase y las precondiciones que esa clase invoca— y es la misma forma en las
cuatro áreas, así que no hay que recordar cuál quedó como archivo y cuál como carpeta.

Una regla vive al lado de las operaciones que la invocan, en `<área>/rules.ts`, porque es el área la que la
decide. Sube a `shared/rules.ts` sólo cuando dos o más áreas la invocan: ahí están el libro y su plan, la
existencia de asiento, diario y período, y las condiciones de la cuenta. Por eso no hay un `guards` para lo
compartido y un `rules` para lo local: es la misma naturaleza y lleva el mismo nombre. Igual que `result` o
`dto`, el nombre dice qué es la pieza, no de dónde cuelga.

**Prohibido un campo estático en estas cuatro clases.** Un `static #deps` convertiría el diseño en estado global
mutable: dos mundos aislados en el mismo proceso se pisarían y los tests pasarían a depender del orden. Las
dependencias viajan por parámetro, siempre.

Por qué las reglas: un caso de uso se lee como su especificación. Cada `requireX` devuelve el valor que
necesita la regla siguiente o lanza el error de esa regla, y el orden en que se invocan es el orden numerado
de la spec — con dos condiciones inválidas a la vez gana la de menor número. Eso reemplaza las cadenas de
`if` repetidas sin esconder el orden.

Por qué no hay un objeto o arreglo de reglas: las reglas son heterogéneas (algunas necesitan un valor
calculado por la anterior, otras dos lecturas `await`, y cada una lanza un error distinto con otro payload).
Una tabla de predicados escondería el orden y los errores detrás de clausuras. Se evaluó y se descartó; ver
`docs/tasks/readable-use-cases.md`.

Los errores se importan como namespace: `import * as errors from '../errors.js'` y `errors.periodClosed(...)`
en el sitio.

Cada operación es un método estático `async` y toda la ejecución —lecturas incluidas— ocurre dentro de una sola
llamada a `unitOfWork.run`. Las cuatro clases son **internas**: la superficie pública es la fachada `Accounting`
(`../facade/accounting.ts`), que ata las dependencias una vez y expone un método por operación.
`../index.ts` re-exporta los datos y los puertos.

Especificaciones: `docs/specs/registration.md`, `docs/specs/post-entry.md`, `docs/specs/close-period.md`,
`docs/specs/reverse-entry.md`, `docs/specs/entry-draft.md` y `docs/specs/entry-draft-edit.md`.
