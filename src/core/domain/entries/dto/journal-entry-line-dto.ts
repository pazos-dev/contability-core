import type { ExchangeRate, Money } from '../../shared/money/index.js';
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
