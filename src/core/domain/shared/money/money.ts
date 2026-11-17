import { describeValue } from '../describe-value.js';
import { Currency } from './currency.js';
import type { MoneyJSON } from './dto/money-dto.js';
import { MoneyFactor } from './factor.js';
import { currencyMismatch, divisionByZero, invalidMoney, invalidRoundingMode } from './money-errors.js';
import { DEFAULT_ROUNDING_MODE } from './rounding-mode.js';
import type { RoundingMode } from './rounding-mode.js';

const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const CANONICAL_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*|-?[1-9][0-9]*)$/;
const ROUNDING_MODES: readonly RoundingMode[] = ['HALF_UP', 'HALF_EVEN', 'DOWN'];

/**
 * Immutable monetary amount expressed in minor units of its Currency.
 * Exact by construction: no float, no rounding and no implicit currency conversion.
 */
export class Money {
  readonly #minorUnits: bigint;
  readonly #currency: Currency;

  private constructor(minorUnits: bigint, currency: Currency) {
    this.#minorUnits = minorUnits;
    this.#currency = currency;
    Object.freeze(this);
  }

  static fromMinorUnits(value: bigint, currency: Currency): Money {
    if (typeof value !== 'bigint') {
      throw invalidMoney(`minorUnits must be a bigint, received ${describeValue(value)}`);
    }
    return new Money(value, requireCurrency(currency));
  }

  /**
   * Parses an exact decimal string such as "-10.25".
   * Rejects whitespace, sign prefixes, leading zeros, exponents, separators and
   * any decimal count above the currency scale, even when the extra decimals are zeros.
   */
  static fromDecimal(text: string, currency: Currency): Money {
    const target = requireCurrency(currency);
    if (typeof text !== 'string' || !DECIMAL_PATTERN.test(text)) {
      throw invalidMoney(`decimal ${describeValue(text)} must match ${DECIMAL_PATTERN.source}`);
    }

    const negative = text.startsWith('-');
    const [integerPart = '', fractionPart = ''] = (negative ? text.slice(1) : text).split('.');
    if (fractionPart.length > target.scale) {
      throw invalidMoney(`decimal ${describeValue(text)} has more than ${target.scale} decimal places`);
    }

    const scale = target.scale;
    const magnitude = BigInt(`${integerPart}${fractionPart.padEnd(scale, '0')}`);
    return new Money(negative ? -magnitude : magnitude, target);
  }

  static fromJSON(value: unknown): Money {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidMoney(`expected an object, received ${describeValue(value)}`);
    }
    if (!('minorUnits' in value) || !('currency' in value)) {
      throw invalidMoney(`expected "minorUnits" and "currency", received ${describeValue(value)}`);
    }

    const minorUnits = value.minorUnits;
    if (typeof minorUnits !== 'string' || !CANONICAL_MINOR_UNITS_PATTERN.test(minorUnits)) {
      throw invalidMoney(`minorUnits ${describeValue(minorUnits)} must be a canonical integer string`);
    }

    return new Money(BigInt(minorUnits), Currency.fromJSON(value.currency));
  }

  get minorUnits(): bigint {
    return this.#minorUnits;
  }

  get currency(): Currency {
    return this.#currency;
  }

  add(other: Money): Money {
    return new Money(this.#minorUnits + this.#compatibleMinorUnits(other), this.#currency);
  }

  subtract(other: Money): Money {
    return new Money(this.#minorUnits - this.#compatibleMinorUnits(other), this.#currency);
  }

  /**
   * Multiplies by an exact decimal factor and rounds the exact product once, at the end.
   * The result keeps the currency and the scale of the receiver: a factor has no currency of its own.
   */
  multiply(factor: MoneyFactor, mode?: RoundingMode): Money {
    if (!(factor instanceof MoneyFactor)) {
      throw invalidMoney(`expected a MoneyFactor, received ${describeValue(factor)}`);
    }

    const rounded = round(this.#minorUnits * factor.numerator, factor.denominator, requireMode(mode));

    return new Money(rounded, this.#currency);
  }

  /**
   * Divides by an integer divisor and rounds the exact quotient once, at the end.
   * Dividing between amounts is not an amount: the divisor is a plain integer, not a Money.
   */
  divide(divisor: bigint, mode?: RoundingMode): Money {
    if (typeof divisor !== 'bigint') {
      throw invalidMoney(`divisor must be a bigint, received ${describeValue(divisor)}`);
    }
    if (divisor === 0n) {
      throw divisionByZero('a divisor cannot be zero');
    }

    // The rounding helper works with a positive denominator; a negative divisor only flips the sign.
    const negative = divisor < 0n;
    const rounded = round(
      negative ? -this.#minorUnits : this.#minorUnits,
      negative ? -divisor : divisor,
      requireMode(mode),
    );

    return new Money(rounded, this.#currency);
  }

  /**
   * Splits the amount into equal parts or by positive weights; the parts always add up to the receiver.
   * The leftover minor units go to the largest remainders, ties broken by the order of the input, so the
   * allocation has no rounding mode: the remainder rule is the rule.
   */
  allocate(parts: number | readonly bigint[]): readonly Money[] {
    const weights = requireWeights(parts);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);

    const quotients: bigint[] = [];
    const remainders: bigint[] = [];
    for (const weight of weights) {
      const exact = this.#minorUnits * weight;
      const quotient = exact / totalWeight;
      const remainder = exact - quotient * totalWeight;

      quotients.push(quotient);
      remainders.push(remainder < 0n ? -remainder : remainder);
    }

    const truncated = quotients.reduce((sum, quotient) => sum + quotient, 0n);
    const delta = this.#minorUnits - truncated;
    const step = delta > 0n ? 1n : -1n;

    // `|delta|` is always below the number of parts, so the order never runs out before it is consumed.
    const boosted = new Set<number>();
    let pending = delta < 0n ? -delta : delta;
    for (const entry of orderByRemainder(remainders)) {
      if (pending === 0n) break;
      boosted.add(entry.index);
      pending -= 1n;
    }

    const allocated = quotients.map(
      (quotient, index) => new Money(boosted.has(index) ? quotient + step : quotient, this.#currency),
    );

    const allocatedTotal = allocated.reduce((sum, part) => sum + part.minorUnits, 0n);
    if (allocatedTotal !== this.#minorUnits) {
      throw new Error('Invariant violated: an allocation must add up to the total.');
    }

    return allocated;
  }

  compare(other: Money): -1 | 0 | 1 {
    const right = this.#compatibleMinorUnits(other);
    if (this.#minorUnits < right) return -1;
    if (this.#minorUnits > right) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return (
      other instanceof Money && this.#currency.equals(other.#currency) && this.#minorUnits === other.#minorUnits
    );
  }

  /** Canonical decimal string with exactly `currency.scale` decimal places. */
  toDecimal(): string {
    const scale = this.#currency.scale;
    const negative = this.#minorUnits < 0n;
    const digits = (negative ? -this.#minorUnits : this.#minorUnits).toString();
    if (scale === 0) return negative ? `-${digits}` : digits;

    const padded = digits.padStart(scale + 1, '0');
    return `${negative ? '-' : ''}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
  }

  toJSON(): MoneyJSON {
    return { minorUnits: this.#minorUnits.toString(), currency: this.#currency.toJSON() };
  }

  #compatibleMinorUnits(other: Money): bigint {
    if (!(other instanceof Money)) {
      throw invalidMoney(`expected a Money operand, received ${describeValue(other)}`);
    }
    if (!this.#currency.equals(other.#currency)) {
      const left = `${this.#currency.code}/${this.#currency.scale}`;
      const right = `${other.#currency.code}/${other.#currency.scale}`;
      throw currencyMismatch(`${left} cannot operate with ${right}`);
    }
    return other.#minorUnits;
  }
}

function requireCurrency(value: unknown): Currency {
  if (!(value instanceof Currency)) {
    throw invalidMoney(`expected a Currency, received ${describeValue(value)}`);
  }
  return value;
}

function requireMode(mode: RoundingMode | undefined): RoundingMode {
  if (mode === undefined) return DEFAULT_ROUNDING_MODE;
  if (!ROUNDING_MODES.includes(mode)) {
    throw invalidRoundingMode(`expected ${ROUNDING_MODES.join(', ')} or none, received ${describeValue(mode)}`);
  }
  return mode;
}

/**
 * Rounds the exact fraction `numerator / denominator` (positive denominator) to a whole minor unit.
 * BigInt division truncates toward zero, so the rule is symmetric by construction: the magnitude is
 * rounded and the sign is preserved. On an exact tie, HALF_UP steps away from zero and HALF_EVEN steps
 * only when the truncated quotient is odd.
 */
function round(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const quotient = numerator / denominator;
  if (mode === 'DOWN') return quotient;

  const remainder = numerator % denominator;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const doubled = 2n * magnitude;

  if (doubled < denominator) return quotient;
  if (doubled === denominator && mode === 'HALF_EVEN' && quotient % 2n === 0n) return quotient;

  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

function requireWeights(parts: number | readonly bigint[]): readonly bigint[] {
  if (typeof parts === 'number') {
    if (!Number.isSafeInteger(parts) || parts < 1) {
      throw invalidMoney(`part count ${describeValue(parts)} must be a positive safe integer`);
    }
    return Array.from({ length: parts }, () => 1n);
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    throw invalidMoney(`parts ${describeValue(parts)} must be a positive count or a non-empty list of weights`);
  }

  for (const weight of parts) {
    if (typeof weight !== 'bigint' || weight <= 0n) {
      throw invalidMoney(`weight ${describeValue(weight)} must be a positive bigint`);
    }
  }

  return parts;
}

/** Part indices by descending remainder, ties broken by the original order. */
function orderByRemainder(
  remainders: readonly bigint[],
): readonly { readonly remainder: bigint; readonly index: number }[] {
  return remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    });
}
