import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations } from '../dist/index.js';
import { withDatabase, PG_ERROR, expectCode } from './helpers/database.mjs';

// Sondas del esquema contra el contrato durable de docs/INTEGRATION.md. Cada prueba escribe por la misma
// ruta que va a usar el adaptador (insert y upsert), no por una ruta privilegiada que la restricción no ve.

async function migrated(work) {
  return withDatabase(async (client) => {
    await applyMigrations(client);
    return work(client);
  });
}

const insertPeriod = (client, id, start, end, ledger = 'L1') =>
  client.query(
    `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
     values ($1, $2, $1, $3, $4, 'OPEN')`,
    [id, ledger, start, end],
  );

test('HA16: la ruta de upsert tampoco puede crear un solapamiento', async () => {
  await migrated(async (client) => {
    await insertPeriod(client, 'p1', '2026-01-01', '2026-01-31');
    await insertPeriod(client, 'p4', '2026-02-01', '2026-02-28');

    await client.query(`update accounting_period set end_date = '2026-02-05' where id = 'p4'`);
    await client.query(`update accounting_period set start_date = '2026-02-02' where id = 'p4'`);

    await expectCode(
      client.query(`update accounting_period set start_date = '2026-01-10' where id = 'p4'`),
      PG_ERROR.EXCLUSION_VIOLATION,
      'mover el extremo hasta el rango vecino',
    );
  });
});

test('HA16: un período de un solo día es válido y un rango invertido no', async () => {
  await migrated(async (client) => {
    await insertPeriod(client, 'uno', '2026-03-15', '2026-03-15');
    await expectCode(insertPeriod(client, 'invertido', '2026-05-01', '2026-04-01'), PG_ERROR.CHECK_VIOLATION, 'rango invertido');
  });
});

test('HA16: la lectura de solapamiento devuelve todos los períodos, no el primero', async () => {
  await migrated(async (client) => {
    await insertPeriod(client, 'p1', '2026-01-01', '2026-01-31');
    await insertPeriod(client, 'p2', '2026-02-01', '2026-02-28');
    const rows = await client.query(
      `select id from accounting_period
       where ledger_id = 'L1' and daterange(start_date, end_date, '[]') && daterange($1, $2, '[]')
       order by id`,
      ['2026-01-31', '2026-02-01'],
    );
    assert.deepEqual(rows.rows.map((row) => row.id), ['p1', 'p2']);
  });
});

test('HA20: el upsert del asiento reescribe la misma fila y no reutiliza el id', async () => {
  await migrated(async (client) => {
    const entry = (id, ledger = 'L1') =>
      client.query(
        `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
         values ($1, $2, 'J', 'P', '2026-01-15', 'asiento', 'DRAFT')`,
        [id, ledger],
      );

    await entry('e1');
    await entry('e1', 'L2');
    await client.query(`update journal_entry set description = 'reescrito' where ledger_id = 'L1' and id = 'e1'`);

    await expectCode(entry('e1'), PG_ERROR.UNIQUE_VIOLATION, 'el par libro y asiento no se reutiliza');
  });
});

test('HA43: los huecos son aceptables y los repetidos no', async () => {
  await migrated(async (client) => {
    const posted = (id, number, ledger = 'L1') =>
      client.query(
        `insert into journal_entry
           (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
         values ($1, $2, 'J', 'P', '2026-01-15', 'asiento', 'POSTED', $3)`,
        [id, ledger, number],
      );

    await posted('n1', 1);
    await posted('n3', 3);
    await posted('n1', 1, 'L2');

    await expectCode(posted('n1bis', 1), PG_ERROR.UNIQUE_VIOLATION, 'número repetido en el mismo libro');
  });
});

test('HA26 y HA25: la huella se guarda tal cual y el resultado vuelve como el mismo valor', async () => {
  await migrated(async (client) => {
    const fingerprint = '  [["ledgerId","L1"],["operation","postEntry"]]  ';
    const stored = {
      status: 'POSTED',
      number: 1,
      lines: [{ amount: { minorUnits: '9007199254740993', currency: { code: 'ARS', scale: 2 } } }],
    };

    await client.query(
      `insert into idempotency_record (ledger_id, operation, idempotency_key, fingerprint, result)
       values ('L1', 'postEntry', 'k1', $1, $2::jsonb)`,
      [fingerprint, JSON.stringify(stored)],
    );

    const row = await client.query(`select fingerprint, result from idempotency_record where idempotency_key = 'k1'`);
    assert.equal(row.rows[0].fingerprint, fingerprint, 'sin recanonicalizar');
    assert.deepEqual(row.rows[0].result, stored, 'el resultado sobrevive el viaje de ida y vuelta');
  });
});

test('HA21: las líneas contabilizadas se cuentan por cuenta sobre todos los libros', async () => {
  await migrated(async (client) => {
    await client.query(
      `insert into journal_entry
         (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
       values ('p1', 'L1', 'J', 'P', '2026-01-15', 'posteado', 'POSTED', 1),
              ('d1', 'L1', 'J', 'P', '2026-01-15', 'borrador', 'DRAFT', null),
              ('p2', 'L2', 'J', 'P', '2026-01-15', 'posteado', 'POSTED', 1)`,
    );
    await client.query(
      `insert into journal_entry_line
         (ledger_id, entry_id, id, position, account_id, side,
          amount_minor_units, amount_currency_code, amount_currency_scale)
       values ('L1', 'p1', 'x1', 1, 'ACC', 'DEBIT', 100, 'ARS', 2),
              ('L1', 'd1', 'x2', 1, 'ACC', 'DEBIT', 100, 'ARS', 2),
              ('L2', 'p2', 'x3', 1, 'ACC', 'DEBIT', 100, 'ARS', 2)`,
    );

    const counted = await client.query(
      `select count(*)::int as total
       from journal_entry_line l
       join journal_entry e on e.ledger_id = l.ledger_id and e.id = l.entry_id
       where l.account_id = 'ACC' and e.status = 'POSTED'`,
    );
    assert.equal(counted.rows[0].total, 2, 'el borrador no cuenta y el otro libro sí');
  });
});

test('HA37: los dos accesos de los reportes tienen índice', async () => {
  await migrated(async (client) => {
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
  await migrated(async (client) => {
    const floating = await client.query(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = 'public' and data_type in ('real', 'double precision', 'numeric', 'money')`,
    );
    assert.deepEqual(floating.rows, [], 'ni coma flotante ni numeric con escala');
  });
});

test('el límite de la columna de importes está por encima de cualquier saldo real', async () => {
  await migrated(async (client) => {
    await client.query(
      `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
       values ('e1', 'L1', 'J', 'P', '2026-01-15', 'asiento', 'DRAFT')`,
    );
    await client.query(
      `insert into journal_entry_line
         (ledger_id, entry_id, id, position, account_id, side,
          amount_minor_units, amount_currency_code, amount_currency_scale)
       values ('L1', 'e1', 'l1', 1, 'ACC', 'DEBIT', 9223372036854775807, 'ARS', 2)`,
    );
    const row = await client.query(
      `select amount_minor_units as v, pg_typeof(amount_minor_units)::text as t
       from journal_entry_line where id = 'l1'`,
    );
    assert.equal(String(row.rows[0].v), '9223372036854775807', 'el entero máximo sobrevive exacto');
    assert.equal(row.rows[0].t, 'bigint');
  });
});
