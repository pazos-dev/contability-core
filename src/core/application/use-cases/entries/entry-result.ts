import type { JournalEntryLine, PostingSide } from '../../../domain/entries/index.js';
import { Money } from '../../../domain/money/index.js';
import type { PostedLineResult } from '../../contracts/entries.js';

/** Serializes one line: a domain value never leaves the module raw. */
export function serializeLine(line: JournalEntryLine): PostedLineResult {
  return {
    lineId: line.id,
    accountId: line.accountId,
    side: line.side,
    amount: line.amount.toJSON(),
    ...(line.description === undefined ? {} : { description: line.description }),
  };
}

/**
 * Sums one side of an entry with exact `Money` arithmetic.
 * Only called on a posted entry, which is balanced with at least two positive lines, so a side is
 * never empty; the throw is an invariant guard, not a user-facing condition.
 */
export function sumSide(lines: readonly JournalEntryLine[], side: PostingSide): Money {
  let total: Money | undefined;
  for (const line of lines) {
    if (line.side !== side) continue;
    total = total === undefined ? line.amount : total.add(line.amount);
  }
  if (total === undefined) {
    throw new Error(`Invariant violated: a posted entry must have at least one ${side} line.`);
  }
  return total;
}
