import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createSchema, nodePostgresTypes } from '../dist/index.js';
import { withDatabase, connectionStringFor, PG_ERROR, expectCode } from './helpers/database.mjs';

// Identificadores fijos con forma de uuid: el esquema ya no acepta texto libre.
const LEDGER = '00000000-0000-4000-8000-000000000001';
const PERIOD_1 = '00000000-0000-4000-8000-000000000021';
const PERIOD_2 = '00000000-0000-4000-8000-000000000022';

function insertPeriod(client, id, start, end) {
  return client.query(
    `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
     values ($1, $2, 'periodo', $3, $4, 'OPEN')`,
    [id, LEDGER, start, end],
  );
}

test('la fecha contable vuelve como el texto que se guardó, sin zona horaria', async () => {
  await withDatabase(async (client, name) => {
    await createSchema(client);
    await insertPeriod(client, PERIOD_1, '2026-03-01', '2026-03-31');

    const typed = new pg.Client({ connectionString: connectionStringFor(name), types: nodePostgresTypes });
    await typed.connect();
    try {
      const row = await typed.query('select start_date from accounting_period where id = $1', [PERIOD_1]);
      assert.equal(typeof row.rows[0].start_date, 'string', 'la fecha no se convierte en una instancia de Date');
      assert.equal(row.rows[0].start_date, '2026-03-01', 'el texto es el que se guardó');

      // El mismo valor con el parser por defecto demuestra por qué el adaptador lo reemplaza: la fecha
      // contable se vuelve un instante y depende de la zona del lector.
      const untyped = new pg.Client({ connectionString: connectionStringFor(name) });
      await untyped.connect();
      try {
        const plain = await untyped.query('select start_date from accounting_period where id = $1', [PERIOD_1]);
        assert.ok(plain.rows[0].start_date instanceof Date, 'el parser por defecto entrega un instante');
      } finally {
        await untyped.end();
      }
    } finally {
      await typed.end();
    }
  });
});

test('las escrituras de un host dependen del esquema, no de un registro de versiones', async () => {
  await withDatabase(async (client) => {
    await createSchema(client);
    await insertPeriod(client, PERIOD_1, '2026-01-01', '2026-01-31');
    await expectCode(
      insertPeriod(client, PERIOD_2, '2026-01-31', '2026-02-28'),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el solapamiento se rechaza después de crear el esquema, no sólo al crearlo',
    );
  });
});
