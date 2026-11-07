import { Currency, type CurrencyJSON } from './currency.js';
import { currencyMismatch, describeValue, invalidMoney } from './money-errors.js';

/** Serialized representation of a Money value. */
export interface MoneyJSON {
  readonly minorUnits: string;
  readonly currency: CurrencyJSON;
}

const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const CANONICAL_MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*|-?[1-9][0-9]*)$/;

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
