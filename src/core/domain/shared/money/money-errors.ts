/** Stable error codes of the money domain. */
export type MoneyErrorCode =
  | 'INVALID_CURRENCY'
  | 'INVALID_MONEY'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_FACTOR'
  | 'DIVISION_BY_ZERO'
  | 'INVALID_ROUNDING_MODE';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

export function invalidCurrency(reason: string): MoneyError {
  return new MoneyError('INVALID_CURRENCY', `Invalid currency: ${reason}.`);
}

export function invalidMoney(reason: string): MoneyError {
  return new MoneyError('INVALID_MONEY', `Invalid money: ${reason}.`);
}

export function currencyMismatch(reason: string): MoneyError {
  return new MoneyError('CURRENCY_MISMATCH', `Currency mismatch: ${reason}.`);
}

export function invalidFactor(reason: string): MoneyError {
  return new MoneyError('INVALID_FACTOR', `Invalid factor: ${reason}.`);
}

export function divisionByZero(reason: string): MoneyError {
  return new MoneyError('DIVISION_BY_ZERO', `Division by zero: ${reason}.`);
}

export function invalidRoundingMode(reason: string): MoneyError {
  return new MoneyError('INVALID_ROUNDING_MODE', `Invalid rounding mode: ${reason}.`);
}
