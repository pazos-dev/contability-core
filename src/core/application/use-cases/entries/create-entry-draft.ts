import { JournalEntry, JournalEntryLine } from '../../../domain/entries/index.js';
import { Money } from '../../../domain/money/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import type { CreateEntryDraftInput, EntryDraftResult, EntryLineInput } from '../../contracts/entries.js';
import {
  accountNotFound,
  entryAlreadyExists,
  journalNotFound,
  ledgerNotFound,
  periodNotFound,
} from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/index.js';
import { draftResultOf } from './entry-result.js';

const OPERATION = 'createEntryDraft';

export type CreateEntryDraft = (input: CreateEntryDraftInput) => Promise<EntryDraftResult>;

/**
 * Creates the draft that `postEntry` later posts.
 *
 * It validates only what makes the draft *coherent*: a known ledger, a free entry id, and a journal,
 * a period and accounts that exist in that ledger. It deliberately does not require an active journal,
 * an open period or a balanced entry: a draft may be prepared against a journal that is reactivated
 * later, and every posting rule is re-checked by `postEntry` anyway.
 */
export function makeCreateEntryDraft(deps: ApplicationDeps): CreateEntryDraft {
  return async (input) => {
    const { ledgerId, entryId, journalId, periodId, accountingDate, description, lines, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      entryId,
      journalId,
      periodId,
      accountingDate,
      description,
      // Normalized per line so the key order of a line object never changes the fingerprint.
      lines: lines.map((line) => [
        line.lineId,
        line.accountId,
        line.side,
        line.amount.minorUnits,
        line.amount.currency.code,
        line.amount.currency.scale,
        line.description ?? null,
      ]),
    });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      if ((await scope.entries.findById(ledgerId, entryId)) !== undefined) throw entryAlreadyExists(entryId);

      if ((await scope.journals.findById(ledgerId, journalId)) === undefined) throw journalNotFound(journalId);

      if ((await scope.periods.findById(ledgerId, periodId)) === undefined) throw periodNotFound(periodId);

      for (const line of lines) {
        const account = await scope.accounts.findById(line.accountId);
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
          throw accountNotFound(line.accountId);
        }
      }

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
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}

function lineOf(line: EntryLineInput): JournalEntryLine {
  return JournalEntryLine.create({
    id: line.lineId,
    accountId: line.accountId,
    side: line.side,
    amount: Money.fromJSON(line.amount),
    ...(line.description === undefined ? {} : { description: line.description }),
  });
}
