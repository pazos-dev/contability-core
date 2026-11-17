import { JournalEntryLine, type JournalEntry, type PostingSide } from '../../../domain/entries/index.js';
import { Currency, ExchangeRate, Money, MoneyFactor } from '../../../domain/shared/money/index.js';
import type { EntryDraftResult, EntryLineInput, ExchangeRateInput, PostedLineResult, PostEntryResult } from '../../dto.js';

/** Serializes one line: a domain value never leaves the module raw. */
export function serializeLine(line: JournalEntryLine): PostedLineResult {
  return {
    lineId: line.id,
    accountId: line.accountId,
    side: line.side,
    amount: line.amount.toJSON(),
    ...(line.functionalAmount === undefined ? {} : { functionalAmount: line.functionalAmount.toJSON() }),
    ...(line.rate === undefined ? {} : { rate: line.rate.toJSON() }),
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
 * Hydrates one rate of a posting: the caller sends the line's currency and the exact factor, and the ledger's
 * functional currency is the destination.
 *
 * The domain validates both — `INVALID_FACTOR` for a factor that is not a canonical decimal and
 * `INVALID_EXCHANGE_RATE` for a pair or a sign that is not a rate — and the application does not repeat any of
 * those checks, exactly as it does not repeat the line rules.
 */
export function rateOf(input: ExchangeRateInput, functionalCurrency: Currency): ExchangeRate {
  return ExchangeRate.create({
    from: Currency.fromJSON(input.currency),
    to: functionalCurrency,
    factor: MoneyFactor.fromDecimal(input.factor),
  });
}

/**
 * The rates of a request in canonical form, for the idempotency fingerprint: `code/scale/factor` per rate,
 * sorted, so the order the caller wrote them in is not part of the request (rule 10).
 *
 * An absent list and an empty one are the same request, and both produce `undefined`, which the fingerprint
 * drops: a request without rates keeps the fingerprint it had before this increment.
 */
export function normalizedRates(rates: readonly ExchangeRateInput[] | undefined): readonly string[] | undefined {
  if (rates === undefined || rates.length === 0) return undefined;

  return rates
    .map((rate) => `${rate.currency.code}/${rate.currency.scale}/${rate.factor}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Sums one side of a posted entry with exact `Money` arithmetic, in the ledger's functional currency: the
 * functional amounts are what balance (rule 1).
 * Only called on a posted entry, which is balanced with at least two positive lines, so a side is
 * never empty and every line carries a functional amount; the throws are invariant guards, not user-facing
 * conditions.
 */
export function sumSide(lines: readonly JournalEntryLine[], side: PostingSide): Money {
  let total: Money | undefined;
  for (const line of lines) {
    if (line.side !== side) continue;
    const amount = line.functionalAmount;
    if (amount === undefined) {
      throw new Error('Invariant violated: a posted line must carry its functional amount.');
    }
    total = total === undefined ? amount : total.add(amount);
  }
  if (total === undefined) {
    throw new Error(`Invariant violated: a posted entry must have at least one ${side} line.`);
  }
  return total;
}

/** Serializes a posted entry for the host: domain values never leave the module raw. */
export function postedResultOf(entry: JournalEntry): PostEntryResult {
  // Only a posted entry reaches here, and the aggregate refuses to build one without a number, so an
  // absent number is an invariant violation, not a user-facing condition.
  const number = entry.number;
  if (number === undefined) {
    throw new Error('Invariant violated: a posted entry must have a number.');
  }
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    // `post()` is the only path here, so the status is POSTED by construction.
    status: 'POSTED',
    number,
    accountingDate: entry.accountingDate.value,
    lines: entry.lines.map(serializeLine),
    totalDebit: sumSide(entry.lines, 'DEBIT').toJSON(),
    totalCredit: sumSide(entry.lines, 'CREDIT').toJSON(),
  };
}

/**
 * Serializes a draft. The status is always DRAFT here: every draft operation starts from a draft and the
 * aggregate refuses to change a posted entry, so no other status can reach this function.
 * A draft has no number and will not get one: the number is assigned when the entry is posted (spec rule 1).
 */
export function draftResultOf(entry: JournalEntry): EntryDraftResult {
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    status: 'DRAFT',
    number: null,
    accountingDate: entry.accountingDate.value,
    description: entry.description,
    lines: entry.lines.map(serializeLine),
  };
}
