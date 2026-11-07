/** Stable error codes of the journal domain. */
export type JournalErrorCode = 'INVALID_JOURNAL';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class JournalError extends Error {
  readonly code: JournalErrorCode;

  constructor(code: JournalErrorCode, message: string) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
  }
}

export function invalidJournal(reason: string): JournalError {
  return new JournalError('INVALID_JOURNAL', `Invalid journal: ${reason}.`);
}
