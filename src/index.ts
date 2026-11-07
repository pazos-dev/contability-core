// Public API of the accounting core. Export only implemented and tested capabilities.
// Each domain owns its public surface in its own index.ts; this file only aggregates those barrels.
// Never import an internal domain file from outside its folder: use the barrel.
export * from './core/domain/money/index.js';
export * from './core/domain/account/index.js';
export * from './core/domain/journal/index.js';
export * from './core/domain/period/index.js';
export * from './core/domain/entries/index.js';
