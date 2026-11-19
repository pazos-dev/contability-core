// Adaptador PostgreSQL del motor contable.
//
// Estado: T1 de `odd/tasks/postgres-adapter.md`. Publica la creación del esquema canónico.
// Los puertos durables se agregan en las tareas siguientes; este paquete nunca crea el esquema al importarse.
export {
  createSchema,
  SCHEMA_DIRECTORY,
  SCHEMA_FILE_PATTERN,
  SCHEMA_TABLES,
  SchemaError,
  readSchema,
} from './schema.js';
export type {
  CreateSchemaOptions,
  Queryable,
  SchemaErrorCode,
  SchemaFile,
  SchemaTarget,
} from './schema.js';
export { ACCOUNTING_DATE_TYPE_ID, nodePostgresTypes } from './types.js';
