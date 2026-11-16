import { describeValue } from '../shared/describe-value.js';
import type { Currency } from '../shared/money/index.js';
import { AccountingDate } from '../period/index.js';
import type {
  JournalEntryChanges,
  JournalEntryFields,
  JournalEntryInput,
  JournalEntryReversalInput,
} from './dto/journal-entry-dto.js';
import {
  duplicateLineId,
  entryCurrencyMismatch,
  entryIncomplete,
  entryLineNotFound,
  entryNumberInvalid,
  entryState,
  entryUnbalanced,
  invalidEntry,
  invalidEntryLine,
} from './errors/entry-errors.js';
import type { EntryStatus } from './types/entry-status.js';
import { JournalEntryLine } from './value-objects/journal-entry-line.js';
import { requireText } from './entry-text.js';

/**
 * Module-private proof that construction went through the validating factory.
 * A TypeScript-private constructor is a normal public constructor at runtime, so the token is what
 * actually stops a plain JavaScript caller from building a posted entry that skipped `post()`.
 */
const CONSTRUCTION_TOKEN = Symbol('JournalEntry');

/**
 * Aggregate of a journal entry: identity, draft lines, posting and reversal.
 * Every mutation returns a new entry; the receiver is never changed, so a rejected operation leaves
 * the previous state intact by construction.
 *
 * Posting protects only local invariants: at least two lines, one currency definition, equal debits
 * and credits, a DRAFT starting state and a positive integer number, which the application obtains from
 * the host's counter. The number is the only field the caller does not choose: it is a sequence of the
 * ledger, never an id. Application decides whether accounts may receive postings,
 * whether the journal belongs to the ledger and whether the period that contains the date is open.
 * A periodId alone proves nothing about the date it holds.
 */
export class JournalEntry {
  readonly #id: string;
  readonly #ledgerId: string;
  readonly #journalId: string;
  readonly #periodId: string;
  readonly #accountingDate: AccountingDate;
  readonly #description: string;
  readonly #status: EntryStatus;
  readonly #number: number | undefined;
  readonly #lines: readonly JournalEntryLine[];
  readonly #reversalOfEntryId: string | undefined;

  private constructor(fields: JournalEntryFields, token: typeof CONSTRUCTION_TOKEN) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw invalidEntry('an entry is created with createDraft or createReversalDraft, never with new');
    }

    this.#id = fields.id;
    this.#ledgerId = fields.ledgerId;
    this.#journalId = fields.journalId;
    this.#periodId = fields.periodId;
    this.#accountingDate = fields.accountingDate;
    this.#description = fields.description;
    this.#status = fields.status;
    requireNumberPair(fields.status, fields.number);
    this.#number = fields.number;
    // Copied and frozen: a caller never keeps a handle that could add or remove lines later.
    this.#lines = Object.freeze([...fields.lines]);
    this.#reversalOfEntryId = fields.reversalOfEntryId;
    Object.freeze(this);
  }

  static createDraft(input: JournalEntryInput): JournalEntry {
    if (typeof input !== 'object' || input === null) {
      throw invalidEntry(`expected an input object, received ${describeValue(input)}`);
    }

    return new JournalEntry({
      id: requireText(input.id, 'id', invalidEntry),
      ledgerId: requireText(input.ledgerId, 'ledgerId', invalidEntry),
      journalId: requireText(input.journalId, 'journalId', invalidEntry),
      periodId: requireText(input.periodId, 'periodId', invalidEntry),
      accountingDate: requireAccountingDate(input.accountingDate),
      description: requireText(input.description, 'description', invalidEntry),
      status: 'DRAFT',
      number: undefined,
      lines: [],
      reversalOfEntryId: undefined,
    }, CONSTRUCTION_TOKEN);
  }

  get id(): string {
    return this.#id;
  }

  get ledgerId(): string {
    return this.#ledgerId;
  }

  get journalId(): string {
    return this.#journalId;
  }

  get periodId(): string {
    return this.#periodId;
  }

  get accountingDate(): AccountingDate {
    return this.#accountingDate;
  }

  get description(): string {
    return this.#description;
  }

  get status(): EntryStatus {
    return this.#status;
  }

  /**
   * Sequential number inside the ledger, present only on a posted entry. `undefined` is the honest
   * answer for a draft: it has no number to give, and inventing one would consume the ledger's sequence
   * for something that is not an accounting fact yet.
   */
  get number(): number | undefined {
    return this.#number;
  }

  get reversalOfEntryId(): string | undefined {
    return this.#reversalOfEntryId;
  }

  /** Frozen snapshot: changing the returned array never changes the entry. */
  get lines(): readonly JournalEntryLine[] {
    return Object.freeze([...this.#lines]);
  }

  /** Returns a draft with the line appended; a posted entry rejects the change. */
  addLine(line: JournalEntryLine): JournalEntry {
    this.#requireDraft('a posted entry cannot add lines');

    if (!(line instanceof JournalEntryLine)) {
      throw invalidEntryLine(`expected a JournalEntryLine, received ${describeValue(line)}`);
    }
    if (this.#lines.some((existing) => existing.id === line.id)) {
      throw duplicateLineId(`"${line.id}" is already used inside this entry`);
    }

    return this.#copyWith({ lines: [...this.#lines, line] });
  }

  /** Returns a draft without the line; a posted entry rejects the change. */
  removeLine(lineId: string): JournalEntry {
    this.#requireDraft('a posted entry cannot remove lines');

    const remaining = this.#lines.filter((line) => line.id !== lineId);
    if (remaining.length === this.#lines.length) {
      throw entryLineNotFound(`"${describeValue(lineId)}" is not part of this entry`);
    }

    return this.#copyWith({ lines: remaining });
  }

  /**
   * Returns a posted copy carrying the number it is given. Debits must equal credits exactly, every line
   * must share one currency definition, at least two lines are required and the number must be a positive
   * integer. A rejected post returns nothing and leaves the receiver as a DRAFT.
   *
   * The number comes from the application, which asks the ledger's counter (Q11): the aggregate checks
   * that it is a number, not that it is free — uniqueness is the host's constraint, the same division as
   * with entry ids and with the single-reversal rule.
   */
  post(number: number): JournalEntry {
    if (this.#status === 'POSTED') {
      throw entryState('the entry is already posted');
    }

    requireSequentialNumber(number);
    this.#assertReadyToPost();

    return this.#copyWith({ status: 'POSTED', number });
  }

  /**
   * Returns a DRAFT that reverses a posted entry: same amounts, opposite sides, linked to the
   * original, which stays POSTED and untouched. Reversal lines reuse the original line ids, which are
   * unique inside their own entry; a globally unique line id is a persistence concern.
   */
  createReversalDraft(input: JournalEntryReversalInput): JournalEntry {
    if (this.#status !== 'POSTED') {
      throw entryState('only a posted entry can be reversed');
    }
    if (typeof input !== 'object' || input === null) {
      throw invalidEntry(`expected an input object, received ${describeValue(input)}`);
    }

    const id = requireText(input.id, 'id', invalidEntry);
    if (id === this.#id) {
      throw invalidEntry(`a reversal must have its own id, received ${describeValue(id)}`);
    }

    return new JournalEntry({
      id,
      ledgerId: this.#ledgerId,
      journalId: this.#journalId,
      periodId: requireText(input.periodId, 'periodId', invalidEntry),
      accountingDate: requireAccountingDate(input.accountingDate),
      description:
        input.description === undefined
          ? this.#description
          : requireText(input.description, 'description', invalidEntry),
      status: 'DRAFT',
      number: undefined,
      lines: this.#lines.map((line) =>
        JournalEntryLine.create({
          id: line.id,
          accountId: line.accountId,
          side: line.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          amount: line.amount,
          ...(line.description === undefined ? {} : { description: line.description }),
        }),
      ),
      reversalOfEntryId: this.#id,
    }, CONSTRUCTION_TOKEN);
  }

  #requireDraft(reason: string): void {
    if (this.#status !== 'DRAFT') {
      throw entryState(reason);
    }
  }

  /**
   * The only place that decides whether a draft may be posted: enough lines, one currency definition
   * and equal exact totals. `post()` repeats none of these checks, so the preconditions of this helper
   * cannot drift from its callers.
   */
  #assertReadyToPost(): void {
    if (this.#lines.length < 2) {
      throw entryIncomplete(`posting needs at least two lines, received ${this.#lines.length}`);
    }

    let currency: Currency | undefined;
    let debits = 0n;
    let credits = 0n;

    for (const line of this.#lines) {
      currency ??= line.amount.currency;
      if (!line.amount.currency.equals(currency)) {
        const found = `${line.amount.currency.code}/${line.amount.currency.scale}`;
        throw entryCurrencyMismatch(`${found} cannot balance an entry in ${currency.code}/${currency.scale}`);
      }
      if (line.side === 'DEBIT') {
        debits += line.amount.minorUnits;
      } else {
        credits += line.amount.minorUnits;
      }
    }

    if (debits !== credits) {
      throw entryUnbalanced(`debits ${debits} and credits ${credits} minor units are not equal`);
    }
  }

  #copyWith(changes: JournalEntryChanges): JournalEntry {
    return new JournalEntry({
      id: this.#id,
      ledgerId: this.#ledgerId,
      journalId: this.#journalId,
      periodId: this.#periodId,
      accountingDate: this.#accountingDate,
      description: this.#description,
      status: changes.status ?? this.#status,
      number: changes.number ?? this.#number,
      lines: changes.lines ?? this.#lines,
      reversalOfEntryId: this.#reversalOfEntryId,
    }, CONSTRUCTION_TOKEN);
  }
}

function requireAccountingDate(value: unknown): AccountingDate {
  if (!(value instanceof AccountingDate)) {
    throw invalidEntry(`accountingDate must be an AccountingDate, received ${describeValue(value)}`);
  }
  return value;
}

/** The number is a positive integer or it is not a number: no zero, no negatives, no fractions. */
function requireSequentialNumber(number: unknown): number {
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) {
    throw entryNumberInvalid(`expected a positive integer, received ${describeValue(number)}`);
  }
  return number;
}

/**
 * The status and the number are decided together: a draft has none and a posted entry has one, so the
 * pair is validated once, where both are known, instead of trusting callers to keep it consistent.
 */
function requireNumberPair(status: EntryStatus, number: number | undefined): void {
  if (status === 'DRAFT' && number !== undefined) {
    throw entryNumberInvalid(`a draft has no number, received ${describeValue(number)}`);
  }
  if (status === 'POSTED') {
    requireSequentialNumber(number);
  }
}
