import type { SetJournalStatusInput, SetJournalStatusResult } from '../../contracts/journals.js';
import { invalidApplicationInput, journalNotFound, ledgerNotFound } from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';

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
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw invalidApplicationInput('status', status);

    return this.#deps.unitOfWork.run(async (scope) => {
      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      const journal = await scope.journals.findById(ledgerId, journalId);
      if (journal === undefined) throw journalNotFound(journalId);

      const next = status === 'INACTIVE' ? journal.deactivate() : journal.activate();
      await scope.journals.save(next);

      return { ledgerId, journalId: next.id, status: next.status };
    });
  }
}
