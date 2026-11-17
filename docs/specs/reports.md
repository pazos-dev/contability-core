# SPEC — Consultas e informes

Estado: **implementado y verificado**. 008a (`accountBalances`, `trialBalance`) y 008b (`accountMovements`)
existen y están probados. Este documento fija el comportamiento de los tres reportes del módulo. Nada de lo
que describe existía antes de este incremento: es la primera superficie de **lectura**.
Ruta prevista: casos de uso en `src/core/application/use-cases/reports/`, puerto de lectura en
`src/core/application/ports/`, adaptador en memoria en `src/adapters/memory/`.
Depende de: `ledger.md` (la moneda funcional del libro, L17-L24), `entries.md` (qué es un asiento
`POSTED`), `registration.md` (convenciones de casos de uso, errores y DTO) y `money.md`.
Decisión que lo habilita: Q08 resuelta como **una** moneda funcional por libro, sin conversión.

## Objetivo

Que el anfitrión pueda responder, a través del motor, las tres preguntas que hoy sólo puede responder
leyendo su propia base por fuera: **cuánto tiene cada cuenta**, **si los libros cuadran** y **cómo se llegó
a ese saldo**.

Es la primera superficie de **lectura** del módulo. Hasta este incremento los trece métodos de `Accounting`
escriben; ninguno devuelve información sobre lo que ya está contabilizado. `PostedMovementsQuery` no cubre
esa necesidad: tiene un solo método, `hasPostedLines(accountId)`, y existe para que la regla de cuentas no
dependa del dominio de asientos.

## Alcance y exclusiones

Incluye:

- **008a — Saldos por cuenta y balance de comprobación.** Dos reportes con dos contratos: `accountBalances`
  devuelve una fila por cuenta del plan con totales de debe y haber y saldo con signo; `trialBalance`
  devuelve esas mismas filas **más** los totales generales y la verificación de cuadre. Comparten la
  agregación y difieren en el contrato: quien sólo quiere saldos no recibe un campo de cuadre que no pidió,
  y el cuadre vive donde se afirma.
- **008b — Mayor por cuenta.** Movimientos de una cuenta en orden cronológico, con saldo corriente por
  fila, saldo de apertura y paginación desde el primer día.
- Un puerto de lectura nuevo: `PostedEntriesQuery`, implementado por el anfitrión.
- Tres casos de uso nuevos en la fachada: `accountBalances` y `trialBalance` (008a) y `accountMovements`
  (008b). La fachada pasa de trece a **dieciséis** métodos; `tests/public-api.test.mjs` lo fija y se
  actualiza con este incremento.

Excluye, declarado para no prometerlo:

- **Acumulación en cuentas de grupo (rollup).** Una fila por cuenta, sin sumar a los padres (D3). El
  balance completo por jerarquía es otro incremento con su propia regla de qué cuenta agrupa qué.
- **Conversión y multimoneda.** El reporte es de una sola moneda porque el libro tiene una sola moneda
  funcional: informa importes funcionales y no tiene columnas por moneda, ni tasa, ni diferencia de cambio
  calculada. La conversión ocurre al contabilizar, no al leer (`foreign-currency.md`).
- **Consolidación entre libros.** No hay reportes que sumen dos libros.
- **Filtros de presentación.** Se listan todas las cuentas del plan, incluidas las de saldo cero (D4).
  Ocultar, ordenar distinto, agrupar o exportar es del consumidor, no del motor.
- **Saldos materializados.** El cálculo es derivado: se suman asientos `POSTED` en cada consulta (D1).
  No hay tabla de saldos, ni caché, ni cierre de saldos.
- **Reportes por período o por ejercicio.** El corte es por fecha (D2); el estado del período no cambia el
  resultado.
- **Formatos de salida** (CSV, PDF, pantalla). El resultado es un DTO serializable.
- **Permisos y autorización.** Del anfitrión, como en todo el módulo.

## Entradas y salidas

```ts
interface AccountBalancesInput {
  readonly ledgerId: string;
  readonly from?: string; // YYYY-MM-DD, inclusive
  readonly to?: string;   // YYYY-MM-DD, inclusive
}

interface AccountBalanceRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly debit: MoneyJSON;
  readonly credit: MoneyJSON;
  readonly balance: MoneyJSON; // con signo: debe menos haber
  readonly side: 'DEBIT' | 'CREDIT' | 'ZERO';
}

interface AccountBalancesResult {
  readonly ledgerId: string;
  readonly currency: CurrencyJSON;
  readonly from: string | null;
  readonly to: string | null;
  readonly rows: readonly AccountBalanceRow[];
}

// `trialBalance` recibe exactamente la misma entrada que `accountBalances` y devuelve las mismas filas,
// más la fila de totales y el cuadre. No hay un segundo cálculo: hay un segundo contrato.
interface TrialBalanceResult {
  readonly ledgerId: string;
  readonly currency: CurrencyJSON;
  readonly from: string | null;
  readonly to: string | null;
  readonly rows: readonly AccountBalanceRow[];
  readonly totals: { readonly debit: MoneyJSON; readonly credit: MoneyJSON };
  readonly balanced: boolean; // totals.debit === totals.credit
}

interface AccountMovementsInput {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

interface AccountMovementRow {
  readonly entryId: string;
  readonly lineId: string;
  readonly accountingDate: string;
  readonly journalId: string;
  readonly description: string;
  readonly side: 'DEBIT' | 'CREDIT';
  readonly amount: MoneyJSON;
  readonly runningBalance: MoneyJSON; // con signo, después de esta fila
  readonly reversalOfEntryId?: string;
}

interface AccountMovementsResult {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly currency: CurrencyJSON;
  readonly openingBalance: MoneyJSON;
  readonly rows: readonly AccountMovementRow[];
  readonly closingBalance: MoneyJSON; // saldo después de la última fila devuelta
  readonly nextCursor: string | null; // null en la última página
}
```

Los importes viajan como `MoneyJSON` y viajan **siempre con la moneda del libro**: la escala es parte de la
identidad monetaria y viaja con el importe, nunca se deduce del código (regla M14). `currency` en el
resultado no es decorativa: es contra qué comparar los importes.

`balance`, `runningBalance` y `openingBalance` son **con signo** —debe menos haber— porque un saldo sin
signo obliga al consumidor a saber el tipo de cuenta para interpretarlo. `side` resume el mismo hecho para
quien sólo necesita saber de qué lado cae.

El resultado no expone instancias de dominio: ni `Money`, ni `Account`, ni `JournalEntry`.

## Flujo y orden de validación

`trialBalance` y `accountBalances` comparten flujo y cálculo; el primero agrega un paso:

1. **Libro.** `ledgers.findById(ledgerId)`; ausente es `LEDGER_NOT_FOUND`. **No** se exige que esté
   `ACTIVE` (regla 9).
2. **Fechas.** `AccountingDate.create` sobre `from` y `to` cuando vienen; sus errores burbujean
   (`INVALID_DATE`). `from` posterior a `to` es `INVALID_APPLICATION_INPUT`.
3. **Cuentas del plan.** `accounts.findByChart(ledger.chartOfAccountsId)` devuelve las cuentas del plan del
   libro; el saldo inicial de cada una es cero. Es la única lectura de cuentas del reporte.
4. **Movimientos.** Se drenan las páginas de `postedEntries.findPostedMovements` para el rango y se acumula
   por `accountId` el debe y el haber. La memoria ocupada depende de la cantidad de **cuentas**, no de la
   cantidad de asientos.
5. **Filas.** Una por cuenta, ordenadas (regla 8), con `balance` y `side` derivados. `accountBalances`
   **termina acá** y devuelve `rows`.
6. **Totales.** Sólo `trialBalance`: suma de debe y de haber de las filas; `balanced` compara los dos.
7. **Resultado.** Se arma desde el acumulado, sin volver a leer.

`accountMovements`:

1. **Libro.** Igual que arriba.
2. **Fechas.** Igual que arriba, incluido `from` posterior a `to`.
3. **Cuenta.** `accounts.findById(accountId)`; ausente o de otro plan es `ACCOUNT_NOT_FOUND` (regla 11).
4. **Límite.** `limit` fuera del rango permitido es `INVALID_APPLICATION_INPUT`; ausente usa el valor por
   defecto.
5. **Saldo de apertura.** Se acumula el neto de todo lo anterior a `from` para esa cuenta; sin `from`, es
   cero.
6. **Página.** Una página de movimientos de la cuenta en el rango, ordenada (regla 8).
7. **Saldo corriente.** Se calcula por fila, empezando desde el saldo de apertura.
8. **Resultado.** `closingBalance` es el saldo después de la última fila devuelta; `nextCursor` lo produce el
   reporte a partir de la clave de orden de la última fila devuelta, y es `null` si la página es la última.

El orden de las reglas es parte del contrato: con dos condiciones inválidas a la vez gana la de número más
bajo, y eso es lo que fija qué error ve el llamador.

## Reglas e invariantes

1. **Sólo asientos `POSTED`.** Un borrador no tiene hecho contable: no aparece en ningún reporte, ni con
   saldo cero. Es la regla que más se rompe en silencio, porque un borrador tiene líneas y puede balancear. El
   core la **vuelve a aplicar** sobre lo que el puerto devuelve, y descarta también lo que no pertenece al
   libro pedido: un puerto que devuelve de más no puede ensuciar un reporte, y un reporte no falla por un
   error del anfitrión que se puede corregir descartándolo.
2. **Una reversión es un asiento más.** Suma con el lado invertido y netea contra el original, que sigue
   `POSTED` y sigue contando. El original **nunca** se excluye por estar revertido: excluirlo daría cero
   donde corresponde el importe, y las dos lecturas parecen razonables hasta que se comparan.
3. **Una sola moneda, la del libro.** Todo importe de un reporte está en la moneda funcional del libro: el
   reporte suma el **importe funcional** de cada línea, no el original con el que se pactó. Si el puerto
   devuelve una línea contabilizada sin importe funcional —datos del anfitrión anteriores a 009d—, la suma
   falla cerrado con `CURRENCY_MISMATCH` de dominio: el core no inventa una conversión histórica. Ese es el
   único significado que le queda a la regla desde 009d; una línea en otra moneda ya no es un error, porque
   contabilizarla la convirtió (`foreign-currency.md`, regla 11).
4. **`from` y `to` son inclusivos** y se comparan sobre `accountingDate`, no sobre la fecha de carga ni
   sobre el período del asiento.
5. **`from` ausente** significa desde el origen; **`to` ausente**, sin techo. El resultado informa `null`
   en el campo correspondiente, que es distinto de un rango vacío.
6. **Un rango vacío es válido**: devuelve todas las cuentas con saldo cero y totales en cero. No es un
   error: un libro recién registrado se reporta así.
7. **Se listan todas las cuentas del plan del libro**, incluidas las que no tuvieron movimiento en el
   rango, con `ZERO` y saldo cero. Nunca se listan cuentas de otro plan (Q07).
8. **Orden estable.** Balance: por `code` ascendente comparado como texto —conserva ceros iniciales, así
   que `1.10` va después de `1.9`— y desempate por `accountId`. Mayor: por `accountingDate`, luego
   `entryId`, luego `lineId`. La misma consulta dos veces devuelve el mismo orden.
9. **Leer no exige libro activo.** Un libro `INACTIVE` rechaza escrituras (`ledger.md`, regla 6) pero se
   reporta con normalidad: desactivar un libro no puede impedir leer su historia.
10. **Sin acumulación en cuentas de grupo.** Cada fila corresponde a una cuenta; `balance` es lo que pasó
    por esa cuenta, no lo de sus hijas.
11. **El mayor es de una sola cuenta**, y esa cuenta tiene que pertenecer al plan del libro. Una cuenta de
    otro plan es `ACCOUNT_NOT_FOUND`, igual que una inexistente: no se distinguen.
12. **`openingBalance`** es el neto de todo lo anterior a `from` para esa cuenta, con el mismo criterio de
    signo que los saldos. Sin `from` es cero.
13. **`closingBalance`** es el saldo después de la última fila de la página devuelta, no el del final del
    rango. En la última página coinciden. `nextCursor` no nulo indica que quedan filas y que el cierre del
    rango todavía no se alcanzó. Una página **sin filas** devuelve `closingBalance` igual a `openingBalance`
    y `nextCursor` en `null`: no hay fila sobre la cual cerrar.
14. **Paginación acotada.** `limit` por defecto 100, mínimo 1, máximo 1000; fuera de rango es
    `INVALID_APPLICATION_INPUT`. `cursor` es opaco para el llamador y lo produce **el core**, no el puerto: el
    puerto pagina por asiento y este reporte pagina por fila, así que el cursor codifica la clave de orden de
    la última fila devuelta y nunca un importe acumulado. Un cursor que el reporte no produjo es
    `INVALID_APPLICATION_INPUT`, y eso incluye un cursor con forma válida cuyo punto de corte no está entre las
    filas del rango pedido para esa cuenta: aceptarlo saltearía filas en silencio, que es peor que fallar.
15. **El core agrega, el puerto entrega líneas.** El puerto devuelve asientos `POSTED` con sus líneas, no
    totales: si agregara el anfitrión, el cuadre y la moneda única dejarían de verificarse en el core.
16. **Determinismo.** El resultado depende sólo de lo almacenado, no del orden en que la persistencia
    devuelve las filas.
17. **Sin efectos.** Un reporte no escribe: ni asientos, ni registros de idempotencia, ni estado. No lleva
    clave de idempotencia porque repetirlo no tiene segundo efecto.
18. **Saldos y balance comparten el cálculo y no el contrato.** `accountBalances` no devuelve `totals` ni
    `balanced`: un saldo por cuenta no afirma que los libros cuadren, y el cuadre se afirma donde se
    calcula. Las dos operaciones devuelven las mismas filas para la misma entrada.

## Errores

Propios de esta entrega: reutiliza `LEDGER_NOT_FOUND`, `ACCOUNT_NOT_FOUND` e `INVALID_APPLICATION_INPUT`.
De dominio, burbujean sin envolver: `INVALID_DATE` (fecha imposible, por ejemplo un 29 de febrero no
bisiesto) y `CURRENCY_MISMATCH` (una línea contabilizada sin importe funcional, es decir datos del anfitrión
anteriores a 009d: el reporte no inventa una conversión histórica).

Todo error deja el estado como estaba: no hay estado que cambiar.

Un **balance que no cuadra no es un error.** El resultado devuelve `totals` y `balanced: false` para que el
llamador vea la diferencia. Un reporte que se niega a mostrar la discrepancia no sirve para encontrarla.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| AB01 | 7, 18 | Un libro con tres cuentas y dos asientos contabilizados | `accountBalances` sin fechas | Devuelve las tres cuentas con debe, haber, saldo y lado, y **ningún** campo de totales |
| AB02 | 12 | Un libro con cuentas registradas y ningún asiento | `accountBalances` | Todas las cuentas aparecen con saldo cero y `side: ZERO` |
| AB03 | 2 | Un asiento contabilizado y su reversión contabilizada | `accountBalances` | La cuenta queda en cero; el original sigue contando |
| AB04 | 8 | Cuentas con códigos `1.9` y `1.10` | `accountBalances` | El orden es por código como texto y es el mismo en dos llamadas seguidas |
| AB05 | 17 | Un libro con asientos contabilizados | `accountBalances` | No escribe: el registro de idempotencia y el de asientos quedan igual |
| TB00 | 18 | Un libro con cuentas y asientos contabilizados | `accountBalances` y `trialBalance` con la misma entrada | Las filas son idénticas; sólo el balance devuelve `totals` y `balanced` |
| TB01 | 7, 9 | Un libro con tres cuentas y dos asientos contabilizados | `trialBalance` sin fechas | Devuelve las tres cuentas, con debe, haber y saldo por cuenta, y totales iguales |
| TB02 | 7 | Un libro con cuentas registradas y ningún asiento | `trialBalance` | Todas las cuentas aparecen con saldo cero y `side: ZERO`; `balanced: true` |
| TB03 | 1 | Un libro con un asiento `POSTED` y un borrador del mismo importe | `trialBalance` | Sólo cuenta el contabilizado; el saldo no incluye el borrador |
| TB04 | 2 | Un asiento contabilizado y su reversión contabilizada | `trialBalance` | La cuenta queda en cero, el original sigue contando y no hay doble conteo |
| TB05 | 4, 5 | Asientos en los extremos de un rango | `trialBalance` con `from` y `to` | Ambos extremos entran; lo anterior a `from` y lo posterior a `to` no |
| TB06 | 6 | Un libro sin asientos | `trialBalance` con un rango sin movimientos | No es error: cuentas con saldo cero y totales en cero |
| TB07 | 8 | Cuentas con códigos `1.9` y `1.10` | `trialBalance` | El orden es por código como texto y es el mismo en dos llamadas seguidas |
| TB08 | 9 | Un libro `INACTIVE` con asientos contabilizados | `trialBalance` | Responde normalmente; el estado del libro no afecta la lectura |
| TB09 | 3 | Un puerto que devuelve una línea contabilizada sin importe funcional (datos anteriores a 009d) | `accountBalances` y `trialBalance` | `CURRENCY_MISMATCH` y ningún resultado parcial, en las dos |
| TB10 | 10 | Una cuenta de grupo con una cuenta hija con movimientos | `trialBalance` | La fila del grupo no incluye lo de la hija |
| TB11 | 4, 6 | Un `from` posterior a `to` | `trialBalance` | `INVALID_APPLICATION_INPUT`; un `from` imposible es `INVALID_DATE` |
| GL01 | 13 | Una cuenta con movimientos en un rango | `accountMovements` | Filas cronológicas, `runningBalance` después de cada una y `closingBalance` de la última |
| GL02 | 12 | Una cuenta con movimientos anteriores a `from` | `accountMovements` con `from` | `openingBalance` refleja lo anterior y la primera fila arranca desde ahí |
| GL03 | 14, 13 | Una cuenta con más movimientos que el `limit` pedido | `accountMovements` | Devuelve `limit` filas y `nextCursor` no nulo; el `closingBalance` es el de la última fila |
| GL04 | 14 | La última página del mayor | `accountMovements` con el cursor final | `nextCursor` es `null` y `closingBalance` es el saldo al final del rango |
| GL05 | 11 | Una cuenta inexistente y una de otro plan | `accountMovements` | Las dos son `ACCOUNT_NOT_FOUND` |
| GL06 | 2 | Un asiento y su reversión, ambos contabilizados | `accountMovements` | Aparecen las cuatro líneas con las dos fechas y el saldo corriente vuelve a cero |
| GL07 | 15, 17 | Un reporte cualquiera | Dos llamadas idénticas, paginadas también | Mismo resultado y ningún registro de idempotencia ni escritura |
| GL09 | 14 | Un cursor con forma válida que el reporte no produjo: una fila inexistente, un asiento inexistente, una fecha fuera del rango o el cursor de otro rango | `accountMovements` | `INVALID_APPLICATION_INPUT`; nada se calcula y el estado no cambia. Sin esta guarda el reporte saltearía filas en silencio |
| GL10 | 1 | Un puerto que devuelve un borrador y un asiento de otro libro | `accountBalances`, `trialBalance` y `accountMovements` | El core los descarta: el reporte sale como si no existieran, sin fallar |
| GL11 | 13 | Una página sin filas, con un cursor válido que apunta a la última fila del rango | `accountMovements` | `closingBalance` igual a `openingBalance` y `nextCursor` en `null`, no el saldo del final del rango |
| GL08 | 14 | Un `limit` de 0 o mayor que 1000 | `accountMovements` | `INVALID_APPLICATION_INPUT`; el valor por defecto se usa cuando falta |

## Decisiones

Resueltas con el humano al abrir el incremento:

| Tema | Decisión | Motivo |
| --- | --- | --- |
| D1 — cálculo | **Derivado**: se suman asientos `POSTED` en cada consulta | Una tabla de saldos abriría una divergencia entre el asiento y el saldo que el core no puede cerrar, porque la transacción es del anfitrión (Q09). Con cálculo derivado una reversión se corrige sola y no hay estado que se desincronice |
| D2 — corte | **`from`/`to` por fecha contable**, inclusivos y opcionales | El estado del período no cambia el resultado: un período cerrado es justamente sobre el que se reporta. Un corte por período habría atado el reporte a una entidad que puede no existir para los asientos históricos |
| D3 — jerarquía | **Plano**: una fila por cuenta | Acumular en los padres exige decidir qué cuenta agrupa qué y cómo se evita contar dos veces lo que ya se sumó. Es una regla propia, no un detalle de presentación |
| D4 — cuentas | **Todas** las del plan, incluidas las de saldo cero | El consumidor filtra; el motor no adivina qué querés ver. Un saldo cero es información: la cuenta existe y no tuvo movimiento |
| D5 — volumen | **Paginado desde el primer contrato** | Agregar paginación después rompe el contrato del resultado y a todo consumidor que ya lo lee |

Decisiones tomadas al redactar esta spec:

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Saldos y balance son **dos** operaciones | `accountBalances` (filas) y `trialBalance` (filas + totales + cuadre) | Decisión del humano al revisar la spec. Cuestan un método más en la fachada y comparten la agregación interna; el motivo es de contrato: quien pide saldos no debería recibir un campo de cuadre que no pidió, y el cuadre tiene que aparecer donde el motor lo afirma |
| Puerto **nuevo** para asientos | `PostedEntriesQuery` junto a `PostedMovementsQuery` | Ampliar un puerto que un anfitrión ya implementa es un cambio de contrato incompatible; el existente responde una regla de escritura y no se toca |
| Cuentas por **repositorio** | `AccountRepository.findByChart(chartOfAccountsId)` en lugar de un puerto de lectura aparte | Criterio de forma y no de sujeto: un puerto se separa cuando la lectura es por rango, paginada o de salida en volumen. La enumeración de un plan no tiene rango ni paginación, y la cuenta ya es la dueña de `chartOfAccountsId`. Dos puertos sobre cuentas obligarían al anfitrión a mantener dos implementaciones coherentes, que es lo que `ledger.md` rechazó al reemplazar `LedgerDirectory` |
| El desbalance **se muestra** | `balanced: false` con totales, no una excepción | Encontrar la diferencia es el uso principal del balance. Una excepción lo escondería detrás del mismo error para el que se consulta el reporte |
| Leer no exige libro activo | Los reportes no comprueban `status` | Desactivar un libro cierra la escritura, no el acceso a su historia |
| `balance` con signo y `side` | Se devuelven los dos | El signo es lo que se suma; el lado es lo que se muestra. Obligar al consumidor a derivar uno de otro según el tipo de cuenta repite una regla del dominio fuera del dominio |
| El core agrega | El puerto entrega líneas, no totales | El cuadre y la regla de moneda única son invariantes del motor: si agregara el anfitrión, el core no podría verificarlas |

| El cursor lo produce el core | Formato propio, con la clave de orden de la última fila; sin importes | El puerto pagina por asiento y el reporte pagina por fila, así que el cursor del puerto ataría la posición del llamador al tamaño de página del host. Y un cursor que llevara el saldo acumulado sería un dato que el llamador puede inventar: la única fuente admisible del saldo corriente es volver a derivarlo |
| Continuidad entre páginas | Cada página alcanzada por un cursor vuelve a drenar el rango desde `from` | Es el precio de D1 sumado a «no confiar en el cursor». Cuesta trabajo lineal en las filas anteriores y está documentado como límite; un caché o un saldo materializado son otra decisión, no una optimización local |
| `description` en la fila | Se toma la descripción del asiento | `JournalEntryLine.description` es opcional y `JournalEntry.description` siempre existe: elegir la de la línea obligaría a inventar un texto cuando falta |

Pendientes que este incremento no cierra:

| ID | Tema | Impacto |
| --- | --- | --- |
| Q08 | Conversión y multimoneda | Resuelta en 009d (`foreign-currency.md`): el asiento se convierte al contabilizar y el reporte suma el importe funcional. Tabla de cotizaciones, diferencia de cambio y revaluación al cierre siguen fuera |
| — | Rollup por jerarquía de cuentas | Excluido por D3; necesita su propia regla de agregación |
| — | Reportes por período y por ejercicio | Excluidos por D2; el ejercicio contable tampoco existe como entidad |
| — | Consolidación entre libros | Fuera de fase |
| — | Referencia opaca al documento de origen | No entra acá. Sería trazabilidad, no multimoneda, y permitiría al anfitrión conservar el importe en moneda extranjera y su cotización fuera del libro |

## Integración y consistencia

- **Lo que cambia para el anfitrión:** implementa `PostedEntriesQuery` sobre su base. Lo natural es una
  consulta sobre las líneas contabilizadas con índices por `(ledger_id, accounting_date)` y por
  `(ledger_id, account_id, accounting_date)`, que son los dos accesos que piden los reportes. El puerto
  devuelve asientos `POSTED` con sus líneas y un cursor; **el orden lo garantiza el core**, no la
  persistencia, y por eso el puerto puede devolver en cualquier orden dentro de una página.
- **Cambio de contrato en `AccountRepository`:** el anfitrión suma `findByChart(chartOfAccountsId)`, que
  devuelve todas las cuentas de un plan. No es opcional: sin esa lectura no se pueden listar las cuentas del
  plan con saldo cero (regla 7). Es un método nuevo en una interfaz que el anfitrión ya implementa, así que
  rompe la compilación de las implementaciones existentes con un error evidente y de arreglo directo, igual
  que el campo obligatorio de 006f. En base durable es un índice por `chart_id`.
- **Adaptador en memoria:** itera su mapa de asientos y filtra por libro, estado, rango y cuenta. Sirve
  para pruebas y composición; no pretende ser eficiente.
- **Paginación y consistencia:** el balance drena todas las páginas, así que una lectura que cambie entre
  página y página puede producir un resultado que nunca existió como foto. El core no bloquea nada: si el
  anfitrión necesita una foto consistente, se la tiene que dar su transacción o su aislamiento (Q09). Es
  el mismo límite que ya tienen las escrituras y se documenta para no prometer atomicidad de lectura.
- **Costo de paginar el mayor:** cada página alcanzada por un cursor vuelve a drenar **el rango completo** desde
  `from` —no sólo lo anterior al corte— y a ordenarlo, para derivar el saldo corriente. Recorrer todo el
  reporte cuesta por lo tanto cuadrático en la cantidad de filas del rango, tanto en lecturas al puerto como
  en comparaciones del ordenamiento. Se acepta porque el puerto filtra por cuenta y porque la alternativa es
  confiar en un acumulado que el llamador puede fabricar. Si alguna vez duele, la salida es un saldo
  materializado con fecha de corte, que es una decisión aparte y no una optimización local.
- **Concurrencia:** los reportes son de sólo lectura; no serializan, no reclaman y no escriben. Dos
  reportes simultáneos no interfieren.
- **Nada que migrar:** el incremento no escribe ni cambia datos. Los cambios de contrato son dos lecturas
  nuevas: un puerto que el anfitrión implementa cuando lo necesite y un método en `AccountRepository` que su
  compilador le va a reclamar. La fachada suma tres métodos sin tocar los trece existentes.

## Verificación

- Pruebas de saldos y balance en `tests/application/reports-balances.test.mjs` (AB01-AB05, TB00-TB11) y del
  mayor en `tests/application/reports-account-movements.test.mjs` (GL01-GL11 más las reglas 1, 3, 9 y 14).
- Cada criterio se prueba desde la fachada, no contra funciones internas, para que el contrato público sea
  lo que queda fijado.
- TB09 y GL10 necesitan un puerto que mienta: se implementa un `PostedEntriesQuery` de prueba que devuelve
  una línea contabilizada sin importe funcional (datos anteriores a 009d), un borrador y un asiento de otro
  libro, porque ningún camino legítimo del módulo
  puede producir esos estados.
- GL09 es la prueba que justifica que el cursor no se confíe: un cursor bien formado que el reporte no produjo
  tiene que fallar, porque aceptarlo saltearía filas en silencio y la primera verificación independiente del
  incremento encontró exactamente eso en la primera implementación.
- GL03 y GL04 comparten escenario: la misma cuenta, dos páginas encadenadas por el cursor, verificando que
  no falta ni sobra ninguna fila y que el saldo corriente continúa de una página a la otra.
- `tests/public-api.test.mjs` pasa a fijar **dieciséis** métodos en la fachada.
- Comandos: `pnpm check` — `check:project`, `typecheck`, `build` y `test` en ese orden. **`pnpm test` por sí
  solo corre contra `dist/` y no prueba el código actual**; sin `build` antes, su resultado no vale.
- Estado hoy: **implementado y verificado**. `pnpm check` en verde con **293 pruebas** (eran 260 al abrir el
  incremento): 18 de 008a y 14 de 008b, más la prueba del barrel que fija dieciséis métodos.
