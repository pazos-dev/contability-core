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
  RegisterAccountInput,
  RegisterAccountResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
} from './use-cases/accounts.js';
export type {
  AddEntryLineInput,
  CreateEntryDraftInput,
  EntryDraftResult,
  EntryLineInput,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
} from './use-cases/entries.js';
export type {
  RegisterJournalInput,
  RegisterJournalResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from './use-cases/journals.js';
export type {
  ClosePeriodInput,
  ClosePeriodResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
} from './use-cases/periods.js';
// The use case classes are internal on purpose: the package publishes `Accounting`, so a host never sees
// eleven symbols nor a per-operation surface. `accounting.ts` composes them, and the area modules under
// `use-cases/` are internal wiring for the facade, not part of the package surface.
