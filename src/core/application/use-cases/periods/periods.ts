import { AccountingDate, AccountingPeriod } from '../../../domain/period/index.js';
import type { ApplicationDeps } from '../../ports.js';
import type {
  ClosePeriodInput,
  ClosePeriodResult,
  RegisterPeriodInput,
  RegisterPeriodResult,
} from '../../dto.js';
import { requireChartOfAccountsId, requirePeriod } from '../shared/rules.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreePeriodId, requireNoOverlap } from './rules.js';

const REGISTER_OPERATION = 'registerPeriod';
const CLOSE_OPERATION = 'closePeriod';

export class Periods {

  /**
   * Registers a period inside its ledger.
   *
   * The domain decides whether the two dates are real calendar dates and whether the range is ordered;
   * this use case owns the cross-entity rule: no two periods of one ledger may share a day (P07). The
   * overlap query and the write share the unit of work so persistence can back it with a constraint.
   */
  static async register(deps: ApplicationDeps, input: RegisterPeriodInput): Promise<RegisterPeriodResult> {
    const { ledgerId, periodId, name, startDate, endDate, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId, name, startDate, endDate });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);
        await requireFreePeriodId(scope, ledgerId, periodId);

        const period = AccountingPeriod.create({
          id: periodId,
          ledgerId,
          name,
          startDate: AccountingDate.create(startDate),
          endDate: AccountingDate.create(endDate),
        });

        await requireNoOverlap(scope, ledgerId, period);

        const result: RegisterPeriodResult = {
          ledgerId,
          periodId: period.id,
          startDate: period.startDate.value,
          endDate: period.endDate.value,
          status: period.status,
        };

        await scope.periods.save(period);

        return result;
      });
    });
  }

  /**
   * Closes an open period.
   *
   * Closing only changes the period status: it does not post drafts, does not touch entries and does not
   * generate result entries. Closing twice with different keys is a state error from the aggregate, not a
   * silent success; a retry is only a replay when it carries the same key and the same request.
   */
  static async close(deps: ApplicationDeps, input: ClosePeriodInput): Promise<ClosePeriodResult> {
    const { ledgerId, periodId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, CLOSE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);

        const period = await requirePeriod(scope, ledgerId, periodId);

        // Closing an already closed period fails here, with the domain code, and nothing is written.
        const closed = period.close();
        const result: ClosePeriodResult = { ledgerId, periodId: closed.id, status: 'CLOSED' };

        await scope.periods.save(closed);

        return result;
      });
    });
  }
}
