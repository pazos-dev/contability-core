// Adaptador PostgreSQL del motor contable.
//
// Estado: T1 de `odd/tasks/postgres-adapter.md`. Publica el esquema canónico y su runner de migraciones.
// Los puertos durables se agregan en las tareas siguientes; este paquete nunca migra al importarse.
export {
  applyMigrations,
  MIGRATIONS_DIRECTORY,
  MIGRATION_FILE_PATTERN,
  MigrationError,
  readMigrations,
} from './migrations.js';
export type {
  ApplyMigrationsOptions,
  MigrationErrorCode,
  MigrationFile,
  MigrationTarget,
  Queryable,
} from './migrations.js';
export { ACCOUNTING_DATE_TYPE_ID, nodePostgresTypes } from './types.js';
