/** Stable error codes of the entries domain. */
export type EntryErrorCode =
  | 'INVALID_ENTRY'
  | 'INVALID_ENTRY_LINE'
  | 'DUPLICATE_LINE_ID'
  | 'ENTRY_LINE_NOT_FOUND'
  | 'ENTRY_STATE'
  | 'ENTRY_INCOMPLETE'
  | 'ENTRY_UNBALANCED'
  | 'ENTRY_CURRENCY_MISMATCH';

/** Domain exception with a stable code; adapters translate it to their own error model. */
export class EntryError extends Error {
  readonly code: EntryErrorCode;

  constructor(code: EntryErrorCode, message: string) {
    super(message);
    this.name = 'EntryError';
    this.code = code;
  }
}

export function invalidEntry(reason: string): EntryError {
  return new EntryError('INVALID_ENTRY', `Invalid entry: ${reason}.`);
}

export function invalidEntryLine(reason: string): EntryError {
  return new EntryError('INVALID_ENTRY_LINE', `Invalid entry line: ${reason}.`);
}

export function duplicateLineId(reason: string): EntryError {
  return new EntryError('DUPLICATE_LINE_ID', `Duplicate entry line id: ${reason}.`);
}

export function entryLineNotFound(reason: string): EntryError {
  return new EntryError('ENTRY_LINE_NOT_FOUND', `Entry line not found: ${reason}.`);
}

/** The operation is not allowed in the current state of the aggregate. */
export function entryState(reason: string): EntryError {
  return new EntryError('ENTRY_STATE', `Entry state: ${reason}.`);
}

/** The draft lacks the minimum content a posted entry needs. */
export function entryIncomplete(reason: string): EntryError {
  return new EntryError('ENTRY_INCOMPLETE', `Incomplete entry: ${reason}.`);
}

export function entryUnbalanced(reason: string): EntryError {
  return new EntryError('ENTRY_UNBALANCED', `Unbalanced entry: ${reason}.`);
}

export function entryCurrencyMismatch(reason: string): EntryError {
  return new EntryError('ENTRY_CURRENCY_MISMATCH', `Entry currency mismatch: ${reason}.`);
}
