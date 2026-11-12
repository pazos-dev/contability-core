// Public surface of the application layer. Import from here, never from the internal files.
export { Accounting } from './accounting.js';
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
  AddEntryLineInput,
  CreateEntryDraftInput,
  EntryDraftResult,
  EntryLineInput,
  ClosePeriodResult,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RegisterAccountInput,
  RemoveEntryLineInput,
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
export { RegisterAccount, SetAccountStatus } from './use-cases/accounts/index.js';
export { RegisterJournal, SetJournalStatus } from './use-cases/journals/index.js';
export { ClosePeriod, RegisterPeriod } from './use-cases/periods/index.js';
export {
  AddEntryLine,
  CreateEntryDraft,
  PostEntry,
  RemoveEntryLine,
  ReversePostedEntry,
} from './use-cases/entries/index.js';
