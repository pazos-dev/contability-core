// Public API of the accounting core. Export only implemented and tested capabilities.
export { Currency } from './core/domain/money/currency.js';
export type { CurrencyJSON } from './core/domain/money/currency.js';
export { Money } from './core/domain/money/money.js';
export type { MoneyJSON } from './core/domain/money/money.js';
export { MoneyError } from './core/domain/money/money-errors.js';
export type { MoneyErrorCode } from './core/domain/money/money-errors.js';

export { Account } from './core/domain/account/account.js';
export type { AccountInput, AccountStatus } from './core/domain/account/account.js';
export { AccountCode } from './core/domain/account/account-code.js';
export { AccountError } from './core/domain/account/account-errors.js';
export type { AccountErrorCode } from './core/domain/account/account-errors.js';
export type { AccountType } from './core/domain/account/account-type.js';
