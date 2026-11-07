import { describeValue } from '../describe-value.js';
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
 * Immutable currency identified by its ISO-shaped code and its explicit scale.
 * The scale is part of the identity: the same code with another scale is incompatible.
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
    return new Currency(validateCode(code), validateScale(scale));
  }

  static fromJSON(value: unknown): Currency {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidCurrency(`expected an object, received ${describeValue(value)}`);
    }
    if (!('code' in value) || !('scale' in value)) {
      throw invalidCurrency(`expected "code" and "scale", received ${describeValue(value)}`);
    }

    return new Currency(validateCode(value.code), validateScale(value.scale));
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

function validateScale(scale: unknown): number {
  if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
    throw invalidCurrency(`scale ${describeValue(scale)} must be an integer between ${MIN_SCALE} and ${MAX_SCALE}`);
  }
  return scale;
}
