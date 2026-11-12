import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Accounting,
  ApplicationError,
  Currency,
  PostEntry,
  createInMemoryAccounting,
} from '../dist/index.js';

const LEDGERS = { 'ledger-1': 'chart-1' };
const uyu = Currency.create('UYU', 2);

function amount(text) {
  const [units, cents = '00'] = text.split('.');
  return { minorUnits: `${units}${cents.padStart(2, '0')}`, currency: { code: uyu.code, scale: uyu.scale } };
}

function line(lineId, accountId, side, text) {
  return { lineId, accountId, side, amount: amount(text) };
}

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function harness() {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS });
  const deps = { unitOfWork: memory.unitOfWork };
  const app = new Accounting(deps);

  return { memory, deps, app };
}

async function chart(app) {
  await app.registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-cash',
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
  });
  await app.registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-rev',
    code: '4.1.01',
    name: 'Ventas',
    type: 'REVENUE',
    postingAllowed: true,
  });
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await app.registerPeriod({
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
  await app.registerPeriod({
    ledgerId: 'ledger-1',
    periodId: 'per-2027',
    name: 'Ejercicio 2027',
    startDate: '2027-01-01',
    endDate: '2027-12-31',
  });
}

test('the facade runs the whole module: chart, draft, edit, posting, closing and reversal', async () => {
  const { memory, app } = harness();
  await chart(app);

  // Journals and accounts can be deactivated and reactivated without losing identity.
  const inactive = await app.setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });
  assert.equal(inactive.status, 'INACTIVE');
  const active = await app.setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'ACTIVE' });
  assert.equal(active.status, 'ACTIVE');
  const accountStatus = await app.setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-cash', status: 'ACTIVE' });
  assert.equal(accountStatus.status, 'ACTIVE');

  const draft = await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines: [],
  });
  assert.equal(draft.status, 'DRAFT');

  const withDebit = await app.addEntryLine({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    line: line('line-1', 'acc-cash', 'DEBIT', '1000.00'),
  });
  assert.equal(withDebit.lines.length, 1);

  await app.addEntryLine({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    line: line('line-temp', 'acc-cash', 'DEBIT', '1.00'),
  });
  const cleaned = await app.removeEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', lineId: 'line-temp' });
  assert.deepEqual(
    cleaned.lines.map((item) => item.lineId),
    ['line-1'],
  );

  await app.addEntryLine({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    line: line('line-2', 'acc-rev', 'CREDIT', '1000.00'),
  });

  const posted = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });
  assert.equal(posted.status, 'POSTED');
  assert.deepEqual(posted.totalDebit, amount('1000.00'));
  assert.deepEqual(posted.totalCredit, amount('1000.00'));

  const closed = await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', idempotencyKey: 'close-1' });
  assert.equal(closed.status, 'CLOSED');

  const reversal = await app.reversePostedEntry({
    ledgerId: 'ledger-1',
    originalEntryId: 'entry-1',
    reversalEntryId: 'reversal-1',
    periodId: 'per-2027',
    accountingDate: '2027-01-10',
    idempotencyKey: 'reverse-1',
  });
  assert.equal(reversal.status, 'POSTED');
  assert.equal(reversal.reversalOfEntryId, 'entry-1');

  const stored = memory.snapshot();
  assert.deepEqual(
    stored.entries.filter((entry) => entry.status === 'POSTED').map((entry) => entry.id),
    ['entry-1', 'reversal-1'],
  );
  assert.deepEqual(
    stored.periods.map((period) => [period.id, period.status]),
    [
      ['per-2026', 'CLOSED'],
      ['per-2027', 'OPEN'],
    ],
  );
});

test('the facade propagates the use case errors unchanged and leaves no partial write', async () => {
  const { memory, app } = harness();
  await chart(app);

  await assert.rejects(
    app.postEntry({ ledgerId: 'ledger-1', entryId: 'missing', idempotencyKey: 'post-1' }),
    assertCode('ENTRY_NOT_FOUND'),
  );
  await assert.rejects(
    app.registerAccount({
      ledgerId: 'ledger-1',
      accountId: 'acc-unknown',
      code: '1.1.02',
      name: 'Otra caja',
      type: 'ASSET',
      parentId: 'acc-missing',
      postingAllowed: true,
    }),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(memory.snapshot().accounts.length, 2);
  assert.deepEqual(memory.snapshot().entries, []);
});

test('the facade and a single use case class share the same unit of work and the same stores', async () => {
  const { memory, deps, app } = harness();
  const postEntry = new PostEntry(deps);
  await chart(app);

  const draft = await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines: [line('line-1', 'acc-cash', 'DEBIT', '1000.00'), line('line-2', 'acc-rev', 'CREDIT', '1000.00')],
  });
  assert.equal(draft.status, 'DRAFT');

  // The draft was written through the facade; the class posts it without any extra wiring.
  const posted = await postEntry.execute({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });
  assert.equal(posted.status, 'POSTED');
  assert.equal(memory.snapshot().entries.length, 1);
});
