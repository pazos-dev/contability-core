# Incremento 008 — Consultas e informes

Primera superficie de **lectura** del módulo. Comportamiento autoritativo en `docs/specs/reports.md`: reglas
1-18, criterios AB01-AB05, TB00-TB11 y GL01-GL08. Dos entregas: **008a** (saldos por cuenta y balance de
comprobación) y **008b** (mayor por cuenta).

## Specs

S1. «d1 derivado» — los saldos se calculan sumando asientos `POSTED` en cada consulta. No hay tabla de saldos,
ni caché, ni cierre de saldos, ni estado que se pueda desincronizar.

S2. «d2 from to» — el corte es por fecha contable con `from` y `to`, ambos inclusivos y opcionales. El estado
del período no cambia el resultado.

S3. «d3 plano» — una fila por cuenta, sin acumular a los padres. El rollup queda fuera de alcance.

S4. «d4 se listan todas las cuentas ya filtrar si no se quieren ver no es trabajo del motor» — se listan todas
las cuentas del plan del libro, incluidas las de saldo cero. El motor no filtra, no ordena por preferencia del
consumidor y no exporta.

S5. «d5 si pagina desde el principio» — el mayor nace paginado: `limit` con valor por defecto, máximo y
`nextCursor`. Agregar paginación después rompería el contrato del resultado.

S6. «separados.» — saldos por cuenta y balance de comprobación son **dos operaciones**: `accountBalances`
devuelve las filas; `trialBalance` devuelve esas mismas filas más `totals` y `balanced`. Comparten la
agregación interna y difieren en el contrato. La fachada pasa de trece a dieciséis métodos.

S7. «balanced false» — un balance que no cuadra **no** es un error: el resultado trae los totales y
`balanced: false` para que el llamador vea la diferencia.

S8. Sólo asientos `POSTED`; una reversión es un asiento más y el original nunca se excluye. Todo importe está
en la moneda funcional del libro y, si no lo está, el cálculo falla cerrado con `CURRENCY_MISMATCH`.

S9. Leer no exige libro activo: un libro `INACTIVE` se reporta con normalidad.

S10. Puerto nuevo `PostedEntriesQuery` en el alcance de la unidad de trabajo (`postedEntries`). **No** se
amplía `PostedMovementsQuery`: agregarle un método rompería el contrato de todo anfitrión que ya lo implementa.

S11. La enumeración de cuentas del plan se agrega a `AccountRepository` como `findByChart(chartOfAccountsId)`,
no como puerto nuevo. El criterio es la forma de la lectura: un puerto se separa cuando la lectura es por
rango, paginada o de salida en volumen; enumerar un plan no tiene rango ni paginación y la cuenta ya es dueña
de `chartOfAccountsId`. Dos puertos sobre cuentas sería la duplicación que `ledger.md` rechazó al reemplazar
`LedgerDirectory` por `LedgerRepository`.

## Tasks

| ID | Specs | Qué | Commit |
| --- | --- | --- | --- |
| T1 | S1-S4, S6-S11 | 008a: puerto `PostedEntriesQuery`, `AccountRepository.findByChart`, `accountBalances` y `trialBalance`, adaptador en memoria, fachada a quince métodos y pruebas AB01-AB05 + TB00-TB11 | `96663e3` |
| T2 | S1-S5, S8-S10 | 008b: `accountMovements` con saldo de apertura, saldo corriente y paginación; fachada a dieciséis métodos y pruebas GL01-GL08 | — |

## Log

L1. «bien me vas a explicar que es lo siguiente y como lo vamos hacer antes de continuar y te digo»

L2. Respuestas a las cinco decisiones del planteo: «d1 derivado», «d2 from to», «d3 plano», «d4 se listan
todas las cuentas ya filtrar si no se quieren ver no es trabajo del motor», «d5 si pagina desde el principio».

L3. Pregunta del humano sobre monedas: «pregunta que no me encaja como se registrarian movimientos de
diferentes monedas? se puede hacer unancotizacion aparte nates de entrar el movimiento en el libro supongo.
eos tambie. le corresponde la motor?» Respuesta registrada: con una moneda funcional por libro la conversión
ocurre **antes** de que el asiento llegue al libro; la cotización no es un concepto del libro. El motor no
convierte y no re-mide. La re-medición y la diferencia de cambio quedan fuera hasta que haya necesidad
demostrada (Q08, mitad abierta).

L4. «nfuera dale soguen» — FX queda fuera del motor por completo y se procede a escribir la spec.

L5. Sobre la separación de reportes: «separados.» El humano eligió dos operaciones donde el redactor había
propuesto una. Coste asumido: un método más en la fachada y la agregación compartida en un módulo interno;
beneficio: quien pide saldos no recibe un campo de cuadre que no pidió.

L6. «balanced false» — confirmado que el desbalance se muestra en el resultado y no se lanza como error.

L7. El worker de 008a frenó antes de escribir: la spec pedía listar todas las cuentas del plan y **no existía
ninguna lectura que enumere un plan**. `AccountRepository` sólo tenía `findById`, `findByCode` y `save`. Es un
hueco de la spec, no del traspaso. Decisión del padre (S11): `findByChart(chartOfAccountsId)` entra en
`AccountRepository`, con el criterio de forma de la lectura; se descarta un puerto aparte por la duplicación
que `ledger.md` ya rechazó para libros. Consecuencia registrada: es un método nuevo en una interfaz que el
anfitrión ya implementa, así que rompe su compilación y el incremento vuelve a tener riesgo de contrato
(ítem 3) y verificación independiente al cerrar.

L8. 008a implementado en `96663e3`. Test-first real: las 17 pruebas se escribieron antes de tocar `src/` y el
rojo fue 17/17 con `app.accountBalances is not a function`. Después, `pnpm check` en verde con **278 pruebas**
(eran 260): 17 del reporte más la prueba nueva del barrel. Interpretaciones aceptadas del implementador: el
cursor en memoria es un desplazamiento sobre el orden total `(accountingDate, entryId)`; el tamaño de página del
drenado (200) es una constante interna; la regla 1 se aplica en el borde del puerto y el core **no** vuelve a
comprobar el estado del asiento, para no duplicar el filtro; `from > to` reutiliza `INVALID_APPLICATION_INPUT`
con `field: 'from'` porque `errors.ts` quedó fuera de las superficies permitidas; los `totals` son la suma de
las columnas, así que una reversión sube las dos columnas por igual mientras los saldos netean a cero.

L9. La rama `feat/006f-ledger-currency` acumula ahora dos incrementos (006f y 008a) en cinco commits. Los cortes
son limpios y separables — `d3ac19a`, `43f7090` y `fed6046` son 006f; `96663e3` y el commit de documentación de
008a son 008a — así que se pueden revisar como dos PR encadenados si se prefiere. Supera la rebanada de ~400
líneas por la regla del ítem 3: el cambio de contrato de 006f y el de 008a no compilan con medio cambio.
