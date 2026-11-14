import type { AccountingDate } from '../value-objects/accounting-date.js';
import type { PeriodStatus } from '../types/period-status.js';

/** Input data of a new accounting period; ids are opaque values received from the caller. */
export interface AccountingPeriodInput {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly startDate: AccountingDate;
  readonly endDate: AccountingDate;
}

/**
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface AccountingPeriodFields {
  readonly id: string;
  readonly ledgerId: string;
  readonly name: string;
  readonly startDate: AccountingDate;
  readonly endDate: AccountingDate;
  readonly status: PeriodStatus;
}
