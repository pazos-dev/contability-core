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
  AddEntryLineInput,
  ClosePeriodInput,
  ClosePeriodResult,
  CreateEntryDraftInput,
  EntryDraftResult,
  EntryLineInput,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisterJournalInput,
  RegisterJournalResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from './use-cases/contracts.js';
// The use case classes are internal on purpose: the package publishes `Accounting`, so a host never sees
// eleven symbols nor a per-operation surface. `accounting.ts` composes them, and the area modules under
// `use-cases/` are internal wiring for the facade, not part of the package surface.
