import type { ApplicationDeps } from '../../ports.js';
import type { EntryDraftResult, RemoveEntryLineInput } from '../../dto.js';
import { requireChartOfAccountsId, requireEntry } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { draftResultOf } from './result.js';

const REMOVE_OPERATION = 'removeEntryLine';

/**
 * Removes one line from an existing draft by id.
 *
 * It does not query accounts: the line that is leaving has nothing to validate. The aggregate owns the
 * state rules: a posted entry rejects removals, and an unknown line id is `ENTRY_LINE_NOT_FOUND`.
 */
export class RemoveEntryLine {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: RemoveEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, lineId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, lineId });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REMOVE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);

        const updated = entry.removeLine(lineId);

        const result = draftResultOf(updated);
        await scope.entries.save(updated);

        return result;
      });
    });
  }
}

