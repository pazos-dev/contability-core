// Public surface of the application layer. Import from here, never from the internal files.
export { Accounting } from './facade/accounting.js';
export { ApplicationError } from './errors.js';
export type { ApplicationErrorCode } from './errors.js';
export type {
  AccountRepository,
  ApplicationDeps,
  EntryNumberSequence,
  EntryRepository,
  IdempotencyRegistry,
  JournalRepository,
  LedgerRepository,
  PeriodRepository,
  PostedEntriesQuery,
  PostedMovementsQuery,
  UnitOfWork,
  UnitOfWorkScope,
} from './ports.js';
export type {
  AccountBalanceRow,
  AccountBalancesInput,
  AccountBalancesResult,
  AccountMovementRow,
  AccountMovementsInput,
  AccountMovementsResult,
  AddEntryLineInput,
  ChangeEntryHeaderInput,
  ClosePeriodInput,
  ClosePeriodResult,
  CreateEntryDraftInput,
  EntryDraftResult,
  EntryLineInput,
  ExchangeRateInput,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisterJournalInput,
  RegisterJournalResult,
  RegisterLedgerInput,
  RegisterLedgerResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
  SetLedgerStatusInput,
  SetLedgerStatusResult,
  StoredOperation,
  TrialBalanceResult,
} from './dto.js';
// The use case classes are internal on purpose: the package publishes `Accounting`, so a host never sees
// seventeen symbols nor a per-operation surface. `accounting.ts` composes them, and the area modules under
// `use-cases/` are internal wiring for the facade, not part of the package surface.
