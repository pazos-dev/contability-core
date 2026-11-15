import type { Account } from '../../core/domain/account/index.js';
import type { JournalEntry } from '../../core/domain/entries/index.js';
import type {
  AccountRepository,
  EntryRepository,
  IdempotencyRegistry,
  JournalRepository,
  LedgerRepository,
  PeriodRepository,
  PostedEntriesQuery,
  PostedMovementsQuery,
} from '../../core/application/ports.js';
import { copyResult, keyOf, type MemoryMaps } from './store.js';

/** The store holder exists so a failing unit of work can swap the whole set of maps at once. */
export interface StoreHolder {
  maps: MemoryMaps;
}

/**
 * Builds every port over the given store.
 *
 * Ledger scoping is done by the key, not by a filter: `journals.findById(ledger, id)` builds a key from
 * both, so an id of another ledger simply does not exist here.
 */
export function createPorts(store: StoreHolder) {
  const ledgers: LedgerRepository = {
    async findById(ledgerId) {
      // Own keys only: a ledger id such as "constructor" must be unknown, not inherited.
      return store.maps.ledgers.get(ledgerId);
    },
    async save(ledger) {
      store.maps.ledgers.set(ledger.id, ledger);
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
    async findByChart(chartOfAccountsId) {
      const found: Account[] = [];
      for (const account of store.maps.accounts.values()) {
        if (account.chartOfAccountsId === chartOfAccountsId) found.push(account);
      }
      return found;
    },
    async save(account) {
      store.maps.accounts.set(account.id, account);
    },
  };

  const journals: JournalRepository = {
    async findById(ledgerId, journalId) {
      return store.maps.journals.get(keyOf(ledgerId, journalId));
    },
    async findByCode(ledgerId, code) {
      for (const journal of store.maps.journals.values()) {
        if (journal.ledgerId === ledgerId && journal.code === code) return journal;
      }
      return undefined;
    },
    async save(journal) {
      store.maps.journals.set(keyOf(journal.ledgerId, journal.id), journal);
    },
  };

  const periods: PeriodRepository = {
    async findById(ledgerId, periodId) {
      return store.maps.periods.get(keyOf(ledgerId, periodId));
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
      store.maps.periods.set(keyOf(period.ledgerId, period.id), period);
    },
  };

  const entries: EntryRepository = {
    async findById(ledgerId, entryId) {
      return store.maps.entries.get(keyOf(ledgerId, entryId));
    },
    async findReversalsOf(ledgerId, originalEntryId) {
      const reversals: JournalEntry[] = [];
      for (const entry of store.maps.entries.values()) {
        if (entry.ledgerId === ledgerId && entry.reversalOfEntryId === originalEntryId) reversals.push(entry);
      }
      return reversals;
    },
    async save(entry) {
      store.maps.entries.set(keyOf(entry.ledgerId, entry.id), entry);
    },
  };

  const idempotency: IdempotencyRegistry = {
    async find(ledgerId, operation, key) {
      const stored = store.maps.idempotency.get(keyOf(ledgerId, operation, key));
      if (stored === undefined) return undefined;
      return { fingerprint: stored.fingerprint, result: copyResult(stored.result) };
    },
    async record(ledgerId, operation, key, entry) {
      // The result is copied in, not referenced: the caller keeps the object it received and may mutate
      // it, and a replay must still answer what the operation produced.
      store.maps.idempotency.set(keyOf(ledgerId, operation, key), {
        ledgerId,
        operation,
        key,
        fingerprint: entry.fingerprint,
        result: copyResult(entry.result),
      });
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

  /**
   * Paged read over the entries map: it filters by ledger, status, inclusive dates and account, sorts so the
   * pages partition the result, and returns the window the cursor points at. The cursor is an offset, which
   * is opaque to the caller and only has to be stable while the same read is drained.
   */
  const postedEntries: PostedEntriesQuery = {
    async findPostedMovements(ledgerId, criteria, page) {
      const matching: JournalEntry[] = [];
      for (const entry of store.maps.entries.values()) {
        if (entry.ledgerId !== ledgerId || entry.status !== 'POSTED') continue;
        if (criteria.from !== undefined && entry.accountingDate.compare(criteria.from) < 0) continue;
        if (criteria.to !== undefined && entry.accountingDate.compare(criteria.to) > 0) continue;
        if (
          criteria.accountId !== undefined &&
          !entry.lines.some((line) => line.accountId === criteria.accountId)
        ) {
          continue;
        }
        matching.push(entry);
      }

      // `entryId` is unique inside its ledger, so date plus id is a total order and the pages never overlap.
      matching.sort(
        (left, right) =>
          left.accountingDate.compare(right.accountingDate) ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      );

      const offset = offsetOf(page.cursor);
      const window = matching.slice(offset, offset + page.limit);
      const next = offset + window.length;

      return {
        entries: window,
        // An empty window proves nothing follows, whatever the limit: the drain cannot loop on the page alone.
        nextCursor: window.length === 0 || next >= matching.length ? null : String(next),
      };
    },
  };

  return { ledgers, accounts, journals, periods, entries, idempotency, postedMovements, postedEntries };
}

/** A cursor this adapter did not produce starts at the beginning instead of throwing at the caller. */
function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = Number(cursor);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}
