import type { UnitOfWork, UnitOfWorkScope } from '../../core/application/ports.js';
import { createPorts, type StoreHolder } from './repositories.js';
import { copyMaps, emptyMaps, snapshotOf, type InMemorySnapshot } from './store.js';

/**
 * In-memory adapter for development and tests.
 *
 * It is not durable and it has no isolation: two concurrent `run` calls can interleave, and no
 * rollback survives the process. What it does model is the write discipline of the contract — a
 * failing unit of work restores the previous state of every store — and the placement of reads and
 * writes inside one transactional context.
 */

export interface InMemoryAccountingOptions {
  /**
   * Testing seam: replaces any port of the default scope. Receives the scope that was just built so a
   * caller can delegate to the real repositories and only change one operation.
   */
  readonly overrides?: (defaults: UnitOfWorkScope) => Partial<UnitOfWorkScope>;
}

export interface InMemoryAccounting {
  readonly unitOfWork: UnitOfWork;
  snapshot(): InMemorySnapshot;
}

export function createInMemoryAccounting(options: InMemoryAccountingOptions = {}): InMemoryAccounting {
  const store: StoreHolder = { maps: emptyMaps() };
  const ports = createPorts(store);

  const defaults: UnitOfWorkScope = ports;
  const scope: UnitOfWorkScope = { ...defaults, ...(options.overrides?.(defaults) ?? {}) };

  const unitOfWork: UnitOfWork = {
    async run(work) {
      const backup = copyMaps(store.maps);
      try {
        return await work(scope);
      } catch (error) {
        // A copy of the maps is a full backup: every stored value is an immutable domain object.
        store.maps = backup;
        throw error;
      }
    },
  };

  return {
    unitOfWork,
    snapshot() {
      return snapshotOf(store.maps);
    },
  };
}
