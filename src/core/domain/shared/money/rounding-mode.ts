/** How an exact quotient loses the fraction of a minor unit it cannot represent. */
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN';

/** The mode applied when an operation does not declare one. */
export const DEFAULT_ROUNDING_MODE: RoundingMode = 'HALF_UP';
