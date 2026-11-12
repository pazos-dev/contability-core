import type { JournalEntry } from '../../core/domain/entries/index.js';
import type {
  AccountRepository,
  EntryRepository,
  IdempotencyRegistry,
  JournalRepository,
  LedgerDirectory,
  PeriodRepository,
  PostedMovementsQuery,
} from '../../core/application/ports/index.js';
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
export function createPorts(store: StoreHolder, chartOfAccountsByLedger: Readonly<Record<string, string>>) {
  const ledgers: LedgerDirectory = {
    async chartOfAccountsIdOf(ledgerId) {
      // Own properties only: a ledger id such as "constructor" must be unknown, not inherited.
      return Object.hasOwn(chartOfAccountsByLedger, ledgerId) ? chartOfAccountsByLedger[ledgerId] : undefined;
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

  return { ledgers, accounts, journals, periods, entries, idempotency, postedMovements };
}
