import type { ApplicationDeps } from '../../ports.js';
import type { PostEntryInput, PostEntryResult } from '../../dto.js';
import {
  requireActiveJournal,
  requireChartOfAccountsId,
  requireEntry,
  requireOpenPeriodContaining,
  requirePostableAccount,
} from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { postedResultOf } from './result.js';
import { requireNoPostedReversal } from './rules.js';

const POST_OPERATION = 'postEntry';

/**
 * Posts a persisted draft.
 *
 * It owns every rule the aggregate cannot decide alone: the ledger resolves the chart of accounts the
 * lines must belong to (Q07), and the journal, the period and the accounts must still admit the
 * posting. The draft's `periodId` is authoritative, but it does not prove the accounting date falls
 * inside that period, so the two are checked together (P05, A06, J05).
 *
 * The entry is never edited here: it is loaded, posted in memory and saved once, together with the
 * idempotency record, inside one unit of work.
 */
export class PostEntry {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: PostEntryInput): Promise<PostEntryResult> {
    const { ledgerId, entryId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, POST_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);
        await requireActiveJournal(scope, ledgerId, entry.journalId);
        await requireOpenPeriodContaining(scope, ledgerId, entry.periodId, entry.accountingDate);
        for (const line of entry.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
        await requireNoPostedReversal(scope, ledgerId, entry);

        const posted = entry.post();
        const result = postedResultOf(posted);

        await scope.entries.save(posted);

        return result;
      });
    });
  }
}

