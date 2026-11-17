import { describeValue } from '../describe-value.js';
import { invalidFactor } from './money-errors.js';

const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const MAX_DECIMALS = 12;

/**
 * Immutable exact decimal factor: `0.21` is stored as 21/100, never as a floating point number.
 * The denominator is always a power of ten and the fraction is never reduced, so a factor keeps the
 * decimals the caller wrote.
 */
export class MoneyFactor {
  readonly #numerator: bigint;
  readonly #denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    this.#numerator = numerator;
    this.#denominator = denominator;
    Object.freeze(this);
  }

  /**
   * Parses an exact decimal factor such as "0.21", "-0.5" or "3".
   * Rejects whitespace, sign prefixes, leading zeros, exponents, commas and more than 12 decimals.
   */
  static fromDecimal(text: string): MoneyFactor {
    if (typeof text !== 'string' || !DECIMAL_PATTERN.test(text)) {
      throw invalidFactor(`factor ${describeValue(text)} must match ${DECIMAL_PATTERN.source}`);
    }

    const negative = text.startsWith('-');
    const [integerPart = '', fractionPart = ''] = (negative ? text.slice(1) : text).split('.');
    if (fractionPart.length > MAX_DECIMALS) {
      throw invalidFactor(`factor ${describeValue(text)} has more than ${MAX_DECIMALS} decimal places`);
    }

    const magnitude = BigInt(`${integerPart}${fractionPart}`);

    return new MoneyFactor(negative ? -magnitude : magnitude, 10n ** BigInt(fractionPart.length));
  }

  get numerator(): bigint {
    return this.#numerator;
  }

  get denominator(): bigint {
    return this.#denominator;
  }
}
