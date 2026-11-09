/**
 * Stable error codes of the application layer.
 * Domain errors bubble up unchanged; these codes only cover rules that cross entities.
 */
export type ApplicationErrorCode =
  | 'INVALID_APPLICATION_INPUT'
  | 'LEDGER_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_ALREADY_EXISTS'
  | 'ACCOUNT_CODE_DUPLICATE'
  | 'ACCOUNT_PARENT_NOT_GROUPING'
  | 'ACCOUNT_HAS_MOVEMENTS'
  | 'JOURNAL_NOT_FOUND'
  | 'JOURNAL_ALREADY_EXISTS'
  | 'JOURNAL_CODE_DUPLICATE'
  | 'PERIOD_NOT_FOUND'
  | 'PERIOD_ALREADY_EXISTS'
  | 'PERIOD_OVERLAP'
  | 'IDEMPOTENCY_CONFLICT';

/** Application exception with a stable code; the host translates it to its own error model. */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(code: ApplicationErrorCode, message: string, details: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.details = details;
  }
}

export function invalidApplicationInput(field: string, value: unknown): ApplicationError {
  const received = typeof value === 'string' ? value : String(value);
  return new ApplicationError(
    'INVALID_APPLICATION_INPUT',
    `Field ${JSON.stringify(field)} has an unsupported value: ${JSON.stringify(received)}.`,
    { field, received },
  );
}

export function ledgerNotFound(ledgerId: string): ApplicationError {
  return new ApplicationError('LEDGER_NOT_FOUND', `Ledger ${JSON.stringify(ledgerId)} is not known to the directory.`, {
    ledgerId,
  });
}

export function accountNotFound(accountId: string): ApplicationError {
  return new ApplicationError('ACCOUNT_NOT_FOUND', `Account ${JSON.stringify(accountId)} is not available in this ledger.`, {
    accountId,
  });
}

export function accountAlreadyExists(accountId: string): ApplicationError {
  return new ApplicationError('ACCOUNT_ALREADY_EXISTS', `Account ${JSON.stringify(accountId)} already exists.`, {
    accountId,
  });
}

export function accountCodeDuplicate(chartOfAccountsId: string, code: string): ApplicationError {
  return new ApplicationError(
    'ACCOUNT_CODE_DUPLICATE',
    `Code ${JSON.stringify(code)} already exists in chart of accounts ${JSON.stringify(chartOfAccountsId)}.`,
    { chartOfAccountsId, code },
  );
}

export function accountParentNotGrouping(parentId: string): ApplicationError {
  return new ApplicationError(
    'ACCOUNT_PARENT_NOT_GROUPING',
    `Account ${JSON.stringify(parentId)} admits postings, so it cannot be a parent in this phase.`,
    { parentId },
  );
}

export function accountHasMovements(parentId: string): ApplicationError {
  return new ApplicationError(
    'ACCOUNT_HAS_MOVEMENTS',
    `Account ${JSON.stringify(parentId)} already has posted movements and cannot become a parent.`,
    { parentId },
  );
}

export function journalNotFound(journalId: string): ApplicationError {
  return new ApplicationError('JOURNAL_NOT_FOUND', `Journal ${JSON.stringify(journalId)} is not available in this ledger.`, {
    journalId,
  });
}

export function journalAlreadyExists(journalId: string): ApplicationError {
  return new ApplicationError('JOURNAL_ALREADY_EXISTS', `Journal ${JSON.stringify(journalId)} already exists.`, {
    journalId,
  });
}

export function journalCodeDuplicate(ledgerId: string, code: string): ApplicationError {
  return new ApplicationError(
    'JOURNAL_CODE_DUPLICATE',
    `Code ${JSON.stringify(code)} already exists in ledger ${JSON.stringify(ledgerId)}.`,
    { ledgerId, code },
  );
}

export function periodNotFound(periodId: string): ApplicationError {
  return new ApplicationError('PERIOD_NOT_FOUND', `Period ${JSON.stringify(periodId)} is not available in this ledger.`, {
    periodId,
  });
}

export function periodAlreadyExists(periodId: string): ApplicationError {
  return new ApplicationError('PERIOD_ALREADY_EXISTS', `Period ${JSON.stringify(periodId)} already exists.`, {
    periodId,
  });
}

export function periodOverlap(ledgerId: string, overlappingIds: readonly string[]): ApplicationError {
  return new ApplicationError(
    'PERIOD_OVERLAP',
    `Period overlaps existing periods of ledger ${JSON.stringify(ledgerId)}: ${overlappingIds
      .map((id) => JSON.stringify(id))
      .join(', ')}.`,
    { ledgerId, overlappingIds: overlappingIds.join(',') },
  );
}

export function idempotencyConflict(ledgerId: string, operation: string, key: string): ApplicationError {
  return new ApplicationError(
    'IDEMPOTENCY_CONFLICT',
    `Key ${JSON.stringify(key)} was already used for ${operation} in ledger ${JSON.stringify(ledgerId)} with another request.`,
    { ledgerId, operation, key },
  );
}
