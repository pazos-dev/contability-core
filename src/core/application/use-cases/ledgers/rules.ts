import type { Ledger } from '../../../domain/ledger/index.js';
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

/** The ledger is registered; an id that was never registered is `LEDGER_NOT_FOUND`. */
export async function requireLedger(scope: UnitOfWorkScope, ledgerId: string): Promise<Ledger> {
  const ledger = await scope.ledgers.findById(ledgerId);
  if (ledger === undefined) throw errors.ledgerNotFound(ledgerId);
  return ledger;
}
