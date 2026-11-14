import type { AccountCode } from '../account-code.js';
import type { AccountStatus } from '../account-status.js';
import type { AccountType } from '../account-type.js';

/** Input data of a new account; ids are opaque values received from the caller. */
export interface AccountInput {
  readonly id: string;
  readonly chartOfAccountsId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId?: string;
  readonly postingAllowed: boolean;
}

/**
 * Validated state a value object hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface AccountFields {
  readonly id: string;
  readonly chartOfAccountsId: string;
  readonly code: AccountCode;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId: string | undefined;
  readonly postingAllowed: boolean;
  readonly status: AccountStatus;
}
