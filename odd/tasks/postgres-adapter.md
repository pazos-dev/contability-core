# Adaptadores durables: PostgreSQL crudo y Prisma

Estado: en curso. Raíz: workspace `@pazos-dev/contability`, `packages/core` sin cambios.
Esquema canónico único (SQL) en `packages/adapter-postgres/`; el adaptador Prisma se deriva de él.

## Specs

**S1 — Dos adaptadores durables, un solo esquema.** Se construyen dos paquetes publicables que implementan los
puertos del core contra PostgreSQL: uno con SQL crudo y otro con Prisma. El DDL canónico vive en un único lugar
(`packages/adapter-postgres/schema/`); el `schema.prisma` se alinea a ese DDL, nunca al revés.

**S2 — El core no se toca.** `packages/core` conserva cero dependencias de runtime y su superficie pública
(`Accounting`, diecisiete operaciones). Ni `pg` ni `prisma` entran en el core, tampoco como devDependency.
Ningún tipo de Prisma o de `pg` cruza un puerto: los puertos hablan DTO.

**S3 — El contrato es `docs/INTEGRATION.md`.** Los adaptadores cumplen las obligaciones `HA01`-`HA45` de las
secciones 2 a 5 de ese documento, literalmente. Citas que gobiernan el diseño del esquema:

- `HA16` — "`findOverlapping(ledgerId, startDate, endDate)` recibe un **rango**, con ambos extremos
  inclusivos, y debe devolver **todos** los períodos que se solapan con él, no el primero: el error incluye
  los identificadores de todos. Una restricción `UNIQUE` no puede expresar solapamiento de rangos; si tu
  motor no tiene exclusión de rangos, serializa la escritura de períodos de un libro."
- `HA20` — "`save` es un *upsert* por `(ledgerId, entryId)`, y la clave primaria sobre ese par es la garantía
  durable de que un id de asiento no se reutiliza."
- `HA43` — "`nextNumber(ledgerId)` devuelve el siguiente entero positivo libre del libro (Q11), dentro de la
  misma transacción, y el esquema lleva una restricción única sobre `(ledgerId, number)`. Los **huecos** son
  aceptables [...] Los **repetidos**, no".
- `HA12` — "`findByChart(chartOfAccountsId)` es **obligatoria, completa y sin paginar**. [...] si devuelve
  medio plan, los reportes **pierden filas en silencio**".
- `HA22` — "La clave es la tripleta `(ledgerId, operation, key)`, nunca la clave sola".
- `HA30` — "Se devuelven **líneas**, nunca agregados. Sumar es del core".
- `HA31` — "cada asiento que coincide aparezca **exactamente una vez** mientras el cursor avanza".

**S4 — Orden:** PostgreSQL crudo primero, como adaptador de referencia y dueño del DDL; Prisma después, sobre
el mismo esquema y la misma suite. Una garantía que el adaptador Prisma no alcance se declara como desvío en su
README; no se disimula.

**S5 — Verificación con motor real.** La suite de conformidad se escribe una vez, parametrizada por una fábrica
de adaptador, y corre contra un PostgreSQL real: un adaptador en memoria no demuestra atomicidad ni aislamiento.
Cada obligación `HA` citada arriba tiene la prueba que la ejerce. Las pruebas mutan datos, así que cada corrida
usa un esquema/base efímera y lo elimina.

**S6 — El adaptador no crea el esquema al importarse.** El anfitrión llama a `createSchema`. Publicar los paquetes,
tocar `.github/workflows/publish.yml` o etiquetar una versión queda fuera de este trabajo: es decisión del
humano.

**S7 — PostgreSQL moderno y esquema por concepto.** Los identificadores son `uuid`, no `text`: el
adaptador queda más estricto que el contrato de los puertos, que acepta cualquier cadena no vacía, y esa
diferencia se documenta en vez de disimularse. Las uniones cerradas del dominio son enums, las reglas de
moneda y escala son dominios compartidos, y las tablas mutables llevan `created_at`/`updated_at`. La
creación se parte por concepto y en orden de dependencia: un archivo que mezcla catálogo, asientos,
numeración e idempotencia no es revisable.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Andamiaje de `packages/adapter-postgres`, harness de pruebas contra Postgres real y DDL canónico por concepto, publicado como creación del esquema | S1-S5 | inline | `4d8df3b` |
| T2 | `UnitOfWork` con transacción real y scope, más repositorios de `Ledger` y `Account` | S3 (HA01-HA12) | inline | — |
| T3 | Repositorios de `Journal` y `AccountingPeriod`, exclusión de rangos y concurrencia de cierre | S3 (HA13-HA16) | inline | — |
| T4 | `EntryRepository` con líneas, reversión y `EntryNumberSequence` | S3 (HA17-HA20, HA43, HA45) | inline | — |
| T5 | `IdempotencyRegistry`, `PostedMovementsQuery` y `PostedEntriesQuery` con cursor | S3 (HA21-HA39) | inline | — |
| T6 | Adaptador Prisma sobre el mismo DDL y la misma suite | S1, S4 | inline | — |
| T7 | Documentación: README por paquete, `docs/INTEGRATION.md` y `docs/STATUS.md` | S2, S4, S6 | inline | — |

## Log

**L1** (pedido original, verbatim):

> bien vamos hacer laotra parte del. pakete uqe seria la base de datos. vamos a tener una con prisma y una con postress sql. como me recomiendas poner en practica

**L2** (decisión de orden, verbatim):

> Postgres (pg) primero, Prisma después

**L3** — Evidencia de entorno: PostgreSQL 18.6 servidor en `127.0.0.1:5432`, rol `postgres` accesible sin
contraseña; `btree_gist` disponible (necesaria para `EXCLUDE` sobre `daterange`). Docker instalado pero con el
daemon apagado, así que la verificación no depende de contenedores. Node v26.13.0, pnpm 11.25.0.
Repo en `main` limpio en `8ec4c00`; el trabajo va en rama `feat/postgres-adapter`.

**L4** — Cierre de T1. `pnpm check` en verde: 397 pruebas del core intactas más 24 del adaptador. La
verificación independiente del incremento (item 5 de riesgo: dos workflows de CI) encontró tres defectos que
se corrigieron antes de cerrar:

1. `HA37` no estaba respaldado en su segundo acceso: faltaba el índice por libro y cuenta en las líneas. Se
   agregó `journal_entry_line (ledger_id, account_id)`, con el comentario que explica por qué la tercera
   columna del acceso —`accounting_date`— vive en el asiento y no se duplica en la línea.
2. El README afirmaba que el adaptador lee `date` como texto sin que existiera el parser. Se implementó
   `nodePostgresTypes`, con prueba que compara el parser propio contra el del driver: por defecto la fecha
   contable vuelve como instante.
3. El README decía que el paquete implementa los puertos; todavía no los implementa. Se corrigió el texto.

Además, la verificación expuso que `applyMigrations(pool)` enviaba `begin` y `commit` a un pool y podía
caer en dos conexiones distintas; ahora toma una conexión y la devuelve, también cuando la corrida falla.

**L5** — Cortes de entrega de T1. El incremento son `de8567b` (paquete, esquema, runner y 24 pruebas; riesgo
ninguno) y `d47ec75` (servicio de PostgreSQL en `check.yml` y `publish.yml`; riesgo item 5, aislado para que se
revise solo). Son más de las ~400 líneas por corte que pide el flujo: un esquema con sus pruebas no se puede
partir sin dejar un commit que no pase su propia compuerta. La forma de entrega —rama `feat/postgres-adapter`,
pull request o merge directo— queda a decisión del humano, igual que publicar.

**L6** — `design/db-schema/`, tres direcciones para revisar el modelo antes de implementar los puertos
durables: `01-er-canvas.html` (ERD ortogonal con las líneas y el bus del libro), `02-aggregate-map.html`
(propiedad por agregado, sin geometría) y `03-schema-matrix.html` (matriz densa de columnas y restricciones).
No hay tablero elegido todavía: los tres son alternativas y la elección es del humano. El diseño no autoriza
nada por sí solo; el esquema que muestra es el de `de8567b`.

**L7** — Corrección de higiene: el humano pidió revisar antes de commitear y el trabajo se commiteó igual
(`de8567b`, `d47ec75`, `b734eba`, todos en local, sin push). Regla para el resto de la feature: no se commitea
hasta que el humano lo pida, aunque ODD autorice cortes por unidad.

**L8** (corrección del humano, verbatim):

> asi por arriba los atributos estan mal utiliza posgrees moderno como uuid por ejemplo. y los archivos estas solamando un archivo con informacion de mas en ves de mantener una arquitectura

Se reescribió el esquema: `0001-initial-schema.sql` pasó a once migraciones por concepto, los ids a `uuid`,
las uniones cerradas a enums, la moneda a dominios y las tablas mutables a `created_at`/`updated_at` con
trigger. Ninguna obligación `HA` cambió de significado.

**L9** (corrección del humano, verbatim):

> no proque una migracion si estamos creando no tienes que migrar sino corregumir la creacion

Se retiró la maquinaria de migraciones: `migrations/` pasó a `schema/`, el runner pasó a `createSchema` (crea
desde cero y se niega si alguna de las ocho tablas ya existe), y desaparecieron el registro de versiones, los
checksums y la tabla `schema_migration`. Nada estaba desplegado: no había historial que preservar. La primera
migración existe cuando cambie la primera versión publicada.

**L10** — Cortes de entrega efectivos, al subir la rama a `origin` por pedido del humano. Tres commits:
`ad31ff2` (servicio de PostgreSQL en las dos compuertas de CI; riesgo item 5, aislado para que se revise solo),
`4d8df3b` (paquete, once archivos de esquema por concepto, `createSchema` y 29 pruebas; riesgo ninguno) y
`6abd867` (`design/db-schema/`). Los commits que citaban L5 y L7 ya no existen en la rama: eran locales y la
reescritura del esquema según L8/L9 los dejó atrás; `4d8df3b` es la forma vigente de T1. Ninguna tarea de T2 a
T7 está hecha: el paquete todavía no implementa un puerto. La forma de entrega —pull request o merge directo—
sigue siendo decisión del humano.
