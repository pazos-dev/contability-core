import { describeValue } from '../describe-value.js';
import { invalidDate } from './period-errors.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FIRST_YEAR = 1;
const LAST_YEAR = 9999;

/**
 * Immutable calendar date in YYYY-MM-DD form, without time zone or time of day.
 * It never uses `Date`, so it neither depends on the host time zone nor normalises
 * impossible dates into the next month.
 */
export class AccountingDate {
  readonly #year: number;
  readonly #month: number;
  readonly #day: number;

  private constructor(year: number, month: number, day: number) {
    this.#year = year;
    this.#month = month;
    this.#day = day;
    Object.freeze(this);
  }

  static create(text: string): AccountingDate {
    if (typeof text !== 'string') {
      throw invalidDate(`expected a YYYY-MM-DD string, received ${describeValue(text)}`);
    }

    const match = DATE_PATTERN.exec(text);
    if (match === null) {
      throw invalidDate(`expected the exact form YYYY-MM-DD, received ${describeValue(text)}`);
    }

    const [, yearText = '', monthText = '', dayText = ''] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);

    if (year < FIRST_YEAR || year > LAST_YEAR) {
      throw invalidDate(`year must be between ${FIRST_YEAR} and ${LAST_YEAR}, received ${yearText}`);
    }
    if (month < 1 || month > 12) {
      throw invalidDate(`month must be between 01 and 12, received ${monthText}`);
    }

    const lastDay = daysInMonth(year, month);
    if (day < 1 || day > lastDay) {
      throw invalidDate(`day must be between 01 and ${lastDay} for ${yearText}-${monthText}, received ${dayText}`);
    }

    return new AccountingDate(year, month, day);
  }

  get year(): number {
    return this.#year;
  }

  get month(): number {
    return this.#month;
  }

  get day(): number {
    return this.#day;
  }

  /** Canonical YYYY-MM-DD text. */
  get value(): string {
    return `${pad(this.#year, 4)}-${pad(this.#month, 2)}-${pad(this.#day, 2)}`;
  }

  compare(other: AccountingDate): -1 | 0 | 1 {
    if (!(other instanceof AccountingDate)) {
      throw invalidDate(`expected an AccountingDate, received ${describeValue(other)}`);
    }

    const left = this.#ordinal();
    const right = other.#ordinal();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  equals(other: AccountingDate): boolean {
    return other instanceof AccountingDate && this.#ordinal() === other.#ordinal();
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  #ordinal(): number {
    return this.#year * 10000 + this.#month * 100 + this.#day;
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(value: number, length: number): string {
  return value.toString().padStart(length, '0');
}
