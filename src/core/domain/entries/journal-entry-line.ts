import { describeValue } from '../describe-value.js';
import { Money } from '../money/index.js';
import { invalidEntryLine } from './entry-errors.js';
import { requireOptionalText, requireText } from './entry-text.js';
import type { PostingSide } from './posting-side.js';

/** Input data of a new entry line; ids are opaque values received from the caller. */
export interface JournalEntryLineInput {
  readonly id: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: Money;
  readonly description?: string;
}

interface JournalEntryLineFields {
  readonly id: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: Money;
  readonly description: string | undefined;
}

/**
 * Module-private proof that construction went through the validating factory.
 * A TypeScript-private constructor is a normal public constructor at runtime, so the token is what
 * actually stops a plain JavaScript caller from building a line that skipped validation.
 */
const CONSTRUCTION_TOKEN = Symbol('JournalEntryLine');

/**
 * Immutable line of a journal entry: one account, one side and a strictly positive amount.
 * A line never exists on its own: the entry owns the collection and decides when a line may be
 * added or removed. Whether the account exists, belongs to the ledger or accepts postings is an
 * application check, not a line invariant.
 */
export class JournalEntryLine {
  readonly #id: string;
  readonly #accountId: string;
  readonly #side: PostingSide;
  readonly #amount: Money;
  readonly #description: string | undefined;

  private constructor(fields: JournalEntryLineFields, token: typeof CONSTRUCTION_TOKEN) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw invalidEntryLine('a line is created with JournalEntryLine.create, never with new');
    }

    this.#id = fields.id;
    this.#accountId = fields.accountId;
    this.#side = fields.side;
    this.#amount = fields.amount;
    this.#description = fields.description;
    Object.freeze(this);
  }

  static create(input: JournalEntryLineInput): JournalEntryLine {
    if (typeof input !== 'object' || input === null) {
      throw invalidEntryLine(`expected an input object, received ${describeValue(input)}`);
    }

    return new JournalEntryLine({
      id: requireText(input.id, 'id', invalidEntryLine),
      accountId: requireText(input.accountId, 'accountId', invalidEntryLine),
      side: requireSide(input.side),
      amount: requirePositiveAmount(input.amount),
      description: requireOptionalText(input.description, 'description', invalidEntryLine),
    }, CONSTRUCTION_TOKEN);
  }

  get id(): string {
    return this.#id;
  }

  get accountId(): string {
    return this.#accountId;
  }

  get side(): PostingSide {
    return this.#side;
  }

  get amount(): Money {
    return this.#amount;
  }

  get description(): string | undefined {
    return this.#description;
  }
}

function requireSide(value: unknown): PostingSide {
  if (value !== 'DEBIT' && value !== 'CREDIT') {
    throw invalidEntryLine(`side ${describeValue(value)} must be DEBIT or CREDIT`);
  }
  return value;
}

/** Money admits zero and negatives; a posted line does not. The restriction lives here. */
function requirePositiveAmount(value: unknown): Money {
  if (!(value instanceof Money)) {
    throw invalidEntryLine(`amount must be a Money, received ${describeValue(value)}`);
  }
  if (value.minorUnits <= 0n) {
    throw invalidEntryLine(`amount must be strictly positive, received ${value.toDecimal()}`);
  }
  return value;
}
