import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type { SetJournalStatusInput, SetJournalStatusResult } from '../../dto.js';
import { requireChartOfAccountsId } from '../guards.js';

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
      await requireChartOfAccountsId(scope, ledgerId);

      const journal = await scope.journals.findById(ledgerId, journalId);
      if (journal === undefined) throw errors.journalNotFound(journalId);

      const next = status === 'INACTIVE' ? journal.deactivate() : journal.activate();
      await scope.journals.save(next);

      return { ledgerId, journalId: next.id, status: next.status };
    });
  }
}
