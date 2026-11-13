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
// The use case classes are internal on purpose: the package publishes `Accounting`, so a host never sees
// eleven symbols nor a per-operation surface. `accounting.ts` composes them, and the area barrels under
// `use-cases/` are internal wiring for the facade, not part of the package surface.
