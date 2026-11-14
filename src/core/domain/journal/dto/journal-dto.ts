import type { JournalStatus } from '../journal-status.js';

/** Input data of a new journal; ids are opaque values received from the caller. */
export interface JournalInput {
  readonly id: string;
  readonly ledgerId: string;
  readonly code: string;
  readonly name: string;
}

/**
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface JournalFields {
  readonly id: string;
  readonly ledgerId: string;
  readonly code: string;
  readonly name: string;
  readonly status: JournalStatus;
}
