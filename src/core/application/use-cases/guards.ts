import type { Account } from '../../domain/account/index.js';
import type { JournalEntry } from '../../domain/entries/index.js';
import type { Journal } from '../../domain/journal/index.js';
import type { AccountingDate, AccountingPeriod } from '../../domain/period/index.js';
import * as errors from '../errors.js';
import type { UnitOfWorkScope } from '../ports/index.js';

/**
 * Preconditions shared by the use cases of this layer.
 *
 * Each guard either returns the value the next rule needs or throws the error of that rule, so a use case
 * reads like its specification: the guards appear in the order the spec numbers its rules, and that order is
 * part of the contract — with two invalid conditions at once, the lower-numbered rule wins.
 *
 * A declarative table of rules was considered and rejected. These rules are heterogeneous: some need a value
 * computed by an earlier rule, some await two reads, and each throws a different error with a different
 * payload. An array of predicates would hide the order and the payloads behind closures, and the lightest
 * thing that removes the repetition is one named guard per rule.
 */

/** The ledger resolves its chart of accounts (Q07). Absent ledger is `LEDGER_NOT_FOUND`. */
export async function requireChartOfAccountsId(scope: UnitOfWorkScope, ledgerId: string): Promise<string> {
  const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
  if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);
  return chartOfAccountsId;
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

/** The journal exists in this ledger and is active: deactivated journals reject postings (J05). */
export async function requireActiveJournal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<Journal> {
  const journal = await scope.journals.findById(ledgerId, journalId);
  if (journal === undefined) throw errors.journalNotFound(journalId);
  if (journal.status !== 'ACTIVE') throw errors.journalInactive(journalId);
  return journal;
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
  const period = await scope.periods.findById(ledgerId, periodId);
  if (period === undefined) throw errors.periodNotFound(periodId);
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
