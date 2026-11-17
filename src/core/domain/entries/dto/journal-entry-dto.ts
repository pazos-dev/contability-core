import type { AccountingDate } from '../../period/index.js';
import type { Currency, ExchangeRate } from '../../shared/money/index.js';
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
 * What posting needs from the caller of the aggregate.
 *
 * The number is the ledger's sequence (Q11) and the functional currency is the ledger's unit of account: the
 * entry knows `ledgerId`, not the ledger, so both arrive with the operation. `rates` carries one rate per
 * foreign currency present, chosen by the application from what the caller supplied; the aggregate decides
 * which of them a line needs and rejects the operation when one is missing.
 */
export interface JournalEntryPostContext {
  readonly number: number;
  readonly functionalCurrency: Currency;
  readonly rates: readonly ExchangeRate[];
}

/**
 * The complete header of a draft when it is edited. The four fields are required on purpose: there is no
 * "absent means keep", which is where a caller silently loses what it did not send.
 */
export interface JournalEntryHeaderInput {
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: AccountingDate;
  readonly description: string;
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
  readonly journalId?: string;
  readonly periodId?: string;
  readonly accountingDate?: AccountingDate;
  readonly description?: string;
}
