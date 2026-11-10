import { JournalEntryLine } from '../../../domain/entries/index.js';
import { Money } from '../../../domain/money/index.js';
import type { AddEntryLineInput, EntryDraftResult } from '../../contracts/entries.js';
import { accountNotFound, entryNotFound, ledgerNotFound } from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/index.js';
import { draftResultOf } from './entry-result.js';

const OPERATION = 'addEntryLine';

export type AddEntryLine = (input: AddEntryLineInput) => Promise<EntryDraftResult>;

/**
 * Adds one line to an existing draft.
 *
 * It only checks that the new line is coherent with the ledger: the account must exist in the same chart
 * of accounts. It does not require the account to be active or postable, and it does not re-check the rest
 * of the draft — an unfinished draft is a legitimate state and `postEntry` re-validates everything.
 */
export function makeAddEntryLine(deps: ApplicationDeps): AddEntryLine {
  return async (input) => {
    const { ledgerId, entryId, line, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      entryId,
      // Normalized so the key order of the line object never changes the fingerprint.
      line: [
        line.lineId,
        line.accountId,
        line.side,
        line.amount.minorUnits,
        line.amount.currency.code,
        line.amount.currency.scale,
        line.description ?? null,
      ],
    });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw entryNotFound(entryId);

      const account = await scope.accounts.findById(line.accountId);
      if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
        throw accountNotFound(line.accountId);
      }

      // The aggregate owns the state rules: a posted entry rejects new lines.
      const updated = entry.addLine(
        JournalEntryLine.create({
          id: line.lineId,
          accountId: line.accountId,
          side: line.side,
          amount: Money.fromJSON(line.amount),
          ...(line.description === undefined ? {} : { description: line.description }),
        }),
      );

      const result = draftResultOf(updated);
      await scope.entries.save(updated);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}
