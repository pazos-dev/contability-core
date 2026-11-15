import type { ApplicationDeps } from '../../ports.js';
import type { AddEntryLineInput, EntryDraftResult } from '../../dto.js';
import { requireAccountOfPlan, requireChartOfAccountsId, requireEntry } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { draftResultOf, lineOf, normalizedLine } from './result.js';

const ADD_OPERATION = 'addEntryLine';

/**
 * Adds one line to an existing draft.
 *
 * It only checks that the new line is coherent with the ledger: the account must exist in the same chart
 * of accounts. It does not require the account to be active or postable, and it does not re-check the rest
 * of the draft — an unfinished draft is a legitimate state and `postEntry` re-validates everything.
 */
export class AddEntryLine {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: AddEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, line, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, line: normalizedLine(line) });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, ADD_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);
        await requireAccountOfPlan(scope, line.accountId, chartOfAccountsId);

        // The aggregate owns the state rules: a posted entry rejects new lines.
        const updated = entry.addLine(lineOf(line));

        const result = draftResultOf(updated);
        await scope.entries.save(updated);

        return result;
      });
    });
  }
}

