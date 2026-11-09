import { describeValue } from '../describe-value.js';
import type { EntryError } from './entry-errors.js';

type Failure = (reason: string) => EntryError;

/**
 * Validates a required text field. Surrounding whitespace is rejected instead of trimmed, so a
 * caller never gets a silently different identifier than the one it sent.
 * The caller passes its own error factory to keep entry and line failures distinguishable.
 */
export function requireText(value: unknown, field: string, fail: Failure): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw fail(`${field} must be a non-empty string, received ${describeValue(value)}`);
  }
  if (value !== value.trim()) {
    throw fail(`${field} must not have leading or trailing whitespace, received ${describeValue(value)}`);
  }
  return value;
}

/** Optional text: absent stays absent; present is validated like a required field. */
export function requireOptionalText(value: unknown, field: string, fail: Failure): string | undefined {
  if (value === undefined) return undefined;
  return requireText(value, field, fail);
}
