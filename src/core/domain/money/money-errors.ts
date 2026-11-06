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

/** Describes an untrusted value for an error message without losing precision or leaking content. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object') return value === null ? 'null' : Object.prototype.toString.call(value);
  if (typeof value === 'function' || typeof value === 'symbol') return typeof value;
  return String(value);
}
