# @pazos-dev/contability-postgres

Adaptador PostgreSQL del motor contable: es el dueño del esquema canónico del proyecto y de las garantías
durables que el almacenamiento debe cumplir para que las reglas de
[`@pazos-dev/contability-core`](https://www.npmjs.com/package/@pazos-dev/contability-core) sobrevivan al
primer fallo.

## Qué es y qué no es

Es el adaptador de **referencia**: el DDL de `migrations/` es la única definición del esquema y cualquier otro
adaptador durable (por ejemplo el de Prisma) se alinea a él. No es un ORM ni un repositorio genérico: son
implementaciones de los puertos de `packages/core` y nada más — los puertos propiamente dichos todavía no
están implementados, ver *Estado*.

El motor no depende de este paquete. Una aplicación que sólo necesita las reglas contables instala sólo el
core; una que necesita durabilidad instala además un adaptador.

## Estado

T1 de [`odd/tasks/postgres-adapter.md`](../../odd/tasks/postgres-adapter.md): esquema canónico y runner de
migraciones, con las garantías durables que el contrato de [`docs/INTEGRATION.md`](../../docs/INTEGRATION.md)
exige del almacenamiento (`HA16` solapamiento de períodos, `HA20` identidad del asiento, `HA22` idempotencia,
`HA43` numeración). Los puertos durables (`UnitOfWork` y repositorios) llegan en las tareas siguientes.

Hasta que eso exista, este paquete **no** sirve como adaptador de producción: sirve para crear el esquema.

## Configuración del driver

Creá el `Pool` con `nodePostgresTypes`. Sin esa configuración, node-postgres convierte una columna `date` en
una instancia de `Date` a medianoche local: la fecha contable se vuelve un instante y cambia según la zona de
quién lee. El motor separa la fecha contable del instante de auditoría, así que la fecha vuelve como el texto
`YYYY-MM-DD` que se guardó.

```ts
import { Pool } from 'pg';
import { applyMigrations, nodePostgresTypes } from '@pazos-dev/contability-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, types: nodePostgresTypes });
await applyMigrations(pool);
```
```ts
import { Pool } from 'pg';
import { applyMigrations } from '@pazos-dev/contability-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await applyMigrations(pool);
```

- Aplica en orden los archivos `NNNN-nombre.sql` que todavía no figuran en `schema_migration`, todo dentro de
  una transacción, y devuelve los nombres aplicados. Una segunda corrida devuelve una lista vacía.
- Una migración ya aplicada cuyo contenido cambió se rechaza con `MIGRATION_CHECKSUM_MISMATCH`: editar una
  migración aplicada hace que dos bases discrepen sobre el mismo número de versión.
- El paquete **nunca** migra al importarse. Si el anfitrión prefiere su propia herramienta, los archivos SQL
  son válidos para cualquier runner que respete el orden y el registro.

Requisitos del motor: PostgreSQL 14 o superior y permiso para `CREATE EXTENSION btree_gist`, que el esquema
necesita para la restricción de exclusión de períodos. Con un usuario que no sea dueño de la base, instalá la
extensión antes de migrar.

## Decisiones del esquema que un revisor va a querer discutir

- **Importes**: `bigint` de unidades mínimas más código y escala de moneda. Nunca `numeric`, nunca coma
  flotante: `Money` transporta una cadena entera exacta y el adaptador no la convierte a `number`.
- Fechas contables: tipo `date`, no `timestamptz`. El motor distingue la fecha contable del instante de
  auditoría; el adaptador la lee como texto `YYYY-MM-DD` con `nodePostgresTypes` para no ganar una zona
  horaria en el viaje.
- **Huella de idempotencia**: `text` tal como llega, sin recanonicalizar. El resultado se guarda en `jsonb`.
- **Sin claves foráneas entre agregados**: el core comprueba existencia y vida al leer; una clave foránea haría
  que el adaptador durable rechazara escrituras que el contrato de los puertos acepta. La única excepción es la
  línea de asiento, que no existe fuera de su asiento.
- **Numeración**: contador por libro con `last_issued`. Los huecos son aceptables y los repetidos no, porque el
  `UNIQUE (ledger_id, number)` los cierra.

## Pruebas

La suite necesita un PostgreSQL real: un almacenamiento en memoria no demuestra atomicidad, aislamiento ni una
restricción de exclusión. Cada prueba crea una base efímera, aplica las migraciones y la elimina.

```bash
pnpm --filter @pazos-dev/contability-postgres run test
```

La conexión se toma de `CONTABILITY_TEST_DATABASE_URL` y, si falta, de
`postgres://postgres@127.0.0.1:5432/postgres`. Sin servidor, la suite falla y lo dice: nunca se saltea.
