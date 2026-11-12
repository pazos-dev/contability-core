import { AccountingDate } from '../../../domain/period/index.js';
import type { ReversePostedEntryInput, ReversePostedEntryResult } from '../../contracts/entries.js';
import {
  accountInactive,
  entryAlreadyExists,
  accountNotFound,
  accountNotPostable,
  entryAlreadyReversed,
  entryNotFound,
  journalInactive,
  journalNotFound,
  ledgerNotFound,
  periodClosed,
  periodDateOutside,
  periodNotFound,
} from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/idempotency.js';
import { resultOf } from '../entries/post-entry.js';

const OPERATION = 'reversePostedEntry';

export type ReversePostedEntry = (input: ReversePostedEntryInput) => Promise<ReversePostedEntryResult>;

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
export function makeReversePostedEntry(deps: ApplicationDeps): ReversePostedEntry {
  return async (input) => {
    const { ledgerId, originalEntryId, reversalEntryId, periodId, accountingDate, description, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      originalEntryId,
      reversalEntryId,
      periodId,
      accountingDate,
      description,
    });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<ReversePostedEntryResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      const original = await scope.entries.findById(ledgerId, originalEntryId);
      if (original === undefined) throw entryNotFound(originalEntryId);

      // The aggregate refuses to reverse anything that is not POSTED, with its own ENTRY_STATE code.
      const draft = original.createReversalDraft({
        id: reversalEntryId,
        periodId,
        accountingDate: AccountingDate.create(accountingDate),
        ...(description === undefined ? {} : { description }),
      });

      const journal = await scope.journals.findById(ledgerId, original.journalId);
      if (journal === undefined) throw journalNotFound(original.journalId);
      if (journal.status !== 'ACTIVE') throw journalInactive(original.journalId);

      const period = await scope.periods.findById(ledgerId, periodId);
      if (period === undefined) throw periodNotFound(periodId);
      if (period.status !== 'OPEN') throw periodClosed(periodId);
      if (!period.contains(draft.accountingDate)) throw periodDateOutside(periodId, draft.accountingDate.value);

      for (const line of draft.lines) {
        const account = await scope.accounts.findById(line.accountId);
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) throw accountNotFound(line.accountId);
        if (account.status !== 'ACTIVE') throw accountInactive(line.accountId);
        if (!account.postingAllowed) throw accountNotPostable(line.accountId);
      }

      // The save is an upsert keyed by (ledgerId, entryId): reusing an id would overwrite the stored
      // entry, so the id must be free before the reversal is written. In 007 this is the primary key.
      if ((await scope.entries.findById(ledgerId, reversalEntryId)) !== undefined) {
        throw entryAlreadyExists(reversalEntryId);
      }

      // Checked immediately before the write, inside the same unit of work, so 007 can replace it with
      // a unique constraint on reversalOfEntryId without moving anything. Every reversal counts, in any
      // status: a reversal that already exists means this original is being reversed elsewhere, and
      // adding another one would leave two entries claiming the same original.
      if ((await scope.entries.findReversalsOf(ledgerId, originalEntryId)).length > 0) {
        throw entryAlreadyReversed(originalEntryId);
      }

      const posted = draft.post();
      const result: ReversePostedEntryResult = { ...resultOf(posted), reversalOfEntryId: originalEntryId };

      await scope.entries.save(posted);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}
