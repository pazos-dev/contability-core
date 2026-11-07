import { describeValue } from '../describe-value.js';
import { AccountingDate } from './accounting-date.js';
import { invalidPeriod, periodAlreadyClosed } from './period-errors.js';
import type { PeriodStatus } from './period-status.js';

/** Input data of a new accounting period; ids are opaque values received from the caller. */
export interface AccountingPeriodInput {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly startDate: AccountingDate;
  readonly endDate: AccountingDate;
}

interface AccountingPeriodFields {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly startDate: AccountingDate;
  readonly endDate: AccountingDate;
  readonly status: PeriodStatus;
}

/**
 * Immutable accounting period over inclusive calendar boundaries.
 * Overlap between periods of one ledger and concurrent closing belong to the
 * application layer with persistence; this value only owns its local rules.
 */
export class AccountingPeriod {
  readonly #id: string;
  readonly #ledgerId: string;
  readonly #name: string;
  readonly #startDate: AccountingDate;
  readonly #endDate: AccountingDate;
  readonly #status: PeriodStatus;

  private constructor(fields: AccountingPeriodFields) {
    this.#id = fields.id;
    this.#ledgerId = fields.ledgerId;
    this.#name = fields.name;
    this.#startDate = fields.startDate;
    this.#endDate = fields.endDate;
    this.#status = fields.status;
    Object.freeze(this);
  }

  static create(input: AccountingPeriodInput): AccountingPeriod {
    if (typeof input !== 'object' || input === null) {
      throw invalidPeriod(`expected an input object, received ${describeValue(input)}`);
    }

    const id = requireText(input.id, 'id');
    const ledgerId = requireText(input.ledgerId, 'ledgerId');
    const name = requireText(input.name, 'name');
    const startDate = requireDate(input.startDate, 'startDate');
    const endDate = requireDate(input.endDate, 'endDate');

    if (startDate.compare(endDate) > 0) {
      throw invalidPeriod(`startDate ${startDate.value} must not be after endDate ${endDate.value}`);
    }

    return new AccountingPeriod({ id, ledgerId, name, startDate, endDate, status: 'OPEN' });
  }

  get id(): string {
    return this.#id;
  }

  get ledgerId(): string {
    return this.#ledgerId;
  }

  get name(): string {
    return this.#name;
  }

  get startDate(): AccountingDate {
    return this.#startDate;
  }

  get endDate(): AccountingDate {
    return this.#endDate;
  }

  get status(): PeriodStatus {
    return this.#status;
  }

  isOpen(): boolean {
    return this.#status === 'OPEN';
  }

  /** Inclusive on both boundaries: the start and the end date belong to the period. */
  contains(date: AccountingDate): boolean {
    const target = requireDate(date, 'date');
    return this.#startDate.compare(target) <= 0 && this.#endDate.compare(target) >= 0;
  }

  /** Returns a CLOSED copy; closing an already closed period is a state error, not a no-op. */
  close(): AccountingPeriod {
    if (!this.isOpen()) {
      throw periodAlreadyClosed(`period ${describeValue(this.#id)} is already CLOSED`);
    }

    return new AccountingPeriod({
      id: this.#id,
      ledgerId: this.#ledgerId,
      name: this.#name,
      startDate: this.#startDate,
      endDate: this.#endDate,
      status: 'CLOSED',
    });
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPeriod(`${field} must be a non-empty string, received ${describeValue(value)}`);
  }
  if (value !== value.trim()) {
    throw invalidPeriod(`${field} must not have leading or trailing whitespace, received ${describeValue(value)}`);
  }
  return value;
}

function requireDate(value: unknown, field: string): AccountingDate {
  if (!(value instanceof AccountingDate)) {
    throw invalidPeriod(`${field} must be an AccountingDate, received ${describeValue(value)}`);
  }
  return value;
}
