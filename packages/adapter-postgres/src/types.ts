import { types as defaultTypes } from 'pg';
import type { CustomTypesConfig } from 'pg';

/** PostgreSQL type OID of `date`: a calendar date, not an instant. */
export const ACCOUNTING_DATE_TYPE_ID = 1082;

function dateAsText(value: string): string {
  return value;
}

/**
 * Driver configuration the adapter needs, to be passed as `types` when creating a `Client` or a `Pool`.
 *
 * Without it, node-postgres turns a `date` column into a JavaScript `Date` at local midnight, which is an
 * instant: an accounting date of `2026-03-01` in a `-03:00` zone comes back as `2026-03-01T03:00:00.000Z`
 * and the next read formats it as `2026-02-28` or `2026-03-01` depending on the zone of the reader. The
 * engine separates the accounting date from the audit instant, so the date stays the text it was stored as.
 *
 * Every other type keeps the default parser: `bigint` is already a string, `jsonb` is already parsed, and
 * `timestamptz` is used only for audit columns the engine never sees.
 */
export const nodePostgresTypes: CustomTypesConfig = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    const isText = format === undefined || format === 'text';
    if (oid === ACCOUNTING_DATE_TYPE_ID && isText) return dateAsText;
    return defaultTypes.getTypeParser(oid, format);
  },
};
