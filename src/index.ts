// Public API of the accounting core. Export only implemented and tested capabilities.
export { Currency } from './core/domain/money/currency.js';
export type { CurrencyJSON } from './core/domain/money/currency.js';
export { Money } from './core/domain/money/money.js';
export type { MoneyJSON } from './core/domain/money/money.js';
export { MoneyError } from './core/domain/money/money-errors.js';
export type { MoneyErrorCode } from './core/domain/money/money-errors.js';
