# Integración con otras aplicaciones

## Como módulo importable

La aplicación anfitriona crea adaptadores y los inyecta en la fachada `Accounting`, el único punto de entrada del
core: los casos de uso son implementación interna y no se exportan.
Puede ser NestJS, Express, otra aplicación Node o una herramienta sin servidor HTTP.

```ts
import { Accounting, createInMemoryAccounting } from '@pazos-dev/contability-core';

const adapter = createInMemoryAccounting();
const accounting = new Accounting({ unitOfWork: adapter.unitOfWork });
```

`createInMemoryAccounting` es para desarrollo y pruebas; el anfitrión sustituye ese `UnitOfWork` por una
transacción real de su motor. La fachada importa compilada, así que el paquete necesita `pnpm build` antes de
consumirse.

1. Inventario registra una compra en su propio dominio.
2. Un coordinador traduce el hecho a una petición contable con cuentas e importes explícitos.
3. `createEntryDraft` guarda el borrador y `postEntry` lo contabiliza dentro del libro correspondiente.
4. Un adaptador guarda el asiento y devuelve un resultado serializable.

La UI consume la API del anfitrión. Un navegador no se conecta directamente a un repositorio PostgreSQL del core.
El catálogo de productos y los documentos comerciales permanecen en sus módulos.

## 1. Frontera: qué garantiza el core y qué debe garantizar el anfitrión

Este repositorio es un motor contable embebible. **No incluye base de datos, ORM, migraciones, HTTP ni
procesos.** Por eso las garantías que dependen del almacenamiento no son un incremento pendiente del core: son
un contrato que el anfitrión debe cumplir al implementar los puertos. Cada obligación lleva un identificador
`HA` para que se pueda verificar una por una.

| El core garantiza | El anfitrión debe garantizar |
| --- | --- |
| Las reglas contables y de coherencia, con códigos estables en **dos** familias: `ApplicationError` y los errores de dominio, que se propagan sin envolver | Una `UnitOfWork` que sea una transacción real de su motor (`HA01`) |
| Que todas las lecturas y entregas al puerto ocurran dentro de ese alcance | Atomicidad y rollback de su motor (`HA02`) |
| Una huella de idempotencia canónica **en el primer nivel**: campos ordenados, ausentes omitidos, pares serializados. Los valores anidados llegan ya normalizados por cada DTO | Guardar la huella tal como llega, y decidir qué hace con las registradas cuando cambie un DTO (`HA26`, `HA27`) |
| Consultar unicidad antes de entregar: identificadores de libro, cuenta, diario, período y asiento; código de cuenta por plan y de diario por libro; solapamiento de períodos; una sola reversión | Restricciones únicas en su esquema que cierren la ventana entre la consulta y la escritura. Para el solapamiento de períodos, un `UNIQUE` **no alcanza** (`HA16`) |
| Un identificador de asiento que nunca se reutiliza, comprobado antes de entregar en el alcance `(ledgerId, entryId)` | Clave primaria sobre `(ledgerId, entryId)`, que es la garantía durable (`HA20`) |
| Rechazar un asiento si el período ya está cerrado en el momento de la lectura | Serialización o detección de versión entre cierre y contabilización (`HA06`, P08 en `docs/specs/post-entry.md`) |

Dos advertencias sobre la primera fila, para que nadie las descubra en producción:

- La huella **no** canonicaliza lo anidado por sí sola. `fingerprintOf`
  (`src/core/application/use-cases/shared/idempotency.ts`) ordena y filtra sólo el primer nivel; lo que hay
  dentro de un valor lo normaliza el DTO que lo construye `Ledger` colapsa la moneda a `code/scale` y
  `draftResultOf` convierte una `description` ausente en `null`, que **no** se omite. Por eso el anfitrión no
  debe re-normalizar la huella: la guarda como texto.
- `ACCOUNT_HAS_MOVEMENTS` existe como guarda de defensa, pero **no es alcanzable** a través de la API pública:
  la única cuenta que puede tener movimientos es contabilizable, y esa misma cuenta se rechaza antes como
  padre con `ACCOUNT_PARENT_NOT_GROUPING`. No cuentes con ese código. Hay además un camino de invariante que
  lanza un `Error` sin código (`src/core/application/use-cases/entries/result.ts`): si aparece, es un defecto
  del core, no una entrada de usuario.

Consecuencia práctica: en este repositorio las pruebas del adaptador en memoria demuestran **la disciplina de
las operaciones**, no atomicidad ni aislamiento. Un adaptador durable del anfitrión debe probar eso con su
base real, y esas pruebas viven en el anfitrión.

## 2. La unidad de trabajo

Es la pieza de la que cuelga todo lo demás: si no es una transacción real, ninguna de las garantías del core
sobrevive al primer fallo.

- **`HA01` — transacción real.** `unitOfWork.run(work)` abre una transacción de tu motor, ejecuta `work` y
  confirma al resolver o revierte al lanzar. Una implementación que sólo envuelva el callback sin transacción
  pasa las pruebas del core y no sirve en producción.
- **`HA02` — un `run` por operación.** Cada método de la fachada entra exactamente una vez. Los casos de uso
  nunca llaman a `run` dentro de otro `run`: no hay anidamiento que resolver ni transacciones parciales que
  anidar.
- **`HA03` — lectura de lo propio escrito.** Dentro del alcance, leer tiene que devolver lo que ya se escribió
  en el mismo alcance. Todos los casos de uso leen antes de escribir —resolver el plan del libro, comprobar
  el período, consultar la idempotencia— y una implementación con conexiones separadas por repositorio rompe
  esa secuencia.
- **`HA04` — repositorios atados al alcance.** Los repositorios sólo existen como campos de `UnitOfWorkScope`.
  El core no puede obtenerlos por fuera y por eso no hay conexiones independientes disfrazadas de transacción.
  No los caches ni los devuelvas de un alcance que ya terminó.
- **`HA05` — el alcance no sobrevive a `run`.** Un `scope` es válido sólo mientras el callback se ejecuta. Si
  lo guardas para después, el core va a escribir fuera de tu transacción.
- **`HA06` — concurrencia.** El core no serializa nada: dos operaciones simultáneas son tu responsabilidad
  (Q09). `P08` —cierre y contabilización a la vez— y `U06`/`U07` quedan de tu lado.

## 3. Obligaciones por puerto

Los contratos son las interfaces de `src/core/application/ports.ts`. Aquí está lo que la firma no dice.

### `LedgerRepository`

- **`HA07`** — Un libro que nunca se registró es indistinguible de uno ausente: `findById` devuelve
  `undefined`, no lanza.
- **`HA08`** — `save` es un *upsert* por `ledgerId`. El core puede guardar el mismo libro más de una vez
  dentro de un circuito (alta, cambio de estado).
- **`HA09`** — Hay que persistir `chartOfAccountsId`, `currency` (`code` y `scale`) y `status`. El libro es la
  **única** fuente del plan de cuentas (Q07) y de la moneda funcional: el core no acepta ninguno de los dos
  del llamador ni los verifica contra otra tabla.

### `AccountRepository`

- **`HA10`** — Los identificadores de cuenta son globales; el código es único dentro de un plan.
- **`HA11`** — `findByCode(chartOfAccountsId, code)` está acotado por plan: el índice natural es
  `(chartOfAccountsId, code)`, no `code` solo.
- **`HA12`** — `findByChart(chartOfAccountsId)` es **obligatoria, completa y sin paginar**. Es la única
  lectura que enumera el plan, y de ella dependen los saldos y el balance: si devuelve medio plan, los
  reportes **pierden filas en silencio**, porque el core no tiene forma de saber que faltan cuentas. En base
  durable es un índice por `chart_id`.

### `JournalRepository`

- **`HA13`** — Los diarios están acotados por libro: el id de otro libro es indistinguible de uno ausente.
- **`HA14`** — `findByCode(ledgerId, code)` está acotado por libro; la unicidad de código es por libro, no
  global.

### `PeriodRepository`

- **`HA15`** — Los períodos están acotados por libro, igual que los diarios.
- **`HA16`** — `findOverlapping(ledgerId, startDate, endDate)` recibe un **rango**, con ambos extremos
  inclusivos, y debe devolver **todos** los períodos que se solapan con él, no el primero: el error incluye
  los identificadores de todos. Una restricción `UNIQUE` no puede expresar solapamiento de rangos; si tu
  motor no tiene exclusión de rangos, serializa la escritura de períodos de un libro.

### `EntryRepository`

- **`HA17`** — `findById(ledgerId, entryId)` está acotado por libro.
- **`HA18`** — `findReversalsOf(ledgerId, originalEntryId)` devuelve **todos** los asientos de ese libro cuyo
  `reversalOfEntryId` es el original, **en cualquier estado**, como lista y nunca como primera coincidencia.
  Un borrador de reversión y una reversión contabilizada pueden coexistir; responder con el primero que
  devuelva el almacenamiento deja que uno tape al otro y habilita una segunda reversión. Qué cuenta como
  reversión existente lo decide la regla que pregunta, no el almacenamiento.
- **`HA19`** — Hay que persistir `reversalOfEntryId`; sin esa columna no hay regla de reversión única.
- **`HA20`** — `save` es un *upsert* por `(ledgerId, entryId)`, y la clave primaria sobre ese par es la
  garantía durable de que un id de asiento no se reutiliza.

### `PostedMovementsQuery`

- **`HA21`** — `hasPostedLines(accountId)` **no** recibe libro: tiene que responder sobre todos los libros y
  sólo contar entradas `POSTED`. Necesita un índice por el `accountId` de las líneas.

### `IdempotencyRegistry` y `PostedEntriesQuery`

Tienen su propia sección, porque el detalle es el que se olvida: 4 y 5.

## 4. Idempotencia

- **`HA22`** — La clave es la tripleta `(ledgerId, operation, key)`, nunca la clave sola: la misma clave en
  otra operación o en otro libro es otra operación.
- **`HA23`** — `record` se escribe en la **misma** transacción que el trabajo. Si el trabajo se confirma y el
  registro no, un reintento con la misma clave vuelve a ejecutar; si el registro se confirma y el trabajo no,
  el reintento recibe un resultado de algo que nunca pasó.
- **`HA24`** — `find` y `record` copian el resultado al entrar y al salir. El objeto que recibe el llamador
  nunca es el que está guardado, así que mutar un resultado no reescribe lo que responde el siguiente
  reintento. `readonly` sólo lo impide en compilación.
- **`HA25`** — El resultado guardado tiene que sobrevivir un viaje de ida y vuelta por tu almacenamiento y
  volver como el mismo valor: el core lo entrega al llamador tal cual lo recibe.
- **`HA26`** — La huella se guarda como texto, sin recanonicalizarla. El formato es del core (primer nivel
  ordenado, ausentes omitidos, pares serializados) y lo anidado ya viene normalizado por cada DTO.
- **`HA27`** — Cuando cambia un DTO, las huellas viejas ya no coinciden. La decisión es del anfitrión:
  migrarlas o aceptar que un reintento con la misma clave falle. El core no lleva versión de formato.

## 5. El lado de lectura

`PostedEntriesQuery.findPostedMovements` alimenta los tres reportes (`docs/specs/reports.md`).

- **`HA28`** — Sólo `POSTED`. Un borrador no es un hecho contable. Y una reversión es un asiento más: el
  original nunca se excluye.
- **`HA29`** — `from` y `to` son inclusivos sobre `accountingDate` y opcionales. Ausente significa **sin
  límite**, que no es lo mismo que un rango vacío.
- **`HA30`** — Se devuelven **líneas**, nunca agregados. Sumar es del core: el cuadre y la moneda única son
  invariantes del motor, y un puerto que devolviera totales los sacaría de ahí.
- **`HA31`** — El orden dentro de una página no es parte del contrato; el core ordena. Lo que sí se exige es
  que cada asiento que coincide aparezca **exactamente una vez** mientras el cursor avanza.
- **`HA32`** — `nextCursor: null` termina el recorrido. Un adaptador que nunca devuelve `null` deja al core
  drenando para siempre: si la ventana llega vacía, se devuelve `null`.
- **`HA33`** — `accountId` selecciona asientos que tienen **al menos una** línea de esa cuenta, pero se
  devuelve el asiento **completo, con todas sus líneas**: el reporte lee `description`, `journalId` y
  `reversalOfEntryId` del asiento, no sólo la línea pedida.
- **`HA34`** — El `limit` lo elige el core (pide 200); el puerto acepta cualquiera y no lo interpreta como
  máximo de filas del reporte.
- **`HA35`** — Devolver de más no corrompe un reporte: el core descarta lo que no es `POSTED` ni del libro
  pedido, y eso es un descarte, no un error. Devolver de menos, en cambio, produce un reporte incorrecto sin
  aviso. Ante la duda, conviene devolver de más.
- **`HA36`** — Leer **no** exige libro activo: los reportes no consultan el estado del libro (TB08). El anfitrión no
  debe agregar ese filtro.
- **`HA37`** — Los accesos que piden los reportes son dos: `(ledger_id, accounting_date)` y
  `(ledger_id, account_id, accounting_date)`.
- **`HA38`** — No hay foto consistente prometida: el balance drena todas las páginas, así que una lectura que
  cambie entre página y página puede producir un resultado que nunca existió como foto. Si se necesita una
  foto, la da la transacción o el aislamiento del anfitrión (Q09).
- **`HA39`** — Costo aceptado: cada página alcanzada por un cursor vuelve a drenar el rango completo y a
  ordenarlo, así que recorrer todo el mayor es cuadrático en filas del rango. Está documentado en
  `docs/specs/reports.md`; si duele, la salida es un saldo materializado con fecha de corte, que es otra
  decisión.

## 6. Migraciones que debe el anfitrión

- **`HA40`** — **Moneda funcional (006f).** Los libros ya persistidos no tienen `currency`. El core no
  inventa una por defecto: agregar la columna y decidir el valor de cada libro existente es tu migración.
- **`HA41`** — **Huellas de idempotencia anteriores a un cambio de DTO.** No coinciden con la huella nueva.
  Migrar o invalidar es tu decisión, y conviene tomarla antes de que un reintento la tome por vos.
- **`HA42`** — **Nada más.** 008 no escribe ni cambia datos: sumó dos lecturas, `PostedEntriesQuery` y
  `AccountRepository.findByChart`, que tu compilador te va a reclamar.

## 7. Lo que este contrato no promete

- **Multimoneda operativa dentro de un mismo libro.** Q08 quedó resuelta como una moneda funcional inmutable
  por libro y el core no convierte tasas.
- **Consolidación entre libros.**
- **El plan de cuentas como entidad del core.** Es un identificador del anfitrión que el libro guarda sin
  verificar (Q07).
- **Numeración de asientos.** Los identificadores son explícitos; la numeración secuencial y su ámbito siguen
  abiertas (Q11).
- **Atomicidad ni aislamiento de lectura.** Vienen de tu motor, no del core.
- **Serialización de carreras.** Ninguna.

## Persistencia: importes y escala

Los objetos de dominio viven en memoria durante la ejecución. Un repositorio guarda y reconstruye su estado.
Sin adaptador durable **del anfitrión**, los datos se pierden al terminar el proceso. Este repositorio no
configura ninguna base: incluir PostgreSQL, un ORM o migraciones queda fuera de su alcance por diseño.

**Un importe se guarda con `minorUnits`, `code` y `scale`.** La escala es parte del dato contable, no un
derivable: la tabla ISO 4217 puede cambiar y el código solo no alcanza para releer un valor histórico.
`Money.toJSON()` ya la incluye; no la quites del esquema de la base ni del DTO por parecer redundante.
Guardar solo `minorUnits` y `code` convierte un cambio de escala en una lectura 10 o 100 veces menor
sin ningún error. Reconstruir sin escala, o con una escala que no coincide con la tabla, falla
(`M14` y `M15` en `docs/specs/money.md`).

Un código fuera del catálogo ISO no es un error: es una moneda propia y la escala viaja con el dato.
Eso cubre las monedas que ISO todavía no publica y las que retiró. El adaptador no debe completar la
escala desde una tabla propia ni deducirla del código: la que viene en el registro es la autoridad.

## Atomicidad entre módulos

Un core desacoplado no garantiza automáticamente que compra y asiento se confirmen juntos.
En una misma BD se puede compartir una transacción mediante contratos explícitos.
Entre servicios/BDs, especificar reintentos e idempotencia y valorar outbox/saga cuando se necesite.
No añadir infraestructura distribuida en esta fase.

## Contratos de intercambio

- Moneda, escala y unidades mínimas explícitas; bigint como cadena en JSON.
- Fecha contable YYYY-MM-DD; instante de auditoría como concepto distinto.
- IDs de libro, diario, período y cuentas sin valores mágicos.
- Clave de idempotencia para operaciones repetibles, aislada por libro y operación.
- Códigos de error estables; traducción a HTTP en el adaptador de entrada.

Antes de persistencia real queda por cerrar la numeración de asientos y su ámbito (Q11); la relación
empresa/libro/plan ya está resuelta y el libro la guarda como identificador opaco del plan (Q07).
