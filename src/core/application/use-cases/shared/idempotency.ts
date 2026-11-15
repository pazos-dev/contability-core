import type { UnitOfWorkScope } from '../../ports.js';
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
 * The idempotent cycle of **one** operation of **one** ledger: replay, work, remember. Built inside the unit
 * of work, from the scope it writes through.
 *
 * The three values that fix the identity of the operation are not parameters: they are carried by the
 * instance, so a use case cannot pass the key of one operation to another, and `operation` and `ledgerId` —
 * two plain strings that used to sit next to each other in every call — are written exactly once.
 *
 * `execute` is the only door on purpose. Replay and remember are private because using them in halves is not
 * a stylistic slip but a defect: a use case that forgets `remember` does not fail — it silently re-executes
 * the operation on the next retry, which is exactly what idempotency exists to prevent.
 *
 * A request without a key stays legal: both halves return early, so idempotency remains optional.
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
   * Returns the result stored for this key without running `work`, or runs `work` once and remembers what it
   * produced. Fails with `IDEMPOTENCY_CONFLICT` when the key already belongs to another request.
   *
   * `work` must save inside itself: the record is written after it returns, so a failed save leaves no replay
   * behind.
   */
  async execute<T>(key: string | undefined, fingerprint: string, work: () => Promise<T>): Promise<T> {
    const stored = await this.#replay<T>(key, fingerprint);
    if (stored !== undefined) return stored;

    const result = await work();
    await this.#remember(key, fingerprint, result);

    return result;
  }

  async #replay<T>(key: string | undefined, fingerprint: string): Promise<T | undefined> {
    if (key === undefined) return undefined;

    const stored = await this.#scope.idempotency.find(this.#ledgerId, this.#operation, key);
    if (stored === undefined) return undefined;
    if (stored.fingerprint !== fingerprint) {
      throw idempotencyConflict(this.#ledgerId, this.#operation, key);
    }

    // The registry only ever stores the result this same use case wrote under this same fingerprint.
    return stored.result as T;
  }

  async #remember(key: string | undefined, fingerprint: string, result: unknown): Promise<void> {
    if (key === undefined) return;

    await this.#scope.idempotency.record(this.#ledgerId, this.#operation, key, { fingerprint, result });
  }
}
