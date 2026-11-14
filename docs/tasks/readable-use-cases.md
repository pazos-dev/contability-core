# Casos de uso legibles: contratos aparte y guardas con nombre

Sacar los contratos de `entries.ts` (eran ruido en medio del comportamiento) y refactorizar las cadenas de
`if` repetidas en guardas con nombre, sin cambiar ninguna regla.

## Specs

S1. Pedido original, textual: «en entrys sepra las interfaces uqe no son epxlicitas derw entries aparte es
ruido. y haz un refantor para mejorar el codigoutiliz abuenas rpactices busca skill para ello. ejemplo en los
if condicionales utiliza negacion para abarcar mejores condiciones y qu3 no sea un if if if if if y luego el
codigo o creamos un objeto reglas para crear reglas y si se cumplen listo asi no es un if if if».

S2. Interpretación de la primera parte: los contratos de `entries.ts` (diez interfaces, ~150 de sus 520
líneas) se mueven a un módulo propio, y con ellos los de las otras tres áreas, para que un archivo de área se
lea como comportamiento y un solo módulo sea el contrato con el anfitrión.

S3. Interpretación de la segunda: negación para rechazar lo que no cumple (en vez de anidar condiciones
positivas), y fin de las cadenas repetidas de `if` mediante **guardas con nombre** que devuelven el valor de
la regla o lanzan su error.

S4. Invariante: cero cambios de comportamiento, de orden de error y de superficie pública. Las 217 pruebas y
`public-api` son la red.

S5. Decisión sobre el «objeto reglas»: **evaluado y descartado**, con el criterio de la skill
`design-patterns` («lightest route first: check the lightweight alternative antes de agregar indirección») y
de `clean-code-architecture` («la solución más sencilla que preserve invariantes»). Motivos concretos, no
gusto:

| Motivo | Detalle |
| --- | --- |
| El orden es contrato | `docs/specs/post-entry.md`: «con dos condiciones inválidas a la vez, el error reportado es el de la regla de menor número». En guardas se lee en la línea; en un arreglo queda implícito en el índice |
| Reglas heterogéneas | `requireOpenPeriodContaining` necesita la fecha que produce un paso previo; `requireNoPostedReversal` necesita el asiento ya cargado; `requirePostableAccount` se repite por línea. Una tabla de predicados obliga a clausuras que capturan el scope |
| Payload distinto por error | `periodDateOutside(periodId, fecha.value)` vs `periodClosed(periodId)` vs `accountNotFound(accountId)`. En una tabla, el payload viaja como argumento de la clausura: mismo ruido, más indirección |
| Asincronía | Casi todas las reglas esperan una lectura; la tabla sería `Promise` de predicados, y el `for` de líneas no encaja sin un caso especial |

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2 | `use-cases/contracts.ts` con las 22 entradas/salidas; las áreas importan sus tipos de ahí y `index.ts` re-exporta el módulo completo | `refactor(application): extract contracts and name the shared preconditions` |
| T2 | S3 | `use-cases/guards.ts` con siete precondiciones compartidas; las áreas las invocan en el orden numerado de su spec | idem |
| T3 | S4 | Verificar orden de error, payloads y superficie; actualizar `check-project.mjs` y el README del área | idem |

## Log

L1. «en entrys sepra las interfaces uqe no son epxlicitas derw entries aparte es ruido. y haz un refantor para
mejorar el codigoutiliz abuenas rpactices busca skill para ello. ejemplo en los if condicionales utiliza
negacion para abarcar mejores condiciones y qu3 no sea un if if if if if y luego el codigo o creamos un
objeto reglas para crear reglas y si se cumplen listo asi no es un if if if».

L2. Skills cargadas: `clean-code-architecture` (proyecto), `typescript-best-practices` (proyecto) y
`design-patterns` (global, para evaluar el objeto de reglas con su tabla de decisión).

L3. Guardas creadas, todas con dos o más consumidores: `requireChartOfAccountsId` (11 usos),
`requireEntry` (4), `requireFreeEntryId` (2), `requireActiveJournal` (2), `requireOpenPeriodContaining` (2),
`requireAccountOfPlan` (2 + un `for`), `requirePostableAccount` (2, por línea). Las comprobaciones de un solo
consumidor quedaron locales al archivo del área: extraerlas sería una abstracción sin variación comprobada.

L4. Negación donde corresponde: `period.status !== 'OPEN'` y `status !== 'ACTIVE' && status !== 'INACTIVE'`
rechazan todo lo que no es el valor admitido, así que un estado futuro no se cuela. Se conservó esa forma en
lugar de `=== 'CLOSED'`, que habría sido una regresión silenciosa.

L5. Resultado medido: sentencias `if (...)` con `throw errors.` en los cuatro archivos de área: **53 → 16**.
`entries.ts`: **520 → 413 líneas** y sin interfaces. En sentido contrario, la capa pasa de 75 a **95
sentencias `import`** (2.2 por archivo) y de 150 a **192 bindings**: partir contratos y nombrar guardas cuesta
una sentencia de import por archivo. Es el precio explícito de que `entries.ts` se lea como comportamiento.

L6. Verificación: `pnpm check` exit 0, **217/217**, sin tocar una expectativa. Orden de reglas por caso de uso
revisado uno por uno contra su spec (libro → asiento → diario → período → cuentas → reversión), y los payloads
de error son los mismos porque las guardas reciben exactamente los mismos argumentos.
