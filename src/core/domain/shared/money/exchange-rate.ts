import { describeValue } from '../describe-value.js';
import { Currency } from './currency.js';
import type { CurrencyJSON } from './dto/currency-dto.js';
import { MoneyFactor } from './factor.js';
import { invalidExchangeRate } from './money-errors.js';

/**
 * Serialized exchange rate: both currencies and the exact decimal factor as text, never a number.
 * It travels with the value it serializes so a host stores and restores the pair and the factor together.
 */
export interface ExchangeRateJSON {
  readonly from: CurrencyJSON;
  readonly to: CurrencyJSON;
  readonly factor: string;
}

/**
 * Immutable exchange rate from one currency into another, expressed as an exact factor.
 *
 * A rate is not a quote: it has no date, no source and no history. The core never keeps a table and never
 * looks one up, so the caller chooses it for one operation and it is stored with the line it converted
 * (009d). That is why a later quote cannot move what was already posted.
 *
 * The factor is a `MoneyFactor`, never a number: `41.25` is 4125/100. Converting multiplies the line's
 * original amount by it with `Money.multiply`, which rounds once, at the end (009b).
 */
export class ExchangeRate {
  readonly #from: Currency;
  readonly #to: Currency;
  readonly #factor: MoneyFactor;

  private constructor(from: Currency, to: Currency, factor: MoneyFactor) {
    this.#from = from;
    this.#to = to;
    this.#factor = factor;
    Object.freeze(this);
  }

  /**
   * Creates the rate of `from` into `to`.
   *
   * Every operand is validated here, because a rate is the one place where a typo silently changes the
   * books: a factor that is not a strictly positive `MoneyFactor` and an operand that is not a `Currency`
   * are `INVALID_EXCHANGE_RATE`, and so is a rate of a currency into itself — a line that needs no
   * conversion takes no rate at all.
   */
  static create(input: {
    readonly from: Currency;
    readonly to: Currency;
    readonly factor: MoneyFactor;
  }): ExchangeRate {
    if (typeof input !== 'object' || input === null) {
      throw invalidExchangeRate(`expected an input object, received ${describeValue(input)}`);
    }

    const from = requireCurrency(input.from, 'from');
    const to = requireCurrency(input.to, 'to');
    if (from.equals(to)) {
      throw invalidExchangeRate(`${currencyText(from)} into itself converts nothing`);
    }

    return new ExchangeRate(from, to, requirePositiveFactor(input.factor, from, to));
  }

  /** The currency of the amount this rate converts. */
  get from(): Currency {
    return this.#from;
  }

  /** The currency the amount is converted into; for a journal entry, the ledger's functional currency. */
  get to(): Currency {
    return this.#to;
  }

  /** How many units of `to` one unit of `from` is worth: an exact fraction, never a float. */
  get factor(): MoneyFactor {
    return this.#factor;
  }

  /** Same pair and same value: `41.25` equals `41.250`, because the decimal is a value and not its spelling. */
  equals(other: ExchangeRate): boolean {
    return (
      other instanceof ExchangeRate &&
      this.#from.equals(other.#from) &&
      this.#to.equals(other.#to) &&
      this.#factor.numerator * other.#factor.denominator === other.#factor.numerator * this.#factor.denominator
    );
  }

  toJSON(): ExchangeRateJSON {
    return { from: this.#from.toJSON(), to: this.#to.toJSON(), factor: this.#factor.toDecimal() };
  }
}

function requireCurrency(value: unknown, field: string): Currency {
  if (!(value instanceof Currency)) {
    throw invalidExchangeRate(`${field} must be a Currency, received ${describeValue(value)}`);
  }
  return value;
}

/** A rate is worth something: zero and negative factors are rejected instead of inverting an amount. */
function requirePositiveFactor(value: unknown, from: Currency, to: Currency): MoneyFactor {
  if (!(value instanceof MoneyFactor)) {
    throw invalidExchangeRate(`factor must be a MoneyFactor, received ${describeValue(value)}`);
  }
  if (value.numerator <= 0n) {
    throw invalidExchangeRate(`factor ${value.toDecimal()} from ${currencyText(from)} to ${currencyText(to)} is not positive`);
  }
  return value;
}

function currencyText(currency: Currency): string {
  return `${currency.code}/${currency.scale}`;
}
