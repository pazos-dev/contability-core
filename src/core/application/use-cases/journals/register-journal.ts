import { Journal } from '../../../domain/journal/index.js';
import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type { RegisterJournalInput, RegisterJournalResult } from '../../dto.js';
import { requireChartOfAccountsId } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';

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
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);

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

        return result;
      });
    });
  }
}

