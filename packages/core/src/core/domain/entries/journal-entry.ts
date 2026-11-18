import { describeValue } from '../shared/describe-value.js';
import { Currency, ExchangeRate, Money, MoneyError } from '../shared/money/index.js';
import { AccountingDate } from '../period/index.js';
import type {
  JournalEntryChanges,
  JournalEntryFields,
  JournalEntryHeaderInput,
  JournalEntryInput,
  JournalEntryPostContext,
  JournalEntryReversalInput,
} from './dto/journal-entry-dto.js';
import {
  duplicateLineId,
  entryCurrencyMismatch,
  entryIncomplete,
  entryLineNotFound,
  entryNumberInvalid,
  entryRateDuplicate,
  entryRateMissing,
  entryState,
  entryUnbalanced,
  invalidEntry,
  invalidEntryLine,
} from './errors/entry-errors.js';
import type { EntryStatus } from './types/entry-status.js';
import { FUNCTIONAL_AMOUNT_TOKEN, JournalEntryLine } from './value-objects/journal-entry-line.js';
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
 * Posting protects only local invariants: at least two lines, every line expressed in the ledger's functional
 * currency — converted with the rate it received when it was foreign — equal functional debits and credits, a
 * DRAFT starting state and a positive integer number, which the application obtains from the host's counter.
 * The number is the only field the caller does not choose: it is a sequence of the ledger, never an id.
 * Application decides whether accounts may receive postings, whether the journal belongs to the ledger and
 * whether the period that contains the date is open. A periodId alone proves nothing about the date it holds.
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
   * Returns a draft with a new header: journal, period, accounting date and description.
   *
   * The four fields are the whole header, so a caller that changes one still sends all of them. Everything
   * else —id, ledger, status, number, lines and the reversal link— is preserved: a draft does not move
   * between ledgers or change identity, and a reversal keeps pointing at its original while it moves to the
   * period and date it needs. Only the aggregate's own state rule applies here: a posted entry has no header
   * to change. Nothing is revalidated against the lines or the currency, because a draft is allowed to stay
   * unbalanced, inactive or out of its period until `post()` asks again.
   */
  changeHeader(changes: JournalEntryHeaderInput): JournalEntry {
    this.#requireDraft('a posted entry cannot change its header');

    if (typeof changes !== 'object' || changes === null) {
      throw invalidEntry(`expected a header object, received ${describeValue(changes)}`);
    }

    return this.#copyWith({
      journalId: requireText(changes.journalId, 'journalId', invalidEntry),
      periodId: requireText(changes.periodId, 'periodId', invalidEntry),
      accountingDate: requireAccountingDate(changes.accountingDate),
      description: requireText(changes.description, 'description', invalidEntry),
    });
  }

  /**
   * Returns a posted copy carrying the number it is given and its lines converted into the ledger's functional
   * currency. Debits must equal credits exactly **in functional minor units**, at least two lines are required
   * and the number must be a positive integer. A rejected post returns nothing and leaves the receiver as a
   * DRAFT.
   *
   * Every line keeps its original amount. A line already in the functional currency takes that same amount as
   * its functional one and no rate; any other line requires a rate from its own currency into the functional
   * one, and is converted once with `Money.multiply`, so the functional amount is stored beside the rate that
   * produced it and never recalculated (rules 6 and 7).
   *
   * A reversal draft already carries the functional amounts and rates of the original, and those are kept as
   * they are: a reversal mirrors, it never converts again (rule 8). `ENTRY_CURRENCY_MISMATCH` survives as the
   * aggregate's own guard for a carried functional amount in another currency; it is unreachable through the
   * public path, because only posting writes that field and posting always uses the currency it was given.
   *
   * The number comes from the application, which asks the ledger's counter (Q11): the aggregate checks that it
   * is a number, not that it is free — uniqueness is the host's constraint, the same division as with entry
   * ids and with the single-reversal rule.
   */
  post(context: JournalEntryPostContext): JournalEntry {
    if (this.#status === 'POSTED') {
      throw entryState('the entry is already posted');
    }

    const { number, functionalCurrency, rates } = requirePostContext(context);
    const lines = this.#convertedLines(functionalCurrency, rates);

    return this.#copyWith({ status: 'POSTED', number, lines });
  }

  /**
   * Returns a DRAFT that reverses a posted entry: same amounts, opposite sides, linked to the
   * original, which stays POSTED and untouched. Reversal lines reuse the original line ids, which are
   * unique inside their own entry; a globally unique line id is a persistence concern.
   *
   * The mirrored lines also bring the functional amount and the rate the original was posted with, so the
   * reversal's functional amounts are exactly opposite and posting it needs no rate and no second conversion
   * (rule 8). That is the one draft that carries functional amounts, and it can only be produced from a
   * posted entry.
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
      lines: this.#lines.map(mirrorOf),
      reversalOfEntryId: this.#id,
    }, CONSTRUCTION_TOKEN);
  }

  #requireDraft(reason: string): void {
    if (this.#status !== 'DRAFT') {
      throw entryState(reason);
    }
  }

  /**
   * The only place that decides whether a draft may be posted: enough lines, one functional currency, a rate
   * for every foreign line and equal exact totals in that currency. `post()` repeats none of these checks, so
   * the preconditions of this helper cannot drift from its callers.
   */
  #convertedLines(functionalCurrency: Currency, rates: readonly ExchangeRate[]): readonly JournalEntryLine[] {
    if (this.#lines.length < 2) {
      throw entryIncomplete(`posting needs at least two lines, received ${this.#lines.length}`);
    }

    const bySource = indexRates(rates, functionalCurrency);
    const converted: JournalEntryLine[] = [];
    let debits = 0n;
    let credits = 0n;

    for (const line of this.#lines) {
      const functionalAmount = functionalAmountOf(line, functionalCurrency, bySource);
      if (!functionalAmount.currency.equals(functionalCurrency)) {
        const found = `${functionalAmount.currency.code}/${functionalAmount.currency.scale}`;
        const target = `${functionalCurrency.code}/${functionalCurrency.scale}`;
        throw entryCurrencyMismatch(`${found} cannot balance an entry in ${target}`);
      }

      if (line.functionalAmount === undefined) {
        const rate = bySource.get(currencyKey(line.amount.currency));
        converted.push(
          line.withFunctionalAmount(
            { functionalAmount, ...(rate === undefined ? {} : { rate }) },
            FUNCTIONAL_AMOUNT_TOKEN,
          ),
        );
      } else {
        converted.push(line);
      }

      if (line.side === 'DEBIT') {
        debits += functionalAmount.minorUnits;
      } else {
        credits += functionalAmount.minorUnits;
      }
    }

    if (debits !== credits) {
      throw entryUnbalanced(`functional debits ${debits} and credits ${credits} minor units are not equal`);
    }

    return converted;
  }

  #copyWith(changes: JournalEntryChanges): JournalEntry {
    return new JournalEntry({
      id: this.#id,
      ledgerId: this.#ledgerId,
      journalId: changes.journalId ?? this.#journalId,
      periodId: changes.periodId ?? this.#periodId,
      accountingDate: changes.accountingDate ?? this.#accountingDate,
      description: changes.description ?? this.#description,
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

/**
 * The context of a post, validated as a whole: the number, the ledger's currency and the rates.
 *
 * The ledger's functional currency and its sequence are the two things the aggregate cannot read by itself —
 * it knows `ledgerId`, not the ledger — so they arrive with the operation and are checked like any other
 * untrusted input. A rate that is not an `ExchangeRate` is `INVALID_EXCHANGE_RATE`: converting with something
 * the domain does not recognise would be converting with a number.
 */
function requirePostContext(value: unknown): JournalEntryPostContext {
  if (typeof value !== 'object' || value === null) {
    throw invalidEntry(`expected a post context object, received ${describeValue(value)}`);
  }
  if (!('number' in value) || !('functionalCurrency' in value) || !('rates' in value)) {
    throw invalidEntry(`expected "number", "functionalCurrency" and "rates", received ${describeValue(value)}`);
  }

  const functionalCurrency = value.functionalCurrency;
  if (!(functionalCurrency instanceof Currency)) {
    throw invalidEntry(`functionalCurrency must be a Currency, received ${describeValue(functionalCurrency)}`);
  }

  const rates = value.rates;
  if (!Array.isArray(rates)) {
    throw invalidEntry(`rates must be a list of ExchangeRate, received ${describeValue(rates)}`);
  }
  for (const rate of rates) {
    if (!(rate instanceof ExchangeRate)) {
      throw invalidRate(`expected an ExchangeRate, received ${describeValue(rate)}`);
    }
  }

  return { number: requireSequentialNumber(value.number), functionalCurrency, rates };
}

/**
 * Indexes the rates by source currency, rejecting a duplicated source and a rate that converts elsewhere.
 *
 * Both checks are the aggregate's, not the application's: the caller supplies a list, and only the entry
 * knows which currencies its lines carry and which currency is the book's. Two rates from one currency are
 * `ENTRY_RATE_DUPLICATE` — picking one would invent a precedence rule (rule 12) — and a rate into a currency
 * that is not the functional one is `INVALID_EXCHANGE_RATE`, because it is not the pair that corresponds.
 */
function indexRates(
  rates: readonly ExchangeRate[],
  functionalCurrency: Currency,
): ReadonlyMap<string, ExchangeRate> {
  const bySource = new Map<string, ExchangeRate>();

  for (const rate of rates) {
    if (!rate.to.equals(functionalCurrency)) {
      throw invalidRate(
        `${currencyKey(rate.from)} → ${currencyKey(rate.to)} does not convert into ${currencyKey(functionalCurrency)}`,
      );
    }

    const source = currencyKey(rate.from);
    if (bySource.has(source)) {
      throw entryRateDuplicate(`two rates from ${source} in one operation`);
    }
    bySource.set(source, rate);
  }

  return bySource;
}

/**
 * The functional amount of one line, decided once.
 *
 * A line already in the functional currency is worth what it says and needs no rate (rule 3). A foreign line
 * needs its own rate — never one borrowed from another line, from another entry or from a unit factor
 * (rule 4) — and a reversal line brings the functional amount it was posted with, mirrored untouched.
 */
function functionalAmountOf(
  line: JournalEntryLine,
  functionalCurrency: Currency,
  rates: ReadonlyMap<string, ExchangeRate>,
): Money {
  if (line.functionalAmount !== undefined) return line.functionalAmount;
  if (line.amount.currency.equals(functionalCurrency)) return line.amount;

  const source = currencyKey(line.amount.currency);
  const rate = rates.get(source);
  if (rate === undefined) {
    throw entryRateMissing(
      `line ${JSON.stringify(line.id)} is in ${source} and no rate ${source} → ${currencyKey(functionalCurrency)} was supplied`,
    );
  }

  return convertedAmountOf(line.amount, rate, functionalCurrency);
}

/**
 * Converts one amount with its rate, keeping the money domain's single rounding.
 *
 * `Money.multiply` returns the product in the operand's currency, because a factor has no currency of its own,
 * so the product is expressed in the functional currency here. That is exact exactly when both currencies
 * share a scale: with different scales one multiply rounds in the wrong unit and rescaling afterwards would
 * round a second time, so such a pair is refused instead of converted approximately.
 */
function convertedAmountOf(amount: Money, rate: ExchangeRate, functionalCurrency: Currency): Money {
  if (amount.currency.scale !== functionalCurrency.scale) {
    throw invalidRate(
      `${currencyKey(rate.from)} → ${currencyKey(rate.to)} cannot be expressed with a single multiply because their scales differ`,
    );
  }

  return Money.fromMinorUnits(amount.multiply(rate.factor).minorUnits, functionalCurrency);
}

/**
 * The mirrored line of a reversal: the opposite side, the same original amount, and the functional amount and
 * rate the original was posted with. Nothing is recalculated, so a reversal cannot produce an exchange
 * difference (rule 8).
 */
function mirrorOf(line: JournalEntryLine): JournalEntryLine {
  const mirrored = JournalEntryLine.create({
    id: line.id,
    accountId: line.accountId,
    side: line.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amount: line.amount,
    ...(line.description === undefined ? {} : { description: line.description }),
  });
  if (line.functionalAmount === undefined) return mirrored;

  return mirrored.withFunctionalAmount(
    { functionalAmount: line.functionalAmount, ...(line.rate === undefined ? {} : { rate: line.rate }) },
    FUNCTIONAL_AMOUNT_TOKEN,
  );
}

/** `code/scale` is the identity of a currency, so it is also the key that finds its rate. */
function currencyKey(currency: Currency): string {
  return `${currency.code}/${currency.scale}`;
}

/**
 * A rejected rate is the money domain's `INVALID_EXCHANGE_RATE`, with the message its own factory writes.
 * The money barrel publishes `MoneyError` and keeps the factories internal to `money`, so the aggregate builds
 * the one error it has to raise itself.
 */
function invalidRate(reason: string): MoneyError {
  return new MoneyError('INVALID_EXCHANGE_RATE', `Invalid exchange rate: ${reason}.`);
}
