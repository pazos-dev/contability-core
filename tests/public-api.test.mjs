import test from 'node:test';
import assert from 'node:assert/strict';

// Public surface of each core domain, exposed through that domain's own index.ts.
// Types are erased at runtime, so only value exports appear here.
const domainBarrels = {
  money: [
    'Currency',
    'Money',
    'MoneyError',
    'ISO_4217_PUBLISHED',
    'listIsoCurrencies',
    'listIsoCurrenciesWithoutMinorUnit',
  ],
  account: ['Account', 'AccountCode', 'AccountError'],
  journal: ['Journal', 'JournalError'],
  period: ['AccountingDate', 'AccountingPeriod', 'PeriodError'],
  entries: ['EntryError', 'JournalEntry', 'JournalEntryLine'],
};

for (const [domain, expected] of Object.entries(domainBarrels)) {
  test(`API: the ${domain} domain exposes exactly its public surface through its own index`, async () => {
    const barrel = await import(`../dist/core/domain/${domain}/index.js`);

    assert.deepEqual(Object.keys(barrel).sort(), [...expected].sort());
  });

  test(`API: the package root re-exports the ${domain} domain surface`, async () => {
    const root = await import('../dist/index.js');

    for (const name of expected) {
      assert.ok(name in root, `root must re-export ${name} from the ${domain} barrel`);
    }
  });
}

test('API: the package root exports nothing outside the domain barrels', async () => {
  const root = await import('../dist/index.js');
  const expected = Object.values(domainBarrels).flat().sort();

  assert.deepEqual(Object.keys(root).sort(), expected);
});
