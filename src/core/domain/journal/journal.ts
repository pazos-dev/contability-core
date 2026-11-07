import { describeValue } from '../describe-value.js';
import { invalidJournal } from './journal-errors.js';

export type JournalStatus = 'ACTIVE' | 'INACTIVE';

/** Input data of a new journal; ids are opaque values received from the caller. */
export interface JournalInput {
  readonly id: string;
  readonly ledgerId: string;
  readonly code: string;
  readonly name: string;
}

interface JournalFields {
  readonly id: string;
  readonly ledgerId: string;
  readonly code: string;
  readonly name: string;
  readonly status: JournalStatus;
}

/**
 * Immutable journal that identifies a journal inside its ledger.
 * It does not hold entries: journal entries live in `entries` and reference the journal.
 * Code uniqueness inside one ledger and ledger ownership of entries belong to the
 * application layer with a repository.
 */
export class Journal {
  readonly #id: string;
  readonly #ledgerId: string;
  readonly #code: string;
  readonly #name: string;
  readonly #status: JournalStatus;

  private constructor(fields: JournalFields) {
    this.#id = fields.id;
    this.#ledgerId = fields.ledgerId;
    this.#code = fields.code;
    this.#name = fields.name;
    this.#status = fields.status;
    Object.freeze(this);
  }

  static create(input: JournalInput): Journal {
    if (typeof input !== 'object' || input === null) {
      throw invalidJournal(`expected an input object, received ${describeValue(input)}`);
    }

    return new Journal({
      id: requireText(input.id, 'id'),
      ledgerId: requireText(input.ledgerId, 'ledgerId'),
      code: requireText(input.code, 'code'),
      name: requireText(input.name, 'name'),
      status: 'ACTIVE',
    });
  }

  get id(): string {
    return this.#id;
  }

  get ledgerId(): string {
    return this.#ledgerId;
  }

  get code(): string {
    return this.#code;
  }

  get name(): string {
    return this.#name;
  }

  get status(): JournalStatus {
    return this.#status;
  }

  isActive(): boolean {
    return this.#status === 'ACTIVE';
  }

  /** Returns an inactive copy that keeps identity, ledger, code and name; deactivation is idempotent. */
  deactivate(): Journal {
    if (!this.isActive()) return this;
    return new Journal({
      id: this.#id,
      ledgerId: this.#ledgerId,
      code: this.#code,
      name: this.#name,
      status: 'INACTIVE',
    });
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidJournal(`${field} must be a non-empty string, received ${describeValue(value)}`);
  }
  return value;
}
