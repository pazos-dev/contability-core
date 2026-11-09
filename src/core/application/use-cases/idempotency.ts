import type { UnitOfWorkScope } from '../ports/index.js';
import { idempotencyConflict } from '../errors.js';

/**
 * Fingerprint of the request a replay is compared against.
 *
 * It covers **every** field of the request except the idempotency key, and it is built from the
 * fields explicitly so that adding a field to a use case is a visible decision here. Covering only
 * the entity identity is not enough: the same key with the same id and a different code, name, date
 * or parent is a different request and must conflict instead of silently reporting success.
 *
 * Field names are sorted and absent (`undefined`) fields are dropped, so two calls with the same
 * values always produce the same text.
 */
export function fingerprintOf(request: { readonly [field: string]: unknown }): string {
  const fields = Object.keys(request)
    .filter((field) => field !== 'idempotencyKey' && request[field] !== undefined)
    .sort();

  return JSON.stringify(fields.map((field) => [field, request[field]]));
}

/**
 * Returns the stored result when the key was already used by the same request, `undefined` when the
 * key is new or absent, and fails with `IDEMPOTENCY_CONFLICT` when the key belongs to another request.
 */
export async function replay<T>(
  scope: UnitOfWorkScope,
  operation: string,
  ledgerId: string,
  key: string | undefined,
  fingerprint: string,
): Promise<T | undefined> {
  if (key === undefined) return undefined;

  const stored = await scope.idempotency.find(ledgerId, operation, key);
  if (stored === undefined) return undefined;
  if (stored.fingerprint !== fingerprint) throw idempotencyConflict(ledgerId, operation, key);

  // The registry only ever stores the result this same use case wrote under this same fingerprint.
  return stored.result as T;
}

/** Remembers the result of the operation, if the caller asked for idempotency at all. */
export async function remember(
  scope: UnitOfWorkScope,
  operation: string,
  ledgerId: string,
  key: string | undefined,
  fingerprint: string,
  result: unknown,
): Promise<void> {
  if (key === undefined) return;

  await scope.idempotency.record(ledgerId, operation, key, { fingerprint, result });
}
