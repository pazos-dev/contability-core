import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { SCHEMA_TABLES, createSchema, readSchema } from '../dist/index.js';
import { withDatabase, connectionStringFor, PG_ERROR, expectCode } from './helpers/database.mjs';

// Identificadores fijos con forma de uuid: el esquema no acepta texto libre.
const LEDGER = '00000000-0000-4000-8000-000000000001';
const OTHER_LEDGER = '00000000-0000-4000-8000-000000000002';
const JOURNAL = '00000000-0000-4000-8000-000000000010';
const PERIOD = '00000000-0000-4000-8000-000000000020';
const PERIOD_1 = '00000000-0000-4000-8000-000000000021';
const PERIOD_2 = '00000000-0000-4000-8000-000000000022';
const PERIOD_3 = '00000000-0000-4000-8000-000000000023';
const PERIOD_4 = '00000000-0000-4000-8000-000000000024';
const ENTRY_1 = '00000000-0000-4000-8000-000000000031';
const ENTRY_2 = '00000000-0000-4000-8000-000000000032';
const ENTRY_3 = '00000000-0000-4000-8000-000000000033';
const ENTRY_4 = '00000000-0000-4000-8000-000000000034';
const ENTRY_5 = '00000000-0000-4000-8000-000000000035';
const ENTRY_6 = '00000000-0000-4000-8000-000000000036';
const GHOST_ENTRY = '00000000-0000-4000-8000-0000000000ff';
const CHART_1 = '00000000-0000-4000-8000-000000000041';
const CHART_2 = '00000000-0000-4000-8000-000000000042';
const ACCOUNT_1 = '00000000-0000-4000-8000-000000000051';
const ACCOUNT_2 = '00000000-0000-4000-8000-000000000052';
const ACCOUNT_3 = '00000000-0000-4000-8000-000000000053';
const LINE_1 = '00000000-0000-4000-8000-000000000061';

async function created(work) {
  return withDatabase(async (client) => {
    await createSchema(client);
    return work(client);
  });
}

test('crea el esquema completo en orden y las ocho tablas existen', async () => {
  await withDatabase(async (client) => {
    const files = readSchema();
    assert.equal(files.length, 11, 'el esquema se crea con once archivos');
    assert.deepEqual(
      files.map((file) => file.name),
      [...files.map((file) => file.name)].sort(),
      'los archivos se leen en orden léxico, que es el orden de aplicación',
    );
    assert.ok(
      files.every((file) => Object.keys(file).sort().join(',') === 'name,sql'),
      'un archivo de creación sólo tiene nombre y SQL: sin checksum ni versión',
    );

    const applied = await createSchema(client);
    assert.deepEqual([...applied], files.map((file) => file.name), 'se aplican todos los archivos en orden');

    const tables = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      [...SCHEMA_TABLES].sort(),
      'las ocho tablas del esquema, y ninguna otra',
    );
  });
});

test('una segunda corrida sobre la misma base se rechaza y nombra una tabla existente', async () => {
  await withDatabase(async (client) => {
    await createSchema(client);

    await assert.rejects(
      () => createSchema(client),
      (error) => {
        assert.equal(error.code, 'SCHEMA_ALREADY_PRESENT', 'el código dice que el esquema ya está');
        assert.ok(
          SCHEMA_TABLES.some((table) => error.message.includes(table)),
          `el mensaje nombra la primera tabla encontrada: ${error.message}`,
        );
        return true;
      },
      'crear el esquema sobre uno existente no puede pasar en silencio',
    );
  });
});

test('un archivo con nombre inválido se rechaza antes de tocar la base', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'contability-schema-'));
  try {
    mkdirSync(join(directory, 'nested'));
    writeFileSync(join(directory, '0001-initial-schema.sql'), 'SELECT 1;\n', 'utf8');

    assert.throws(
      () => readSchema(directory),
      (error) => error.code === 'SCHEMA_FILE_INVALID' && error.message.includes('0001-initial-schema.sql'),
      'el prefijo de cuatro dígitos no es el formato de creación del esquema',
    );

    await withDatabase(async (client) => {
      await assert.rejects(
        () => createSchema(client, { directory }),
        (error) => error.code === 'SCHEMA_FILE_INVALID',
        'el runner no aplica medio esquema cuando un archivo no es válido',
      );
      const tables = await client.query(
        `select count(*)::int as total from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'`,
      );
      assert.equal(tables.rows[0].total, 0, 'la base quedó vacía tras el rechazo');
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('createSchema con un Pool toma una conexión propia y la devuelve', async () => {
  await withDatabase(async (_client, name) => {
    const pool = new pg.Pool({ connectionString: connectionStringFor(name), max: 2 });
    try {
      const applied = await createSchema(pool);
      assert.ok(applied.length > 0, 'creó el esquema');
      assert.equal(pool.idleCount, 1, 'la conexión volvió al pool');
      assert.equal(pool.totalCount, 1, 'no abrió una conexión por sentencia');
    } finally {
      await pool.end();
    }
  });
});

test('createSchema devuelve la conexión al Pool aunque la creación falle', async () => {
  await withDatabase(async (client, name) => {
    await createSchema(client);
    const pool = new pg.Pool({ connectionString: connectionStringFor(name), max: 2 });
    try {
      await assert.rejects(
        () => createSchema(pool),
        (error) => error.code === 'SCHEMA_ALREADY_PRESENT',
      );
      assert.equal(pool.idleCount, 1, 'una corrida fallida no filtra la conexión');
    } finally {
      await pool.end();
    }
  });
});

test('HA16: dos períodos que comparten un extremo se solapan y se rechazan', async () => {
  await created(async (client) => {
    await insertPeriod(client, { id: PERIOD_1, start: '2026-01-01', end: '2026-01-31' });

    await expectCode(
      insertPeriod(client, { id: PERIOD_2, start: '2026-01-31', end: '2026-02-28' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el extremo final de uno es el extremo inicial del otro',
    );
    await expectCode(
      insertPeriod(client, { id: PERIOD_3, start: '2025-12-01', end: '2026-01-01' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el otro extremo, también inclusivo',
    );
    await insertPeriod(client, { id: PERIOD_4, start: '2026-02-01', end: '2026-02-28' });
  });
});

test('HA16: un rango contenido en otro se rechaza y el mismo rango vive en otro libro', async () => {
  await created(async (client) => {
    await insertPeriod(client, { id: PERIOD_1, start: '2026-01-01', end: '2026-01-31' });

    await expectCode(
      insertPeriod(client, { id: PERIOD_2, start: '2026-01-10', end: '2026-01-20' }),
      PG_ERROR.EXCLUSION_VIOLATION,
      'rango contenido',
    );
    await insertPeriod(client, {
      id: PERIOD_1,
      ledger: OTHER_LEDGER,
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

test('HA20: la clave primaria de asiento es el par libro y asiento', async () => {
  await created(async (client) => {
    await insertEntry(client, { id: ENTRY_1 });
    await insertEntry(client, { id: ENTRY_1, ledger: OTHER_LEDGER });
    await expectCode(
      insertEntry(client, { id: ENTRY_1 }),
      PG_ERROR.UNIQUE_VIOLATION,
      'el mismo id de asiento dentro del mismo libro',
    );
  });
});

test('HA43: el número de asiento es único por libro y los borradores no lo llevan', async () => {
  await created(async (client) => {
    await insertEntry(client, { id: ENTRY_1, number: 1, status: 'POSTED' });
    await expectCode(
      insertEntry(client, { id: ENTRY_2, number: 1, status: 'POSTED' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'número repetido en el mismo libro',
    );
    await insertEntry(client, { id: ENTRY_3, number: 1, status: 'POSTED', ledger: OTHER_LEDGER });

    const twoDrafts = await client.query(
      `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status)
       values ($1, $2, $3, $4, '2026-01-15', 'borrador', 'DRAFT'),
              ($5, $2, $3, $4, '2026-01-15', 'borrador', 'DRAFT')
       returning id`,
      [ENTRY_4, LEDGER, JOURNAL, PERIOD, ENTRY_5],
    );
    assert.equal(twoDrafts.rows.length, 2, 'varios borradores conviven porque su número es nulo');

    await expectCode(
      insertEntry(client, { id: ENTRY_6, number: 0, status: 'POSTED' }),
      PG_ERROR.CHECK_VIOLATION,
      'el número debe ser positivo',
    );
  });
});

test('el código de cuenta es único por plan y no global', async () => {
  await created(async (client) => {
    await insertAccount(client, { id: ACCOUNT_1, chart: CHART_1, code: '1.1' });
    await insertAccount(client, { id: ACCOUNT_2, chart: CHART_2, code: '1.1' });
    await expectCode(
      insertAccount(client, { id: ACCOUNT_3, chart: CHART_1, code: '1.1' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'código repetido en el mismo plan',
    );
  });
});

test('HA22: la clave de idempotencia es la tripleta libro, operación y clave', async () => {
  await created(async (client) => {
    await insertIdempotency(client, { operation: 'postEntry', key: 'k1' });
    await insertIdempotency(client, { operation: 'reversePostedEntry', key: 'k1' });
    await insertIdempotency(client, { ledger: OTHER_LEDGER, operation: 'postEntry', key: 'k1' });
    await expectCode(
      insertIdempotency(client, { operation: 'postEntry', key: 'k1' }),
      PG_ERROR.UNIQUE_VIOLATION,
      'la misma clave en la misma operación y libro',
    );
  });
});

test('los importes sobreviven como enteros exactos fuera del rango seguro de JavaScript', async () => {
  const exact = '9007199254740993';
  await created(async (client) => {
    await insertEntry(client, { id: ENTRY_1 });
    await insertLine(client, { entry: ENTRY_1, id: LINE_1, minorUnits: exact });

    const result = await client.query(
      `select amount_minor_units, functional_minor_units, rate_factor
       from journal_entry_line where entry_id = $1`,
      [ENTRY_1],
    );
    assert.equal(String(result.rows[0].amount_minor_units), exact, 'sin pérdida de precisión');
    assert.equal(result.rows[0].functional_minor_units, null, 'sin conversión no hay importe funcional');
    assert.equal(result.rows[0].rate_factor, null, 'sin conversión no hay tasa');
  });
});

test('una línea no existe sin su asiento', async () => {
  await created(async (client) => {
    await expectCode(
      insertLine(client, { entry: GHOST_ENTRY, id: LINE_1, minorUnits: '100' }),
      PG_ERROR.FOREIGN_KEY_VIOLATION,
      'la línea cuelga de un asiento que no existe',
    );
  });
});

function insertPeriod(client, { id, ledger = LEDGER, start, end }) {
  return client.query(
    `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
     values ($1, $2, $3, $4, $5, 'OPEN')`,
    [id, ledger, id, start, end],
  );
}

function insertEntry(client, { id, ledger = LEDGER, number = null, status = 'DRAFT' }) {
  return client.query(
    `insert into journal_entry (id, ledger_id, journal_id, period_id, accounting_date, description, status, number)
     values ($1, $2, $3, $4, '2026-01-15', 'asiento', $5, $6)`,
    [id, ledger, JOURNAL, PERIOD, status, number],
  );
}

function insertAccount(client, { id, chart, code }) {
  return client.query(
    `insert into account (id, chart_of_accounts_id, code, name, type, posting_allowed, status)
     values ($1, $2, $3, 'Caja', 'ASSET', true, 'ACTIVE')`,
    [id, chart, code],
  );
}

function insertIdempotency(client, { ledger = LEDGER, operation, key }) {
  return client.query(
    `insert into idempotency_record (ledger_id, operation, idempotency_key, fingerprint, result)
     values ($1, $2, $3, 'huella', '{"ok":true}'::jsonb)`,
    [ledger, operation, key],
  );
}

function insertLine(client, { entry, id, minorUnits, ledger = LEDGER }) {
  return client.query(
    `insert into journal_entry_line (
       ledger_id, entry_id, id, position, account_id, side,
       amount_minor_units, amount_currency_code, amount_currency_scale, description
     ) values ($1, $2, $3, 1, $4, 'DEBIT', $5::bigint, 'ARS', 2, null)`,
    [ledger, entry, id, ACCOUNT_1, minorUnits],
  );
}
