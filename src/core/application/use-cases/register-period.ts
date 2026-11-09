import { AccountingDate, AccountingPeriod } from '../../domain/period/index.js';
import type { RegisterPeriodInput, RegisterPeriodResult } from '../contracts/registration.js';
import { ledgerNotFound, periodAlreadyExists, periodOverlap } from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './idempotency.js';

const OPERATION = 'registerPeriod';

export type RegisterPeriod = (input: RegisterPeriodInput) => Promise<RegisterPeriodResult>;

/**
 * Registers a period inside its ledger.
 *
 * The domain decides whether the two dates are real calendar dates and whether the range is ordered;
 * this use case owns the cross-entity rule: no two periods of one ledger may share a day (P07). The
 * overlap query and the write share the unit of work so persistence can back it with a constraint.
 */
export function makeRegisterPeriod(deps: ApplicationDeps): RegisterPeriod {
  return async (input) => {
    const { ledgerId, periodId, name, startDate, endDate, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, periodId, name, startDate, endDate });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<RegisterPeriodResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw ledgerNotFound(ledgerId);

      if ((await scope.periods.findById(ledgerId, periodId)) !== undefined) throw periodAlreadyExists(periodId);

      const period = AccountingPeriod.create({
        id: periodId,
        ledgerId,
        name,
        startDate: AccountingDate.create(startDate),
        endDate: AccountingDate.create(endDate),
      });

      const overlapping = await scope.periods.findOverlapping(ledgerId, period.startDate, period.endDate);
      if (overlapping.length > 0) {
        throw periodOverlap(
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
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}
