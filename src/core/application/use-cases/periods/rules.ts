import type { AccountingPeriod } from '../../../domain/period/index.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions of the periods area.
 *
 * They live next to the operations that invoke them, not in `shared/`: a rule belongs to the area that
 * decides it, and only the rules two or more areas invoke are shared. Each one either returns the value
 * the next rule needs or throws the error of that rule.
 */

/** An id already taken is rejected: registering never overwrites a stored period. */
export async function requireFreePeriodId(
  scope: UnitOfWorkScope,
  ledgerId: string,
  periodId: string,
): Promise<void> {
  if ((await scope.periods.findById(ledgerId, periodId)) !== undefined) throw errors.periodAlreadyExists(periodId);
}

/** No two periods of one ledger may share a day (P07). The overlap query runs in the same unit of work. */
export async function requireNoOverlap(
  scope: UnitOfWorkScope,
  ledgerId: string,
  period: AccountingPeriod,
): Promise<void> {
  const overlapping = await scope.periods.findOverlapping(ledgerId, period.startDate, period.endDate);
  if (overlapping.length > 0) {
    throw errors.periodOverlap(
      ledgerId,
      overlapping.map((item) => item.id),
    );
  }
}
