import test from 'node:test';
import assert from 'node:assert/strict';

import { Accounting, ApplicationError, createInMemoryAccounting, LedgerError } from '../../dist/index.js';

const ledgerInput = { ledgerId: 'ledger-1', name: 'Libro comercial', chartOfAccountsId: 'chart-1' };

function harness(options = {}) {
  const memory = createInMemoryAccounting(options);
  return { memory, app: new Accounting({ unitOfWork: memory.unitOfWork }) };
}

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

function assertDomainCode(code) {
  return (error) => {
    assert.ok(error instanceof LedgerError, `expected LedgerError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

function storedLedgers(memory) {
  return memory.snapshot().ledgers;
}

test('L01: registering a ledger stores it active with its chart of accounts', async () => {
  const { memory, app } = harness();

  const result = await app.registerLedger({ ...ledgerInput });

  assert.deepEqual(result, {
    ledgerId: 'ledger-1',
    name: 'Libro comercial',
    chartOfAccountsId: 'chart-1',
    status: 'ACTIVE',
  });

  const [stored] = storedLedgers(memory);
  assert.equal(stored.id, 'ledger-1');
  assert.equal(stored.name, 'Libro comercial');
  assert.equal(stored.chartOfAccountsId, 'chart-1');
  assert.equal(stored.status, 'ACTIVE');
});

test('L02: registering an id that is already taken is rejected and never overwrites', async () => {
  const { memory, app } = harness();
  await app.registerLedger({ ...ledgerInput });

  await assert.rejects(
    app.registerLedger({ ...ledgerInput, name: 'Otro libro', chartOfAccountsId: 'chart-2' }),
    assertCode('LEDGER_ALREADY_EXISTS'),
  );

  const ledgers = storedLedgers(memory);
  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].name, 'Libro comercial');
  assert.equal(ledgers[0].chartOfAccountsId, 'chart-1');
});

test('L03: an invalid id, name or chart is rejected by the domain and nothing is stored', async () => {
  for (const [field, value] of [
    ['ledgerId', ''],
    ['name', '   '],
    ['chartOfAccountsId', ' chart-1'],
  ]) {
    const { memory, app } = harness();

    await assert.rejects(app.registerLedger({ ...ledgerInput, [field]: value }), assertDomainCode('INVALID_LEDGER'));

    assert.deepEqual(storedLedgers(memory), []);
    assert.deepEqual(memory.snapshot().idempotency, []);
  }
});

test('L04: the same key with the same request replays without a second write', async () => {
  const { memory, app } = harness();
  const request = { ...ledgerInput, idempotencyKey: 'key-1' };

  const first = await app.registerLedger({ ...request });
  const second = await app.registerLedger({ ...request });

  assert.deepEqual(second, first);
  assert.equal(storedLedgers(memory).length, 1);
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('L05: the same key with another name or another chart is a conflict and leaves the record intact', async () => {
  const { memory, app } = harness();
  await app.registerLedger({ ...ledgerInput, idempotencyKey: 'key-1' });

  for (const change of [{ name: 'Otro libro' }, { chartOfAccountsId: 'chart-2' }]) {
    await assert.rejects(
      app.registerLedger({ ...ledgerInput, ...change, idempotencyKey: 'key-1' }),
      assertCode('IDEMPOTENCY_CONFLICT'),
    );
  }

  const [stored] = storedLedgers(memory);
  assert.equal(stored.name, 'Libro comercial');
  assert.equal(stored.chartOfAccountsId, 'chart-1');
});

test('L12: a failing save leaves neither the ledger nor the idempotency record', async () => {
  const { memory, app } = harness({
    overrides: (scope) => ({
      ledgers: {
        ...scope.ledgers,
        save: async () => {
          throw new Error('storage unavailable');
        },
      },
    }),
  });

  await assert.rejects(app.registerLedger({ ...ledgerInput, idempotencyKey: 'key-1' }), /storage unavailable/);

  assert.deepEqual(storedLedgers(memory), []);
  assert.deepEqual(memory.snapshot().idempotency, []);
});

test('L15: accounts derive their chart of accounts from the registered ledger', async () => {
  const { memory, app } = harness();
  await app.registerLedger({ ...ledgerInput });

  const account = await app.registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-cash',
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
  });

  assert.equal(account.chartOfAccountsId, 'chart-1');
  assert.equal(memory.snapshot().accounts[0].chartOfAccountsId, 'chart-1');
});

test('L16: the result never exposes the accounts, journals, periods or entries of the ledger', async () => {
  const { app } = harness();
  await app.registerLedger({ ...ledgerInput });

  const result = await app.registerLedger({ ledgerId: 'ledger-2', name: 'Libro fiscal', chartOfAccountsId: 'chart-2' });

  assert.deepEqual(Object.keys(result).sort(), ['chartOfAccountsId', 'ledgerId', 'name', 'status']);
});

test('an inherited property name is not a registered ledger', async () => {
  const { app } = harness();

  for (const ledgerId of ['constructor', 'toString', '__proto__']) {
    await assert.rejects(
      app.registerAccount({
        ledgerId,
        accountId: 'acc-cash',
        code: '1.1.01',
        name: 'Caja',
        type: 'ASSET',
        postingAllowed: true,
      }),
      assertCode('LEDGER_NOT_FOUND'),
    );
  }
});
