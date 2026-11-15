import type { Account } from '../../../domain/account/index.js';
import type { JournalEntry } from '../../../domain/entries/index.js';
import type { Journal } from '../../../domain/journal/index.js';
import type { Ledger } from '../../../domain/ledger/index.js';
import type { AccountingDate, AccountingPeriod } from '../../../domain/period/index.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions shared by the use cases of this layer.
 *
 * A rule lives in `use-cases/<area>/rules.ts` — the area that decides it — and moves here only when two or
 * more areas invoke it. The name is the same in both places because the nature is the same: `rules`, like
 * `dto` or `result`, never `guards` for one and `rules` for the other.
 *
 * Each rule either returns the value the next rule needs or throws the error of that rule, so a use case
 * reads like its specification: the rules appear in the order the spec numbers them, and that order is part
 * of the contract — with two invalid conditions at once, the lower-numbered rule wins.
 *
 * A declarative table of rules was considered and rejected. These rules are heterogeneous: some need a value
 * computed by an earlier rule, some await two reads, and each throws a different error with a different
 * payload. An array of predicates would hide the order and the payloads behind closures, and the lightest
 * thing that removes the repetition is one named function per rule.
 */

/**
 * The ledger exists and is active. Absent is `LEDGER_NOT_FOUND`, inactive is `LEDGER_INACTIVE` (R6):
 * a status that still allowed writes would not mean anything, so every write of the module passes here.
 *
 * This is the first rule of every use case, in the place where the chart of accounts used to be resolved:
 * the ledger is the scope that gives the rest of the entities their meaning.
 */
export async function requireActiveLedger(scope: UnitOfWorkScope, ledgerId: string): Promise<Ledger> {
  const ledger = await scope.ledgers.findById(ledgerId);
  if (ledger === undefined) throw errors.ledgerNotFound(ledgerId);
  if (ledger.status !== 'ACTIVE') throw errors.ledgerInactive(ledgerId);
  return ledger;
}

/**
 * The ledger resolves its chart of accounts (Q07), after the ledger itself is known to be active.
 *
 * The ledger is the only source of that relation since `chartOfAccountsByLedger` disappeared from the
 * adapter: a ledger that nobody registered cannot be operated on, not even by configuration.
 */
export async function requireChartOfAccountsId(scope: UnitOfWorkScope, ledgerId: string): Promise<string> {
  return (await requireActiveLedger(scope, ledgerId)).chartOfAccountsId;
}

/** The entry exists in this ledger; an id of another ledger is indistinguishable from a missing one. */
export async function requireEntry(
  scope: UnitOfWorkScope,
  ledgerId: string,
  entryId: string,
): Promise<JournalEntry> {
  const entry = await scope.entries.findById(ledgerId, entryId);
  if (entry === undefined) throw errors.entryNotFound(entryId);
  return entry;
}

/** The id must be free: the save is an upsert, so reusing it would overwrite a stored entry. */
export async function requireFreeEntryId(
  scope: UnitOfWorkScope,
  ledgerId: string,
  entryId: string,
): Promise<void> {
  if ((await scope.entries.findById(ledgerId, entryId)) !== undefined) throw errors.entryAlreadyExists(entryId);
}

/**
 * The journal exists in this ledger, whatever its status: a draft may point to a journal that is not active
 * yet, and only posting requires the active one.
 */
export async function requireJournal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<Journal> {
  const journal = await scope.journals.findById(ledgerId, journalId);
  if (journal === undefined) throw errors.journalNotFound(journalId);
  return journal;
}

/** The journal exists in this ledger and is active: deactivated journals reject postings (J05). */
export async function requireActiveJournal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<Journal> {
  const journal = await requireJournal(scope, ledgerId, journalId);
  if (journal.status !== 'ACTIVE') throw errors.journalInactive(journalId);
  return journal;
}

/**
 * The period exists in this ledger, whatever its status: a draft may point to a period that is not open yet,
 * and only posting requires the open one.
 */
export async function requirePeriod(
  scope: UnitOfWorkScope,
  ledgerId: string,
  periodId: string,
): Promise<AccountingPeriod> {
  const period = await scope.periods.findById(ledgerId, periodId);
  if (period === undefined) throw errors.periodNotFound(periodId);
  return period;
}

/**
 * The destination period is open and contains the date. The id alone does not prove the date belongs to
 * it, so both are checked together (P05).
 */
export async function requireOpenPeriodContaining(
  scope: UnitOfWorkScope,
  ledgerId: string,
  periodId: string,
  accountingDate: AccountingDate,
): Promise<AccountingPeriod> {
  const period = await requirePeriod(scope, ledgerId, periodId);
  if (period.status !== 'OPEN') throw errors.periodClosed(periodId);
  if (!period.contains(accountingDate)) throw errors.periodDateOutside(periodId, accountingDate.value);
  return period;
}

/** The account exists and belongs to the plan of this ledger. */
export async function requireAccountOfPlan(
  scope: UnitOfWorkScope,
  accountId: string,
  chartOfAccountsId: string,
): Promise<Account> {
  const account = await scope.accounts.findById(accountId);
  // An account of another plan is reported as unavailable: the ledger isolation outweighs the diagnosis.
  if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) throw errors.accountNotFound(accountId);
  return account;
}

/** The account exists in the plan, is active and admits postings (A06). */
export async function requirePostableAccount(
  scope: UnitOfWorkScope,
  accountId: string,
  chartOfAccountsId: string,
): Promise<Account> {
  const account = await requireAccountOfPlan(scope, accountId, chartOfAccountsId);
  if (account.status !== 'ACTIVE') throw errors.accountInactive(accountId);
  if (!account.postingAllowed) throw errors.accountNotPostable(accountId);
  return account;
}
