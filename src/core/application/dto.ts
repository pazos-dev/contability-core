import type { AccountStatus, AccountType } from '../domain/account/index.js';
import type { EntryStatus, PostingSide } from '../domain/entries/index.js';
import type { JournalStatus } from '../domain/journal/index.js';
import type { LedgerStatus } from '../domain/ledger/index.js';
import type { PeriodStatus } from '../domain/period/index.js';
import type { CurrencyJSON, MoneyJSON } from '../domain/shared/money/index.js';

/**
 * Data shapes of this layer: the inputs and outputs of every use case, plus the record the idempotency port
 * stores.
 *
 * They are data, not implementation: serializable values that cross the boundary with the host. The module is
 * named `dto` like every other data module of the project, and it holds no behaviour contracts — those live in
 * `ports/`. That separation is why `StoredOperation` is here and not beside the idempotency registry interface.
 * Keeping the shapes in one module leaves each area file to be read as behaviour, and gives the barrel a
 * single place to re-export the surface from. Domain instances never appear in these shapes: `Money` travels
 * as `MoneyJSON`.
 */

// ── Ledgers ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Serializable input of `registerLedger`. The ledger id is chosen by the caller, like every id of this
 * module: the core never invents one. The chart of accounts is an opaque identifier of the host (Q07).
 * The functional currency travels as `CurrencyJSON` because the scale is part of currency identity and is
 * persisted with the amount rather than deduced from the code (Q08).
 */
export interface RegisterLedgerInput {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly currency: CurrencyJSON;
  readonly idempotencyKey?: string;
}

export interface RegisterLedgerResult {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly currency: CurrencyJSON;
  readonly status: LedgerStatus;
}

/** No idempotency key on purpose: repeating the current status is a no-op by construction. */
export interface SetLedgerStatusInput {
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

export interface SetLedgerStatusResult {
  readonly ledgerId: string;
  readonly status: LedgerStatus;
}

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

// ── Reports ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Serializable input of the two balance reports. `from` and `to` are YYYY-MM-DD and inclusive on the
 * accounting date; an absent one means unbounded, which the result reports as `null`.
 */
export interface AccountBalancesInput {
  readonly ledgerId: string;
  readonly from?: string;
  readonly to?: string;
}

/**
 * One account of the ledger's chart with what moved through it in the range.
 *
 * `balance` is signed —debit minus credit— so a consumer does not have to know the account type to read
 * it, and `side` states the same fact for whoever only needs the side. All three amounts travel as
 * `MoneyJSON` in the ledger's currency: the scale is part of currency identity and is never deduced from
 * the code.
 */
export interface AccountBalanceRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly debit: MoneyJSON;
  readonly credit: MoneyJSON;
  readonly balance: MoneyJSON;
  readonly side: 'DEBIT' | 'CREDIT' | 'ZERO';
}

/**
 * Rows only: a balance per account does not assert that the books agree, so this result carries no
 * `totals` and no `balanced` (rule 18).
 */
export interface AccountBalancesResult {
  readonly ledgerId: string;
  readonly currency: CurrencyJSON;
  readonly from: string | null;
  readonly to: string | null;
  readonly rows: readonly AccountBalanceRow[];
}

/**
 * The same rows as `accountBalances`, for the same input, plus the general totals and the check: there is
 * no second calculation, there is a second contract. A balance that does not agree is not an error —
 * `balanced: false` with the totals is what lets the caller find the difference.
 */
export interface TrialBalanceResult {
  readonly ledgerId: string;
  readonly currency: CurrencyJSON;
  readonly from: string | null;
  readonly to: string | null;
  readonly rows: readonly AccountBalanceRow[];
  readonly totals: { readonly debit: MoneyJSON; readonly credit: MoneyJSON };
  readonly balanced: boolean;
}

// ── Idempotency ───────────────────────────────────────────────────────────────────────────────────────

/**
 * What a repeated request is matched against: a fingerprint of every field of the request except the key, plus
 * the result that request produced. A fingerprint over the entity identity alone would make a changed payload
 * look like a replay.
 */
export interface StoredOperation {
  readonly fingerprint: string;
  readonly result: unknown;
}
