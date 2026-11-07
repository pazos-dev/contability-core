/** Closed set of accounting period states. */
export const PERIOD_STATUSES = ['OPEN', 'CLOSED'] as const;

export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export function isPeriodStatus(value: unknown): value is PeriodStatus {
  return typeof value === 'string' && (PERIOD_STATUSES as readonly string[]).includes(value);
}
