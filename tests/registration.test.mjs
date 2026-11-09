import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApplicationError,
  createInMemoryAccounting,
  makeRegisterAccount,
  makeRegisterJournal,
  makeRegisterPeriod,
  makeSetAccountStatus,
  makeSetJournalStatus,
} from '../dist/index.js';

const LEDGERS = { 'ledger-1': 'chart-1', 'ledger-2': 'chart-2' };

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function harness(options = {}) {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS, ...options });
  return {
    memory,
    registerAccount: makeRegisterAccount({ unitOfWork: memory.unitOfWork }),
    setAccountStatus: makeSetAccountStatus({ unitOfWork: memory.unitOfWork }),
    registerJournal: makeRegisterJournal({ unitOfWork: memory.unitOfWork }),
    setJournalStatus: makeSetJournalStatus({ unitOfWork: memory.unitOfWork }),
    registerPeriod: makeRegisterPeriod({ unitOfWork: memory.unitOfWork }),
  };
}

function accountInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    accountId: 'acc-1',
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
    ...overrides,
  };
}

function storedAccounts(memory) {
  return memory.snapshot().accounts;
}

test('R01: a valid account is registered inside the plan the ledger resolves', async () => {
  const { memory, registerAccount } = harness();

  const result = await registerAccount(accountInput());

  assert.deepEqual(result, {
    ledgerId: 'ledger-1',
    chartOfAccountsId: 'chart-1',
    accountId: 'acc-1',
    code: '1.1.01',
    status: 'ACTIVE',
  });

  const [stored] = storedAccounts(memory);
  assert.equal(stored.chartOfAccountsId, 'chart-1');
  assert.equal(stored.postingAllowed, true);
  assert.equal(stored.status, 'ACTIVE');
  assert.equal(memory.snapshot().accounts.length, 1);
});

test('R02: an unknown ledger is rejected and nothing is stored', async () => {
  const { memory, registerAccount } = harness();

  await assert.rejects(registerAccount(accountInput({ ledgerId: 'ledger-x' })), assertCode('LEDGER_NOT_FOUND'));

  assert.equal(storedAccounts(memory).length, 0);
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('R03: a repeated code inside the same plan is rejected and nothing is stored', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount(accountInput());

  await assert.rejects(
    registerAccount(accountInput({ accountId: 'acc-2', name: 'Caja chica' })),
    assertCode('ACCOUNT_CODE_DUPLICATE'),
  );

  assert.equal(storedAccounts(memory).length, 1);
  assert.equal(storedAccounts(memory)[0].id, 'acc-1');
});

test('R04: the same code in another plan is accepted', async () => {
  const { memory, registerAccount } = harness();

  await registerAccount(accountInput());
  const second = await registerAccount(accountInput({ ledgerId: 'ledger-2', accountId: 'acc-9' }));

  assert.equal(second.chartOfAccountsId, 'chart-2');
  assert.equal(storedAccounts(memory).length, 2);
});

test('R05: a parent in another plan is rejected and nothing is stored', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount(accountInput({ accountId: 'acc-other', ledgerId: 'ledger-2', postingAllowed: false }));

  await assert.rejects(
    registerAccount(accountInput({ accountId: 'acc-1', parentId: 'acc-other' })),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(storedAccounts(memory).length, 1);
  assert.equal(storedAccounts(memory)[0].id, 'acc-other');
});

test('R07: a child is only registered under a grouping parent', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount(accountInput({ accountId: 'acc-1', postingAllowed: true }));

  await assert.rejects(
    registerAccount(accountInput({ accountId: 'acc-2', code: '1.1.01.01', parentId: 'acc-1', postingAllowed: true })),
    assertCode('ACCOUNT_PARENT_NOT_GROUPING'),
  );

  await registerAccount(accountInput({ accountId: 'acc-1b', code: '1.1', postingAllowed: false }));
  const child = await registerAccount(
    accountInput({ accountId: 'acc-3', code: '1.1.02', parentId: 'acc-1b', postingAllowed: true }),
  );

  assert.equal(child.status, 'ACTIVE');
  assert.equal(storedAccounts(memory).length, 3);
});

test('R08: a repeated account id is rejected without overwriting the stored account', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount(accountInput());

  await assert.rejects(
    registerAccount(accountInput({ code: '9.9.99', name: 'Otra' })),
    assertCode('ACCOUNT_ALREADY_EXISTS'),
  );

  const [stored] = storedAccounts(memory);
  assert.equal(stored.code.value, '1.1.01');
  assert.equal(stored.name, 'Caja');
});

test('R09: a parent with posted movements does not accept new children', async () => {
  const { memory, registerAccount } = harness({
    overrides: (scope) => ({ postedMovements: { hasPostedLines: async () => true } }),
  });
  await registerAccount(accountInput({ accountId: 'acc-1', postingAllowed: false }));

  await assert.rejects(
    registerAccount(accountInput({ accountId: 'acc-2', code: '1.1.02', parentId: 'acc-1' })),
    assertCode('ACCOUNT_HAS_MOVEMENTS'),
  );

  assert.equal(storedAccounts(memory).length, 1);
});

test('A04: a cycle cannot be closed because re-registering an ancestor is rejected', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount(accountInput({ accountId: 'acc-root', code: '1', postingAllowed: false }));
  await registerAccount(
    accountInput({ accountId: 'acc-child', code: '1.1', parentId: 'acc-root', postingAllowed: false }),
  );

  await assert.rejects(
    registerAccount(
      accountInput({ accountId: 'acc-root', code: '1', parentId: 'acc-child', postingAllowed: false }),
    ),
    assertCode('ACCOUNT_ALREADY_EXISTS'),
  );

  const stored = storedAccounts(memory);
  assert.equal(stored.length, 2);
  assert.equal(stored.find((account) => account.id === 'acc-root').parentId, undefined);
});

test('R14: a repository failure leaves no write behind', async () => {
  const { memory, registerAccount } = harness({
    overrides: (scope) => ({
      accounts: {
        ...scope.accounts,
        save: async () => {
          throw new Error('storage unavailable');
        },
      },
    }),
  });

  await assert.rejects(registerAccount(accountInput()), /storage unavailable/);

  assert.equal(storedAccounts(memory).length, 0);
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('R15: repeating the same request with the same key has no second effect', async () => {
  const { memory, registerAccount } = harness();

  const first = await registerAccount({ ...accountInput(), idempotencyKey: 'key-1' });
  const second = await registerAccount({ ...accountInput(), idempotencyKey: 'key-1' });

  assert.deepEqual(second, first);
  assert.equal(storedAccounts(memory).length, 1);
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('R16: the same key with a different request is a conflict', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount({ ...accountInput(), idempotencyKey: 'key-1' });

  await assert.rejects(
    registerAccount({ ...accountInput({ accountId: 'acc-2' }), idempotencyKey: 'key-1' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(storedAccounts(memory).length, 1);
});

test('idempotency is optional: a request without a key writes once', async () => {
  const { memory, registerAccount } = harness();

  await registerAccount(accountInput());
  await assert.rejects(registerAccount(accountInput()), assertCode('ACCOUNT_ALREADY_EXISTS'));

  assert.equal(storedAccounts(memory).length, 1);
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('R10: a used account is deactivated, never deleted', async () => {
  const { memory, registerAccount, setAccountStatus } = harness();
  await registerAccount(accountInput());
  await registerAccount(accountInput({ accountId: 'acc-2', code: '1.1.02', name: 'Banco' }));

  const result = await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });

  assert.deepEqual(result, { ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });
  const stored = storedAccounts(memory);
  assert.equal(stored.length, 2);
  const account = stored.find((item) => item.id === 'acc-1');
  assert.equal(account.status, 'INACTIVE');
  assert.equal(account.code.value, '1.1.01');
  assert.equal(account.name, 'Caja');
  assert.equal(account.postingAllowed, true);
});

test('R11: reactivating an inactive account returns it to ACTIVE keeping identity', async () => {
  const { memory, registerAccount, setAccountStatus } = harness();
  await registerAccount(accountInput());
  await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });

  const result = await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'ACTIVE' });

  assert.equal(result.status, 'ACTIVE');
  const [account] = storedAccounts(memory);
  assert.equal(account.status, 'ACTIVE');
  assert.equal(account.id, 'acc-1');
  assert.equal(account.chartOfAccountsId, 'chart-1');
});

test('an account resolved through another ledger is not reachable', async () => {
  const { memory, registerAccount, setAccountStatus } = harness();
  await registerAccount(accountInput());

  await assert.rejects(
    setAccountStatus({ ledgerId: 'ledger-2', accountId: 'acc-1', status: 'INACTIVE' }),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(storedAccounts(memory)[0].status, 'ACTIVE');
});

test('setting the same status twice is not an error', async () => {
  const { memory, registerAccount, setAccountStatus } = harness();
  await registerAccount(accountInput());

  await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });
  const again = await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });

  assert.equal(again.status, 'INACTIVE');
  assert.equal(storedAccounts(memory).length, 1);
});

test('an unknown status value is rejected instead of silently activating', async () => {
  const { memory, registerAccount, setAccountStatus } = harness();
  await registerAccount(accountInput());
  await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' });

  await assert.rejects(
    setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'ACTIVO' }),
    assertCode('INVALID_APPLICATION_INPUT'),
  );

  assert.equal(storedAccounts(memory)[0].status, 'INACTIVE');
});

test('a failure while saving the new status leaves the previous state', async () => {
  let calls = 0;
  const memory = createInMemoryAccounting({
    chartOfAccountsByLedger: LEDGERS,
    overrides: (scope) => ({
      accounts: {
        ...scope.accounts,
        save: async (account) => {
          calls += 1;
          if (calls > 1) throw new Error('storage unavailable');
          await scope.accounts.save(account);
        },
      },
    }),
  });
  const registerAccount = makeRegisterAccount({ unitOfWork: memory.unitOfWork });
  const setAccountStatus = makeSetAccountStatus({ unitOfWork: memory.unitOfWork });
  await registerAccount(accountInput());

  await assert.rejects(
    setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-1', status: 'INACTIVE' }),
    /storage unavailable/,
  );

  assert.equal(memory.snapshot().accounts[0].status, 'ACTIVE');
});

function journalInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    journalId: 'jrn-1',
    code: 'VENTAS',
    name: 'Diario de ventas',
    ...overrides,
  };
}

function storedJournals(memory) {
  return memory.snapshot().journals;
}

test('R12: a valid journal is registered active inside its ledger', async () => {
  const { memory, registerJournal } = harness();

  const result = await registerJournal(journalInput());

  assert.deepEqual(result, { ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', status: 'ACTIVE' });
  const [stored] = storedJournals(memory);
  assert.equal(stored.id, 'jrn-1');
  assert.equal(stored.ledgerId, 'ledger-1');
  assert.equal(stored.status, 'ACTIVE');
});

test('R12: a repeated code inside the ledger is rejected and nothing is stored', async () => {
  const { memory, registerJournal } = harness();
  await registerJournal(journalInput());

  await assert.rejects(
    registerJournal(journalInput({ journalId: 'jrn-2', name: 'Ventas 2' })),
    assertCode('JOURNAL_CODE_DUPLICATE'),
  );

  assert.equal(storedJournals(memory).length, 1);
});

test('the same journal code is allowed in another ledger', async () => {
  const { memory, registerJournal } = harness();

  await registerJournal(journalInput());
  await registerJournal(journalInput({ ledgerId: 'ledger-2' }));

  assert.equal(storedJournals(memory).length, 2);
});

test('a repeated journal id is rejected without overwriting', async () => {
  const { memory, registerJournal } = harness();
  await registerJournal(journalInput());

  await assert.rejects(
    registerJournal(journalInput({ code: 'COMPRAS', name: 'Compras' })),
    assertCode('JOURNAL_ALREADY_EXISTS'),
  );

  assert.equal(storedJournals(memory)[0].code, 'VENTAS');
});

test('a journal of an unknown ledger is rejected', async () => {
  const { memory, registerJournal } = harness();

  await assert.rejects(registerJournal(journalInput({ ledgerId: 'ledger-x' })), assertCode('LEDGER_NOT_FOUND'));

  assert.equal(storedJournals(memory).length, 0);
});

test('J04: deactivating a journal keeps it and its data', async () => {
  const { memory, registerJournal, setJournalStatus } = harness();
  await registerJournal(journalInput());

  const result = await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });

  assert.equal(result.status, 'INACTIVE');
  const [stored] = storedJournals(memory);
  assert.equal(stored.status, 'INACTIVE');
  assert.equal(stored.code, 'VENTAS');
  assert.equal(stored.name, 'Diario de ventas');
});

test('J06: reactivating a journal returns it to ACTIVE keeping identity', async () => {
  const { memory, registerJournal, setJournalStatus } = harness();
  await registerJournal(journalInput());
  await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });

  const result = await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'ACTIVE' });

  assert.equal(result.status, 'ACTIVE');
  assert.equal(storedJournals(memory)[0].id, 'jrn-1');
});

test('a journal resolved through another ledger is not reachable', async () => {
  const { memory, registerJournal, setJournalStatus } = harness();
  await registerJournal(journalInput());

  await assert.rejects(
    setJournalStatus({ ledgerId: 'ledger-2', journalId: 'jrn-1', status: 'INACTIVE' }),
    assertCode('JOURNAL_NOT_FOUND'),
  );

  assert.equal(storedJournals(memory)[0].status, 'ACTIVE');
});

test('journal idempotency replays and conflicts like the account one', async () => {
  const { memory, registerJournal } = harness();

  const first = await registerJournal({ ...journalInput(), idempotencyKey: 'key-j1' });
  const second = await registerJournal({ ...journalInput(), idempotencyKey: 'key-j1' });
  assert.deepEqual(second, first);
  assert.equal(storedJournals(memory).length, 1);

  await assert.rejects(
    registerJournal({ ...journalInput({ journalId: 'jrn-2' }), idempotencyKey: 'key-j1' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
});

function periodInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ...overrides,
  };
}

function storedPeriods(memory) {
  return memory.snapshot().periods;
}

test('R13: a valid period is registered open inside its ledger', async () => {
  const { memory, registerPeriod } = harness();

  const result = await registerPeriod(periodInput());

  assert.deepEqual(result, {
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OPEN',
  });
  const [stored] = storedPeriods(memory);
  assert.equal(stored.ledgerId, 'ledger-1');
  assert.equal(stored.status, 'OPEN');
});

test('P07: an overlapping period in the same ledger is rejected and nothing is stored', async () => {
  const { memory, registerPeriod } = harness();
  await registerPeriod(periodInput());

  await assert.rejects(
    registerPeriod(periodInput({ periodId: 'per-h1', name: 'Primer semestre', startDate: '2026-06-01', endDate: '2026-06-30' })),
    assertCode('PERIOD_OVERLAP'),
  );

  assert.equal(storedPeriods(memory).length, 1);
});

test('P07: touching the boundary with one day counts as an overlap', async () => {
  const { registerPeriod } = harness();
  await registerPeriod(periodInput({ periodId: 'per-a', startDate: '2026-01-01', endDate: '2026-06-30' }));

  await assert.rejects(
    registerPeriod(periodInput({ periodId: 'per-b', startDate: '2026-06-30', endDate: '2026-12-31' })),
    assertCode('PERIOD_OVERLAP'),
  );
});

test('P07: adjacent periods that do not share a day are accepted', async () => {
  const { memory, registerPeriod } = harness();
  await registerPeriod(periodInput({ periodId: 'per-a', startDate: '2026-01-01', endDate: '2026-06-30' }));

  await registerPeriod(periodInput({ periodId: 'per-b', startDate: '2026-07-01', endDate: '2026-12-31' }));

  assert.equal(storedPeriods(memory).length, 2);
});

test('P07: the same range in another ledger is not an overlap', async () => {
  const { memory, registerPeriod } = harness();

  await registerPeriod(periodInput());
  await registerPeriod(periodInput({ ledgerId: 'ledger-2' }));

  assert.equal(storedPeriods(memory).length, 2);
});

test('P04: impossible dates are rejected by the domain and nothing is stored', async () => {
  const { memory, registerPeriod } = harness();

  await assert.rejects(
    registerPeriod(periodInput({ startDate: '2026-02-29', endDate: '2026-12-31' })),
    (error) => error.code === 'INVALID_DATE',
  );
  await assert.rejects(
    registerPeriod(periodInput({ startDate: '2026-12-31', endDate: '2026-01-01' })),
    (error) => error.code === 'INVALID_PERIOD',
  );

  assert.equal(storedPeriods(memory).length, 0);
});

test('a single-day period is valid', async () => {
  const { memory, registerPeriod } = harness();

  const result = await registerPeriod(periodInput({ startDate: '2026-05-05', endDate: '2026-05-05' }));

  assert.equal(result.startDate, '2026-05-05');
  assert.equal(storedPeriods(memory).length, 1);
});

test('a repeated period id is rejected without overwriting', async () => {
  const { memory, registerPeriod } = harness();
  await registerPeriod(periodInput({ startDate: '2026-01-01', endDate: '2026-06-30' }));

  await assert.rejects(
    registerPeriod(periodInput({ startDate: '2026-07-01', endDate: '2026-12-31' })),
    assertCode('PERIOD_ALREADY_EXISTS'),
  );

  assert.equal(storedPeriods(memory)[0].endDate.value, '2026-06-30');
});

test('a period of an unknown ledger is rejected', async () => {
  const { memory, registerPeriod } = harness();

  await assert.rejects(registerPeriod(periodInput({ ledgerId: 'ledger-x' })), assertCode('LEDGER_NOT_FOUND'));

  assert.equal(storedPeriods(memory).length, 0);
});

test('period idempotency replays and conflicts like the others', async () => {
  const { memory, registerPeriod } = harness();

  const first = await registerPeriod({ ...periodInput(), idempotencyKey: 'key-p1' });
  const second = await registerPeriod({ ...periodInput(), idempotencyKey: 'key-p1' });
  assert.deepEqual(second, first);
  assert.equal(storedPeriods(memory).length, 1);

  await assert.rejects(
    registerPeriod({ ...periodInput({ periodId: 'per-other' }), idempotencyKey: 'key-p1' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
});

test('both status use cases reject a ledger the directory does not know', async () => {
  const { memory, registerAccount, registerJournal, setAccountStatus, setJournalStatus } = harness();
  await registerAccount(accountInput());
  await registerJournal(journalInput());

  await assert.rejects(
    setAccountStatus({ ledgerId: 'ledger-x', accountId: 'acc-1', status: 'INACTIVE' }),
    assertCode('LEDGER_NOT_FOUND'),
  );
  await assert.rejects(
    setJournalStatus({ ledgerId: 'ledger-x', journalId: 'jrn-1', status: 'INACTIVE' }),
    assertCode('LEDGER_NOT_FOUND'),
  );

  assert.equal(memory.snapshot().accounts[0].status, 'ACTIVE');
  assert.equal(memory.snapshot().journals[0].status, 'ACTIVE');
});

// The correction R1-IDEMP-ACCOUNT / R1-IDEMP-JOURNAL / R1-IDEMP-PERIOD / R3-001 / R4-001 / R2-1:
// a fingerprint over the entity identity alone turns a changed payload into a silent replay.

test('the same key with the same id and a changed account payload is a conflict', async () => {
  const { memory, registerAccount } = harness();
  await registerAccount({ ...accountInput(), idempotencyKey: 'key-a1' });

  for (const changed of [
    { code: '1.1.02' },
    { name: 'Caja chica' },
    { type: 'EXPENSE' },
    { postingAllowed: false },
  ]) {
    await assert.rejects(
      registerAccount({ ...accountInput(changed), idempotencyKey: 'key-a1' }),
      assertCode('IDEMPOTENCY_CONFLICT'),
      JSON.stringify(changed),
    );
  }

  const [stored] = storedAccounts(memory);
  assert.equal(stored.code.value, '1.1.01');
  assert.equal(stored.name, 'Caja');
  assert.equal(stored.type, 'ASSET');
  assert.equal(stored.postingAllowed, true);
});

test('the same key with the same id and a changed journal payload is a conflict', async () => {
  const { memory, registerJournal } = harness();
  await registerJournal({ ...journalInput(), idempotencyKey: 'key-j9' });

  await assert.rejects(
    registerJournal({ ...journalInput({ code: 'COMPRAS' }), idempotencyKey: 'key-j9' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
  await assert.rejects(
    registerJournal({ ...journalInput({ name: 'Otro nombre' }), idempotencyKey: 'key-j9' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(storedJournals(memory)[0].code, 'VENTAS');
});

test('the same key with the same id and changed period dates is a conflict', async () => {
  const { memory, registerPeriod } = harness();
  await registerPeriod({ ...periodInput(), idempotencyKey: 'key-p9' });

  await assert.rejects(
    registerPeriod({ ...periodInput({ startDate: '2026-02-01' }), idempotencyKey: 'key-p9' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
  await assert.rejects(
    registerPeriod({ ...periodInput({ endDate: '2026-11-30' }), idempotencyKey: 'key-p9' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(storedPeriods(memory)[0].startDate.value, '2026-01-01');
});

test('a parent added to a replayed account request is a conflict, not an ignored field', async () => {
  const { registerAccount } = harness();
  await registerAccount(accountInput({ accountId: 'acc-root', code: '1', postingAllowed: false }));
  await registerAccount({ ...accountInput({ accountId: 'acc-x', code: '1.5' }), idempotencyKey: 'key-a2' });

  await assert.rejects(
    registerAccount({ ...accountInput({ accountId: 'acc-x', code: '1.5', parentId: 'acc-root' }), idempotencyKey: 'key-a2' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
});
