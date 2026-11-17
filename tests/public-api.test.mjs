import test from 'node:test';
import assert from 'node:assert/strict';

// Public surface of each folder that publishes a barrel.
// Types are erased at runtime, so only value exports appear here.
const barrels = {
  'core/domain/shared/money': [
    'Currency',
    'DEFAULT_ROUNDING_MODE',
    'ExchangeRate',
    'Money',
    'MoneyError',
    'MoneyFactor',
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

// The rounding mode is a type, so it is erased at runtime and fixed against the declaration file the build
// emits: a value export would be a second, contradictory surface.
test('API: the money barrel publishes the rounding mode and the serialized shapes as types', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/domain/shared/money/index.d.ts', import.meta.url), 'utf8');
  const exportedTypes = [...declaration.matchAll(/export type \{([^}]*)\} from/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()).filter((name) => name.length > 0),
  );

  for (const type of ['CurrencyJSON', 'ExchangeRateJSON', 'MoneyErrorCode', 'MoneyJSON', 'RoundingMode']) {
    assert.ok(exportedTypes.includes(type), `money barrel must export the type ${type}`);
  }
});

// A code is a member of a union, so it is erased too: the declaration file the build emits is where the new
// domain codes are pinned. They live in the domain because it is the aggregate that receives the functional
// currency and the rates and decides (009d).
test('API: the domain publishes the exchange rate and entry rate error codes', async () => {
  const { readFileSync } = await import('node:fs');

  const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
  const codes = (path) => [...read(path).matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);

  assert.ok(codes('core/domain/shared/money/money-errors.d.ts').includes('INVALID_EXCHANGE_RATE'));

  const entryCodes = codes('core/domain/entries/errors/entry-errors.d.ts');
  for (const code of ['ENTRY_RATE_MISSING', 'ENTRY_RATE_DUPLICATE']) {
    assert.ok(entryCodes.includes(code), `EntryErrorCode must include ${code}`);
  }
});

// The application barrel publishes behaviour and data shapes, and the facade is the only entry point for
// behaviour. Types are erased at runtime, so the facade count is fixed at run time and the type surface is
// fixed against the declaration file the build emits.
test('API: the entries barrel publishes the input of the host restore path', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/domain/entries/index.d.ts', import.meta.url), 'utf8');
  const exportedTypes = [...declaration.matchAll(/export type \{([^}]*)\} from/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()).filter((name) => name.length > 0),
  );

  // A durable adapter rebuilds a converted line with `restore`: its input is part of the published surface.
  for (const type of ['JournalEntryLineInput', 'JournalEntryLineRestoreInput']) {
    assert.ok(exportedTypes.includes(type), `entries barrel must export the type ${type}`);
  }

  const { JournalEntryLine } = await import('../dist/index.js');
  assert.equal(typeof JournalEntryLine.restore, 'function');
});

// The facade is the only behaviour surface, so every input it receives has to be published: a caller cannot
// call a method whose input type it cannot name. The seventeen methods use sixteen input types, because
// `trialBalance` shares `AccountBalancesInput` with `accountBalances`. They are listed one by one on purpose:
// a sampled list let `ChangeEntryHeaderInput` go unpublished, and a new method with an unpublished input has to
// fail here instead of failing for the host.
test('API: the application barrel publishes the input type of every facade method', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/application/index.d.ts', import.meta.url), 'utf8');
  const exportedTypes = [...declaration.matchAll(/export type \{([^}]*)\} from/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()).filter((name) => name.length > 0),
  );

  const facadeInputTypes = [
    'RegisterLedgerInput',
    'RegisterAccountInput',
    'SetAccountStatusInput',
    'RegisterJournalInput',
    'SetJournalStatusInput',
    'SetLedgerStatusInput',
    'RegisterPeriodInput',
    'ClosePeriodInput',
    'CreateEntryDraftInput',
    'AddEntryLineInput',
    'RemoveEntryLineInput',
    'ChangeEntryHeaderInput',
    'PostEntryInput',
    'ReversePostedEntryInput',
    'AccountBalancesInput',
    'AccountMovementsInput',
  ];

  for (const type of facadeInputTypes) {
    assert.ok(exportedTypes.includes(type), `application barrel must export the type ${type}`);
  }
});

test('API: the application barrel publishes the report and port types', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/application/index.d.ts', import.meta.url), 'utf8');
  const exportedTypes = [...declaration.matchAll(/export type \{([^}]*)\} from/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()).filter((name) => name.length > 0),
  );

  for (const type of [
    'AccountBalanceRow',
    'AccountBalancesResult',
    'AccountMovementRow',
    'AccountMovementsResult',
    'EntryNumberSequence',
    'ExchangeRateInput',
    'PostedEntriesQuery',
    'TrialBalanceResult',
  ]) {
    assert.ok(exportedTypes.includes(type), `application barrel must export the type ${type}`);
  }
});

// A posted entry is always POSTED, so the published result has to say exactly that: a wider status would let a
// host accept a draft where a posting was promised. The reversal link travels in the same shape because posting
// a host-built reversal draft stores it, and a result that hides it loses a fact the caller cannot recover.
test('API: the posted result declares the POSTED literal and the optional reversal link', async () => {
  const { readFileSync } = await import('node:fs');
  const declaration = readFileSync(new URL('../dist/core/application/dto.d.ts', import.meta.url), 'utf8');
  const block = declaration.match(/export interface PostEntryResult \{([^}]*)\}/);

  assert.ok(block, 'dto.d.ts must declare PostEntryResult');
  assert.match(block[1], /readonly status: 'POSTED';/);
  assert.match(block[1], /readonly reversalOfEntryId\?: string;/);
});

// The facade is the only public entry point of the application layer: seventeen use cases after 009c, no more
// and no fewer. Adding one without deciding how it is published fails here.
test('API: the facade exposes exactly the seventeen use cases', async () => {
  const { Accounting } = await import('../dist/index.js');
  const expected = [
    'accountBalances',
    'accountMovements',
    'addEntryLine',
    'changeEntryHeader',
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
