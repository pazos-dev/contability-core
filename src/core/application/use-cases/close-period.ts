import type { ClosePeriodInput, ClosePeriodResult } from '../contracts/posting.js';
import { ledgerNotFound, periodNotFound } from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './idempotency.js';

const OPERATION = 'closePeriod';

export type ClosePeriod = (input: ClosePeriodInput) => Promise<ClosePeriodResult>;

/**
 * Closes an open period.
 *
 * Closing only changes the period status: it does not post drafts, does not touch entries and does not
 * generate result entries. Closing twice with different keys is a state error from the aggregate, not a
 * silent success; a retry is only a replay when it carries the same key and the same request.
 */
export function makeClosePeriod(deps: ApplicationDeps): ClosePeriod {
  return async (input) => {
    const { ledgerId, periodId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<ClosePeriodResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      const period = await scope.periods.findById(ledgerId, periodId);
      if (period === undefined) throw periodNotFound(periodId);

      // Closing an already closed period fails here, with the domain code, and nothing is written.
      const closed = period.close();
      const result: ClosePeriodResult = { ledgerId, periodId: closed.id, status: 'CLOSED' };

      await scope.periods.save(closed);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}
