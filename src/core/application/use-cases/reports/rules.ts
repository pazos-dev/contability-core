import type { Ledger } from '../../../domain/ledger/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions of the report area.
 *
 * They live here and not in `shared/rules.ts` because only this area decides them: the shared module holds
 * the rules two or more areas invoke, and no writing use case reads without an active ledger.
 */

/** Inclusive window over the accounting date; an absent end is unbounded, not empty. */
export interface ReportRange {
  readonly from: AccountingDate | undefined;
  readonly to: AccountingDate | undefined;
}

/**
 * The ledger of a report exists, whatever its status (rule 9).
 *
 * It deliberately is not `requireActiveLedger`: deactivating a ledger closes writing, not access to its
 * history, so an `INACTIVE` ledger is reported like any other.
 */
export async function requireReportLedger(scope: UnitOfWorkScope, ledgerId: string): Promise<Ledger> {
  const ledger = await scope.ledgers.findById(ledgerId);
  if (ledger === undefined) throw errors.ledgerNotFound(ledgerId);
  return ledger;
}

/**
 * The window of the report, in the order the specification fixes: every supplied date is created first —
 * an impossible date is the domain's `INVALID_DATE` and bubbles unwrapped — and only then is the order
 * compared. A `from` after a `to` is `INVALID_APPLICATION_INPUT`, so an impossible `from` wins over a
 * reversed range.
 */
export function requireReportRange(input: { readonly from?: string; readonly to?: string }): ReportRange {
  const from = input.from === undefined ? undefined : AccountingDate.create(input.from);
  const to = input.to === undefined ? undefined : AccountingDate.create(input.to);

  if (from !== undefined && to !== undefined && from.compare(to) > 0) {
    throw errors.invalidApplicationInput('from', input.from);
  }

  return { from, to };
}
