import { AccountingDate, AccountingPeriod } from '../../domain/period/index.js';
import * as errors from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import type { ClosePeriodInput, ClosePeriodResult, RegisterPeriodInput, RegisterPeriodResult } from './contracts.js';
import { requireChartOfAccountsId } from './guards.js';
import { fingerprintOf, remember, replay } from './shared/index.js';

const REGISTER_OPERATION = 'registerPeriod';
const CLOSE_OPERATION = 'closePeriod';

/**
 * Registers a period inside its ledger.
 *
 * The domain decides whether the two dates are real calendar dates and whether the range is ordered;
 * this use case owns the cross-entity rule: no two periods of one ledger may share a day (P07). The
 * overlap query and the write share the unit of work so persistence can back it with a constraint.
 */
export class RegisterPeriod {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: RegisterPeriodInput): Promise<RegisterPeriodResult> {
    const { ledgerId, periodId, name, startDate, endDate, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId, name, startDate, endDate });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<RegisterPeriodResult>(
        scope,
        REGISTER_OPERATION,
        ledgerId,
        idempotencyKey,
        fingerprint,
      );
      if (stored !== undefined) return stored;

      await requireChartOfAccountsId(scope, ledgerId);

      if ((await scope.periods.findById(ledgerId, periodId)) !== undefined) {
        throw errors.periodAlreadyExists(periodId);
      }

      const period = AccountingPeriod.create({
        id: periodId,
        ledgerId,
        name,
        startDate: AccountingDate.create(startDate),
        endDate: AccountingDate.create(endDate),
      });

      const overlapping = await scope.periods.findOverlapping(ledgerId, period.startDate, period.endDate);
      if (overlapping.length > 0) {
        throw errors.periodOverlap(
          ledgerId,
          overlapping.map((item) => item.id),
        );
      }

      const result: RegisterPeriodResult = {
        ledgerId,
        periodId: period.id,
        startDate: period.startDate.value,
        endDate: period.endDate.value,
        status: period.status,
      };

      await scope.periods.save(period);
      await remember(scope, REGISTER_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

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
      const stored = await replay<ClosePeriodResult>(
        scope,
        CLOSE_OPERATION,
        ledgerId,
        idempotencyKey,
        fingerprint,
      );
      if (stored !== undefined) return stored;

      await requireChartOfAccountsId(scope, ledgerId);

      const period = await scope.periods.findById(ledgerId, periodId);
      if (period === undefined) throw errors.periodNotFound(periodId);

      // Closing an already closed period fails here, with the domain code, and nothing is written.
      const closed = period.close();
      const result: ClosePeriodResult = { ledgerId, periodId: closed.id, status: 'CLOSED' };

      await scope.periods.save(closed);
      await remember(scope, CLOSE_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}
