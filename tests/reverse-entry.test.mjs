import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AccountingDate,
  ApplicationError,
  ClosePeriod,
  Currency,
  EntryError,
  JournalEntry,
  JournalEntryLine,
  Money,
  PostEntry,
  RegisterAccount,
  RegisterJournal,
  RegisterPeriod,
  ReversePostedEntry,
  SetAccountStatus,
  SetJournalStatus,
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

function assertEntryCode(code) {
  return (error) => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function money(text) {
  return Money.fromDecimal(text, uyu);
}

function draftOf(
  id,
  lines = [
    { id: 'line-1', accountId: 'acc-cash-ledger-1', side: 'DEBIT', amount: money('1000.00') },
    { id: 'line-2', accountId: 'acc-rev-ledger-1', side: 'CREDIT', amount: money('1000.00') },
  ],
) {
  return lines.reduce(
    (entry, line) => entry.addLine(JournalEntryLine.create({ description: undefined, ...line })),
    JournalEntry.createDraft({
      id,
      ledgerId: 'ledger-1',
      journalId: 'jrn-ledger-1',
      periodId: 'per-ledger-1',
      accountingDate: AccountingDate.create('2026-03-15'),
      description: 'Venta de contado',
    }),
  );
}

async function harness() {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = new RegisterAccount(deps);
  const registerJournal = new RegisterJournal(deps);
  const registerPeriod = new RegisterPeriod(deps);
  const postEntry = new PostEntry(deps);
  const closePeriod = new ClosePeriod(deps);
  const reversePostedEntry = new ReversePostedEntry(deps);
  const setAccountStatus = new SetAccountStatus(deps);
  const setJournalStatus = new SetJournalStatus(deps);

  for (const ledgerId of ['ledger-1', 'ledger-2']) {
    await registerAccount.execute({ ledgerId, accountId: `acc-cash-${ledgerId}`, code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
    await registerAccount.execute({ ledgerId, accountId: `acc-rev-${ledgerId}`, code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
    await registerJournal.execute({ ledgerId, journalId: `jrn-${ledgerId}`, code: 'VENTAS', name: 'Ventas' });
    await registerPeriod.execute({ ledgerId, periodId: `per-${ledgerId}`, name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  }

  // A posted original with two balanced pairs, so mirroring cannot depend on line position.
  await memory.entries.save(
    draftOf('original', [
      { id: 'line-1', accountId: 'acc-cash-ledger-1', side: 'DEBIT', amount: money('1000.00') },
      { id: 'line-2', accountId: 'acc-rev-ledger-1', side: 'CREDIT', amount: money('1000.00') },
      { id: 'line-3', accountId: 'acc-cash-ledger-1', side: 'DEBIT', amount: money('250.00') },
      { id: 'line-4', accountId: 'acc-rev-ledger-1', side: 'CREDIT', amount: money('250.00') },
    ]),
  );
  await postEntry.execute({ ledgerId: 'ledger-1', entryId: 'original', idempotencyKey: 'post-original' });

  return {
    memory,
    deps,
    postEntry,
    closePeriod,
    reversePostedEntry,
    setAccountStatus,
    setJournalStatus,
    registerPeriod,
  };
}

function reversalInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    originalEntryId: 'original',
    reversalEntryId: 'reversal',
    periodId: 'per-ledger-1',
    accountingDate: '2026-04-01',
    idempotencyKey: 'reverse-1',
    ...overrides,
  };
}

function storedEntry(memory, entryId) {
  return memory.snapshot().entries.find((entry) => entry.id === entryId);
}

test('V01/V02: reversing posts a mirrored entry and leaves the original untouched', async () => {
  const { memory, reversePostedEntry } = await harness();

  const result = await reversePostedEntry.execute(reversalInput());

  assert.equal(result.status, 'POSTED');
  assert.equal(result.reversalOfEntryId, 'original');
  assert.deepEqual(
    result.lines.map((line) => [line.lineId, line.accountId, line.side, line.amount.minorUnits]),
    [
      ['line-1', 'acc-cash-ledger-1', 'CREDIT', '100000'],
      ['line-2', 'acc-rev-ledger-1', 'DEBIT', '100000'],
      ['line-3', 'acc-cash-ledger-1', 'CREDIT', '25000'],
      ['line-4', 'acc-rev-ledger-1', 'DEBIT', '25000'],
    ],
  );
  assert.deepEqual(result.totalDebit, { minorUnits: '125000', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '125000', currency: { code: 'UYU', scale: 2 } });

  const original = storedEntry(memory, 'original');
  assert.equal(original.status, 'POSTED');
  assert.deepEqual(
    original.lines.map((line) => [line.id, line.side]),
    [
      ['line-1', 'DEBIT'],
      ['line-2', 'CREDIT'],
      ['line-3', 'DEBIT'],
      ['line-4', 'CREDIT'],
    ],
  );
  assert.equal(storedEntry(memory, 'reversal').reversalOfEntryId, 'original');
});

test('V03: a second full reversal of the same original is rejected', async () => {
  const { memory, reversePostedEntry } = await harness();
  await reversePostedEntry.execute(reversalInput());

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ reversalEntryId: 'reversal-2', idempotencyKey: 'reverse-2' })),
    assertCode('ENTRY_ALREADY_REVERSED'),
  );

  assert.equal(storedEntry(memory, 'reversal-2'), undefined);
  assert.equal(memory.snapshot().entries.length, 2);
});

test('V04: a draft cannot be reversed', async () => {
  const { memory, reversePostedEntry } = await harness();
  await memory.entries.save(draftOf('borrador'));

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ originalEntryId: 'borrador' })),
    assertEntryCode('ENTRY_STATE'),
  );

  assert.equal(storedEntry(memory, 'reversal'), undefined);
});

test('V05: a closed destination period rejects the reversal', async () => {
  const { reversePostedEntry, registerPeriod, closePeriod } = await harness();
  await registerPeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-2027', name: 'Ejercicio 2027', startDate: '2027-01-01', endDate: '2027-12-31' });
  await closePeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-2027', idempotencyKey: 'close-2027' });

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ periodId: 'per-2027', accountingDate: '2027-01-10' })),
    assertCode('PERIOD_CLOSED'),
  );
});

test('V06: an original in a closed period can still be reversed into an open one', async () => {
  const { memory, reversePostedEntry, registerPeriod, closePeriod } = await harness();
  await registerPeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-2027', name: 'Ejercicio 2027', startDate: '2027-01-01', endDate: '2027-12-31' });
  await closePeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', idempotencyKey: 'close-2026' });

  const result = await reversePostedEntry.execute(reversalInput({ periodId: 'per-2027', accountingDate: '2027-01-10' }));

  assert.equal(result.periodId, 'per-2027');
  assert.equal(storedEntry(memory, 'original').status, 'POSTED');
  assert.equal(memory.snapshot().periods.find((period) => period.id === 'per-ledger-1').status, 'CLOSED');
});

test('V07: a date outside the destination period rejects the reversal', async () => {
  const { reversePostedEntry, registerPeriod } = await harness();
  await registerPeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-2027', name: 'Ejercicio 2027', startDate: '2027-01-01', endDate: '2027-12-31' });

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ periodId: 'per-2027', accountingDate: '2026-12-31' })),
    assertCode('PERIOD_DATE_OUTSIDE'),
  );
});

test('V08: an account of the original that no longer admits postings blocks the reversal', async () => {
  const { memory, reversePostedEntry, setAccountStatus } = await harness();
  await setAccountStatus.execute({ ledgerId: 'ledger-1', accountId: 'acc-rev-ledger-1', status: 'INACTIVE' });

  await assert.rejects(reversePostedEntry.execute(reversalInput()), assertCode('ACCOUNT_INACTIVE'));
  assert.equal(storedEntry(memory, 'reversal'), undefined);
});

test('V09: an inactive journal blocks the reversal', async () => {
  const { memory, reversePostedEntry, setJournalStatus } = await harness();
  await setJournalStatus.execute({ ledgerId: 'ledger-1', journalId: 'jrn-ledger-1', status: 'INACTIVE' });

  await assert.rejects(reversePostedEntry.execute(reversalInput()), assertCode('JOURNAL_INACTIVE'));
  assert.equal(storedEntry(memory, 'reversal'), undefined);
});

test('V10: an original of another ledger is not reachable', async () => {
  const { memory, reversePostedEntry } = await harness();

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ ledgerId: 'ledger-2' })),
    assertCode('ENTRY_NOT_FOUND'),
  );

  assert.equal(storedEntry(memory, 'original').status, 'POSTED');
  assert.equal(memory.snapshot().entries.length, 1);
});

test('V11/V12: idempotency replays the same request and conflicts with another', async () => {
  const { memory, reversePostedEntry } = await harness();

  const first = await reversePostedEntry.execute(reversalInput());
  const second = await reversePostedEntry.execute(reversalInput());
  assert.deepEqual(second, first);
  assert.equal(memory.snapshot().entries.length, 2);

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ reversalEntryId: 'other-reversal' })),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
});

test('V13: a failing save leaves no reversal behind', async () => {
  const memory = createInMemoryAccounting({
    chartOfAccountsByLedger: LEDGERS,
    overrides: (scope) => ({
      entries: {
        ...scope.entries,
        save: async (entry) => {
          if (entry.reversalOfEntryId !== undefined) throw new Error('storage unavailable');
          await scope.entries.save(entry);
        },
      },
    }),
  });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = new RegisterAccount(deps);
  const registerJournal = new RegisterJournal(deps);
  const registerPeriod = new RegisterPeriod(deps);
  const postEntry = new PostEntry(deps);
  const reversePostedEntry = new ReversePostedEntry(deps);

  await registerAccount.execute({ ledgerId: 'ledger-1', accountId: 'acc-cash-ledger-1', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
  await registerAccount.execute({ ledgerId: 'ledger-1', accountId: 'acc-rev-ledger-1', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
  await registerJournal.execute({ ledgerId: 'ledger-1', journalId: 'jrn-ledger-1', code: 'VENTAS', name: 'Ventas' });
  await registerPeriod.execute({ ledgerId: 'ledger-1', periodId: 'per-ledger-1', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  await memory.entries.save(draftOf('original'));
  await postEntry.execute({ ledgerId: 'ledger-1', entryId: 'original', idempotencyKey: 'post-original' });

  await assert.rejects(reversePostedEntry.execute(reversalInput()), /storage unavailable/);

  assert.equal(memory.snapshot().entries.length, 1);
  assert.equal(storedEntry(memory, 'original').status, 'POSTED');
  assert.equal(memory.snapshot().idempotency.filter((record) => record.operation === 'reversePostedEntry').length, 0);
});

test('V14: a reversal id that is already used is rejected instead of overwriting the entry', async () => {
  const { memory, reversePostedEntry } = await harness();
  await memory.entries.save(draftOf('neighbour'));

  // "neighbour" is already stored in this ledger: reusing its id would silently replace that entry.
  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ reversalEntryId: 'neighbour' })),
    assertCode('ENTRY_ALREADY_EXISTS'),
  );

  assert.equal(storedEntry(memory, 'neighbour').status, 'DRAFT');
  const original = storedEntry(memory, 'original');
  assert.equal(original.reversalOfEntryId, undefined);
  assert.equal(original.status, 'POSTED');
  assert.equal(original.lines.length, 4);
  assert.equal(memory.snapshot().entries.length, 2);
});

test('V15: a draft reversal id blocks the reversal before any account or period check', async () => {
  const { memory, reversePostedEntry } = await harness();
  await memory.entries.save(draftOf('occupied'));

  await assert.rejects(
    reversePostedEntry.execute(reversalInput({ reversalEntryId: 'occupied' })),
    assertCode('ENTRY_ALREADY_EXISTS'),
  );

  assert.equal(storedEntry(memory, 'occupied').status, 'DRAFT');
  assert.equal(storedEntry(memory, 'occupied').reversalOfEntryId, undefined);
});

test('V16: a stored reversal draft blocks a new reversal even before it is posted', async () => {
  const { memory, reversePostedEntry } = await harness();

  // Rule 9 of the spec is status-blind on purpose: a reversal that already exists in any state means
  // this original is being reversed elsewhere, and the missing delete operation makes a second one a
  // decision, not a shortcut.
  const original = storedEntry(memory, 'original');
  await memory.entries.save(
    original.createReversalDraft({
      id: 'draft-reversal',
      periodId: 'per-ledger-1',
      accountingDate: AccountingDate.create('2026-04-01'),
    }),
  );

  await assert.rejects(reversePostedEntry.execute(reversalInput()), assertCode('ENTRY_ALREADY_REVERSED'));

  assert.equal(storedEntry(memory, 'reversal'), undefined);
  assert.equal(storedEntry(memory, 'draft-reversal').status, 'DRAFT');
});
