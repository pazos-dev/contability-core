import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type { ClosePeriodInput, ClosePeriodResult } from '../../dto.js';
import { requireChartOfAccountsId } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';

const CLOSE_OPERATION = 'closePeriod';

/**
 * Closes an open period.
 *
 * Closing only changes the period status: it does not post drafts, does not touch entries and does not
 * generate result entries. Closing twice with different keys is a state error from the aggregate, not a
 * silent success; a retry is only a replay when it carries the same key and the same request.
 */
export class ClosePeriod {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: ClosePeriodInput): Promise<ClosePeriodResult> {
    const { ledgerId, periodId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId });

    return this.#deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, CLOSE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);

        const period = await scope.periods.findById(ledgerId, periodId);
        if (period === undefined) throw errors.periodNotFound(periodId);

        // Closing an already closed period fails here, with the domain code, and nothing is written.
        const closed = period.close();
        const result: ClosePeriodResult = { ledgerId, periodId: closed.id, status: 'CLOSED' };

        await scope.periods.save(closed);

        return result;
      });
    });
  }
}
