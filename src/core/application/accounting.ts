import type {
  RegisterAccountInput,
  RegisterAccountResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
} from './contracts/index.js';
import type {
  RegisterJournalInput,
  RegisterJournalResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from './contracts/index.js';
import type {
  ClosePeriodInput,
  ClosePeriodResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
} from './contracts/index.js';
import type {
  AddEntryLineInput,
  CreateEntryDraftInput,
  EntryDraftResult,
  PostEntryInput,
  PostEntryResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
} from './contracts/index.js';
import type { ApplicationDeps } from './ports/index.js';
import { RegisterAccount, SetAccountStatus } from './use-cases/accounts/index.js';
import {
  AddEntryLine,
  CreateEntryDraft,
  PostEntry,
  RemoveEntryLine,
  ReversePostedEntry,
} from './use-cases/entries/index.js';
import { RegisterJournal, SetJournalStatus } from './use-cases/journals/index.js';
import { ClosePeriod, RegisterPeriod } from './use-cases/periods/index.js';

/**
 * Every use case of the module behind one object, for a host that uses all of them.
 *
 * It is a composition, not a new layer on top: each method delegates to the class of the same name and
 * adds nothing — no validation, no state, no error translation. A host that needs a single operation
 * instantiates that class directly (`new PostEntry(deps)`), which is also the cheaper thing to test; the
 * facade exists so the common case does not need eleven constructors at the call site.
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
