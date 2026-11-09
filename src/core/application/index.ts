// Public surface of the application layer. Import from here, never from the internal files.
export { ApplicationError } from './errors.js';
export type { ApplicationErrorCode } from './errors.js';
export type {
  AccountRepository,
  ApplicationDeps,
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
  RegisterAccountInput,
  RegisterAccountResult,
  RegisterJournalInput,
  RegisterJournalResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from './contracts/registration.js';
export { makeRegisterAccount } from './use-cases/register-account.js';
export type { RegisterAccount } from './use-cases/register-account.js';
export { makeSetAccountStatus } from './use-cases/set-account-status.js';
export type { SetAccountStatus } from './use-cases/set-account-status.js';
export { makeRegisterJournal } from './use-cases/register-journal.js';
export type { RegisterJournal } from './use-cases/register-journal.js';
export { makeSetJournalStatus } from './use-cases/set-journal-status.js';
export type { SetJournalStatus } from './use-cases/set-journal-status.js';
export { makeRegisterPeriod } from './use-cases/register-period.js';
export type { RegisterPeriod } from './use-cases/register-period.js';
