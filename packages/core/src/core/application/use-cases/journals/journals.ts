import { Journal } from '../../../domain/journal/index.js';
import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type {
  RegisterJournalInput,
  RegisterJournalResult,
  SetJournalStatusInput,
  SetJournalStatusResult,
} from '../../dto.js';
import { requireChartOfAccountsId, requireJournal } from '../shared/rules.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreeJournalCode, requireFreeJournalId } from './rules.js';

const REGISTER_OPERATION = 'registerJournal';

export class Journals {

  /**
   * Registers a journal inside its ledger. Code uniqueness is scoped by ledger (J03): the same code in
   * another ledger is a different journal.
   */
  static async register(deps: ApplicationDeps, input: RegisterJournalInput): Promise<RegisterJournalResult> {
    const { ledgerId, journalId, code, name, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, journalId, code, name });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);
        await requireFreeJournalId(scope, ledgerId, journalId);
        await requireFreeJournalCode(scope, ledgerId, code);

        const journal = Journal.create({ id: journalId, ledgerId, code, name });
        const result: RegisterJournalResult = {
          ledgerId,
          journalId: journal.id,
          code: journal.code,
          status: journal.status,
        };

        await scope.journals.save(journal);

        return result;
      });
    });
  }

  /**
   * Activates or deactivates a journal. Deactivating keeps the journal and its history (J04) and never
   * touches the entries that reference it; reactivating returns it to ACTIVE (J06).
   */
  static async setStatus(deps: ApplicationDeps, input: SetJournalStatusInput): Promise<SetJournalStatusResult> {
    const { ledgerId, journalId, status } = input;
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw errors.invalidApplicationInput('status', status);

    return deps.unitOfWork.run(async (scope) => {
      await requireChartOfAccountsId(scope, ledgerId);

      const journal = await requireJournal(scope, ledgerId, journalId);

      const next = status === 'INACTIVE' ? journal.deactivate() : journal.activate();
      await scope.journals.save(next);

      return { ledgerId, journalId: next.id, status: next.status };
    });
  }
}
