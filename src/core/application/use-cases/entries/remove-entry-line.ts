import type { EntryDraftResult, RemoveEntryLineInput } from '../../contracts/entries.js';
import { entryNotFound, ledgerNotFound } from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/index.js';
import { draftResultOf } from './entry-result.js';

const OPERATION = 'removeEntryLine';

export type RemoveEntryLine = (input: RemoveEntryLineInput) => Promise<EntryDraftResult>;

/**
 * Removes one line from an existing draft by id.
 *
 * It does not query accounts: the line that is leaving has nothing to validate. The aggregate owns the
 * state rules: a posted entry rejects removals, and an unknown line id is `ENTRY_LINE_NOT_FOUND`.
 */
export function makeRemoveEntryLine(deps: ApplicationDeps): RemoveEntryLine {
  return async (input) => {
    const { ledgerId, entryId, lineId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, lineId });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw entryNotFound(entryId);

      const updated = entry.removeLine(lineId);

      const result = draftResultOf(updated);
      await scope.entries.save(updated);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}
