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
import { Accounts } from '../use-cases/accounts.js';
import { Entries } from '../use-cases/entries.js';
import { Journals } from '../use-cases/journals.js';
import { Periods } from '../use-cases/periods.js';

/**
 * Every use case of the module behind one object: the only public entry point of this layer.
 *
 * It is a composition, not a new layer on top: each method forwards to the static operation of the same
 * name and adds nothing — no validation, no state, no error translation. The four area classes are
 * internal to `use-cases/`, so the host never has to choose between eleven symbols.
 *
 * `#deps` is the reason this class is instantiable. The operations themselves are stateless: they receive
 * the dependencies as a parameter and group by area, so nothing about them needs an object. Binding the
 * deps once here is what makes the invariant true by construction — every method of this instance runs
 * inside the one `unitOfWork` the host provided, and no caller can hand any of them a different one.
 */
export class Accounting {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    return Accounts.register(this.#deps, input);
  }

  setAccountStatus(input: SetAccountStatusInput): Promise<SetAccountStatusResult> {
    return Accounts.setStatus(this.#deps, input);
  }

  registerJournal(input: RegisterJournalInput): Promise<RegisterJournalResult> {
    return Journals.register(this.#deps, input);
  }

  setJournalStatus(input: SetJournalStatusInput): Promise<SetJournalStatusResult> {
    return Journals.setStatus(this.#deps, input);
  }

  registerPeriod(input: RegisterPeriodInput): Promise<RegisterPeriodResult> {
    return Periods.register(this.#deps, input);
  }

  closePeriod(input: ClosePeriodInput): Promise<ClosePeriodResult> {
    return Periods.close(this.#deps, input);
  }

  createEntryDraft(input: CreateEntryDraftInput): Promise<EntryDraftResult> {
    return Entries.createDraft(this.#deps, input);
  }

  addEntryLine(input: AddEntryLineInput): Promise<EntryDraftResult> {
    return Entries.addLine(this.#deps, input);
  }

  removeEntryLine(input: RemoveEntryLineInput): Promise<EntryDraftResult> {
    return Entries.removeLine(this.#deps, input);
  }

  postEntry(input: PostEntryInput): Promise<PostEntryResult> {
    return Entries.post(this.#deps, input);
  }

  reversePostedEntry(input: ReversePostedEntryInput): Promise<ReversePostedEntryResult> {
    return Entries.reverse(this.#deps, input);
  }
}
