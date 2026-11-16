import type { AccountingDate } from '../../period/index.js';
import type { EntryStatus } from '../types/entry-status.js';
import type { JournalEntryLine } from '../value-objects/journal-entry-line.js';

/** Input data of a new draft; ids, date and period are opaque values received from the caller. */
export interface JournalEntryInput {
  readonly id: string;
  readonly ledgerId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: AccountingDate;
  readonly description: string;
}

/**
 * Explicit inputs of a reversal draft. The original keeps its identity; the reversal receives a new
 * id plus the date and period where it lands, so a closed original period is not a problem.
 */
export interface JournalEntryReversalInput {
  readonly id: string;
  readonly periodId: string;
  readonly accountingDate: AccountingDate;
  readonly description?: string;
}

/**
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface JournalEntryFields {
  readonly id: string;
  readonly ledgerId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: AccountingDate;
  readonly description: string;
  readonly status: EntryStatus;
  readonly number: number | undefined;
  readonly lines: readonly JournalEntryLine[];
  readonly reversalOfEntryId: string | undefined;
}

/** The fields a mutation may replace; everything else is preserved by the aggregate. */
export interface JournalEntryChanges {
  readonly status?: EntryStatus;
  readonly number?: number;
  readonly lines?: readonly JournalEntryLine[];
}
