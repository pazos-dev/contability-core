/**
 * Lifecycle state of a journal entry.
 * POSTED is terminal inside the aggregate: a posted entry never returns to DRAFT.
 */
export type EntryStatus = 'DRAFT' | 'POSTED';
