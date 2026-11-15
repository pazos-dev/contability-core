import { AccountingDate } from '../../../domain/period/index.js';
import type { ApplicationDeps } from '../../ports.js';
import type { ReversePostedEntryInput, ReversePostedEntryResult } from '../../dto.js';
import {
  requireActiveJournal,
  requireChartOfAccountsId,
  requireEntry,
  requireFreeEntryId,
  requireOpenPeriodContaining,
  requirePostableAccount,
} from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { postedResultOf } from './result.js';
import { requireNoReversal } from './rules.js';

const REVERSE_OPERATION = 'reversePostedEntry';

/**
 * Reverses a posted entry with a second, mirrored entry.
 *
 * The original is never touched: the reversal is a new entry with its own id, period and date, and the
 * link is `reversalOfEntryId`. Only one full reversal per original is allowed, and the check sits right
 * before the write so persistence can back it with a unique constraint in 007.
 *
 * The destination period must be open even when the original period is already closed, and the accounts
 * of the original must still admit postings: reversing is not a way around a deactivated account.
 */
export class ReversePostedEntry {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: ReversePostedEntryInput): Promise<ReversePostedEntryResult> {
    const { ledgerId, originalEntryId, reversalEntryId, periodId, accountingDate, description, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      originalEntryId,
      reversalEntryId,
      periodId,
      accountingDate,
      description,
    });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REVERSE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        const original = await requireEntry(scope, ledgerId, originalEntryId);

        // The aggregate refuses to reverse anything that is not POSTED, with its own ENTRY_STATE code.
        const draft = original.createReversalDraft({
          id: reversalEntryId,
          periodId,
          accountingDate: AccountingDate.create(accountingDate),
          ...(description === undefined ? {} : { description }),
        });

        await requireActiveJournal(scope, ledgerId, original.journalId);
        await requireOpenPeriodContaining(scope, ledgerId, periodId, draft.accountingDate);
        for (const line of draft.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
        await requireFreeEntryId(scope, ledgerId, reversalEntryId);
        await requireNoReversal(scope, ledgerId, originalEntryId);

        const posted = draft.post();
        const result: ReversePostedEntryResult = { ...postedResultOf(posted), reversalOfEntryId: originalEntryId };

        await scope.entries.save(posted);

        return result;
      });
    });
  }
}

