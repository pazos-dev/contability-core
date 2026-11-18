# SPEC — Libro contable

Estado: **implementado y verificado** hasta el incremento 006f. L01-L16 se implementaron en 006e y L17-L24 en
006f, que resolvió Q08: el libro declara una moneda funcional única. El incremento 009d
(`foreign-currency.md`) cambió lo que significa contabilizar en otra moneda: ya no se rechaza por serlo, se
convierte con la tasa que recibe la operación, y por eso L22 y L24 y las reglas 15 y 17 se reescribieron en ese
mismo incremento. Este documento fija el comportamiento del
libro contable; lo que describe existe y está probado en `packages/core/tests/domain/ledger/ledger.test.mjs` y
`packages/core/tests/application/ledger.test.mjs`, con L11 cubierto una prueba por área en `packages/core/tests/application/registration.test.mjs`
y `packages/core/tests/application/entry-draft.test.mjs`, y L13 por la prueba de unicidad por plan que ya existía (R04).
Ruta: dominio en `packages/core/src/core/domain/ledger/`, casos de uso en
`packages/core/src/core/application/use-cases/ledgers/`.
Depende de: `registration.md` (convenciones de casos de uso, puertos, errores e idempotencia),
`journal.md` y `account.md` (convenciones de entidad y estado).

## Objetivo

Que el anfitrión pueda dar de alta y gobernar sus libros **a través del motor**, sin configuración previa:
registrar un libro con su plan de cuentas, desactivarlo y reactivarlo, y que todo caso de uso existente
rechace operar sobre un libro inactivo.

Antes de este incremento el libro no era una entidad del core: era un identificador que el adaptador en
memoria recibía al construirse (`chartOfAccountsByLedger`) y que el puerto `LedgerDirectory.chartOfAccountsIdOf`
resolvía a un plan. La consecuencia era concreta: el libro no se podía crear en runtime, no tenía nombre ni
estado, y era el único concepto del módulo sin caso de uso. Ese es el problema que este incremento resolvió.

## Alcance y exclusiones

Incluye:

- `Ledger` en el dominio: `id`, `name`, `chartOfAccountsId`, `currency` y estado `ACTIVE`/`INACTIVE`.
- Puerto `LedgerRepository` en el alcance de la unidad de trabajo, en reemplazo de `LedgerDirectory`.
- Casos de uso `registerLedger` y `setLedgerStatus`, expuestos por la fachada `Accounting`
  (que pasa de once a trece métodos).
- `LEDGER_INACTIVE` en los once casos de uso existentes.
- Adaptador en memoria: mapa de libros; `options.chartOfAccountsByLedger` desaparece y los libros se siembran
  registrándolos.

Excluye, declarado para no prometerlo:

- **Empresa, sociedad, tenant, usuario y autorización.** Siguen siendo identidad del anfitrión. El core no
  genera identificadores: el `ledgerId` lo elige el llamador, como todos los ids de este módulo.
- **El plan de cuentas como entidad.** Sigue siendo el identificador que el anfitrión aporta (Q07). El core
  no verifica que exista ni lo administra; sólo lo guarda en el libro y lo usa para el aislamiento de cuentas.
- **Borrado de libros.** Se desactivan; el historial queda.
- **Cambio de plan de un libro.** No hay operación; ver «Decisiones».
- **Jerarquía entre libros, consolidación y reportes por libro.** Corresponde a 008.
- **Tasas y diferencia de cambio.** El libro declara **una** moneda funcional inmutable; la conversión de una
  línea la decide la contabilización con la tasa que recibe y la guarda con la línea (009d). El core no elige ni
  busca cotizaciones y no lleva cuentas de diferencia de cambio (Q08).
- **Concurrencia y unicidad durable.** Del anfitrión (Q09): dos altas simultáneas del mismo id las separa su
  clave primaria, no este repositorio.

## Entradas y salidas

```ts
interface RegisterLedgerInput {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly currency: CurrencyJSON; // { code: 'UYU', scale: 2 }
  readonly idempotencyKey?: string;
}

interface RegisterLedgerResult {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly currency: CurrencyJSON;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

interface SetLedgerStatusInput {
  readonly ledgerId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

interface SetLedgerStatusResult {
  readonly ledgerId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}
```

La huella de idempotencia de `registerLedger` es `ledgerId` + `name` + `chartOfAccountsId` + `currency`: todo
el campo de la petición salvo la clave, como exige la regla 6 de `registration.md`. Dejar la moneda afuera de
la huella devolvería el resultado guardado ante una petición que cambia la moneda funcional del libro, que es
exactamente el conflicto que la idempotencia tiene que detectar. La moneda entra en forma canónica `code/scale`
y no como el objeto del llamador: el orden de las claves de un objeto no es parte de la petición, y
`{ scale, code }` tiene que ser la misma petición que `{ code, scale }`. `setLedgerStatus` no lleva clave por
la misma razón que `setAccountStatus`: repetir el mismo estado es un no-op.

Las salidas son serializables y sin instancias de dominio, igual que el resto de la capa.

## Flujo y orden de validación

`registerLedger`, todo dentro de una sola llamada a `unitOfWork.run`, lecturas incluidas:

1. **Idempotencia.** `find(ledgerId, 'registerLedger', key)`: huella igual devuelve el resultado guardado sin
   segundo efecto; huella distinta es `IDEMPOTENCY_CONFLICT`.
2. **Id libre.** `ledgers.findById(ledgerId)` presente es `LEDGER_ALREADY_EXISTS`. Nunca se sobrescribe.
3. **Validación local.** El caso de uso hidrata `Currency.fromJSON(input.currency)` y llama a
   `Ledger.create({ id, name, chartOfAccountsId, currency })`; sus errores burbujean sin envolver
   (`INVALID_LEDGER`, `INVALID_CURRENCY`).
4. **Escritura única.** `ledgers.save(ledger)` e `idempotency.record(...)` en la misma unidad de trabajo: si
   una falla, no queda la otra.
5. **Resultado.** Se arma desde el libro creado.

`setLedgerStatus`:

1. **Valor admitido.** Un `status` distinto de `ACTIVE` o `INACTIVE` es `INVALID_APPLICATION_INPUT`; sin esa
   guarda caería en la rama de activación y parecería un éxito.
2. **Libro.** `ledgers.findById(ledgerId)` ausente es `LEDGER_NOT_FOUND`.
3. **Transición.** `deactivate()` o `activate()` devuelven una copia; repetir el estado actual es no-op.
4. **Escritura.** `ledgers.save(next)` en la unidad de trabajo.

Orden en los casos de uso existentes: el plan no se resuelve por su cuenta; lo entrega
`requireActiveLedger(ledgerId)` —o `requireChartOfAccountsId`, que delega en ella— como
`ledger.chartOfAccountsId`. Ausente sigue siendo `LEDGER_NOT_FOUND`, y el nuevo
`status` distinto de `ACTIVE` es `LEDGER_INACTIVE`. La posición dentro de cada flujo no cambia: el libro se
sigue resolviendo antes que cualquier otra entidad, porque es el ámbito que da sentido a las demás.

## Reglas e invariantes

1. `Ledger` es inmutable: `rename`, `deactivate` y `activate` devuelven copias y conservan id, plan y
   estado no afectado. No hay setters.
2. `chartOfAccountsId` **no cambia**. Un libro con otro plan es otro libro; el plan es su identidad contable.
3. `id`, `name` y `chartOfAccountsId` no vacíos y sin espacios exteriores: se rechazan, no se recortan,
   alineado con `Account` y `Journal`.
4. El libro nace `ACTIVE`.
5. No existe operación de borrado: desactivar conserva identidad, nombre y plan, y deja el historial legible.
6. Un libro `INACTIVE` rechaza **todas** las operaciones de escritura del módulo con `LEDGER_INACTIVE`: los
   once casos de uso actuales más `setLedgerStatus` sobre otro libro. Desactivar no es una forma de seguir
   contabilizando por atrás.
7. Un libro `INACTIVE` se puede reactivar con `setLedgerStatus`; ahí vuelve a admitir operaciones.
8. Varios libros pueden compartir el mismo plan. Varios planes en un libro, no.
9. Ningún caso de uso acepta `chartOfAccountsId` del llamador: lo resuelve el libro, y con eso se mantiene
   Q07 en su parte ya decidida.
10. El libro no guarda cuentas, diarios, períodos, asientos ni saldos: sólo los identifica.
11. `registerAccount` y el resto derivan el plan del libro, así que dos libros con planes distintos siguen
    sin poder compartir cuentas.
12. `currency` **no cambia**. Es la moneda funcional del libro, su unidad de cuenta: cambiarla dejaría
    asientos contabilizados en una moneda que ya no es la del libro, sin operación que los migre. Mismo
    criterio que la regla 2 aplica al plan.
13. `currency` es obligatoria: un libro sin moneda funcional no existe y no se registra. El core no tiene una
    moneda por defecto, porque suponer una contabilizaría mal en silencio.
14. La moneda se valida con las reglas de `Currency`, no con reglas nuevas del libro: código de tres letras
    mayúsculas, escala entera de 0 a 6 y escala oficial de la tabla ISO para los códigos catalogados.
15. Contabilizar exige que el asiento quede **expresado en la moneda funcional** del libro: cada línea se
    convierte con la tasa que recibe la operación y lo que se compara son los importes funcionales
    (`foreign-currency.md`, reglas 1-8). Una línea en la moneda del libro no necesita tasa; una en otra moneda
    sin tasa es `ENTRY_RATE_MISSING`. Vale para las dos vías que dejan un asiento en `POSTED`: `postEntry` y
    `reversePostedEntry`; la reversión espeja los funcionales del original y no vuelve a convertir.
16. Los borradores **no** se validan por moneda, igual que no se validan por balance ni por período abierto:
    el borrador admite lo que todavía no se contabilizó y `post` es el punto estricto. Puede mezclar monedas y
    no guarda importe funcional.
17. El libro no guarda tasas ni las busca por fecha: la aporta quien llama, por operación, y se persiste con
    la línea que convirtió (`foreign-currency.md`, D2 y reglas 6-7). `Money` conserva `CURRENCY_MISMATCH` en
    las operaciones cruzadas porque convertir no es una operación de dinero sino una multiplicación por un
    factor exacto (`rounding.md`).
18. Varios libros pueden declarar la misma moneda funcional; una moneda por libro, no dos.

## Errores

Propios de esta entrega: `LEDGER_ALREADY_EXISTS`, `LEDGER_INACTIVE`, `LEDGER_CURRENCY_MISMATCH`.
Ya existente y reutilizado, ahora originado en el repositorio: `LEDGER_NOT_FOUND`.
Compartidos: `INVALID_APPLICATION_INPUT`, `IDEMPOTENCY_CONFLICT`.
De dominio, burbujean sin envolver: `INVALID_LEDGER` y `INVALID_CURRENCY` (este último de `Money`).

`LEDGER_CURRENCY_MISMATCH` pertenece a la aplicación y no al agregado porque la moneda del libro vive en otro
agregado: `JournalEntry` conoce `ledgerId`, no el libro, y resolverlo exige una lectura que el dominio no hace.
Desde 009d ese código dejó de ser el rechazo por defecto de una línea en otra moneda: la falta de tasa es
`ENTRY_RATE_MISSING` y la pareja equivocada o el factor no positivo son `INVALID_EXCHANGE_RATE`, las tres del
dominio (`foreign-currency.md`). Como guarda de la reversión compara el importe funcional y recurre al original
cuando no lo hay, así que un asiento antiguo en la moneda del libro se revierte igual; la discrepancia sólo
podría darse con un original en moneda extranjera **sin** funcional, que la contabilización anterior a 009d no
podía producir.

Todo error deja el estado como estaba: ni libro, ni registro de idempotencia parcial.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| L01 | 4 | Un id libre, nombre y plan válidos | `registerLedger` | Devuelve `status: ACTIVE` y el libro queda guardado con su plan |
| L02 | 2 | Un `ledgerId` ya registrado | `registerLedger` con otro nombre | `LEDGER_ALREADY_EXISTS`; el libro original queda intacto |
| L03 | 3 | Un `ledgerId`, un `name` o un `chartOfAccountsId` vacío o con espacios exteriores | `registerLedger` | `INVALID_LEDGER`; nada guardado |
| L04 | — | La misma clave y la misma petición | Repetir `registerLedger` | Mismo resultado, sin segunda escritura |
| L05 | — | La misma clave y otro `name` o otro plan | `registerLedger` | `IDEMPOTENCY_CONFLICT`; el registro guardado queda intacto |
| L06 | 1, 5 | Un libro `ACTIVE` con cuentas y asientos | `setLedgerStatus` a `INACTIVE` | Queda `INACTIVE` con id, nombre y plan intactos; ninguna operación de escritura lo acepta después |
| L07 | 7 | Un libro `INACTIVE` | `setLedgerStatus` a `ACTIVE` | Vuelve a `ACTIVE` y admite operaciones de nuevo |
| L08 | — | Un libro en el estado pedido | `setLedgerStatus` con ese mismo estado | No es error y no hay segundo efecto |
| L09 | — | Un `status` distinto de `ACTIVE` o `INACTIVE` | `setLedgerStatus` | `INVALID_APPLICATION_INPUT`; el estado anterior no cambia |
| L10 | 2 | Un `ledgerId` inexistente | `setLedgerStatus` | `LEDGER_NOT_FOUND`; nada escrito |
| L11 | 6 | Un libro `INACTIVE` | Cualquiera de los once casos de uso, uno por área | `LEDGER_INACTIVE`; nada escrito |
| L12 | — | Un repositorio de libros que falla al guardar | `registerLedger` | El error sube; no queda libro ni registro de idempotencia |
| L13 | 9 | Dos libros con planes distintos y una cuenta registrada en uno | `registerAccount` en el otro con el mismo código | Se registra: la unicidad de código es por plan, como ya especifica `registration.md` |
| L14 | 2 | Un `ledgerId` con espacios exteriores | `registerLedger` | `INVALID_LEDGER`, aunque después los casos de uso busquen el id tal cual |
| L15 | 2 | Un libro guardado | `registerAccount` sin `chartOfAccountsId` en la entrada | Toma el plan del libro; el contrato de `registration.md` no cambia |
| L16 | 10 | Un libro | Cualquier operación | El resultado no expone cuentas, asientos, períodos ni saldos del libro |
| L17 | 12, 13 | Un id libre, nombre y plan válidos y `currency: { code: 'UYU', scale: 2 }` | `registerLedger` | Se registra y el resultado devuelve la misma moneda; el libro queda con ella |
| L18 | 14 | Una moneda con código mal formado o con una escala que no es la oficial del código | `registerLedger` | `INVALID_CURRENCY`; no queda libro ni registro de idempotencia |
| L19 | 13 | Un alta sin `currency` | `registerLedger` | Error de dominio por moneda ausente; nada guardado |
| L20 | 12 | La misma clave y la misma petición salvo la moneda | Repetir `registerLedger` | `IDEMPOTENCY_CONFLICT`; el libro guardado conserva su moneda original |
| L21 | 12 | Un libro registrado con moneda | `rename`, `setLedgerStatus` a `INACTIVE` y de vuelta a `ACTIVE` | La moneda es la misma en todas las copias |
| L22 | 15 | Un libro `UYU` con un borrador balanceado en `USD` | `postEntry` sin tasas | `ENTRY_RATE_MISSING`; el asiento sigue `DRAFT` y no hay registro de idempotencia. Con la tasa `USD → UYU` contabiliza y cuadra en funcional |
| L23 | 16 | Un libro `UYU` | `createEntryDraft` y `addEntryLine` con líneas `USD` | El borrador se crea y se edita sin error; el rechazo aparece recién al contabilizar |
| L24 | 15 | Un libro en un código propio `ABC` con escala 2 y un borrador `ABC` con escala 4 | `postEntry` | `ENTRY_RATE_MISSING`: el mismo código con otra escala es otra moneda, y por eso el libro guarda el par y esa línea necesita su propia tasa |

## Decisiones

Resueltas en esta spec, con el motivo:

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Plan inmutable | No hay operación para cambiar `chartOfAccountsId` | Mismo criterio que `Account`, que no cambia código, padre ni tipo: el plan es la identidad contable del libro. Cambiarlo dejaría cuentas y asientos apuntando a un plan que ya no es el suyo sin ninguna operación que lo migre |
| Bloqueo total del libro inactivo | `LEDGER_INACTIVE` en los once casos de uso | Un estado que permite escribir no significa nada. El cierre de ejercicio es otra cosa y tiene sus propios estados |
| Un solo puerto | `LedgerRepository` reemplaza a `LedgerDirectory` | `chartOfAccountsIdOf` ya era la lectura del libro; el repositorio lleva la misma información más nombre y estado. Dos puertos para el mismo dato obligarían al anfitrión a mantener dos implementaciones coherentes |
| `setLedgerStatus` sin clave de idempotencia | Igual que `setAccountStatus` | Repetir el estado es no-op por construcción, así que no hay segundo efecto que evitar |
| El core no valida que el plan exista | Sin comprobación | No hay entidad de plan de cuentas: es un identificador del anfitrión. Inventar una tabla de planes acá sería decidir por el anfitrión |
| Moneda única por libro | Una sola moneda funcional; el asiento en otra moneda se convierte al contabilizar | Es la opción A de Q08. Un libro con asientos en dos monedas necesita importe funcional y tasa por línea: eso es 009d, y sigue sin haber cuentas de diferencia de cambio, que son otra operación |
| Moneda funcional inmutable | No hay `changeLedgerCurrency` | La moneda funcional es la unidad de cuenta del libro: cambiarla invalida todo asiento ya contabilizado, y ningún reporte histórico seguiría significando lo mismo. Un libro con otra moneda es otro libro |
| La guarda de moneda vive en la aplicación | `LEDGER_CURRENCY_MISMATCH` sólo en la reversión de un asiento sin funcional | La moneda del libro está en el `Ledger` y el asiento sólo conoce `ledgerId`; la conversión la decide el agregado porque recibe la moneda funcional y las tasas con la operación (009d) |
| La guarda no está en los borradores | Sólo al contabilizar | `createEntryDraft` ya declara que valida lo que hace coherente el borrador y que `postEntry` revalida todo. Validar la moneda antes habría invertido ese reparto y duplicado la regla |
| Sin tabla de tasas | La tasa la aporta el llamador, por operación | El core no tiene fuente de tasas ni fecha de aplicación; elegir una por defecto produciría importes funcionales falsos que nadie detectaría. `ExchangeRate` es un valor que viaja con la operación y se guarda con la línea (009d) |
| Sin moneda por defecto | `currency` obligatoria | Una moneda supuesta es peor que un alta fallida: contabiliza en silencio en la unidad equivocada |

Pendientes, con lo que bloquean:

| ID | Tema | Impacto |
| --- | --- | --- |
| Q08 | Moneda funcional y conversión | **Resuelta**: moneda única por libro en 006f y conversión con tasa recibida en 009d. Una tabla de cotizaciones, la diferencia de cambio y la revaluación al cierre siguen fuera, con spec propia |
| Q11 | Numeración de asientos y su ámbito | La numeración podría ser por libro; no cambia el alta de libro |
| — | Ejercicio contable por libro | Agrupar períodos en ejercicios necesita su propia spec; no bloquea el libro |
| — | Consolidación entre libros | Fuera de fase; exigiría una relación entre libros que hoy no existe |

## Integración y consistencia

- **Lo que cambia para el anfitrión:** implementa `LedgerRepository` (`findById`, `save`) sobre su tabla de
  libros en lugar de `LedgerDirectory`. En base durable eso es una tabla con `id`, `name`, `chart_id`,
  `currency_code`, `currency_scale` y `status`, con clave primaria sobre `id`; la restricción es lo que cierra
  la ventana entre la consulta de unicidad y la escritura.
- **Migración de libros ya persistidos:** el alta exige moneda desde 006f, así que un anfitrión con libros
  anteriores tiene que rellenarla antes de reutilizarlos. El core no puede hacerlo: no persiste (Q09) y no
  tiene criterio para elegir la moneda de un libro ajeno. `currency_code` y `currency_scale` nacen como
  columnas obligatorias una vez migrado el parque.
- **Migración del registro de idempotencia:** la huella de `registerLedger` cambia en 006f, así que los
  registros guardados por un alta anterior ya no coinciden con ninguna petición nueva. Un anfitrión que
  reintente un alta vieja con su clave va a recibir `IDEMPOTENCY_CONFLICT`, no el resultado guardado. La
  decisión es suya: descartar esos registros al migrar, o conservarlos aceptando que un reintento con la
  misma clave falle y haya que usar otra. Lo que el core garantiza es que no devuelve un resultado sin moneda
  declarada: el alta la exige antes de mirar el registro.
- **Adaptador en memoria:** `MemoryMaps` gana `ledgers` y la copia de respaldo de la unidad de trabajo lo
  incluye automáticamente. `options.chartOfAccountsByLedger` se elimina; los arneses de prueba siembran los
  libros que necesitan con `registerLedger`, que es lo que hace un anfitrión real. Un libro inexistente deja de
  poder aparecer por configuración: aparece sólo si se registró.
- **Idempotencia:** el ámbito sigue siendo libro + operación + clave. Con el libro como entidad, el ámbito se
  vuelve explícito: no se puede registrar con una clave en un libro que no existe, porque `ledgerId` es el
  sujeto del alta.
- **Concurrencia:** dos `registerLedger` simultáneos del mismo id pueden pasar la comprobación y chocar en la
  escritura; el aislamiento y la clave primaria son del anfitrión (Q09). Este repositorio no serializa.
- **Atomicidad:** el adaptador en memoria restaura todos los mapas si la unidad de trabajo falla, ahora
  incluido el de libros.

## Verificación

- Pruebas: `packages/core/tests/domain/ledger/ledger.test.mjs` para las reglas locales del agregado (L03, L14 e
  inmutabilidad) y `packages/core/tests/application/ledger.test.mjs` para L01-L10, L12, L15 y L16.
- L11 se cubre una prueba por área, no once: `packages/core/tests/application/registration.test.mjs` para cuentas, diarios y
  períodos, y `packages/core/tests/application/entry-draft.test.mjs` para asientos.
- Las pruebas del alta nombran la moneda explícitamente en cada caso, incluido el rechazo, para que una
  moneda por defecto no pueda volver a entrar sin que una prueba lo detecte.
- L13 se cubre con la prueba de unicidad por plan que ya existe en `packages/core/tests/application/registration.test.mjs`
  (R04), alimentada ahora por dos libros registrados en lugar de por configuración.
- `packages/core/tests/public-api.test.mjs` fija la superficie de trece métodos y el barrel `core/domain/ledger`, y falla si
  `Ledger` se filtra al paquete fuera de él.
- L17-L21 en `packages/core/tests/application/ledger.test.mjs`; L22 y L23 en `packages/core/tests/application/post-entry.test.mjs` y
  `packages/core/tests/application/entry-draft.test.mjs`; la inmutabilidad de L21 se cubre además en el agregado.
- L22 y L24 se reescribieron en 009d: la tasa es lo que falta, no la moneda. Sus casos viven en
  `packages/core/tests/application/post-entry.test.mjs` y el detalle de la conversión en
  `packages/core/tests/application/foreign-currency.test.mjs` (FX01-FX14).
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- Estado hoy: **implementado y verificado**. Existen `Ledger`, `LedgerRepository`, `registerLedger` y
  `setLedgerStatus`; la fachada expone diecisiete métodos; `chartOfAccountsByLedger` ya no existe en el adaptador
  en memoria y los libros se siembran registrándolos. Siguen fuera de alcance: tabla de cotizaciones,
  diferencia de cambio y revaluación al cierre (`foreign-currency.md`), cambio de plan de un libro (sin
  operación), borrado (se desactiva) y verificación de que el plan exista (Q07, a cargo del anfitrión).
