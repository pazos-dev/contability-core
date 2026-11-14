import type { CurrencyJSON } from './currency-dto.js';

/** Serialized representation of a Money value. */
export interface MoneyJSON {
  readonly minorUnits: string;
  readonly currency: CurrencyJSON;
}
