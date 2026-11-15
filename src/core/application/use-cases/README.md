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
| `reports/reports.ts` | `Reports.accountBalances`, `Reports.trialBalance` y `Reports.accountMovements`. Las tres operaciones de **lectura** del módulo: no escriben ni llevan idempotencia |
| `reports/aggregate.ts` | Agregación compartida por los dos reportes de saldos: drena las páginas de `postedEntries`, acumula por cuenta y arma las filas. Es interna al área |
| `reports/movements.ts` | Mayor por cuenta: drenado, orden total `(accountingDate, entryId, lineId)`, saldo de apertura y corriente, y el cursor de posición. Es interna al área |
| `reports/rules.ts` | Precondiciones del área: libro sin exigir estado activo, rango de fechas con las fechas creadas antes de compararlas y límite de página con default y cotas |
| `../dto.ts` | Las 26 entradas/salidas serializables de la capa. No vive en esta carpeta: son datos, no casos de uso |
| `shared/rules.ts` | Precondiciones compartidas por dos o más áreas: libro, asiento, id libre de asiento, diario, período, cuenta del plan y cuenta contabilizable |
| `shared/idempotency.ts` | Idempotencia (`fingerprintOf`, `Idempotency`). No es API pública |

El nombre de la clase da el sustantivo y el método el verbo: `Entries.post(deps, input)` se lee mejor que
`Entries.postEntry(deps, input)` y que el antiguo `PostEntry.execute(input)`.

`entries/` no es la excepción: **cada área tiene su carpeta** con la clase de operaciones y su `rules.ts`. La
carpeta no decora nada —agrupa la clase y las precondiciones que esa clase invoca— y es la misma forma en las
cinco áreas, así que no hay que recordar cuál quedó como archivo y cuál como carpeta.

`reports/` es la única área que no escribe. Esa diferencia es la que decide dónde vive una lectura: lo que un
caso de uso necesita para **validar una escritura** es un método de repositorio (`findById`, `findByCode`,
`findOverlapping`, `findReversalsOf`); lo que existe sólo para **producir salida** es un puerto de consulta, y
sólo si su forma lo justifica —rango, paginación o volumen—. Por eso los movimientos contabilizados llegan por
`PostedEntriesQuery` y las cuentas de un plan llegan por `AccountRepository.findByChart`: la enumeración de un
plan no tiene rango ni paginación.

El mayor por cuenta (`accountMovements`) es el único reporte con cursor, y el cursor es suyo, no del puerto:
`PostedEntriesQuery` pagina por asiento y el mayor por fila, así que el core drena, ordena por
`(accountingDate, entryId, lineId)` y corta. El cursor guarda sólo la posición de la última fila devuelta —un
marcador de versión y los tres valores de esa posición— y **ningún importe**. Su procedencia se valida contra las
filas drenadas: una posición que no es una fila de esa cuenta y ese rango es `INVALID_APPLICATION_INPUT`, porque
aceptarla saltearía filas en silencio. Una página alcanzada por cursor vuelve a drenar y ordenar el rango
completo desde `from` para reconstruir el saldo corriente —no sólo lo anterior al corte—, así que recorrer el
reporte cuesta cuadrático en las filas del rango; confiar en el cursor convertiría un dato del llamador en un
saldo que el reporte afirma como propio, y una foto, caché o saldo materializado escondería la divergencia que
D1 cierra. Una página sin filas no tiene fila sobre la cual cerrar: devuelve `closingBalance` igual a
`openingBalance` y `nextCursor` en `null` (regla 13).

La regla 1 también se aplica en el borde del puerto: `isReportEntry` descarta lo que no sea `POSTED` o no
pertenezca al libro pedido, sin fallar por el exceso.

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
`docs/specs/reverse-entry.md`, `docs/specs/entry-draft.md`, `docs/specs/entry-draft-edit.md` y
`docs/specs/reports.md`.
