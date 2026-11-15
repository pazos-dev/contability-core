import { describeValue } from '../shared/describe-value.js';
import type { LedgerFields, LedgerInput } from './dto/ledger-dto.js';
import { invalidLedger } from './errors/ledger-errors.js';
import type { LedgerStatus } from './types/ledger-status.js';

/**
 * Immutable ledger: the accounting scope that owns one chart of accounts.
 * It holds no accounts, journals, periods, entries or balances; it only identifies them.
 * The chart of accounts is an opaque identifier supplied by the caller (Q07): this domain does not
 * verify that it exists and offers no operation to change it, because the chart is the ledger's
 * accounting identity. Uniqueness of the id and of the chart inside the application layer belongs to
 * the application layer with a repository.
 */
export class Ledger {
  readonly #id: string;
  readonly #name: string;
  readonly #chartOfAccountsId: string;
  readonly #status: LedgerStatus;

  private constructor(fields: LedgerFields) {
    this.#id = fields.id;
    this.#name = fields.name;
    this.#chartOfAccountsId = fields.chartOfAccountsId;
    this.#status = fields.status;
    Object.freeze(this);
  }

  static create(input: LedgerInput): Ledger {
    if (typeof input !== 'object' || input === null) {
      throw invalidLedger(`expected an input object, received ${describeValue(input)}`);
    }

    return new Ledger({
      id: requireText(input.id, 'id'),
      name: requireText(input.name, 'name'),
      chartOfAccountsId: requireText(input.chartOfAccountsId, 'chartOfAccountsId'),
      status: 'ACTIVE',
    });
  }

  get id(): string {
    return this.#id;
  }

  get name(): string {
    return this.#name;
  }

  get chartOfAccountsId(): string {
    return this.#chartOfAccountsId;
  }

  get status(): LedgerStatus {
    return this.#status;
  }

  isActive(): boolean {
    return this.#status === 'ACTIVE';
  }

  /** Returns a copy with another name that keeps identity, chart of accounts and status. */
  rename(name: string): Ledger {
    return this.#copyWith({ name: requireText(name, 'name') });
  }

  /** Returns an inactive copy that keeps identity, name and chart of accounts. */
  deactivate(): Ledger {
    return this.#copyWith({ status: 'INACTIVE' });
  }

  /** Returns an active copy that keeps identity, name and chart of accounts. */
  activate(): Ledger {
    return this.#copyWith({ status: 'ACTIVE' });
  }

  #copyWith(changes: { readonly name?: string; readonly status?: LedgerStatus }): Ledger {
    return new Ledger({
      id: this.#id,
      name: changes.name ?? this.#name,
      chartOfAccountsId: this.#chartOfAccountsId,
      status: changes.status ?? this.#status,
    });
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidLedger(`${field} must be a non-empty string, received ${describeValue(value)}`);
  }
  if (value !== value.trim()) {
    throw invalidLedger(`${field} must not have leading or trailing whitespace, received ${describeValue(value)}`);
  }
  return value;
}
