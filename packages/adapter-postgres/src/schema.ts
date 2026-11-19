import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

/** Where the published package keeps the schema creation, resolved from the compiled module. */
export const SCHEMA_DIRECTORY = fileURLToPath(new URL('../schema/', import.meta.url));

/**
 * The files the creator accepts: an ordered prefix and a lowercase slug, so the application order is not a
 * guess. Two digits at least so a later concern of the same neighbourhood can be inserted between two files.
 */
export const SCHEMA_FILE_PATTERN = /^\d{2,3}-[a-z0-9-]+\.sql$/;

/** The eight tables of the schema. The guard and its message both read this list, so they cannot drift. */
export const SCHEMA_TABLES = [
  'ledger',
  'account',
  'journal',
  'accounting_period',
  'journal_entry',
  'journal_entry_line',
  'entry_number_counter',
  'idempotency_record',
] as const;

export type SchemaErrorCode = 'SCHEMA_FILE_INVALID' | 'SCHEMA_ALREADY_PRESENT';

export class SchemaError extends Error {
  readonly code: SchemaErrorCode;

  constructor(code: SchemaErrorCode, message: string) {
    super(message);
    this.name = 'SchemaError';
    this.code = code;
  }
}

export interface SchemaFile {
  readonly name: string;
  readonly sql: string;
}

export interface CreateSchemaOptions {
  /** Overrides the published directory; the tests use it to prove the parser, never to skip real files. */
  readonly directory?: string;
}

/** Anything that can run a statement: a `Pool`, a `PoolClient` or a client from the tests. */
export type Queryable = Pick<PoolClient, 'query'>;

/** Schema creation takes a pool and pins a connection, or a connection the caller already owns. */
export type SchemaTarget = Queryable | Pool;

interface ExistingTable {
  readonly name: string;
}

/**
 * Reads the schema files in application order.
 *
 * There is no checksum and no history: these files are a creation, not a sequence of steps. Throws instead
 * of returning an empty list, because creating nothing while reporting success leaves a database that only
 * looks ready.
 */
export function readSchema(directory: string = SCHEMA_DIRECTORY): readonly SchemaFile[] {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new SchemaError(
      'SCHEMA_FILE_INVALID',
      `El directorio ${directory} no contiene archivos .sql para crear el esquema.`,
    );
  }

  return files.map((name) => {
    if (!SCHEMA_FILE_PATTERN.test(name)) {
      throw new SchemaError(
        'SCHEMA_FILE_INVALID',
        `El archivo ${name} no respeta el formato NN-NNN-nombre.sql del directorio de creación del esquema.`,
      );
    }
    const sql = readFileSync(join(directory, name), 'utf8');
    return { name, sql };
  });
}

/**
 * Creates the schema from zero, in one transaction, and returns the names of the files applied.
 *
 * It refuses a database where any of the eight tables already exists: creating a schema over a schema is not
 * a no-op that can be told apart from a half-created database, so it fails loudly instead of guessing.
 * It writes nothing else — no version registry, no checksums, no bookkeeping table.
 *
 * A `Pool` is accepted and one connection is taken for the whole run, because `begin` and `commit` sent to
 * a pool can land on two different connections and turn the transaction into a sequence of autocommits.
 */
export async function createSchema(
  target: SchemaTarget,
  options: CreateSchemaOptions = {},
): Promise<readonly string[]> {
  if (!isPool(target)) return run(target, options);

  const client = await target.connect();
  try {
    return await run(client, options);
  } finally {
    client.release();
  }
}

// A pool is the only thing here that counts its connections: a `Client` and a `PoolClient` both have
// `connect`, so that marker cannot tell them apart from a pool.
function isPool(target: SchemaTarget): target is Pool {
  return 'totalCount' in target;
}

async function run(client: Queryable, options: CreateSchemaOptions): Promise<readonly string[]> {
  const files = readSchema(options.directory);

  await client.query('begin');
  try {
    const existing = await client.query<ExistingTable>(
      `select t.name
       from unnest($1::text[]) with ordinality as t(name, position)
       where to_regclass(t.name) is not null
       order by t.position
       limit 1`,
      [[...SCHEMA_TABLES]],
    );

    const found = existing.rows[0];
    if (found !== undefined) {
      throw new SchemaError(
        'SCHEMA_ALREADY_PRESENT',
        `El esquema ya existe: la tabla ${found.name} está presente. createSchema sólo crea un esquema vacío.`,
      );
    }

    for (const file of files) {
      await client.query(file.sql);
    }

    await client.query('commit');
    return files.map((file) => file.name);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}
