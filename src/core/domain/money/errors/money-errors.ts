/** Stable error codes of the money domain. */
export type MoneyErrorCode = 'INVALID_CURRENCY' | 'INVALID_MONEY' | 'CURRENCY_MISMATCH';

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
