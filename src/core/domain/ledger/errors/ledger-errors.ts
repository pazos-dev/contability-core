/** Stable error codes of the ledger domain. */
export type LedgerErrorCode = 'INVALID_LEDGER';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

export function invalidLedger(reason: string): LedgerError {
  return new LedgerError('INVALID_LEDGER', `Invalid ledger: ${reason}.`);
}
