import { JournalEntryLine, type JournalEntry, type PostingSide } from '../../../domain/entries/index.js';
import { Money } from '../../../domain/shared/money/index.js';
import type { EntryDraftResult, EntryLineInput, PostedLineResult, PostEntryResult } from '../../dto.js';

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
 * A line as the fingerprint sees it: the fields in a fixed order, with an absent description as `null`,
 * so the key order of a line object never changes the fingerprint.
 */
export function normalizedLine(line: EntryLineInput): readonly (string | number | null)[] {
  return [
    line.lineId,
    line.accountId,
    line.side,
    line.amount.minorUnits,
    line.amount.currency.code,
    line.amount.currency.scale,
    line.description ?? null,
  ];
}

export function lineOf(line: EntryLineInput): JournalEntryLine {
  return JournalEntryLine.create({
    id: line.lineId,
    accountId: line.accountId,
    side: line.side,
    amount: Money.fromJSON(line.amount),
    ...(line.description === undefined ? {} : { description: line.description }),
  });
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

/** Serializes a posted entry for the host: domain values never leave the module raw. */
export function postedResultOf(entry: JournalEntry): PostEntryResult {
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    // `post()` is the only path here, so the status is POSTED by construction.
    status: 'POSTED',
    accountingDate: entry.accountingDate.value,
    lines: entry.lines.map(serializeLine),
    totalDebit: sumSide(entry.lines, 'DEBIT').toJSON(),
    totalCredit: sumSide(entry.lines, 'CREDIT').toJSON(),
  };
}

/**
 * Serializes a draft. The status is always DRAFT here: every draft operation starts from a draft and the
 * aggregate refuses to change a posted entry, so no other status can reach this function.
 */
export function draftResultOf(entry: JournalEntry): EntryDraftResult {
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    status: 'DRAFT',
    accountingDate: entry.accountingDate.value,
    description: entry.description,
    lines: entry.lines.map(serializeLine),
  };
}
