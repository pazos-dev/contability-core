import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

/** Where the published package keeps its migrations, resolved from the compiled module. */
export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));

/** The files the runner accepts: an ordered prefix and a lowercase slug, so the order is not a guess. */
export const MIGRATION_FILE_PATTERN = /^\d{4}-[a-z0-9-]+\.sql$/;

export type MigrationErrorCode = 'MIGRATION_CHECKSUM_MISMATCH' | 'MIGRATION_FILE_INVALID';

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface ApplyMigrationsOptions {
  /** Overrides the published directory; the tests use it to prove the parser, never to skip real files. */
  readonly directory?: string;
}

/** Anything that can run a statement: a `Pool`, a `PoolClient` or a client from the tests. */
export type Queryable = Pick<PoolClient, 'query'>;

/** The migration runner takes a pool and pins a connection, or a connection the caller already owns. */
export type MigrationTarget = Queryable | Pool;

interface RecordedMigration {
  readonly name: string;
  readonly checksum: string;
}

const MIGRATION_TABLE = `create table if not exists schema_migration (
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migration_pkey primary key (name)
)`;

/**
 * Reads the migration files in order, with the checksum of their exact contents.
 * Throws instead of returning an empty list: an adapter that silently applies nothing reports success
 * over an empty database.
 */
export function readMigrations(directory: string = MIGRATIONS_DIRECTORY): readonly MigrationFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      if (!MIGRATION_FILE_PATTERN.test(name)) {
        throw new MigrationError(
          'MIGRATION_FILE_INVALID',
          `El archivo ${name} no respeta el formato NNNN-nombre.sql del directorio de migraciones.`,
        );
      }
      const sql = readFileSync(join(directory, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

/**
 * Applies the migrations that are not recorded yet, in one transaction, and returns their names.
 *
 * A host applies its own migrations; this runner exists so the schema has exactly one definition and the
 * adapter's tests exercise the same files the host will deploy. It never runs on import: the package loads
 * without touching a database.
 *
 * A migrated file whose checksum changed is refused: editing an applied migration makes two databases
 * disagree about the same version number, and the failure has to be loud and early.
 *
 * A `Pool` is accepted and one connection is taken for the whole run, because `begin` and `commit` sent to
 * a pool can land on two different connections and turn the transaction into a sequence of autocommits.
 */
export async function applyMigrations(
  target: MigrationTarget,
  options: ApplyMigrationsOptions = {},
): Promise<readonly string[]> {
  if (!isPool(target)) return run(target, options);

  const client = await target.connect();
  try {
    return await run(client, options);
  } finally {
    client.release();
  }
}

// A pool is the only thing here that counts its connections; a `Client` and a `PoolClient` both have
// `connect` or `release`, so neither marker can tell them apart from a pool.
function isPool(target: MigrationTarget): target is Pool {
  return 'totalCount' in target && 'connect' in target;
}

async function run(client: Queryable, options: ApplyMigrationsOptions): Promise<readonly string[]> {
  const files = readMigrations(options.directory);

  await client.query('begin');
  try {
    await client.query(MIGRATION_TABLE);
    const recorded = await client.query<RecordedMigration>('select name, checksum from schema_migration');
    const checksums = new Map(recorded.rows.map((row) => [row.name, row.checksum]));
    const applied: string[] = [];

    for (const file of files) {
      const previous = checksums.get(file.name);
      if (previous !== undefined) {
        if (previous !== file.checksum) {
          throw new MigrationError(
            'MIGRATION_CHECKSUM_MISMATCH',
            `La migración ${file.name} cambió después de aplicarse: el checksum registrado no coincide.`,
          );
        }
        continue;
      }
      await client.query(file.sql);
      await client.query('insert into schema_migration (name, checksum) values ($1, $2)', [
        file.name,
        file.checksum,
      ]);
      applied.push(file.name);
    }

    await client.query('commit');
    return applied;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}
