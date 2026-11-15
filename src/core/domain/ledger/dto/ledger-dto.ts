import type { LedgerStatus } from '../types/ledger-status.js';

/** Input data of a new ledger; ids are opaque values received from the caller. */
export interface LedgerInput {
  readonly id: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
}

/**
 * Validated state the entity hands to its own private constructor.
 * It stays internal to the domain: the barrel never exports it.
 */
export interface LedgerFields {
  readonly id: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly status: LedgerStatus;
}
