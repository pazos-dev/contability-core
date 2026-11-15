import { JournalEntry } from '../../../domain/entries/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import type { ApplicationDeps } from '../../ports.js';
import type { CreateEntryDraftInput, EntryDraftResult } from '../../dto.js';
import { requireAccountOfPlan, requireChartOfAccountsId, requireFreeEntryId } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { draftResultOf, lineOf, normalizedLine } from './result.js';
import { requireJournalInLedger, requirePeriodInLedger } from './rules.js';

const CREATE_OPERATION = 'createEntryDraft';

/**
 * Creates the draft that `postEntry` later posts.
 *
 * It validates only what makes the draft *coherent*: a known ledger, a free entry id, and a journal,
 * a period and accounts that exist in that ledger. It deliberately does not require an active journal,
 * an open period or a balanced entry: a draft may be prepared against a journal that is reactivated
 * later, and every posting rule is re-checked by `postEntry` anyway.
 */
export class CreateEntryDraft {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: CreateEntryDraftInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, journalId, periodId, accountingDate, description, lines, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      entryId,
      journalId,
      periodId,
      accountingDate,
      description,
      lines: lines.map(normalizedLine),
    });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, CREATE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        await requireFreeEntryId(scope, ledgerId, entryId);
        await requireJournalInLedger(scope, ledgerId, journalId);
        await requirePeriodInLedger(scope, ledgerId, periodId);
        for (const line of lines) await requireAccountOfPlan(scope, line.accountId, chartOfAccountsId);

        const draft = lines.reduce(
          (entry, line) => entry.addLine(lineOf(line)),
          JournalEntry.createDraft({
            id: entryId,
            ledgerId,
            journalId,
            periodId,
            accountingDate: AccountingDate.create(accountingDate),
            description,
          }),
        );

        const result = draftResultOf(draft);

        await scope.entries.save(draft);

        return result;
      });
    });
  }
}

