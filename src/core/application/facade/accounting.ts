import type { ApplicationDeps } from '../ports.js';
import type {
  AddEntryLineInput,
  ClosePeriodInput,
  ClosePeriodResult,
  CreateEntryDraftInput,
  EntryDraftResult,
  PostEntryInput,
  PostEntryResult,
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
} from '../dto.js';
import { RegisterAccount } from '../use-cases/accounts/register-account.js';
import { SetAccountStatus } from '../use-cases/accounts/set-account-status.js';
import { AddEntryLine } from '../use-cases/entries/add-entry-line.js';
import { CreateEntryDraft } from '../use-cases/entries/create-entry-draft.js';
import { PostEntry } from '../use-cases/entries/post-entry.js';
import { RemoveEntryLine } from '../use-cases/entries/remove-entry-line.js';
import { ReversePostedEntry } from '../use-cases/entries/reverse-posted-entry.js';
import { RegisterJournal } from '../use-cases/journals/register-journal.js';
import { SetJournalStatus } from '../use-cases/journals/set-journal-status.js';
import { ClosePeriod } from '../use-cases/periods/close-period.js';
import { RegisterPeriod } from '../use-cases/periods/register-period.js';

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
