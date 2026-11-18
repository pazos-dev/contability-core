/** Stable error codes of the accounting period domain. */
export type PeriodErrorCode = 'INVALID_DATE' | 'INVALID_PERIOD' | 'PERIOD_ALREADY_CLOSED';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class PeriodError extends Error {
  readonly code: PeriodErrorCode;

  constructor(code: PeriodErrorCode, message: string) {
    super(message);
    this.name = 'PeriodError';
    this.code = code;
  }
}

export function invalidDate(reason: string): PeriodError {
  return new PeriodError('INVALID_DATE', `Invalid accounting date: ${reason}.`);
}

export function invalidPeriod(reason: string): PeriodError {
  return new PeriodError('INVALID_PERIOD', `Invalid accounting period: ${reason}.`);
}

export function periodAlreadyClosed(reason: string): PeriodError {
  return new PeriodError('PERIOD_ALREADY_CLOSED', `Period cannot be closed again: ${reason}.`);
}
