import { describeValue } from '../describe-value.js';

/** Stable error codes of the account domain. */
export type AccountErrorCode = 'INVALID_ACCOUNT' | 'INVALID_ACCOUNT_CODE' | 'ACCOUNT_SELF_PARENT';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

export function invalidAccount(reason: string): AccountError {
  return new AccountError('INVALID_ACCOUNT', `Invalid account: ${reason}.`);
}

export function invalidAccountCode(reason: string): AccountError {
  return new AccountError('INVALID_ACCOUNT_CODE', `Invalid account code: ${reason}.`);
}

export function accountSelfParent(id: unknown): AccountError {
  return new AccountError(
    'ACCOUNT_SELF_PARENT',
    `Invalid account: account ${describeValue(id)} cannot be its own parent.`,
  );
}
