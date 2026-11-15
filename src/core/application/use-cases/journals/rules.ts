import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions of the journals area.
 *
 * They live next to the operations that invoke them, not in `shared/`: a rule belongs to the area that
 * decides it, and only the rules two or more areas invoke are shared. Each one either returns the value
 * the next rule needs or throws the error of that rule.
 */

/** An id already taken is rejected: registering never overwrites a stored journal. */
export async function requireFreeJournalId(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<void> {
  if ((await scope.journals.findById(ledgerId, journalId)) !== undefined) throw errors.journalAlreadyExists(journalId);
}

/** Code uniqueness is scoped by ledger (J03): the same code in another ledger is a different journal. */
export async function requireFreeJournalCode(
  scope: UnitOfWorkScope,
  ledgerId: string,
  code: string,
): Promise<void> {
  if ((await scope.journals.findByCode(ledgerId, code)) !== undefined) {
    throw errors.journalCodeDuplicate(ledgerId, code);
  }
}
