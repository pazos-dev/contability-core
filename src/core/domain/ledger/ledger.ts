import { Currency } from '../shared/money/index.js';
import { describeValue } from '../shared/describe-value.js';
import type { LedgerFields, LedgerInput } from './dto/ledger-dto.js';
import { invalidLedger } from './errors/ledger-errors.js';
import type { LedgerStatus } from './types/ledger-status.js';

/**
 * Immutable ledger: the accounting scope that owns one chart of accounts and one functional currency.
 * It holds no accounts, journals, periods, entries or balances; it only identifies them.
 * The chart of accounts is an opaque identifier supplied by the caller (Q07): this domain does not
 * verify that it exists and offers no operation to change it, because the chart is the ledger's
 * accounting identity. Uniqueness of the id and of the chart inside the application layer belongs to
 * the application layer with a repository.
 *
 * The functional currency is the ledger's unit of account (Q08, resolved as one currency per ledger).
 * It is a `Currency` and not a bare code because currency identity here is code *and* scale: two
 * currencies with the same code and a different scale do not compare equal, and the scale is persisted
 * with the amount rather than deduced from the code. Like the chart, it never changes: changing it would
 * leave posted entries denominated in a currency the ledger no longer has, with no operation to migrate
 * them. There is no conversion here either; `Money` remains the only place that knows about currency, and
 * it refuses mixed operations.
 */
export class Ledger {
  readonly #id: string;
  readonly #name: string;
  readonly #chartOfAccountsId: string;
  readonly #currency: Currency;
  readonly #status: LedgerStatus;

  private constructor(fields: LedgerFields) {
    this.#id = fields.id;
    this.#name = fields.name;
    this.#chartOfAccountsId = fields.chartOfAccountsId;
    this.#currency = fields.currency;
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
      currency: requireCurrency(input.currency, 'currency'),
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

  /** Functional currency of this ledger: its unit of account, kept for the life of the ledger. */
  get currency(): Currency {
    return this.#currency;
  }

  get status(): LedgerStatus {
    return this.#status;
  }

  isActive(): boolean {
    return this.#status === 'ACTIVE';
  }

  /** Returns a copy with another name that keeps identity, chart of accounts, currency and status. */
  rename(name: string): Ledger {
    return this.#copyWith({ name: requireText(name, 'name') });
  }

  /** Returns an inactive copy that keeps identity, name, chart of accounts and currency. */
  deactivate(): Ledger {
    return this.#copyWith({ status: 'INACTIVE' });
  }

  /** Returns an active copy that keeps identity, name, chart of accounts and currency. */
  activate(): Ledger {
    return this.#copyWith({ status: 'ACTIVE' });
  }

  #copyWith(changes: { readonly name?: string; readonly status?: LedgerStatus }): Ledger {
    return new Ledger({
      id: this.#id,
      name: changes.name ?? this.#name,
      chartOfAccountsId: this.#chartOfAccountsId,
      currency: this.#currency,
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

/**
 * The functional currency arrives as a `Currency`, never as a plain code or a JSON object: the scale is part
 * of currency identity, and accepting a literal would let a hand-written pair bypass the catalog rules.
 * Hydrating `CurrencyJSON` into a `Currency` is the application layer's job, as it already is for
 * `JournalEntryLineInput.amount`.
 */
function requireCurrency(value: unknown, field: string): Currency {
  if (!(value instanceof Currency)) {
    throw invalidLedger(`${field} must be a Currency, received ${describeValue(value)}`);
  }
  return value;
}
