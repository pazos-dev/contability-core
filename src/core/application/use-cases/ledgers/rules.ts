import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * An id already taken is rejected: registering never overwrites a stored ledger.
 *
 * Remembering a registration is the only way a ledger exists: there is no configuration that can make one
 * appear, so this rule is the whole answer to "does this ledger exist?".
 */
export async function requireFreeLedgerId(scope: UnitOfWorkScope, ledgerId: string): Promise<void> {
  if ((await scope.ledgers.findById(ledgerId)) !== undefined) throw errors.ledgerAlreadyExists(ledgerId);
}
