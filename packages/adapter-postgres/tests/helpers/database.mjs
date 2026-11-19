import { randomBytes } from 'node:crypto';
import pg from 'pg';

// The suite needs a real engine: an in-memory store cannot prove atomicity, isolation or an exclusion
// constraint, which is the whole point of this adapter (docs/INTEGRATION.md, HA01 and HA02).
// Never a skip: if the server is missing the suite fails and says so.
export const ADMIN_DATABASE_URL =
  process.env.CONTABILITY_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';

function databaseName() {
  return `contability_test_${process.pid}_${randomBytes(4).toString('hex')}`;
}

function urlFor(name) {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Connection string of the throwaway database, for a test that needs its own pool or a second connection. */
export function connectionStringFor(name) {
  return urlFor(name);
}

/**
 * Runs `work` against a throwaway database with the schema created by the caller, then drops it.
 * One database per test keeps every guarantee observable without a search_path trick: the exclusion
 * constraint needs the btree_gist operator classes and those live where the extension is installed.
 */
export async function withDatabase(work) {
  const name = databaseName();
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  let client;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    client = new pg.Client({ connectionString: urlFor(name) });
    await client.connect();
    return await work(client, name);
  } finally {
    if (client) await client.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
}

/** PostgreSQL error codes the tests assert on, so a failure names the rule and not a message string. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
};

export async function expectCode(promise, code, label) {
  try {
    await promise;
  } catch (error) {
    if (error.code !== code) {
      throw new Error(`${label}: se esperaba el código ${code} y llegó ${error.code}: ${error.message}`);
    }
    return;
  }
  throw new Error(`${label}: el motor aceptó una escritura que la regla rechaza`);
}
