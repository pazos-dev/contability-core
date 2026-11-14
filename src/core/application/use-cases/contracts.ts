import type { AccountStatus, AccountType } from '../../domain/account/index.js';
import type { EntryStatus, PostingSide } from '../../domain/entries/index.js';
import type { JournalStatus } from '../../domain/journal/index.js';
import type { MoneyJSON } from '../../domain/money/index.js';
import type { PeriodStatus } from '../../domain/period/index.js';

/**
 * Inputs and outputs of every use case of this layer, in one module.
 *
 * They are contracts, not implementation: serializable data that crosses the boundary with the host. Keeping
 * them here leaves each area file to be read as behaviour, and gives the barrel a single place to re-export
 * the surface from. Domain instances never appear in these shapes: `Money` travels as `MoneyJSON`.
 */

// ── Accounts ─────────────────────────────────────────────────────────────────────────────────────────

/** Serializable input of `registerAccount`: text and booleans only, no domain instances. */
export interface RegisterAccountInput {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId?: string;
  readonly postingAllowed: boolean;
  readonly idempotencyKey?: string;
}

export interface RegisterAccountResult {
  readonly ledgerId: string;
  readonly chartOfAccountsId: string;
  readonly accountId: string;
  readonly code: string;
  readonly status: AccountStatus;
}

/** Serializable input of `setAccountStatus`. */
export interface SetAccountStatusInput {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly status: AccountStatus;
}

export interface SetAccountStatusResult {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly status: AccountStatus;
}

// ── Journals ─────────────────────────────────────────────────────────────────────────────────────────

/** Serializable input of `registerJournal`. */
export interface RegisterJournalInput {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly code: string;
  readonly name: string;
  readonly idempotencyKey?: string;
}

export interface RegisterJournalResult {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly code: string;
  readonly status: JournalStatus;
}

/** Serializable input of `setJournalStatus`. */
export interface SetJournalStatusInput {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly status: JournalStatus;
}

export interface SetJournalStatusResult {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly status: JournalStatus;
}

// ── Periods ──────────────────────────────────────────────────────────────────────────────────────────

/** Serializable input of `registerPeriod`; dates travel as YYYY-MM-DD text. */
export interface RegisterPeriodInput {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly idempotencyKey?: string;
}

export interface RegisterPeriodResult {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: PeriodStatus;
}

export interface ClosePeriodInput {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly idempotencyKey: string;
}

export interface ClosePeriodResult {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly status: 'CLOSED';
}

// ── Entries ──────────────────────────────────────────────────────────────────────────────────────────

/** One line of an entry, already serializable. */
export interface PostedLineResult {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;
  readonly description?: string;
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

export interface AddEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly line: EntryLineInput;
  readonly idempotencyKey?: string;
}

export interface RemoveEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly lineId: string;
  readonly idempotencyKey?: string;
}

/**
 * A draft reports no totals: it may be empty or unbalanced, so a total is a posting notion.
 * It is also the result of every draft edit: the draft as it stands after the operation.
 */
export interface EntryDraftResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: 'DRAFT';
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly PostedLineResult[];
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
