import type { SetJournalStatusInput, SetJournalStatusResult } from '../contracts/registration.js';
import { invalidApplicationInput, journalNotFound, ledgerNotFound } from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';

export type SetJournalStatus = (input: SetJournalStatusInput) => Promise<SetJournalStatusResult>;

/**
 * Activates or deactivates a journal. Deactivating keeps the journal and its history (J04) and never
 * touches the entries that reference it; reactivating returns it to ACTIVE (J06).
 */
export function makeSetJournalStatus(deps: ApplicationDeps): SetJournalStatus {
  return async (input) => {
    const { ledgerId, journalId, status } = input;
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw invalidApplicationInput('status', status);

    return deps.unitOfWork.run(async (scope) => {
      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      const journal = await scope.journals.findById(ledgerId, journalId);
      if (journal === undefined) throw journalNotFound(journalId);

      const next = status === 'INACTIVE' ? journal.deactivate() : journal.activate();
      await scope.journals.save(next);

      return { ledgerId, journalId: next.id, status: next.status };
    });
  };
}
