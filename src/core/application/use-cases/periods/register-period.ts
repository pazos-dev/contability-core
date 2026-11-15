import { AccountingDate, AccountingPeriod } from '../../../domain/period/index.js';
import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type { RegisterPeriodInput, RegisterPeriodResult } from '../../dto.js';
import { requireChartOfAccountsId } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';

const REGISTER_OPERATION = 'registerPeriod';

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
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
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

        return result;
      });
    });
  }
}

