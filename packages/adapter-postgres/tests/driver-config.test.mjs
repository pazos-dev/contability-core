import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { applyMigrations, nodePostgresTypes } from '../dist/index.js';
import { withDatabase, connectionStringFor, PG_ERROR, expectCode } from './helpers/database.mjs';

test('la fecha contable vuelve como el texto que se guardó, sin zona horaria', async () => {
  await withDatabase(async (client, name) => {
    await applyMigrations(client);
    await client.query(
      `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
       values ('p1', 'libro-1', 'periodo', '2026-03-01', '2026-03-31', 'OPEN')`,
    );

    const typed = new pg.Client({ connectionString: connectionStringFor(name), types: nodePostgresTypes });
    await typed.connect();
    try {
      const row = await typed.query('select start_date from accounting_period where id = $1', ['p1']);
      assert.equal(typeof row.rows[0].start_date, 'string', 'la fecha no se convierte en una instancia de Date');
      assert.equal(row.rows[0].start_date, '2026-03-01', 'el texto es el que se guardó');

      // El mismo valor con el parser por defecto demuestra por qué el adaptador lo reemplaza: la fecha
      // contable se vuelve un instante y depende de la zona del lector.
      const untyped = new pg.Client({ connectionString: connectionStringFor(name) });
      await untyped.connect();
      try {
        const plain = await untyped.query('select start_date from accounting_period where id = $1', ['p1']);
        assert.ok(plain.rows[0].start_date instanceof Date, 'el parser por defecto entrega un instante');
      } finally {
        await untyped.end();
      }
    } finally {
      await typed.end();
    }
  });
});

test('applyMigrations con un Pool toma una conexión propia y la devuelve', async () => {
  await withDatabase(async (_client, name) => {
    const pool = new pg.Pool({ connectionString: connectionStringFor(name), max: 2 });
    try {
      const applied = await applyMigrations(pool);
      assert.ok(applied.length > 0, 'aplicó las migraciones');
      assert.equal(pool.idleCount, 1, 'la conexión volvió al pool');
      assert.equal(pool.totalCount, 1, 'no abrió una conexión por sentencia');
    } finally {
      await pool.end();
    }
  });
});

test('applyMigrations devuelve la conexión al Pool aunque la corrida falle', async () => {
  await withDatabase(async (client, name) => {
    await applyMigrations(client);
    const pool = new pg.Pool({ connectionString: connectionStringFor(name), max: 2 });
    try {
      await client.query('update schema_migration set checksum = $1', ['alterado']);
      await assert.rejects(
        () => applyMigrations(pool),
        (error) => error.code === 'MIGRATION_CHECKSUM_MISMATCH',
      );
      assert.equal(pool.idleCount, 1, 'una corrida fallida no filtra la conexión');
    } finally {
      await pool.end();
    }
  });
});

test('las escrituras de un host no dependen del registro de migraciones', async () => {
  await withDatabase(async (client) => {
    await applyMigrations(client);
    await client.query(
      `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
       values ('p1', 'libro-1', 'periodo', '2026-01-01', '2026-01-31', 'OPEN')`,
    );
    await expectCode(
      client.query(
        `insert into accounting_period (id, ledger_id, name, start_date, end_date, status)
         values ('p2', 'libro-1', 'periodo', '2026-01-31', '2026-02-28', 'OPEN')`,
      ),
      PG_ERROR.EXCLUSION_VIOLATION,
      'el solapamiento se rechaza después de migrar, no sólo al crear el esquema',
    );
  });
});
