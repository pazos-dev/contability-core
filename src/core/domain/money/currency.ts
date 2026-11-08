import { describeValue } from '../describe-value.js';
import { isoHasNoMinorUnit, isoScaleOf } from './currency-catalog.js';
import { invalidCurrency } from './money-errors.js';

/** Serialized representation of a Currency. */
export interface CurrencyJSON {
  readonly code: string;
  readonly scale: number;
}

const CODE_PATTERN = /^[A-Z]{3}$/;
const MIN_SCALE = 0;
const MAX_SCALE = 6;

/**
 * Immutable currency identified by a three-letter code and a scale.
 * An ISO 4217 code with a decimal minor unit fixes its scale: the official one, so the caller cannot
 * choose it. Any other well-formed code is an own currency and the caller owns its scale.
 */
export class Currency {
  readonly #code: string;
  readonly #scale: number;

  private constructor(code: string, scale: number) {
    this.#code = code;
    this.#scale = scale;
    Object.freeze(this);
  }

  static create(code: string, scale: number): Currency {
    const validatedCode = validateCode(code);

    return new Currency(validatedCode, validateScale(scale, validatedCode));
  }

  static fromJSON(value: unknown): Currency {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidCurrency(`expected an object, received ${describeValue(value)}`);
    }
    if (!('code' in value) || !('scale' in value)) {
      throw invalidCurrency(`expected "code" and "scale", received ${describeValue(value)}`);
    }

    const code = validateCode(value.code);

    return new Currency(code, validateScale(value.scale, code));
  }

  get code(): string {
    return this.#code;
  }

  get scale(): number {
    return this.#scale;
  }

  equals(other: Currency): boolean {
    return other instanceof Currency && this.#code === other.#code && this.#scale === other.#scale;
  }

  toJSON(): CurrencyJSON {
    return { code: this.#code, scale: this.#scale };
  }
}

function validateCode(code: unknown): string {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    throw invalidCurrency(`code ${describeValue(code)} must be three uppercase letters A-Z`);
  }
  return code;
}

function validateScale(scale: unknown, code: string): number {
  if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
    throw invalidCurrency(`scale ${describeValue(scale)} must be an integer between ${MIN_SCALE} and ${MAX_SCALE}`);
  }

  // An ISO code without a decimal minor unit has no own-currency regime: the core cannot represent
  // a currency that has no minor unit at all.
  if (isoHasNoMinorUnit(code)) {
    throw invalidCurrency(`code ${describeValue(code)} is an ISO 4217 currency without a decimal minor unit`);
  }

  const official = isoScaleOf(code);
  if (official !== undefined && scale !== official) {
    throw invalidCurrency(`scale ${scale} does not match ISO 4217 scale ${official} for code ${describeValue(code)}`);
  }

  return scale;
}
