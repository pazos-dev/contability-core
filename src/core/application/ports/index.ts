import type { Account } from '../../domain/account/index.js';
import type { JournalEntry } from '../../domain/entries/index.js';
import type { Journal } from '../../domain/journal/index.js';
import type { AccountingDate, AccountingPeriod } from '../../domain/period/index.js';

/**
 * Relation between a ledger and its chart of accounts. The application layer never accepts a chart
 * of accounts from the caller: the ledger owns the relation (Q07), so a host cannot declare one.
 */
export interface LedgerDirectory {
  chartOfAccountsIdOf(ledgerId: string): Promise<string | undefined>;
}

/** Accounts are global by id; code uniqueness is scoped by chart of accounts. */
export interface AccountRepository {
  findById(accountId: string): Promise<Account | undefined>;
  findByCode(chartOfAccountsId: string, code: string): Promise<Account | undefined>;
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
 * What a repeated request is matched against: a fingerprint of every field of the request except the
 * key, plus the result that request produced. A fingerprint over the entity identity alone would make
 * a changed payload look like a replay.
 */
export interface StoredOperation {
  readonly fingerprint: string;
  readonly result: unknown;
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
 * One transactional context. Repositories are reachable only from its scope, so a use case cannot
 * open an independent connection and call it a unit of work.
 */
export interface UnitOfWorkScope {
  readonly ledgers: LedgerDirectory;
  readonly accounts: AccountRepository;
  readonly journals: JournalRepository;
  readonly periods: PeriodRepository;
  readonly entries: EntryRepository;
  readonly idempotency: IdempotencyRegistry;
  readonly postedMovements: PostedMovementsQuery;
}

export interface UnitOfWork {
  run<T>(work: (scope: UnitOfWorkScope) => Promise<T>): Promise<T>;
}

/** Dependencies of every use case of this increment. */
export interface ApplicationDeps {
  readonly unitOfWork: UnitOfWork;
}
