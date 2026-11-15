import type { JournalEntry } from '../../domain/entries/index.js';
import * as errors from '../errors.js';
import type { UnitOfWorkScope } from '../ports.js';

/** A draft may point to any journal of the ledger; it does not have to be active yet. */
export async function requireJournalInLedger(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<void> {
  if ((await scope.journals.findById(ledgerId, journalId)) === undefined) throw errors.journalNotFound(journalId);
}

/** A draft may point to any period of the ledger; it does not have to be open yet. */
export async function requirePeriodInLedger(
  scope: UnitOfWorkScope,
  ledgerId: string,
  periodId: string,
): Promise<void> {
  if ((await scope.periods.findById(ledgerId, periodId)) === undefined) throw errors.periodNotFound(periodId);
}

/**
 * Posting a stored reversal draft cannot create a second *posted* reversal of the same original. Every
 * reversal is read, not the first one found, and this entry is excluded: a draft saved before the posted
 * reversal must not hide it, and the entry being posted is not another reversal of its own original.
 */
export async function requireNoPostedReversal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  entry: JournalEntry,
): Promise<void> {
  if (entry.reversalOfEntryId === undefined) return;

  const reversals = await scope.entries.findReversalsOf(ledgerId, entry.reversalOfEntryId);
  const alreadyPosted = reversals.some((reversal) => reversal.id !== entry.id && reversal.status === 'POSTED');
  if (alreadyPosted) throw errors.entryAlreadyReversed(entry.reversalOfEntryId);
}

/**
 * Reversing creates a new entry, so any reversal of that original -in any status- blocks it. Checked
 * immediately before the write, inside the same unit of work, so 007 can replace it with a unique
 * constraint on `reversalOfEntryId` without moving anything.
 */
export async function requireNoReversal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  originalEntryId: string,
): Promise<void> {
  if ((await scope.entries.findReversalsOf(ledgerId, originalEntryId)).length > 0) {
    throw errors.entryAlreadyReversed(originalEntryId);
  }
}

