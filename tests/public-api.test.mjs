import test from 'node:test';
import assert from 'node:assert/strict';

// Public surface of each folder that publishes a barrel.
// Types are erased at runtime, so only value exports appear here.
const barrels = {
  'core/domain/shared/money': [
    'Currency',
    'Money',
    'MoneyError',
    'ISO_4217_PUBLISHED',
    'listIsoCurrencies',
    'listIsoCurrenciesWithoutMinorUnit',
  ],
  'core/domain/ledger': ['Ledger', 'LedgerError'],
  'core/domain/account': ['Account', 'AccountCode', 'AccountError'],
  'core/domain/journal': ['Journal', 'JournalError'],
  'core/domain/period': ['AccountingDate', 'AccountingPeriod', 'PeriodError'],
  'core/domain/entries': ['EntryError', 'JournalEntry', 'JournalEntryLine'],
  'core/application': ['Accounting', 'ApplicationError'],
  'adapters/memory': ['createInMemoryAccounting'],
};

const domainBarrels = Object.keys(barrels).filter((name) => name.startsWith('core/domain/'));

for (const [name, expected] of Object.entries(barrels)) {
  test(`API: ${name} exposes exactly its public surface through its own index`, async () => {
    const barrel = await import(`../dist/${name}/index.js`);

    assert.deepEqual(Object.keys(barrel).sort(), [...expected].sort());
  });

  test(`API: the package root re-exports the ${name} surface`, async () => {
    const root = await import('../dist/index.js');

    for (const exported of expected) {
      assert.ok(exported in root, `root must re-export ${exported} from ${name}`);
    }
  });
}

test('API: the package root exports nothing outside the published barrels', async () => {
  const root = await import('../dist/index.js');
  const expected = Object.values(barrels).flat().sort();

  assert.deepEqual(Object.keys(root).sort(), expected);
});

test('API: the package still aggregates the domain barrels', async () => {
  const root = await import('../dist/index.js');

  for (const name of domainBarrels) {
    const barrel = await import(`../dist/${name}/index.js`);

    assert.deepEqual(
      Object.keys(barrel).filter((exported) => !(exported in root)),
      [],
      `${name} must be fully aggregated`,
    );
  }
});

// The application barrel publishes behaviour and data shapes, and the facade is the only entry point for
// behaviour. Types are erased at runtime, so the facade count is fixed at run time and the type surface is
// fixed against the declaration file the build emits.
test('API: the application barrel publishes the report types', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/application/index.d.ts', import.meta.url), 'utf8');
  const exportedTypes = [...declaration.matchAll(/export type \{([^}]*)\} from/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()).filter((name) => name.length > 0),
  );

  for (const type of [
    'AccountBalanceRow',
    'AccountBalancesInput',
    'AccountBalancesResult',
    'PostedEntriesQuery',
    'TrialBalanceResult',
  ]) {
    assert.ok(exportedTypes.includes(type), `application barrel must export the type ${type}`);
  }
});

// The facade is the only public entry point of the application layer: fifteen use cases after 008a, no more
// and no fewer. Adding one without deciding how it is published fails here.
test('API: the facade exposes exactly the fifteen use cases', async () => {
  const { Accounting } = await import('../dist/index.js');
  const expected = [
    'accountBalances',
    'addEntryLine',
    'closePeriod',
    'createEntryDraft',
    'postEntry',
    'registerAccount',
    'registerJournal',
    'registerLedger',
    'registerPeriod',
    'removeEntryLine',
    'reversePostedEntry',
    'setAccountStatus',
    'setJournalStatus',
    'setLedgerStatus',
    'trialBalance',
  ];

  const methods = Object.getOwnPropertyNames(Accounting.prototype).filter((name) => name !== 'constructor');

  assert.deepEqual(methods.sort(), expected);
});

// A write that bypasses the unit of work is invisible to every backup: an unrelated failing run could
// silently discard it. The adapter therefore offers one write path, and the unit of work scope is it.
test('API: the memory adapter offers one write path, the unit of work', async () => {
  const { createInMemoryAccounting } = await import('../dist/index.js');

  assert.deepEqual(Object.keys(createInMemoryAccounting()).sort(), ['snapshot', 'unitOfWork']);
});
