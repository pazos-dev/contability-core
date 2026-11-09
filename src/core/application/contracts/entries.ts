import type { EntryStatus, PostingSide } from '../../domain/entries/index.js';
import type { MoneyJSON } from '../../domain/money/index.js';

/** One line of a posted entry, already serializable. */
export interface PostedLineResult {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;
  readonly description?: string;
}

export interface PostEntryInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly idempotencyKey: string;
}

export interface PostEntryResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: EntryStatus;
  readonly accountingDate: string;
  readonly lines: readonly PostedLineResult[];
  readonly totalDebit: MoneyJSON;
  readonly totalCredit: MoneyJSON;
}

export interface ReversePostedEntryInput {
  readonly ledgerId: string;
  readonly originalEntryId: string;
  readonly reversalEntryId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description?: string;
  readonly idempotencyKey: string;
}

export interface ReversePostedEntryResult extends PostEntryResult {
  readonly reversalOfEntryId: string;
}

/** One line of a draft, as the caller supplies it. The amount uses the domain's `MoneyJSON`. */
export interface EntryLineInput {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;
  readonly description?: string;
}

export interface CreateEntryDraftInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly EntryLineInput[];
  readonly idempotencyKey?: string;
}

/**
 * A draft reports no totals: it may be empty or unbalanced, so a total is a posting notion.
 */
export interface CreateEntryDraftResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: 'DRAFT';
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly PostedLineResult[];
}
