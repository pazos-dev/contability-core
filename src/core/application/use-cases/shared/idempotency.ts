import type { UnitOfWorkScope } from '../../ports/index.js';
import { idempotencyConflict } from '../../errors.js';

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
 * Replay and remember for **one** operation of **one** ledger. Built inside the unit of work, from the
 * scope it writes through.
 *
 * The three values that fix the identity of the operation are not parameters of `replay`/`remember`:
 * they are carried by the instance, so a use case cannot pass the key of one operation to another, and
 * `operation` and `ledgerId` — two plain strings that used to sit next to each other in every call —
 * are written exactly once. What a caller chooses per call is only what differs between calls: the key
 * the host supplied and the fingerprint of the request.
 *
 * A registry that is asked nothing when the host sends no key at all is why both methods accept
 * `undefined` and return early: idempotency stays optional per request.
 */
export class Idempotency {
  readonly #scope: UnitOfWorkScope;
  readonly #operation: string;
  readonly #ledgerId: string;

  private constructor(scope: UnitOfWorkScope, operation: string, ledgerId: string) {
    this.#scope = scope;
    this.#operation = operation;
    this.#ledgerId = ledgerId;
  }

  static of(scope: UnitOfWorkScope, operation: string, ledgerId: string): Idempotency {
    return new Idempotency(scope, operation, ledgerId);
  }

  /**
   * Returns the stored result when the key was already used by the same request, `undefined` when the
   * key is new or absent, and fails with `IDEMPOTENCY_CONFLICT` when the key belongs to another request.
   */
  async replay<T>(key: string | undefined, fingerprint: string): Promise<T | undefined> {
    if (key === undefined) return undefined;

    const stored = await this.#scope.idempotency.find(this.#ledgerId, this.#operation, key);
    if (stored === undefined) return undefined;
    if (stored.fingerprint !== fingerprint) {
      throw idempotencyConflict(this.#ledgerId, this.#operation, key);
    }

    // The registry only ever stores the result this same use case wrote under this same fingerprint.
    return stored.result as T;
  }

  /** Remembers the result of the operation, if the caller asked for idempotency at all. */
  async remember(key: string | undefined, fingerprint: string, result: unknown): Promise<void> {
    if (key === undefined) return;

    await this.#scope.idempotency.record(this.#ledgerId, this.#operation, key, { fingerprint, result });
  }
}
