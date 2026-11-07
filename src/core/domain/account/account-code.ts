import { describeValue } from '../describe-value.js';
import { invalidAccountCode } from './account-errors.js';

/**
 * Immutable account code as text: leading zeros and separators are part of the
 * chart of accounts format, so the value is never converted to a number.
 */
export class AccountCode {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  static create(value: string): AccountCode {
    if (typeof value !== 'string') {
      throw invalidAccountCode(`expected a string, received ${describeValue(value)}`);
    }
    if (value.length === 0) {
      throw invalidAccountCode('must not be empty');
    }
    if (value !== value.trim()) {
      throw invalidAccountCode(`must not have leading or trailing whitespace, received ${describeValue(value)}`);
    }

    return new AccountCode(value);
  }

  get value(): string {
    return this.#value;
  }

  equals(other: AccountCode): boolean {
    return other instanceof AccountCode && this.#value === other.#value;
  }

  toString(): string {
    return this.#value;
  }
}
