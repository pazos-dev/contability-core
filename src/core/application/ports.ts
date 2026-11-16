import type { Account } from '../domain/account/index.js';
import type { JournalEntry } from '../domain/entries/index.js';
import type { Journal } from '../domain/journal/index.js';
import type { Ledger } from '../domain/ledger/index.js';
import type { AccountingDate, AccountingPeriod } from '../domain/period/index.js';
import type { StoredOperation } from './dto.js';

/**
 * The ledger is the accounting scope and the owner of its chart of accounts. The application layer never
 * accepts a chart of accounts from the caller (Q07): it resolves the ledger and reads the chart from it.
 * A ledger that was never registered is indistinguishable from a missing one.
 */
export interface LedgerRepository {
  findById(ledgerId: string): Promise<Ledger | undefined>;
  save(ledger: Ledger): Promise<void>;
}

/** Accounts are global by id; code uniqueness is scoped by chart of accounts. */
export interface AccountRepository {
  findById(accountId: string): Promise<Account | undefined>;
  findByCode(chartOfAccountsId: string, code: string): Promise<Account | undefined>;
  /**
   * Every account of one chart of accounts.
   *
   * It lives here and not in a port of its own because the shape of the read decides where a port goes: a
   * read is separated when it is ranged, paginated or bulk output, and enumerating a chart is none of
   * those. The account already owns `chartOfAccountsId`, and two ports over accounts would force the host
   * to keep two coherent implementations — the duplication `LedgerDirectory` was removed to avoid.
   */
  findByChart(chartOfAccountsId: string): Promise<readonly Account[]>;
  save(account: Account): Promise<void>;
}

/** Journals are scoped by ledger: an id of another ledger is indistinguishable from a missing one. */
export interface JournalRepository {
  findById(ledgerId: string, journalId: string): Promise<Journal | undefined>;
  findByCode(ledgerId: string, code: string): Promise<Journal | undefined>;
  save(journal: Journal): Promise<void>;
}

/** Periods are scoped by ledger; overlap is a question over a date range, not over one period. */
export interface PeriodRepository {
  findById(ledgerId: string, periodId: string): Promise<AccountingPeriod | undefined>;
  findOverlapping(
    ledgerId: string,
    startDate: AccountingDate,
    endDate: AccountingDate,
  ): Promise<readonly AccountingPeriod[]>;
  save(period: AccountingPeriod): Promise<void>;
}

/** Entries are scoped by ledger: an id of another ledger is indistinguishable from a missing one. */
export interface EntryRepository {
  findById(ledgerId: string, entryId: string): Promise<JournalEntry | undefined>;
  /**
   * Every entry of this ledger that reverses the given original, in any status.
   *
   * A list, never a single entry: a reversal draft and a posted reversal of the same original can
   * coexist, so answering with the first match in whatever order the storage returns lets one hide the
   * other. Which of them count as an existing reversal is decided by the rule that asks, not by storage.
   */
  findReversalsOf(ledgerId: string, originalEntryId: string): Promise<readonly JournalEntry[]>;
  save(entry: JournalEntry): Promise<void>;
}

/**
 * Sequential entry numbers, per ledger (Q11).
 *
 * The scope is the ledger: two ledgers may both have entry number 1, because a number identifies an entry
 * inside its book and nothing else. The counter lives on the host's side because a sequence is storage:
 * this repository asks for the next number and never keeps one.
 *
 * Gaps are allowed — a number asked for and not saved because the operation failed leaves a hole — and
 * duplicates are not: the host closes that window with a unique constraint over `(ledgerId, number)`, the
 * same division as with entry ids and with the single-reversal rule.
 */
export interface EntryNumberSequence {
  nextNumber(ledgerId: string): Promise<number>;
}

/**
 * Idempotency is isolated by ledger and by operation, never by key alone.
 *
 * `record` and `find` copy the result in and out, as a durable registry that serializes it to a row
 * does: the object the caller receives is never the object stored, so mutating a result — which
 * `readonly` only forbids at compile time — cannot rewrite what a later replay answers.
 */
export interface IdempotencyRegistry {
  find(ledgerId: string, operation: string, key: string): Promise<StoredOperation | undefined>;
  record(ledgerId: string, operation: string, key: string, entry: StoredOperation): Promise<void>;
}

/**
 * Cross-entity question about posted entries. It exists so the account rules can ask whether an
 * account already carries movements without the account use case knowing about entries.
 */
export interface PostedMovementsQuery {
  hasPostedLines(accountId: string): Promise<boolean>;
}

/**
 * Paged read of the posted entries of a ledger, for the reports.
 *
 * It returns POSTED entries with their lines and never aggregates: the trial balance and the single
 * currency rule are invariants of the core, so a port that returned totals would move both out of it
 * (rule 15). Only `POSTED` entries belong to a report — a draft is not an accounting fact — and a reversal
 * is one more entry, never a reason to hide the one it reverses.
 *
 * `from` and `to` are inclusive on the accounting date and optional; an absent one is unbounded, which is
 * not the same as an empty range. The order inside a page is not part of the contract: the core orders the
 * result, so the host only has to return every matching entry exactly once while the cursor advances.
 */
export interface PostedEntriesQuery {
  findPostedMovements(
    ledgerId: string,
    criteria: {
      readonly from?: AccountingDate;
      readonly to?: AccountingDate;
      readonly accountId?: string;
    },
    page: { readonly limit: number; readonly cursor?: string },
  ): Promise<{ readonly entries: readonly JournalEntry[]; readonly nextCursor: string | null }>;
}

/**
 * One transactional context. Repositories are reachable only from its scope, so a use case cannot
 * open an independent connection and call it a unit of work.
 */
export interface UnitOfWorkScope {
  readonly ledgers: LedgerRepository;
  readonly accounts: AccountRepository;
  readonly journals: JournalRepository;
  readonly periods: PeriodRepository;
  readonly entries: EntryRepository;
  readonly idempotency: IdempotencyRegistry;
  readonly entryNumbers: EntryNumberSequence;
  readonly postedMovements: PostedMovementsQuery;
  readonly postedEntries: PostedEntriesQuery;
}

export interface UnitOfWork {
  run<T>(work: (scope: UnitOfWorkScope) => Promise<T>): Promise<T>;
}

/** Dependencies of every use case of this increment. */
export interface ApplicationDeps {
  readonly unitOfWork: UnitOfWork;
}
