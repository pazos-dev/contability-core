import type { ExchangeRate, ExchangeRateJSON, Money, MoneyJSON } from '../../shared/money/index.js';
import type { PostingSide } from '../types/posting-side.js';

/** Input data of a new entry line; ids are opaque values received from the caller. */
export interface JournalEntryLineInput {
  readonly id: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: Money;
  readonly description?: string;
}

/**
 * Input data of a line a host rebuilds from its storage: the same validated input as `create` —with `amount`
 * already hydrated as a `Money`— plus the functional amount and the rate it persisted with the line. The two
 * extra fields are exactly the ones `PostedLineResult` publishes, so a durable adapter can feed back what it
 * wrote.
 *
 * The two stored values are hydration, not a decision: `restore` checks their type and their consistency, and
 * the aggregate still checks at posting that the functional amount is worth something in the book's currency.
 */
export interface JournalEntryLineRestoreInput extends JournalEntryLineInput {
  readonly functionalAmount?: MoneyJSON;
  readonly rate?: ExchangeRateJSON;
}

/**
 * What posting adds to a line: the amount in the ledger's currency and, only when the line was converted,
 * the rate that produced it.
 *
 * It is deliberately not part of `JournalEntryLineInput`: a caller creates the original line in its own
 * currency, and the aggregate decides what that line is worth in the book when it posts.
 */
export interface JournalEntryLineFunctionalInput {
  readonly functionalAmount: Money;
  readonly rate?: ExchangeRate;
}

/**
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface JournalEntryLineFields {
  readonly id: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: Money;
  readonly functionalAmount: Money | undefined;
  readonly rate: ExchangeRate | undefined;
  readonly description: string | undefined;
}
