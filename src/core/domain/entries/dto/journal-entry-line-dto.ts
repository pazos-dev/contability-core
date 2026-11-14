import type { Money } from '../../money/index.js';
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
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface JournalEntryLineFields {
  readonly id: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: Money;
  readonly description: string | undefined;
}
