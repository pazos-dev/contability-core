import { Journal } from '../../../domain/journal/index.js';
import type { RegisterJournalInput, RegisterJournalResult } from '../../contracts/journals.js';
import { journalAlreadyExists, journalCodeDuplicate, ledgerNotFound } from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/idempotency.js';

const OPERATION = 'registerJournal';

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
      const stored = await replay<RegisterJournalResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      if ((await scope.journals.findById(ledgerId, journalId)) !== undefined) throw journalAlreadyExists(journalId);

      if ((await scope.journals.findByCode(ledgerId, code)) !== undefined) throw journalCodeDuplicate(ledgerId, code);

      const journal = Journal.create({ id: journalId, ledgerId, code, name });
      const result: RegisterJournalResult = {
        ledgerId,
        journalId: journal.id,
        code: journal.code,
        status: journal.status,
      };

      await scope.journals.save(journal);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}
