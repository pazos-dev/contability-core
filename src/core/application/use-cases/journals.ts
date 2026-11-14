import { Journal, type JournalStatus } from '../../domain/journal/index.js';
import * as errors from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './shared/index.js';

/** Serializable input of `registerJournal`. */
export interface RegisterJournalInput {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly code: string;
  readonly name: string;
  readonly idempotencyKey?: string;
}

export interface RegisterJournalResult {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly code: string;
  readonly status: JournalStatus;
}

/** Serializable input of `setJournalStatus`. */
export interface SetJournalStatusInput {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly status: JournalStatus;
}

export interface SetJournalStatusResult {
  readonly ledgerId: string;
  readonly journalId: string;
  readonly status: JournalStatus;
}

const REGISTER_OPERATION = 'registerJournal';

/**
 * Registers a journal inside its ledger. Code uniqueness is scoped by ledger (J03): the same code in
 * another ledger is a different journal.
 */
export class RegisterJournal {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: RegisterJournalInput): Promise<RegisterJournalResult> {
    const { ledgerId, journalId, code, name, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, journalId, code, name });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<RegisterJournalResult>(
        scope,
        REGISTER_OPERATION,
        ledgerId,
        idempotencyKey,
        fingerprint,
      );
      if (stored !== undefined) return stored;

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw errors.ledgerNotFound(ledgerId);

      if ((await scope.journals.findById(ledgerId, journalId)) !== undefined) {
        throw errors.journalAlreadyExists(journalId);
      }

      if ((await scope.journals.findByCode(ledgerId, code)) !== undefined) {
        throw errors.journalCodeDuplicate(ledgerId, code);
      }

      const journal = Journal.create({ id: journalId, ledgerId, code, name });
      const result: RegisterJournalResult = {
        ledgerId,
        journalId: journal.id,
        code: journal.code,
        status: journal.status,
      };

      await scope.journals.save(journal);
      await remember(scope, REGISTER_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/**
 * Activates or deactivates a journal. Deactivating keeps the journal and its history (J04) and never
 * touches the entries that reference it; reactivating returns it to ACTIVE (J06).
 */
export class SetJournalStatus {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: SetJournalStatusInput): Promise<SetJournalStatusResult> {
    const { ledgerId, journalId, status } = input;
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw errors.invalidApplicationInput('status', status);

    return this.#deps.unitOfWork.run(async (scope) => {
      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw errors.ledgerNotFound(ledgerId);

      const journal = await scope.journals.findById(ledgerId, journalId);
      if (journal === undefined) throw errors.journalNotFound(journalId);

      const next = status === 'INACTIVE' ? journal.deactivate() : journal.activate();
      await scope.journals.save(next);

      return { ledgerId, journalId: next.id, status: next.status };
    });
  }
}
