# Adaptadores durables: PostgreSQL crudo y Prisma

Estado: en curso. Raíz: workspace `@pazos-dev/contability`, `packages/core` sin cambios.
Esquema canónico único (SQL) en `packages/adapter-postgres/`; el adaptador Prisma se deriva de él.

## Specs

**S1 — Dos adaptadores durables, un solo esquema.** Se construyen dos paquetes publicables que implementan los
puertos del core contra PostgreSQL: uno con SQL crudo y otro con Prisma. El DDL canónico vive en un único lugar
(`packages/adapter-postgres/migrations/`); el `schema.prisma` se alinea a ese DDL, nunca al revés.

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

**S6 — El adaptador no migra al importarse.** El anfitrión aplica las migraciones. Publicar los paquetes,
tocar `.github/workflows/publish.yml` o etiquetar una versión queda fuera de este trabajo: es decisión del
humano.

## Tasks

| ID | Tarea | Specs | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Andamiaje de `packages/adapter-postgres`, harness de pruebas contra Postgres real y DDL canónico con migraciones | S1-S5 | inline | `de8567b` |
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
