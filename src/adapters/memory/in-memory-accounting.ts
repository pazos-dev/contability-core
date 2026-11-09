import type { Account } from '../../core/domain/account/index.js';
import type { JournalEntry } from '../../core/domain/entries/index.js';
import type { Journal } from '../../core/domain/journal/index.js';
import type { AccountingPeriod } from '../../core/domain/period/index.js';
import type {
  AccountRepository,
  IdempotencyRegistry,
  JournalRepository,
  LedgerDirectory,
  PeriodRepository,
  PostedMovementsQuery,
  StoredOperation,
  UnitOfWork,
  UnitOfWorkScope,
} from '../../core/application/ports/index.js';

/**
 * In-memory adapter for development and tests.
 *
 * It is not durable and it has no isolation: two concurrent `run` calls can interleave, and no
 * rollback survives the process. What it does model is the write discipline of the contract — a
 * failing unit of work restores the previous state of every store — and the placement of reads and
 * writes inside one transactional context.
 */

export interface InMemoryAccountingOptions {
  /** Ledger to chart of accounts map used by the `LedgerDirectory` port. */
  readonly chartOfAccountsByLedger?: Readonly<Record<string, string>>;
  /**
   * Testing seam: replaces any port of the default scope. Receives the scope that was just built so a
   * caller can delegate to the real repositories and only change one operation.
   */
  readonly overrides?: (defaults: UnitOfWorkScope) => Partial<UnitOfWorkScope>;
}

export interface InMemoryIdempotencyRecord {
  readonly ledgerId: string;
  readonly operation: string;
  readonly key: string;
  readonly fingerprint: string;
}

/** Read-only view of what the adapter holds, for composition checks and tests. */
export interface InMemorySnapshot {
  readonly accounts: readonly Account[];
  readonly journals: readonly Journal[];
  readonly periods: readonly AccountingPeriod[];
  readonly entries: readonly JournalEntry[];
  readonly idempotency: readonly InMemoryIdempotencyRecord[];
}

export interface InMemoryAccounting {
  readonly unitOfWork: UnitOfWork;
  snapshot(): InMemorySnapshot;
}

interface StoredIdempotency extends StoredOperation {
  readonly ledgerId: string;
  readonly operation: string;
  readonly key: string;
}

interface MemoryMaps {
  readonly accounts: Map<string, Account>;
  readonly journals: Map<string, Journal>;
  readonly periods: Map<string, AccountingPeriod>;
  readonly entries: Map<string, JournalEntry>;
  readonly idempotency: Map<string, StoredIdempotency>;
}

const SEPARATOR = '\u0000';

function pairKey(first: string, second: string): string {
  return `${first}${SEPARATOR}${second}`;
}

function tripleKey(first: string, second: string, third: string): string {
  return `${first}${SEPARATOR}${second}${SEPARATOR}${third}`;
}

function emptyMaps(): MemoryMaps {
  return {
    accounts: new Map(),
    journals: new Map(),
    periods: new Map(),
    entries: new Map(),
    idempotency: new Map(),
  };
}

function copyMaps(maps: MemoryMaps): MemoryMaps {
  return {
    accounts: new Map(maps.accounts),
    journals: new Map(maps.journals),
    periods: new Map(maps.periods),
    entries: new Map(maps.entries),
    idempotency: new Map(maps.idempotency),
  };
}

export function createInMemoryAccounting(options: InMemoryAccountingOptions = {}): InMemoryAccounting {
  const store: { maps: MemoryMaps } = { maps: emptyMaps() };
  const chartOfAccountsByLedger = options.chartOfAccountsByLedger ?? {};

  const ledgers: LedgerDirectory = {
    async chartOfAccountsIdOf(ledgerId) {
      return chartOfAccountsByLedger[ledgerId];
    },
  };

  const accounts: AccountRepository = {
    async findById(accountId) {
      return store.maps.accounts.get(accountId);
    },
    async findByCode(chartOfAccountsId, code) {
      for (const account of store.maps.accounts.values()) {
        if (account.chartOfAccountsId === chartOfAccountsId && account.code.value === code) return account;
      }
      return undefined;
    },
    async save(account) {
      store.maps.accounts.set(account.id, account);
    },
  };

  const journals: JournalRepository = {
    async findById(ledgerId, journalId) {
      return store.maps.journals.get(pairKey(ledgerId, journalId));
    },
    async findByCode(ledgerId, code) {
      for (const journal of store.maps.journals.values()) {
        if (journal.ledgerId === ledgerId && journal.code === code) return journal;
      }
      return undefined;
    },
    async save(journal) {
      store.maps.journals.set(pairKey(journal.ledgerId, journal.id), journal);
    },
  };

  const periods: PeriodRepository = {
    async findById(ledgerId, periodId) {
      return store.maps.periods.get(pairKey(ledgerId, periodId));
    },
    async findOverlapping(ledgerId, startDate, endDate) {
      return [...store.maps.periods.values()].filter(
        (period) =>
          period.ledgerId === ledgerId &&
          period.startDate.compare(endDate) <= 0 &&
          period.endDate.compare(startDate) >= 0,
      );
    },
    async save(period) {
      store.maps.periods.set(pairKey(period.ledgerId, period.id), period);
    },
  };

  const idempotency: IdempotencyRegistry = {
    async find(ledgerId, operation, key) {
      const stored = store.maps.idempotency.get(tripleKey(ledgerId, operation, key));
      return stored === undefined ? undefined : { fingerprint: stored.fingerprint, result: stored.result };
    },
    async record(ledgerId, operation, key, entry) {
      store.maps.idempotency.set(tripleKey(ledgerId, operation, key), { ledgerId, operation, key, ...entry });
    },
  };

  const postedMovements: PostedMovementsQuery = {
    async hasPostedLines(accountId) {
      for (const entry of store.maps.entries.values()) {
        if (entry.status === 'POSTED' && entry.lines.some((line) => line.accountId === accountId)) return true;
      }
      return false;
    },
  };

  const defaults: UnitOfWorkScope = { ledgers, accounts, journals, periods, idempotency, postedMovements };
  const scope: UnitOfWorkScope = { ...defaults, ...(options.overrides?.(defaults) ?? {}) };

  const unitOfWork: UnitOfWork = {
    async run(work) {
      const backup = copyMaps(store.maps);
      try {
        return await work(scope);
      } catch (error) {
        store.maps = backup;
        throw error;
      }
    },
  };

  return {
    unitOfWork,
    snapshot() {
      return {
        accounts: [...store.maps.accounts.values()],
        journals: [...store.maps.journals.values()],
        periods: [...store.maps.periods.values()],
        entries: [...store.maps.entries.values()],
        idempotency: [...store.maps.idempotency.values()].map(({ ledgerId, operation, key, fingerprint }) => ({
          ledgerId,
          operation,
          key,
          fingerprint,
        })),
      };
    },
  };
}
