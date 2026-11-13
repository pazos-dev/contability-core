import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Accounting,
  AccountingDate,
  ApplicationError,
  Currency,
  JournalEntry,
  JournalEntryLine,
  Money,
  createInMemoryAccounting,
} from '../dist/index.js';

const LEDGERS = { 'ledger-1': 'chart-1', 'ledger-2': 'chart-2' };
const uyu = Currency.create('UYU', 2);

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function periodErrorCode(code) {
  return (error) => {
    assert.equal(error?.code, code, error?.message);
    return true;
  };
}

function draft(id, status = 'DRAFT') {
  const entry = JournalEntry.createDraft({
    id,
    ledgerId: 'ledger-1',
    journalId: 'jrn-ledger-1',
    periodId: 'per-ledger-1',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Venta',
  })
    .addLine(
      JournalEntryLine.create({
        id: 'line-1',
        accountId: 'acc-cash-ledger-1',
        side: 'DEBIT',
        amount: Money.fromDecimal('100.00', uyu),
      }),
    )
    .addLine(
      JournalEntryLine.create({
        id: 'line-2',
        accountId: 'acc-rev-ledger-1',
        side: 'CREDIT',
        amount: Money.fromDecimal('100.00', uyu),
      }),
    );

  return status === 'POSTED' ? entry.post() : entry;
}

async function harness(options = {}) {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS, ...options });
  const deps = { unitOfWork: memory.unitOfWork };
  const app = new Accounting(deps);

  for (const ledgerId of ['ledger-1', 'ledger-2']) {
    await app.registerAccount({ ledgerId, accountId: `acc-cash-${ledgerId}`, code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
    await app.registerAccount({ ledgerId, accountId: `acc-rev-${ledgerId}`, code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
    await app.registerJournal({ ledgerId, journalId: `jrn-${ledgerId}`, code: 'VENTAS', name: 'Ventas' });
    await app.registerPeriod({ ledgerId, periodId: `per-${ledgerId}`, name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  }

  return { memory, app };
}

function storedPeriod(memory, periodId = 'per-ledger-1') {
  return memory.snapshot().periods.find((period) => period.id === periodId);
}

test('C01: closing a period keeps posted entries and drafts untouched', async () => {
  const { memory, app } = await harness();
  await memory.entries.save(draft('entry-posted'));
  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-posted', idempotencyKey: 'post-1' });
  await memory.entries.save(draft('entry-draft'));

  const result = await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-1' });

  assert.deepEqual(result, { ledgerId: 'ledger-1', periodId: 'per-ledger-1', status: 'CLOSED' });
  assert.equal(storedPeriod(memory).status, 'CLOSED');

  const entries = memory.snapshot().entries;
  assert.equal(entries.find((entry) => entry.id === 'entry-posted').status, 'POSTED');
  assert.equal(entries.find((entry) => entry.id === 'entry-draft').status, 'DRAFT');
  assert.equal(storedPeriod(memory).startDate.value, '2026-01-01');
});

test('C02: closing twice with different keys is a state error', async () => {
  const { memory, app } = await harness();
  await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-1' });

  await assert.rejects(
    app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-2' }),
    periodErrorCode('PERIOD_ALREADY_CLOSED'),
  );

  assert.equal(storedPeriod(memory).status, 'CLOSED');
});

test('C03: repeating the same close request replays without a second effect', async () => {
  const { memory, app } = await harness();

  const first = await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-1' });
  const second = await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-1' });

  assert.deepEqual(second, first);
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('C04: a period of another ledger is not reachable', async () => {
  const { memory, app } = await harness();

  await assert.rejects(
    app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-2', idempotencyKey: 'close-1' }),
    assertCode('PERIOD_NOT_FOUND'),
  );

  assert.equal(storedPeriod(memory, 'per-ledger-2').status, 'OPEN');
  assert.equal(storedPeriod(memory, 'per-ledger-1').status, 'OPEN');
});

test('C06: a failing save leaves the period open', async () => {
  const { memory, app } = await harness({
    overrides: (scope) => ({
      periods: {
        ...scope.periods,
        save: async (period) => {
          // Seeding registers an OPEN period; only closing it must fail here.
          if (period.status === 'CLOSED') throw new Error('storage unavailable');
          await scope.periods.save(period);
        },
      },
    }),
  });

  await assert.rejects(
    app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-1' }),
    /storage unavailable/,
  );

  assert.equal(memory.snapshot().periods.find((period) => period.id === 'per-ledger-1').status, 'OPEN');
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('C07: an unknown period is reported as not found', async () => {
  const { app } = await harness();

  await assert.rejects(
    app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-nowhere', idempotencyKey: 'close-1' }),
    assertCode('PERIOD_NOT_FOUND'),
  );
});

test('closing a ledger the directory does not know is rejected', async () => {
  const { app } = await harness();

  await assert.rejects(
    app.closePeriod({ ledgerId: 'ledger-x', periodId: 'per-ledger-1', idempotencyKey: 'close-1' }),
    assertCode('LEDGER_NOT_FOUND'),
  );
});
