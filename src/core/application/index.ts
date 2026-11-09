// Public surface of the application layer. Import from here, never from the internal files.
export { ApplicationError } from './errors.js';
export type { ApplicationErrorCode } from './errors.js';
export type {
  AccountRepository,
  ApplicationDeps,
  EntryRepository,
  IdempotencyRegistry,
  JournalRepository,
  LedgerDirectory,
  PeriodRepository,
  PostedMovementsQuery,
  StoredOperation,
  UnitOfWork,
  UnitOfWorkScope,
} from './ports/index.js';
export type {
  ClosePeriodInput,
  ClosePeriodResult,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisterJournalInput,
  RegisterJournalResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from './contracts/index.js';
export { makeRegisterAccount, makeSetAccountStatus } from './use-cases/accounts/index.js';
export type { RegisterAccount, SetAccountStatus } from './use-cases/accounts/index.js';
export { makeRegisterJournal, makeSetJournalStatus } from './use-cases/journals/index.js';
export type { RegisterJournal, SetJournalStatus } from './use-cases/journals/index.js';
export { makeClosePeriod, makeRegisterPeriod } from './use-cases/periods/index.js';
export type { ClosePeriod, RegisterPeriod } from './use-cases/periods/index.js';
export { makePostEntry, makeReversePostedEntry } from './use-cases/entries/index.js';
export type { PostEntry, ReversePostedEntry } from './use-cases/entries/index.js';
