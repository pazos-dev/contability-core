import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, readMigrations } from '../dist/index.js';
import { withDatabase, PG_ERROR, expectCode } from './helpers/database.mjs';

async function migrated(work) {
  return withDatabase(async (client) => {
    await applyMigrations(client);
    return work(client);
  });
}

test('aplica todas las migraciones sobre una base vacía y las registra una sola vez', async () => {
  await withDatabase(async (client) => {
    const files = readMigrations();
    assert.ok(files.length > 0, 'la carpeta migrations debe tener al menos un archivo');

    const applied = await applyMigrations(client);
    assert.deepEqual(
      [...applied],
      files.map((file) => file.name),
      'la primera corrida aplica todas las migraciones en orden',
    );

    const again = await applyMigrations(client);
    assert.deepEqual([...again], [], 'una segunda corrida no aplica nada');

    const recorded = await client.query('select name from schema_migration order by name');
    assert.equal(recorded.rows.length, files.length, 'cada migración queda registrada una vez');
  });
});

test('rechaza una migración ya aplicada cuyo contenido cambió', async () => {
  await withDatabase(async (client) => {
    await applyMigrations(client);
    const first = readMigrations()[0].name;
    await client.query('update schema_migration set checksum = $1 where name = $2', ['alterado', first]);

    await assert.rejects(
      () => applyMigrations(client),
      (error) => error.code === 'MIGRATION_CHECKSUM_MISMATCH' && error.message.includes(first),
      'una migración aplicada que cambió de contenido no puede pasar en silencio',
    );
  });
});

test('HA16: dos períodos que comparten un extremo se solapan y se rechazan', async () => {
  await migrated(async (client) => {
    await insertPeriod(client, { id: 'p1', start: '2026-01-01', end: '2026-01-31' });

    await expectCode(
      insertPeriod(client, { id: 'p2', start: '2026-01-31', end: '2026-02-28' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el extremo final de uno es el extremo inicial del otro',
    );
    await expectCode(
      insertPeriod(client, { id: 'p3', start: '2025-12-01', end: '2026-01-01' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el otro extremo, también inclusivo',
    );
    await insertPeriod(client, { id: 'p4', start: '2026-02-01', end: '2026-02-28' });
  });
});

test('HA16: un rango contenido en otro se rechaza y el mismo rango vive en otro libro', async () => {
  await migrated(async (client) => {
    await insertPeriod(client, { id: 'p1', start: '2026-01-01', end: '2026-01-31' });

    await expectCode(
      insertPeriod(client, { id: 'p2', start: '2026-01-10', end: '2026-01-20' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'rango contenido',
    );
    await insertPeriod(client, { id: 'p1', ledger: 'libro-2', start: '2026-01-01', end: '2026-01-31' });
  });
});

test('HA20: la clave primaria de asiento es el par libro y asiento', async () => {
  await migrated(async (client) => {
    await insertEntry(client, { id: 'e1' });
    await insertEntry(client, { id: 'e1', ledger: 'otro' });
    await expectCode(
      insertEntry(client, { id: 'e1' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'el mismo id de asiento dentro del mismo libro',
    );
  });
});

test('HA43: el número de asiento es único por libro y los borradores no lo llevan', async () => {
  await migrated(async (client) => {
    await insertEntry(client, { id: 'e1', number: 1, status: 'POSTED' });
    await expectCode(
      insertEntry(client, { id: 'e2', number: 1, status: 'POSTED' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'número repetido en el mismo libro',
    );
    await insertEntry(client, { id: 'e3', number: 1, status: 'POSTED', ledger: 'otro' });

    const twoDrafts = await client.query(
      `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
       values ('e4', 'libro-1', 'diario-1', 'periodo-1', '2026-01-15', 'borrador', 'DRAFT'),
              ('e5', 'libro-1', 'diario-1', 'periodo-1', '2026-01-15', 'borrador', 'DRAFT')
       returning id`,
    );
    assert.equal(twoDrafts.rows.length, 2, 'varios borradores conviven porque su número es nulo');

    await expectCode(
      insertEntry(client, { id: 'e6', number: 0, status: 'POSTED' }),
      PG_ERROR.CHECK_VIOLATION,
      'el número debe ser positivo',
    );
  });
});

test('el código de cuenta es único por plan y no global', async () => {
  await migrated(async (client) => {
    await insertAccount(client, { id: 'a1', chart: 'plan-1', code: '1.1' });
    await insertAccount(client, { id: 'a2', chart: 'plan-2', code: '1.1' });
    await expectCode(
      insertAccount(client, { id: 'a3', chart: 'plan-1', code: '1.1' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'código repetido en el mismo plan',
    );
  });
});

test('HA22: la clave de idempotencia es la tripleta libro, operación y clave', async () => {
  await migrated(async (client) => {
    await insertIdempotency(client, { operation: 'postEntry', key: 'k1' });
    await insertIdempotency(client, { operation: 'reversePostedEntry', key: 'k1' });
    await insertIdempotency(client, { ledger: 'otro', operation: 'postEntry', key: 'k1' });
    await expectCode(
      insertIdempotency(client, { operation: 'postEntry', key: 'k1' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'la misma clave en la misma operación y libro',
    );
  });
});

test('los importes sobreviven como enteros exactos fuera del rango seguro de JavaScript', async () => {
  const exact = '9007199254740993';
  await migrated(async (client) => {
    await insertEntry(client, { id: 'e1' });
    await insertLine(client, { entry: 'e1', id: 'l1', minorUnits: exact });

    const result = await client.query(
      `select amount_minor_units, functional_minor_units, rate_factor
       from journal_entry_line where entry_id = $1`,
      ['e1'],
    );
    assert.equal(String(result.rows[0].amount_minor_units), exact, 'sin pérdida de precisión');
    assert.equal(result.rows[0].functional_minor_units, null, 'sin conversión no hay importe funcional');
    assert.equal(result.rows[0].rate_factor, null, 'sin conversión no hay tasa');
  });
});

test('una línea no existe sin su asiento', async () => {
  await migrated(async (client) => {
    await expectCode(
      insertLine(client, { entry: 'fantasma', id: 'l1', minorUnits: '100' }),
      PG_ERROR.FOREIGN_KEY_VIOLATION,
      'la línea cuelga de un asiento que no existe',
    );
  });
});

function insertPeriod(client, { id, ledger = 'libro-1', start, end }) {
  return client.query(
    `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, 'OPEN')`,
    [id, ledger, id, start, end],
  );
}

function insertEntry(client, { id, ledger = 'libro-1', number = null, status = 'DRAFT' }) {
  return client.query(
    `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
     values ($1, $2, 'diario-1', 'periodo-1', '2026-01-15', 'asiento', $3, $4)`,
    [id, ledger, status, number],
  );
}

function insertAccount(client, { id, chart, code }) {
  return client.query(
    `insert into account (id, chart_of_accounts_id, code, name, type, posting_allowed, status)
     values ($1, $2, $3, 'Caja', 'ASSET', true, 'ACTIVE')`,
    [id, chart, code],
  );
}

function insertIdempotency(client, { ledger = 'libro-1', operation, key }) {
  return client.query(
    `insert into idempotency_record (ledger_id, operation, idempotency_key, fingerprint, result)
     values ($1, $2, $3, 'huella', '{"ok":true}'::jsonb)`,
    [ledger, operation, key],
  );
}

function insertLine(client, { entry, id, minorUnits, ledger = 'libro-1' }) {
  return client.query(
    `insert into journal_entry_line (
       ledger_id, entry_id, id, position, account_id, side,
       amount_minor_units, amount_currency_code, amount_currency_scale, description
     ) values ($1, $2, $3, 1, 'cuenta-1', 'DEBIT', $4::bigint, 'ARS', 2, null)`,
    [ledger, entry, id, minorUnits],
  );
}
