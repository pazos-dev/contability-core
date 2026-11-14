import type { ApplicationDeps } from './ports/index.js';
import {
  RegisterAccount,
  SetAccountStatus,
  type RegisterAccountInput,
  type RegisterAccountResult,
  type SetAccountStatusInput,
  type SetAccountStatusResult,
} from './use-cases/accounts.js';
import {
  AddEntryLine,
  CreateEntryDraft,
  PostEntry,
  RemoveEntryLine,
  ReversePostedEntry,
  type AddEntryLineInput,
  type CreateEntryDraftInput,
  type EntryDraftResult,
  type PostEntryInput,
  type PostEntryResult,
  type RemoveEntryLineInput,
  type ReversePostedEntryInput,
  type ReversePostedEntryResult,
} from './use-cases/entries.js';
import {
  RegisterJournal,
  SetJournalStatus,
  type RegisterJournalInput,
  type RegisterJournalResult,
  type SetJournalStatusInput,
  type SetJournalStatusResult,
} from './use-cases/journals.js';
import {
  ClosePeriod,
  RegisterPeriod,
  type ClosePeriodInput,
  type ClosePeriodResult,
  type RegisterPeriodInput,
  type RegisterPeriodResult,
} from './use-cases/periods.js';

/**
 * Every use case of the module behind one object: the only public entry point of this layer.
 *
 * It is a composition, not a new layer on top: each method delegates to the class of the same name and
 * adds nothing — no validation, no state, no error translation. The eleven classes are internal to
 * `use-cases/`, so the host never has to choose between eleven symbols; keeping them separate is what lets
 * this object stay thin and each rule live with the class that owns it.
 *
 * The deps are shared, so every method still runs inside the one `unitOfWork` the host provided.
 */
export class Accounting {
  readonly #registerAccount: RegisterAccount;
  readonly #setAccountStatus: SetAccountStatus;
  readonly #registerJournal: RegisterJournal;
  readonly #setJournalStatus: SetJournalStatus;
  readonly #registerPeriod: RegisterPeriod;
  readonly #closePeriod: ClosePeriod;
  readonly #createEntryDraft: CreateEntryDraft;
  readonly #addEntryLine: AddEntryLine;
  readonly #removeEntryLine: RemoveEntryLine;
  readonly #postEntry: PostEntry;
  readonly #reversePostedEntry: ReversePostedEntry;

  constructor(deps: ApplicationDeps) {
    this.#registerAccount = new RegisterAccount(deps);
    this.#setAccountStatus = new SetAccountStatus(deps);
    this.#registerJournal = new RegisterJournal(deps);
    this.#setJournalStatus = new SetJournalStatus(deps);
    this.#registerPeriod = new RegisterPeriod(deps);
    this.#closePeriod = new ClosePeriod(deps);
    this.#createEntryDraft = new CreateEntryDraft(deps);
    this.#addEntryLine = new AddEntryLine(deps);
    this.#removeEntryLine = new RemoveEntryLine(deps);
    this.#postEntry = new PostEntry(deps);
    this.#reversePostedEntry = new ReversePostedEntry(deps);
  }

  registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    return this.#registerAccount.execute(input);
  }

  setAccountStatus(input: SetAccountStatusInput): Promise<SetAccountStatusResult> {
    return this.#setAccountStatus.execute(input);
  }

  registerJournal(input: RegisterJournalInput): Promise<RegisterJournalResult> {
    return this.#registerJournal.execute(input);
  }

  setJournalStatus(input: SetJournalStatusInput): Promise<SetJournalStatusResult> {
    return this.#setJournalStatus.execute(input);
  }

  registerPeriod(input: RegisterPeriodInput): Promise<RegisterPeriodResult> {
    return this.#registerPeriod.execute(input);
  }

  closePeriod(input: ClosePeriodInput): Promise<ClosePeriodResult> {
    return this.#closePeriod.execute(input);
  }

  createEntryDraft(input: CreateEntryDraftInput): Promise<EntryDraftResult> {
    return this.#createEntryDraft.execute(input);
  }

  addEntryLine(input: AddEntryLineInput): Promise<EntryDraftResult> {
    return this.#addEntryLine.execute(input);
  }

  removeEntryLine(input: RemoveEntryLineInput): Promise<EntryDraftResult> {
    return this.#removeEntryLine.execute(input);
  }

  postEntry(input: PostEntryInput): Promise<PostEntryResult> {
    return this.#postEntry.execute(input);
  }

  reversePostedEntry(input: ReversePostedEntryInput): Promise<ReversePostedEntryResult> {
    return this.#reversePostedEntry.execute(input);
  }
}
