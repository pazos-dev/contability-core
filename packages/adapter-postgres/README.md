# @pazos-dev/contability-postgres

Adaptador PostgreSQL del motor contable: es el dueño del esquema canónico del proyecto y de las garantías
durables que el almacenamiento debe cumplir para que las reglas de
[`@pazos-dev/contability-core`](https://www.npmjs.com/package/@pazos-dev/contability-core) sobrevivan al
primer fallo.

## Qué es y qué no es

Es el adaptador de **referencia**: el DDL de `schema/` es la única definición del esquema y cualquier otro
adaptador durable (por ejemplo el de Prisma) se alinea a él. No es un ORM ni un repositorio genérico: son
implementaciones de los puertos de `packages/core` y nada más — los puertos propiamente dichos todavía no
están implementados, ver *Estado*.

El motor no depende de este paquete. Una aplicación que sólo necesita las reglas contables instala sólo el
core; una que necesita durabilidad instala además un adaptador.

## Estado

T1 de [`odd/tasks/postgres-adapter.md`](../../odd/tasks/postgres-adapter.md): esquema canónico y creación del
esquema, con las garantías durables que el contrato de [`docs/INTEGRATION.md`](../../docs/INTEGRATION.md)
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
import { createSchema, nodePostgresTypes } from '@pazos-dev/contability-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, types: nodePostgresTypes });
await createSchema(pool);
```

## Creación del esquema

- `createSchema` aplica en orden los archivos de `schema/` dentro de una transacción y devuelve los nombres
  aplicados. Si algo falla, revierte todo: no queda medio esquema.
- Con un `Pool` toma una conexión y la devuelve, también cuando la creación falla. Un `Client` o un
  `PoolClient` se usa tal cual, sin pedir conexiones que no puede dar.
- Se niega a correr si alguna de las ocho tablas ya existe: falla con `SCHEMA_ALREADY_PRESENT` nombrando la
  primera que encuentra. Crear un esquema sobre otro tiene que fallar en voz alta, porque un no-op en
  silencio no se puede distinguir de una base a medio crear.
- Un archivo cuyo nombre no respeta el formato se rechaza con `SCHEMA_FILE_INVALID` antes de tocar la base.
- No crea nada más que el esquema: ni tabla de registro, ni checksums, ni ninguna forma de bookkeeping.
- El paquete **nunca** crea el esquema al importarse. Si el anfitrión prefiere su propia herramienta, los
  archivos SQL son válidos para cualquier runner que respete el orden.

### Por qué no hay registro de versiones

Nada está desplegado, así que no hay historial que preservar: un registro de versiones con checksums
resolvería un problema que este paquete todavía no tiene. Por eso publica una **creación** y no un historial.
La primera migración nace cuando la primera versión publicada tenga que cambiar.

### Archivos del esquema

Una creación por concepto y en orden de dependencia. Un archivo que mezcla catálogo, asientos, numeración e
idempotencia no es revisable. Las ocho tablas son `ledger`, `account`, `journal`, `accounting_period`,
`journal_entry`, `journal_entry_line`, `entry_number_counter` e `idempotency_record`.

| Archivo | Concepto |
| --- | --- |
| `010-extensions.sql` | `btree_gist`, que la exclusión de rangos necesita. |
| `020-shared-types.sql` | Dominios de moneda y enums de las uniones cerradas. |
| `030-audit-timestamps.sql` | Función `set_updated_at()` y convención de auditoría. |
| `040-ledger.sql` | Libro (`ledger`) y su moneda funcional. |
| `050-account.sql` | Catálogo de cuentas (`account`), unicidad por plan e índice de `findByChart`. |
| `060-journal.sql` | Diario (`journal`) y unicidad de código por libro. |
| `070-accounting-period.sql` | Períodos (`accounting_period`) y su exclusión de solapamiento (`HA16`). |
| `080-journal-entry.sql` | Asiento (`journal_entry`), numeración (`HA43`) e índices de reportes (`HA37`, `HA18`). |
| `090-journal-entry-line.sql` | Línea de asiento (`journal_entry_line`), la única clave foránea, e índices por cuenta. |
| `100-entry-number-counter.sql` | Contador de numeración por libro (`entry_number_counter`, `HA43`). |
| `110-idempotency-record.sql` | Registro de idempotencia por libro y operación (`idempotency_record`, `HA22`, `HA26`). |

**Los números son orden de aplicación, no versiones.** `010` va antes que `020` porque el segundo necesita
lo que crea el primero. Van de diez en diez para poder insertar un concepto posterior sin renumerar los
demás. Un archivo que un anfitrión ya aplicó no se edita: ahí empieza a existir una migración.

Requisitos del motor: PostgreSQL 14 o superior y permiso para `CREATE EXTENSION btree_gist`, que el esquema
necesita para la restricción de exclusión de períodos. Con un usuario que no sea dueño de la base, instalá la
extensión antes de crear el esquema.

## Identificadores

Las columnas de identidad —`id`, `ledger_id`, `entry_id`, `account_id`, `chart_of_accounts_id`, `journal_id`,
`period_id`, `reversal_of_entry_id` y `parent_id`— son `uuid`, no `text`, y no llevan `DEFAULT`. Los ids los
genera el anfitrión porque el motor recibe ids explícitos en sus DTO; la base no inventa identidad que el
motor ya decidió.

Se recomienda UUIDv7 para conservar la localidad de los índices: un uuid aleatorio dispersa las inserciones
en el btree. PostgreSQL 18 ofrece `uuidv7()`, así que un anfitrión que prefiera que la base genere el valor
puede usarlo como `DEFAULT` en su propia composición, sin cambiar este esquema.

`operation`, `idempotency_key` y `fingerprint` quedan en `text` a propósito: son cadenas del core, no
identificadores. Lo mismo vale para `code`, `name` y `description`.

Aquí el adaptador es **más estricto que el contrato de los puertos**: el adaptador en memoria del core acepta
cualquier cadena no vacía como id, y este esquema exige un `uuid` válido. La diferencia se documenta en vez de
disimularse.

## Dominios y enums

- `currency_code` es un dominio `text` con `CHECK (VALUE ~ '^[A-Z]{3}$')`; `currency_scale` es un dominio
  `smallint` con `CHECK (VALUE BETWEEN 0 AND 6)`. La regla de moneda se define una vez y la usan el libro y
  cada importe de una línea, incluidos el funcional y la tasa.
- Cada agregado tiene su propio enum (`ledger_status`, `account_status`, `account_type`, `journal_status`,
  `accounting_period_status`, `journal_entry_status`, `posting_side`) en vez de un `ACTIVE`/`INACTIVE`
  compartido: el core declara esas uniones cerradas por separado y pueden divergir, así que el almacenamiento
  refleja esa separación.

Costo operativo de los enums: agregar un valor necesita `ALTER TYPE ... ADD VALUE`, que fuera de PostgreSQL 12
no puede correr dentro de una transacción y que en ninguna versión debe usarse en la misma transacción que lo
agrega. Si un cierre de dominio cambia seguido, ese cambio es un paso operativo aparte del anfitrión.

## Auditoría

Las cinco tablas mutables —`ledger`, `account`, `journal`, `accounting_period` y `journal_entry`— llevan
`created_at timestamptz NOT NULL DEFAULT now()` y `updated_at timestamptz NOT NULL DEFAULT now()`. Un trigger
`BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION set_updated_at()` mueve `updated_at` en cada actualización.

El motor nunca ve estas columnas: son la auditoría del anfitrión. Los valores de auditoría del propio motor
—quién y cuándo, según su contrato— viajan en los DTO.

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
restricción de exclusión. Cada prueba crea una base efímera, crea el esquema y la elimina.

```bash
pnpm --filter @pazos-dev/contability-postgres run test
```

La conexión se toma de `CONTABILITY_TEST_DATABASE_URL` y, si falta, de
`postgres://postgres@127.0.0.1:5432/postgres`. Sin servidor, la suite falla y lo dice: nunca se saltea.
