import type { AccountStatus, AccountType } from '../../domain/account/index.js';
import type { JournalStatus } from '../../domain/journal/index.js';
import type { PeriodStatus } from '../../domain/period/index.js';

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
