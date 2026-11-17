import { JournalEntryLine, type JournalEntry, type PostingSide } from '../../../domain/entries/index.js';
import { Currency, ExchangeRate, Money, MoneyFactor } from '../../../domain/shared/money/index.js';
import type { EntryDraftResult, EntryLineInput, ExchangeRateInput, PostedLineResult, PostEntryResult } from '../../dto.js';
import * as errors from '../../errors.js';

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
 *
 * The shape is validated here because it is an input of this layer, not a domain value: the value must be absent
 * or a list of plain objects carrying `currency` and `factor`. Anything else is `INVALID_APPLICATION_INPUT`
 * before the unit of work opens, so a malformed request cannot throw a `TypeError` from the fingerprint and
 * cannot write anything. The contents still belong to the domain: `Currency.fromJSON` and
 * `MoneyFactor.fromDecimal` are the ones that reject an unknown currency or a factor that is not canonical.
 *
 * The factor is canonicalized as a value, not as a spelling: `41.25` and `41.250` are the same rate
 * (`ExchangeRate.equals`), so they have to produce the same fingerprint or a replay would be mistaken for
 * `IDEMPOTENCY_CONFLICT`.
 */
export function normalizedRates(rates: readonly ExchangeRateInput[] | undefined): readonly string[] | undefined {
  if (rates === undefined) return undefined;
  if (!Array.isArray(rates)) throw errors.invalidApplicationInput('rates', rates);
  if (rates.length === 0) return undefined;

  return rates
    .map((rate) => {
      if (!isExchangeRateInput(rate)) throw errors.invalidApplicationInput('rates', rate);
      return `${rate.currency.code}/${rate.currency.scale}/${canonicalFactor(rate.factor)}`;
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * A rate as the caller must send it: a plain object with the line's currency and the factor as text.
 *
 * Only the shape is checked. The currency is a plain object with a code and a scale because that is
 * `CurrencyJSON`, and both are hydrated by the domain, which rejects what it does not accept.
 */
function isExchangeRateInput(value: unknown): value is ExchangeRateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const candidate = value as { readonly currency?: unknown; readonly factor?: unknown };
  if (typeof candidate.factor !== 'string') return false;
  if (typeof candidate.currency !== 'object' || candidate.currency === null) return false;

  const currency = candidate.currency as { readonly code?: unknown; readonly scale?: unknown };
  return typeof currency.code === 'string' && typeof currency.scale === 'number';
}

/**
 * One factor without the trailing zeros a decimal keeps for free: `41.250` becomes `41.25` and `3.000`
 * becomes `3`, which is the same value with the denominator brought down to one. The transformation is
 * textual on purpose: the fingerprint is computed before the aggregate hydrates and validates the rates, and
 * an invalid factor has to reach that validation unchanged instead of failing here with another error.
 */
function canonicalFactor(factor: string): string {
  return factor.includes('.') ? factor.replace(/0+$/, '').replace(/\.$/, '') : factor;
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
    ...(entry.reversalOfEntryId === undefined ? {} : { reversalOfEntryId: entry.reversalOfEntryId }),
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
