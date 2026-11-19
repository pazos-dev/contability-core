import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchema } from '../dist/index.js';
import { withDatabase, PG_ERROR, expectCode } from './helpers/database.mjs';

// Sondas del esquema contra el contrato durable de docs/INTEGRATION.md. Cada prueba escribe por la misma
// ruta que va a usar el adaptador (insert y upsert), no por una ruta privilegiada que la restricción no ve.

// Identificadores fijos con forma de uuid: el esquema ya no acepta texto libre.
const LEDGER = '00000000-0000-4000-8000-000000000001';
const OTHER_LEDGER = '00000000-0000-4000-8000-000000000002';
const JOURNAL = '00000000-0000-4000-8000-000000000010';
const PERIOD = '00000000-0000-4000-8000-000000000020';
const PERIOD_1 = '00000000-0000-4000-8000-000000000021';
const PERIOD_2 = '00000000-0000-4000-8000-000000000022';
const PERIOD_4 = '00000000-0000-4000-8000-000000000024';
const PERIOD_ONE_DAY = '00000000-0000-4000-8000-000000000025';
const PERIOD_INVERTED = '00000000-0000-4000-8000-000000000026';
const ENTRY_1 = '00000000-0000-4000-8000-000000000031';
const ENTRY_N1 = '00000000-0000-4000-8000-000000000032';
const ENTRY_N3 = '00000000-0000-4000-8000-000000000033';
const ENTRY_N1_BIS = '00000000-0000-4000-8000-000000000034';
const ENTRY_P1 = '00000000-0000-4000-8000-000000000035';
const ENTRY_D1 = '00000000-0000-4000-8000-000000000036';
const ENTRY_P2 = '00000000-0000-4000-8000-000000000037';
const LINE_X1 = '00000000-0000-4000-8000-000000000041';
const LINE_X2 = '00000000-0000-4000-8000-000000000042';
const LINE_X3 = '00000000-0000-4000-8000-000000000043';
const LINE_1 = '00000000-0000-4000-8000-000000000044';
const ACCOUNT = '00000000-0000-4000-8000-000000000051';
const CHART = '00000000-0000-4000-8000-000000000052';
const CURRENCY_LEDGER = '00000000-0000-4000-8000-000000000061';
const SCALE_LEDGER = '00000000-0000-4000-8000-000000000062';
const AUDIT_LEDGER = '00000000-0000-4000-8000-000000000063';

async function created(work) {
  return withDatabase(async (client) => {
    await createSchema(client);
    return work(client);
  });
}

const insertPeriod = (client, id, start, end, ledger = LEDGER) =>
  client.query(
    `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, 'OPEN')`,
    [id, ledger, id, start, end],
  );

const insertLedger = (client, id, currency = 'ARS', scale = 2) =>
  client.query(
    `insert into ledger (id, name, chart_of_accounts_id, currency_code, currency_scale, status)
     values ($1, 'Libro', $2, $3, $4, 'ACTIVE')`,
    [id, CHART, currency, scale],
  );

test('HA16: la ruta de upsert tampoco puede crear un solapamiento', async () => {
  await created(async (client) => {
    await insertPeriod(client, PERIOD_1, '2026-01-01', '2026-01-31');
    await insertPeriod(client, PERIOD_4, '2026-02-01', '2026-02-28');

    await client.query(`update accounting_period set end_date = '2026-02-05' where id = $1`, [PERIOD_4]);
    await client.query(`update accounting_period set start_date = '2026-02-02' where id = $1`, [PERIOD_4]);

    await expectCode(
      client.query(`update accounting_period set start_date = '2026-01-10' where id = $1`, [PERIOD_4]),
      PG_ERROR.EXCLUSION_VIOLATION,
      'mover el extremo hasta el rango vecino',
    );
  });
});

test('HA16: un período de un solo día es válido y un rango invertido no', async () => {
  await created(async (client) => {
    await insertPeriod(client, PERIOD_ONE_DAY, '2026-03-15', '2026-03-15');
    await expectCode(insertPeriod(client, PERIOD_INVERTED, '2026-05-01', '2026-04-01'), PG_ERROR.CHECK_VIOLATION, 'rango invertido');
  });
});

test('HA16: la lectura de solapamiento devuelve todos los períodos, no el primero', async () => {
  await created(async (client) => {
    await insertPeriod(client, PERIOD_1, '2026-01-01', '2026-01-31');
    await insertPeriod(client, PERIOD_2, '2026-02-01', '2026-02-28');
    const rows = await client.query(
      `select id from accounting_period
       where ledger_id = $1 and daterange(start_date, end_date, '[]') && daterange($2, $3, '[]')
       order by id`,
      [LEDGER, '2026-01-31', '2026-02-01'],
    );
    assert.deepEqual(rows.rows.map((row) => row.id), [PERIOD_1, PERIOD_2]);
  });
});

test('HA20: el upsert del asiento reescribe la misma fila y no reutiliza el id', async () => {
  await created(async (client) => {
    const entry = (id, ledger = LEDGER) =>
      client.query(
        `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
         values ($1, $2, $3, $4, '2026-01-15', 'asiento', 'DRAFT')`,
        [id, ledger, JOURNAL, PERIOD],
      );

    await entry(ENTRY_1);
    await entry(ENTRY_1, OTHER_LEDGER);
    await client.query(`update journal_entry set description = 'reescrito' where ledger_id = $1 and id = $2`, [
      LEDGER,
      ENTRY_1,
    ]);

    await expectCode(entry(ENTRY_1), PG_ERROR.UNIQUE_VIOLATION, 'el par libro y asiento no se reutiliza');
  });
});

test('HA43: los huecos son aceptables y los repetidos no', async () => {
  await created(async (client) => {
    const posted = (id, number, ledger = LEDGER) =>
      client.query(
        `insert into journal_entry
           (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
         values ($1, $2, $3, $4, '2026-01-15', 'asiento', 'POSTED', $5)`,
        [id, ledger, JOURNAL, PERIOD, number],
      );

    await posted(ENTRY_N1, 1);
    await posted(ENTRY_N3, 3);
    await posted(ENTRY_N1, 1, OTHER_LEDGER);

    await expectCode(posted(ENTRY_N1_BIS, 1), PG_ERROR.UNIQUE_VIOLATION, 'número repetido en el mismo libro');
  });
});

test('HA26 y HA25: la huella se guarda tal cual y el resultado vuelve como el mismo valor', async () => {
  await created(async (client) => {
    const fingerprint = '  [["ledgerId","L1"],["operation","postEntry"]]  ';
    const stored = {
      status: 'POSTED',
      number: 1,
      lines: [{ amount: { minorUnits: '9007199254740993', currency: { code: 'ARS', scale: 2 } } }],
    };

    await client.query(
      `insert into idempotency_record (ledger_id, operation, idempotency_key, fingerprint, result)
       values ($1, 'postEntry', 'k1', $2, $3::jsonb)`,
      [LEDGER, fingerprint, JSON.stringify(stored)],
    );

    const row = await client.query(`select fingerprint, result from idempotency_record where idempotency_key = 'k1'`);
    assert.equal(row.rows[0].fingerprint, fingerprint, 'sin recanonicalizar');
    assert.deepEqual(row.rows[0].result, stored, 'el resultado sobrevive el viaje de ida y vuelta');
  });
});

test('HA21: las líneas contabilizadas se cuentan por cuenta sobre todos los libros', async () => {
  await created(async (client) => {
    await client.query(
      `insert into journal_entry
         (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
       values ($1, $2, $3, $4, '2026-01-15', 'posteado', 'POSTED', 1),
              ($5, $2, $3, $4, '2026-01-15', 'borrador', 'DRAFT', null),
              ($6, $7, $3, $4, '2026-01-15', 'posteado', 'POSTED', 1)`,
      [ENTRY_P1, LEDGER, JOURNAL, PERIOD, ENTRY_D1, ENTRY_P2, OTHER_LEDGER],
    );
    await client.query(
      `insert into journal_entry_line
         (ledger_id, entry_id, id, position, account_id, side,
          amount_minor_units, amount_currency_code, amount_currency_scale)
       values ($1, $2, $3, 1, $4, 'DEBIT', 100, 'ARS', 2),
              ($1, $5, $6, 1, $4, 'DEBIT', 100, 'ARS', 2),
              ($7, $8, $9, 1, $4, 'DEBIT', 100, 'ARS', 2)`,
      [LEDGER, ENTRY_P1, LINE_X1, ACCOUNT, ENTRY_D1, LINE_X2, OTHER_LEDGER, ENTRY_P2, LINE_X3],
    );

    const counted = await client.query(
      `select count(*)::int as total
       from journal_entry_line l
       join journal_entry e on e.ledger_id = l.ledger_id and e.id = l.entry_id
       where l.account_id = $1 and e.status = 'POSTED'`,
      [ACCOUNT],
    );
    assert.equal(counted.rows[0].total, 2, 'el borrador no cuenta y el otro libro sí');
  });
});

test('HA37: los dos accesos de los reportes tienen índice', async () => {
  await created(async (client) => {
    const indexes = await client.query(
      `select tablename, indexdef from pg_indexes where schemaname = 'public'`,
    );
    const defs = indexes.rows.map((row) => `${row.tablename}: ${row.indexdef}`);

    assert.ok(
      defs.some((def) => def.startsWith('journal_entry:') && def.includes('(ledger_id, accounting_date)')),
      'falta el acceso por libro y fecha contable',
    );
    assert.ok(
      defs.some((def) => def.startsWith('journal_entry_line:') && def.includes('(ledger_id, account_id)')),
      'falta el acceso por libro y cuenta',
    );
  });
});

test('ninguna columna puede perder precisión monetaria', async () => {
  await created(async (client) => {
    const floating = await client.query(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = 'public' and data_type in ('real', 'double precision', 'numeric', 'money')`,
    );
    assert.deepEqual(floating.rows, [], 'ni coma flotante ni numeric con escala');
  });
});

test('el límite de la columna de importes está por encima de cualquier saldo real', async () => {
  await created(async (client) => {
    await client.query(
      `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
       values ($1, $2, $3, $4, '2026-01-15', 'asiento', 'DRAFT')`,
      [ENTRY_1, LEDGER, JOURNAL, PERIOD],
    );
    await client.query(
      `insert into journal_entry_line
         (ledger_id, entry_id, id, position, account_id, side,
          amount_minor_units, amount_currency_code, amount_currency_scale)
       values ($1, $2, $3, 1, $4, 'DEBIT', 9223372036854775807, 'ARS', 2)`,
      [LEDGER, ENTRY_1, LINE_1, ACCOUNT],
    );
    const row = await client.query(
      `select amount_minor_units as v, pg_typeof(amount_minor_units)::text as t
       from journal_entry_line where id = $1`,
      [LINE_1],
    );
    assert.equal(String(row.rows[0].v), '9223372036854775807', 'el entero máximo sobrevive exacto');
    assert.equal(row.rows[0].t, 'bigint');
  });
});

test('un identificador que no es uuid se rechaza', async () => {
  await created(async (client) => {
    await expectCode(
      insertLedger(client, 'libro-1'),
      PG_ERROR.INVALID_TEXT_REPRESENTATION,
      'el identificador del libro debe ser un uuid',
    );
  });
});

test('un valor fuera de la unión cerrada se rechaza', async () => {
  await created(async (client) => {
    await expectCode(
      client.query(
        `insert into account (id, chart_of_accounts_id, code, name, type, posting_allowed, status)
         values ($1, $2, '1.1', 'Caja', 'ASSET', true, 'BORRADA')`,
        [ACCOUNT, CHART],
      ),
      PG_ERROR.INVALID_TEXT_REPRESENTATION,
      'el estado no pertenece al enum account_status',
    );
  });
});

test('los dominios de moneda rechazan minúsculas y una escala de siete', async () => {
  await created(async (client) => {
    await expectCode(
      insertLedger(client, CURRENCY_LEDGER, 'ars', 2),
      PG_ERROR.CHECK_VIOLATION,
      'el código de moneda debe ser tres letras mayúsculas',
    );
    await expectCode(
      insertLedger(client, SCALE_LEDGER, 'ARS', 7),
      PG_ERROR.CHECK_VIOLATION,
      'la escala de moneda llega hasta seis',
    );
  });
});

test('las tablas mutables llevan created_at y updated_at, y el trigger mueve updated_at', async () => {
  await created(async (client) => {
    const columns = await client.query(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = 'public'
         and table_name = any($1::text[])
         and column_name in ('created_at', 'updated_at')
       order by table_name, column_name`,
      [['ledger', 'account', 'journal', 'accounting_period', 'journal_entry']],
    );
    assert.equal(columns.rows.length, 10, 'las cinco tablas mutables llevan las dos columnas');
    assert.ok(
      columns.rows.every((row) => row.data_type === 'timestamp with time zone'),
      'las columnas de auditoría son timestamptz',
    );

    await insertLedger(client, AUDIT_LEDGER);
    const before = (
      await client.query('select created_at, updated_at from ledger where id = $1', [AUDIT_LEDGER])
    ).rows[0];

    await client.query('select pg_sleep(0.01)');
    await client.query(`update ledger set name = 'renombrado' where id = $1`, [AUDIT_LEDGER]);

    const after = (
      await client.query('select created_at, updated_at from ledger where id = $1', [AUDIT_LEDGER])
    ).rows[0];
    assert.ok(after.updated_at > before.updated_at, 'el trigger mueve updated_at');
    assert.equal(after.created_at.toISOString(), before.created_at.toISOString(), 'created_at no se toca');
  });
});
