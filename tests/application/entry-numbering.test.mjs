import test from 'node:test';
import assert from 'node:assert/strict';

import { Accounting, ApplicationError, Currency, Money, createInMemoryAccounting } from '../../dist/index.js';

import { seedLedgers, TEST_CURRENCY } from './seed.mjs';

const LEDGERS = { 'ledger-1': 'chart-1', 'ledger-2': 'chart-2' };
const uyu = Currency.create('UYU', 2);

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function amount(text) {
  return Money.fromDecimal(text, uyu).toJSON();
}

/** Registers accounts, a journal and a period for one ledger, the way a host does. */
async function seedLedger(app, { ledgerId, cashId, revenueId, journalId, periodId }) {
  await app.registerAccount({
    ledgerId,
    accountId: cashId,
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
  });
  await app.registerAccount({
    ledgerId,
    accountId: revenueId,
    code: '4.1.01',
    name: 'Ventas',
    type: 'REVENUE',
    postingAllowed: true,
  });
  await app.registerJournal({ ledgerId, journalId, code: 'VENTAS', name: 'Diario de ventas' });
  await app.registerPeriod({
    ledgerId,
    periodId,
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
}

async function harness(unitOfWorkOf = (memory) => memory.unitOfWork) {
  const memory = createInMemoryAccounting();
  const app = new Accounting({ unitOfWork: unitOfWorkOf(memory) });

  await seedLedgers(app, LEDGERS, TEST_CURRENCY);
  await seedLedger(app, {
    ledgerId: 'ledger-1',
    cashId: 'acc-cash',
    revenueId: 'acc-rev',
    journalId: 'jrn-1',
    periodId: 'per-1',
  });
  await seedLedger(app, {
    ledgerId: 'ledger-2',
    cashId: 'acc-cash-2',
    revenueId: 'acc-rev-2',
    journalId: 'jrn-2',
    periodId: 'per-2',
  });

  return { memory, app };
}

function draftOf({ entryId, ledgerId = 'ledger-1', journalId = 'jrn-1', periodId = 'per-1', cashId = 'acc-cash', revenueId = 'acc-rev' }) {
  return {
    ledgerId,
    entryId,
    journalId,
    periodId,
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines: [
      { lineId: 'line-1', accountId: cashId, side: 'DEBIT', amount: amount('1000.00') },
      { lineId: 'line-2', accountId: revenueId, side: 'CREDIT', amount: amount('1000.00') },
    ],
  };
}

async function postEntry(app, entryId, ledgerId = 'ledger-1') {
  return app.postEntry({ ledgerId, entryId, idempotencyKey: `key-${ledgerId}-${entryId}` });
}

function storedEntry(memory, entryId, ledgerId = 'ledger-1') {
  return memory.snapshot().entries.find((entry) => entry.ledgerId === ledgerId && entry.id === entryId);
}

test('N01: the first posted entry of a ledger gets number 1 and the result repeats it', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));

  const result = await postEntry(app, 'entry-1');

  assert.equal(result.number, 1);
  assert.equal(storedEntry(memory, 'entry-1').number, 1);
});

test('N02: the second posted entry of the same ledger gets number 2', async () => {
  const { app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await app.createEntryDraft(draftOf({ entryId: 'entry-2' }));

  await postEntry(app, 'entry-1');
  const second = await postEntry(app, 'entry-2');

  assert.equal(second.number, 2);
});

test('N03: two ledgers number their own entries from 1', async () => {
  const { app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await app.createEntryDraft(
    draftOf({
      entryId: 'entry-2',
      ledgerId: 'ledger-2',
      journalId: 'jrn-2',
      periodId: 'per-2',
      cashId: 'acc-cash-2',
      revenueId: 'acc-rev-2',
    }),
  );

  const first = await postEntry(app, 'entry-1');
  const other = await postEntry(app, 'entry-2', 'ledger-2');

  assert.equal(first.number, 1);
  assert.equal(other.number, 1);
});

test('N06: the reversal gets its own number from the same counter as its original', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await postEntry(app, 'entry-1');

  const reversal = await app.reversePostedEntry({
    ledgerId: 'ledger-1',
    originalEntryId: 'entry-1',
    reversalEntryId: 'entry-2',
    periodId: 'per-1',
    accountingDate: '2026-04-15',
    idempotencyKey: 'reverse-1',
  });

  assert.equal(reversal.number, 2);
  assert.equal(reversal.reversalOfEntryId, 'entry-1');
  assert.equal(storedEntry(memory, 'entry-1').number, 1);
});

test('N07: a counter that fails leaves the draft a draft and writes nothing', async () => {
  const brokenCounter = new Error('sequence down');
  const { memory, app } = await harness((memory) => ({
    async run(work) {
      return memory.unitOfWork.run((scope) =>
        work({ ...scope, entryNumbers: { async nextNumber() { throw brokenCounter; } } }),
      );
    },
  }));
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));

  await assert.rejects(postEntry(app, 'entry-1'), (error) => error === brokenCounter);

  assert.equal(storedEntry(memory, 'entry-1').status, 'DRAFT');
  assert.equal(storedEntry(memory, 'entry-1').number, undefined);
  assert.deepEqual(memory.snapshot().idempotency, []);
});

test('N08: a replay returns the same number and does not consume another', async () => {
  const { app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await app.createEntryDraft(draftOf({ entryId: 'entry-2' }));

  const first = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });
  const replay = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });
  const second = await postEntry(app, 'entry-2');

  assert.equal(first.number, 1);
  assert.equal(replay.number, 1);
  assert.equal(second.number, 2);
});

test('N11: a closed period is reported before the counter is asked for a number', async () => {
  const brokenCounter = new Error('sequence down');
  const { app } = await harness((memory) => ({
    async run(work) {
      return memory.unitOfWork.run((scope) =>
        work({ ...scope, entryNumbers: { async nextNumber() { throw brokenCounter; } } }),
      );
    },
  }));
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-1', idempotencyKey: 'close-1' });

  await assert.rejects(postEntry(app, 'entry-1'), assertCode('PERIOD_CLOSED'));
});

test('N12: the number does not leak into the reports', async () => {
  const { app } = await harness();
  await app.createEntryDraft(draftOf({ entryId: 'entry-1' }));
  await app.createEntryDraft(draftOf({ entryId: 'entry-2' }));
  await postEntry(app, 'entry-1');
  await postEntry(app, 'entry-2');

  const balances = await app.accountBalances({ ledgerId: 'ledger-1' });
  const movements = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });

  assert.deepEqual(Object.keys(balances.rows[0]).sort(), [
    'accountId',
    'balance',
    'code',
    'credit',
    'debit',
    'name',
    'side',
    'type',
  ]);
  assert.deepEqual(Object.keys(movements.rows[0]).sort(), [
    'accountingDate',
    'amount',
    'description',
    'entryId',
    'journalId',
    'lineId',
    'runningBalance',
    'side',
  ]);
});
