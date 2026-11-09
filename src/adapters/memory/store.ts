import type { Account } from '../../core/domain/account/index.js';
import type { JournalEntry } from '../../core/domain/entries/index.js';
import type { Journal } from '../../core/domain/journal/index.js';
import type { AccountingPeriod } from '../../core/domain/period/index.js';
import type { StoredOperation } from '../../core/application/ports/index.js';

/** Idempotency record as the snapshot exposes it: the fingerprint, never the stored result. */
export interface InMemoryIdempotencyRecord {
  readonly ledgerId: string;
  readonly operation: string;
  readonly key: string;
  readonly fingerprint: string;
}

/** Read-only view of what the adapter holds, for composition checks and tests. */
export interface InMemorySnapshot {
  readonly accounts: readonly Account[];
  readonly journals: readonly Journal[];
  readonly periods: readonly AccountingPeriod[];
  readonly entries: readonly JournalEntry[];
  readonly idempotency: readonly InMemoryIdempotencyRecord[];
}

export interface StoredIdempotency extends StoredOperation {
  readonly ledgerId: string;
  readonly operation: string;
  readonly key: string;
}

/** Every store of the adapter. Values are immutable domain objects, so a copy of a map is a backup. */
export interface MemoryMaps {
  readonly accounts: Map<string, Account>;
  readonly journals: Map<string, Journal>;
  readonly periods: Map<string, AccountingPeriod>;
  readonly entries: Map<string, JournalEntry>;
  readonly idempotency: Map<string, StoredIdempotency>;
}

/**
 * Composite keys are built from a JSON array, not from a separator: any separator can appear inside an
 * id, and then two different pairs would produce the same key and overwrite each other.
 */
export function keyOf(...parts: readonly string[]): string {
  return JSON.stringify(parts);
}

export function emptyMaps(): MemoryMaps {
  return {
    accounts: new Map(),
    journals: new Map(),
    periods: new Map(),
    entries: new Map(),
    idempotency: new Map(),
  };
}

export function copyMaps(maps: MemoryMaps): MemoryMaps {
  return {
    accounts: new Map(maps.accounts),
    journals: new Map(maps.journals),
    periods: new Map(maps.periods),
    entries: new Map(maps.entries),
    idempotency: new Map(maps.idempotency),
  };
}

export function snapshotOf(maps: MemoryMaps): InMemorySnapshot {
  return {
    accounts: [...maps.accounts.values()],
    journals: [...maps.journals.values()],
    periods: [...maps.periods.values()],
    entries: [...maps.entries.values()],
    idempotency: [...maps.idempotency.values()].map(({ ledgerId, operation, key, fingerprint }) => ({
      ledgerId,
      operation,
      key,
      fingerprint,
    })),
  };
}
