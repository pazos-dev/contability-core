import test from 'node:test';
import assert from 'node:assert/strict';

// Public surface of each folder that publishes a barrel.
// Types are erased at runtime, so only value exports appear here.
const barrels = {
  'core/domain/money': [
    'Currency',
    'Money',
    'MoneyError',
    'ISO_4217_PUBLISHED',
    'listIsoCurrencies',
    'listIsoCurrenciesWithoutMinorUnit',
  ],
  'core/domain/account': ['Account', 'AccountCode', 'AccountError'],
  'core/domain/journal': ['Journal', 'JournalError'],
  'core/domain/period': ['AccountingDate', 'AccountingPeriod', 'PeriodError'],
  'core/domain/entries': ['EntryError', 'JournalEntry', 'JournalEntryLine'],
  'core/application': [
    'ApplicationError',
    'makeRegisterAccount',
    'makeRegisterJournal',
    'makeRegisterPeriod',
    'makeSetAccountStatus',
    'makeSetJournalStatus',
  ],
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
