import type { JournalEntry, JournalEntryLine } from '../../../domain/entries/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import { Money, type Currency } from '../../../domain/shared/money/index.js';
import type { AccountMovementRow } from '../../dto.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';
import { isReportEntry, type ReportRange } from './rules.js';

/**
 * The account ledger: one account, its movements in chronological order and the balance after each one.
 *
 * The core owns almost everything here because the port promises little: it returns `POSTED` entries with
 * their lines, in any order inside a page, and pages by **entry** while this report pages by **row**. So the
 * drain collects the rows, the core orders them by `(accountingDate, entryId, lineId)` and only then cuts the
 * page, which is the only way a page boundary can never skip or repeat a line of an entry that straddles it.
 *
 * ## Cost, and why the cursor carries no amount
 *
 * `runningBalance` is derived like every other figure of the module (D1): it is never stored and the cursor is
 * never believed. A page reached by a cursor re-drains **the whole range** from `from` —not only the rows
 * before the cut— and re-sorts it, because the running balance is a prefix sum of the range and the core owns
 * the order. Walking the whole report is therefore quadratic in the rows of the range, both in port reads and
 * in comparisons, and that is accepted: the port filters by account, and the alternative is a balance the
 * caller could forge in the cursor or a materialized balance that can disagree with the entries. No snapshot,
 * cache or materialized balance exists to soften it.
 */

/** One drained page: small enough to keep the drain bounded, large enough not to round-trip per entry. */
const PAGE_SIZE = 200;

/** The version mark of the cursor, so a cursor of another report is refused instead of misread. */
const CURSOR_VERSION = 'am1';

/**
 * Where a row sits in the ordered stream: the accounting date, the entry and the line.
 *
 * It is the whole content of the cursor. A port cursor is not part of it: the report re-drains the range for
 * the reason above, so repeating the port's page boundaries would buy nothing and would tie the caller's
 * cursor to the host's page size.
 */
export interface MovementPosition {
  readonly date: string;
  readonly entryId: string;
  readonly lineId: string;
}

/** A row plus the position the cursor remembers; the row alone is what leaves the module. */
export interface MovementRow {
  readonly row: AccountMovementRow;
  readonly position: MovementPosition;
}

/**
 * The net of every posted line of one account strictly before `before` (rule 12), or zero when the range has
 * no start.
 *
 * The port compares dates inclusively, so entries on `before` itself come back and the core drops them: the
 * opening balance is what happened *before* the first reported row, and the row on `from` belongs to the page.
 */
export async function openingBalanceOf(
  scope: UnitOfWorkScope,
  ledgerId: string,
  currency: Currency,
  accountId: string,
  before: AccountingDate | undefined,
): Promise<Money> {
  const zero = Money.fromMinorUnits(0n, currency);
  if (before === undefined) return zero;

  let balance = zero;
  for await (const entry of postedEntries(scope, ledgerId, { to: before, accountId })) {
    if (entry.accountingDate.compare(before) >= 0) continue;

    for (const line of entry.lines) {
      if (line.accountId !== accountId) continue;
      balance = signed(balance, line);
    }
  }

  return balance;
}

/**
 * Every row of the account in the range, ordered and with its running balance already continued from
 * `opening`.
 *
 * The order is the one the specification fixes — `accountingDate`, then `entryId`, then `lineId` (rule 8) —
 * and it is produced here because the port may return a page in any order. Two lines of the same account in
 * one entry are two rows: the report is a ledger, and a ledger lists lines, not entry totals.
 */
export async function movementRows(
  scope: UnitOfWorkScope,
  ledgerId: string,
  accountId: string,
  range: ReportRange,
  opening: Money,
): Promise<readonly MovementRow[]> {
  const drained: { readonly entry: JournalEntry; readonly line: JournalEntryLine }[] = [];

  for await (const entry of postedEntries(scope, ledgerId, {
    ...(range.from === undefined ? {} : { from: range.from }),
    ...(range.to === undefined ? {} : { to: range.to }),
    accountId,
  })) {
    for (const line of entry.lines) {
      if (line.accountId === accountId) drained.push({ entry, line });
    }
  }

  drained.sort(
    (left, right) =>
      left.entry.accountingDate.compare(right.entry.accountingDate) ||
      compareText(left.entry.id, right.entry.id) ||
      compareText(left.line.id, right.line.id),
  );

  let running = opening;
  return drained.map(({ entry, line }) => {
    // `Money` refuses to add another currency, so a line the host denominated elsewhere fails the report
    // closed here instead of producing a sum of two currencies (rule 3).
    running = signed(running, line);

    const position: MovementPosition = { date: entry.accountingDate.value, entryId: entry.id, lineId: line.id };

    return {
      position,
      row: {
        entryId: entry.id,
        lineId: line.id,
        accountingDate: entry.accountingDate.value,
        journalId: entry.journalId,
        // The entry's description, which every entry has: a line description is optional, so using it would
        // make the field of the row optional too.
        description: entry.description,
        side: line.side,
        amount: line.amount.toJSON(),
        runningBalance: running.toJSON(),
        ...(entry.reversalOfEntryId === undefined ? {} : { reversalOfEntryId: entry.reversalOfEntryId }),
      },
    };
  });
}

export interface MovementPage {
  readonly rows: readonly AccountMovementRow[];
  readonly closingBalance: Money;
  readonly nextCursor: string | null;
}

/** A cursor that passed the shape check, with the raw value kept for the error it may still deserve. */
export interface MovementsCursor {
  readonly position: MovementPosition;
  readonly raw: string;
}

/**
 * The window after the cursor, its closing balance and the cursor of the row that ends it.
 *
 * `closingBalance` is the balance after the last row **returned** (rule 13), so on a page that is not the
 * last one it is not the balance at the end of the range. A page without rows has no row to close on, so it
 * closes where it opens: the opening balance, and no next cursor.
 */
export function movementPage(
  rows: readonly MovementRow[],
  opening: Money,
  limit: number,
  cursor: MovementsCursor | undefined,
): MovementPage {
  const first = cursor === undefined ? 0 : positionAfter(rows, cursor);
  const window = rows.slice(first, first + limit);

  if (window.length === 0) {
    // Rule 13: no row follows, so there is nothing to close on and nothing to announce.
    return { rows: [], closingBalance: opening, nextCursor: null };
  }

  const last = window[window.length - 1];
  const end = first + window.length;

  return {
    rows: window.map((candidate) => candidate.row),
    closingBalance: last === undefined ? opening : Money.fromJSON(last.row.runningBalance),
    nextCursor: end < rows.length && last !== undefined ? encodeCursor(last.position) : null,
  };
}

/**
 * The index of the first row after the cursor, proving that the cursor's position is one of the drained
 * rows of this account and this range.
 *
 * This is the provenance check of rule 14. A cursor with a valid shape whose cut is not among these rows — a
 * line or entry that does not exist, a date the requested range does not reach, or a cursor produced for
 * another account or another range — would silently skip the rows in between, so it is refused instead of
 * trusted. The check costs nothing extra: the page already needed the ordered rows to cut them.
 */
function positionAfter(rows: readonly MovementRow[], cursor: MovementsCursor): number {
  const index = rows.findIndex((candidate) => comparePosition(candidate.position, cursor.position) === 0);
  if (index === -1) throw errors.invalidApplicationInput('cursor', cursor.raw);
  return index + 1;
}

/**
 * The cursor of a row, opaque to the caller: a version mark and the position, nothing else.
 *
 * It deliberately carries no amount and no count. A cursor that carried a balance would be a value the
 * caller could edit and the report would disclose as its own, and it would have to be re-verified against a
 * drain anyway.
 */
export function encodeCursor(position: MovementPosition): string {
  return JSON.stringify([CURSOR_VERSION, position.date, position.entryId, position.lineId]);
}

/**
 * Reads a cursor produced by `encodeCursor`. Anything else is `INVALID_APPLICATION_INPUT`: continuing from a
 * cursor nobody produced would either repeat rows or skip them, and neither is an answer worth returning.
 *
 * The check here is the shape only, because whether the position is one of the rows of the requested account
 * and range is a fact this function cannot know; `positionAfter` proves that against the drained rows.
 */
export function decodeCursor(raw: string): MovementsCursor {
  const refuse = (): never => {
    throw errors.invalidApplicationInput('cursor', raw);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refuse();
  }

  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== CURSOR_VERSION) return refuse();

  const [, date, entryId, lineId] = parsed;
  if (typeof date !== 'string' || typeof entryId !== 'string' || typeof lineId !== 'string') return refuse();
  if (entryId.length === 0 || lineId.length === 0) return refuse();
  try {
    AccountingDate.create(date);
  } catch {
    return refuse();
  }

  return { position: { date, entryId, lineId }, raw };
}

/** The signed movement of one line: debit adds, credit subtracts, and the side is the only thing that decides. */
function signed(balance: Money, line: JournalEntryLine): Money {
  return line.side === 'DEBIT' ? balance.add(line.amount) : balance.subtract(line.amount);
}

/**
 * Drains the posted entries of the criteria page by page and yields them one by one.
 *
 * The pages are forgotten as they are consumed, so what is held is the caller's accumulation and never the
 * ledger's history. The port's own cursor is used only to walk its pages, never to answer the caller, and an
 * entry that is not `POSTED` or that belongs to another ledger is dropped here (rule 1): the report asks for
 * the right entries and still discards what it did not ask for.
 */
async function* postedEntries(
  scope: UnitOfWorkScope,
  ledgerId: string,
  criteria: { readonly from?: AccountingDate; readonly to?: AccountingDate; readonly accountId?: string },
): AsyncGenerator<JournalEntry> {
  let cursor: string | undefined;

  for (;;) {
    const page = await scope.postedEntries.findPostedMovements(
      ledgerId,
      criteria,
      { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    );

    for (const entry of page.entries) {
      if (isReportEntry(entry, ledgerId)) yield entry;
    }

    if (page.nextCursor === null) return;
    cursor = page.nextCursor;
  }
}

/**
 * The total order of the report: date, entry, line, each compared as text.
 *
 * The date is `YYYY-MM-DD`, so text order is calendar order; entry and line ids are compared as written, like
 * the account code of the balance reports, so the same read twice returns the same order.
 */
function comparePosition(left: MovementPosition, right: MovementPosition): number {
  return (
    compareText(left.date, right.date) ||
    compareText(left.entryId, right.entryId) ||
    compareText(left.lineId, right.lineId)
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
