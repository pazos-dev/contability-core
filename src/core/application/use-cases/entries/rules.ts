import type { JournalEntry } from '../../../domain/entries/index.js';
import type { Ledger } from '../../../domain/ledger/index.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions of the entries area.
 *
 * They live next to the operations that invoke them, not in `shared/`: a rule belongs to the area that
 * decides it, and only the rules two or more areas invoke are shared. Each one either returns the value
 * the next rule needs or throws the error of that rule.
 *
 * Journal and period existence are not here: drafts and other areas both need them, so they live in
 * `../shared/rules.ts` as `requireJournal` and `requirePeriod`.
 */

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

/**
 * Every line of the entry is expressed in the ledger's functional currency (`ledger.md`, rule 15).
 *
 * Posting already guarantees that intra-aggregate, from the rates it receives (`entries.md`, E05). This rule
 * survives for the one path where the aggregate takes the amount it is handed instead of converting: reversing
 * a posted entry mirrors the functional amounts of the original, so what has to be in the ledger's currency is
 * the functional one. A line written before 009d carries none, and its own amount is the honest fallback: an
 * entry whose own amount is in another currency and that carries no functional amount is refused here, because a
 * reversal cannot invent the conversion the original never had. Posting no longer reaches this rule: since 009d
 * the aggregate converts and guards the pair itself.
 *
 * Drafts never pass through this rule, exactly like balance and open period: a draft may hold any currency and
 * `post` is the strict point (`ledger.md`, rule 16).
 */
export function requireLedgerCurrency(ledger: Ledger, entry: JournalEntry): void {
  for (const line of entry.lines) {
    const amount = line.functionalAmount ?? line.amount;
    if (!amount.currency.equals(ledger.currency)) {
      throw errors.ledgerCurrencyMismatch(ledger.id, ledger.currency.toJSON(), amount.currency.toJSON());
    }
  }
}
