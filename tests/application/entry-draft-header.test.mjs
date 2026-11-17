import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Accounting,
  AccountingDate,
  ApplicationError,
  Currency,
  EntryError,
  JournalEntry,
  JournalEntryLine,
  Money,
  PeriodError,
  createInMemoryAccounting,
} from '../../dist/index.js';

import { saveEntry, seedLedgers } from './seed.mjs';

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

function assertPeriodCode(code) {
  return (error) => {
    assert.ok(error instanceof PeriodError, `expected PeriodError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function money(text) {
  return Money.fromDecimal(text, uyu);
}

function amount(minorUnits) {
  return { minorUnits, currency: { code: 'UYU', scale: 2 } };
}

function debit(lineId, minorUnits = '100000') {
  return { lineId, accountId: 'acc-cash', side: 'DEBIT', amount: amount(minorUnits) };
}

function credit(lineId, minorUnits = '100000') {
  return { lineId, accountId: 'acc-rev', side: 'CREDIT', amount: amount(minorUnits) };
}

// A domain-level draft, for the fixtures the host persists itself instead of going through createEntryDraft.
function domainDraft(id, lines) {
  return lines.reduce(
    (entry, line) => entry.addLine(JournalEntryLine.create({ description: undefined, ...line })),
    JournalEntry.createDraft({
      id,
      ledgerId: 'ledger-1',
      journalId: 'jrn-1',
      periodId: 'per-2026',
      accountingDate: AccountingDate.create('2026-03-15'),
      description: 'Venta de contado',
    }),
  );
}

async function harness({ ledgers = LEDGERS } = {}) {
  // The port is counted, not changed: L23 has to prove a replay does not reach the store twice.
  let saves = 0;
  const memory = createInMemoryAccounting({
    overrides: (scope) => ({
      entries: {
        ...scope.entries,
        save: async (entry) => {
          saves += 1;
          await scope.entries.save(entry);
        },
      },
    }),
  });
  const deps = { unitOfWork: memory.unitOfWork };
  const app = new Accounting(deps);

  await seedLedgers(app, ledgers);

  await app.registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-cash', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
  await app.registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-rev', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-2', code: 'COMPRAS', name: 'Compras' });
  await app.registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  await app.registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-2027', name: 'Ejercicio 2027', startDate: '2027-01-01', endDate: '2027-12-31' });

  return { memory, deps, app, saves: () => saves };
}

function draftInput(lines, overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines,
    ...overrides,
  };
}

function headerInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-2',
    periodId: 'per-2027',
    accountingDate: '2027-01-05',
    description: 'Venta corregida',
    ...overrides,
  };
}

function stored(memory, entryId = 'entry-1') {
  return memory.snapshot().entries.find((entry) => entry.id === entryId);
}

function headerRecords(memory) {
  return memory.snapshot().idempotency.filter((record) => record.operation === 'changeEntryHeader');
}

test('L14: changing the header returns the draft with the new header, its lines and its id, and stores it', async () => {
  const { memory, app, saves } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  const before = saves();

  const result = await app.changeHeader(headerInput());

  assert.equal(result.status, 'DRAFT');
  assert.equal(result.number, null);
  assert.equal(result.entryId, 'entry-1');
  assert.equal(result.journalId, 'jrn-2');
  assert.equal(result.periodId, 'per-2027');
  assert.equal(result.accountingDate, '2027-01-05');
  assert.equal(result.description, 'Venta corregida');
  assert.deepEqual(
    result.lines.map((line) => [line.lineId, line.side]),
    [
      ['line-1', 'DEBIT'],
      ['line-2', 'CREDIT'],
    ],
  );

  // The port was handed the new header exactly once.
  assert.equal(saves(), before + 1);
  const after = stored(memory);
  assert.equal(after.id, 'entry-1');
  assert.equal(after.journalId, 'jrn-2');
  assert.equal(after.periodId, 'per-2027');
  assert.equal(after.accountingDate.value, '2027-01-05');
  assert.equal(after.description, 'Venta corregida');
  assert.equal(after.lines.length, 2);
});

test('L15: changing only the journal leaves the two lines untouched and returns them', async () => {
  const { memory, app } = await harness();
  const draft = await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')], { journalId: 'jrn-2' }));

  const result = await app.changeHeader(headerInput({
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
  }));

  assert.equal(result.journalId, 'jrn-1');
  assert.deepEqual(result.lines, draft.lines);
  assert.equal(stored(memory).journalId, 'jrn-1');
  assert.equal(stored(memory).lines.length, 2);
});

test('L16: a posted entry rejects the header change and keeps its number', async () => {
  const { memory, app, saves } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  const posted = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });
  const before = saves();

  await assert.rejects(app.changeHeader(headerInput()), assertEntryCode('ENTRY_STATE'));

  const after = stored(memory);
  assert.equal(after.status, 'POSTED');
  assert.equal(after.number, posted.number);
  assert.equal(after.journalId, 'jrn-1');
  assert.equal(after.periodId, 'per-2026');
  assert.equal(after.description, 'Venta de contado');
  assert.equal(after.lines.length, 2);
  assert.equal(saves(), before);
});

test('L17: an empty or padded description is rejected and nothing changes', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  for (const description of ['', '   ', ' Venta corregida', 'Venta corregida ']) {
    await assert.rejects(
      app.changeHeader(headerInput({ description })),
      assertEntryCode('INVALID_ENTRY'),
      JSON.stringify(description),
    );
  }

  const after = stored(memory);
  assert.equal(after.description, 'Venta de contado');
  assert.equal(after.journalId, 'jrn-1');
  assert.equal(headerRecords(memory).length, 0);
});

test('L18: an impossible date is INVALID_DATE and nothing changes', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  await assert.rejects(
    app.changeHeader(headerInput({ accountingDate: '2026-02-30' })),
    assertPeriodCode('INVALID_DATE'),
  );

  const after = stored(memory);
  assert.equal(after.accountingDate.value, '2026-03-15');
  assert.equal(after.journalId, 'jrn-1');
  assert.equal(headerRecords(memory).length, 0);
});

test('L19: a journal or a period of another ledger, or an unknown one, is not reachable', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  await app.registerJournal({ ledgerId: 'ledger-2', journalId: 'jrn-foreign', code: 'VENTAS', name: 'Ventas' });
  await app.registerPeriod({ ledgerId: 'ledger-2', periodId: 'per-foreign', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });

  for (const journalId of ['jrn-foreign', 'jrn-nowhere']) {
    await assert.rejects(app.changeHeader(headerInput({ journalId })), assertCode('JOURNAL_NOT_FOUND'), journalId);
  }

  for (const periodId of ['per-foreign', 'per-nowhere']) {
    await assert.rejects(app.changeHeader(headerInput({ periodId })), assertCode('PERIOD_NOT_FOUND'), periodId);
  }

  const after = stored(memory);
  assert.equal(after.journalId, 'jrn-1');
  assert.equal(after.periodId, 'per-2026');
  assert.equal(after.accountingDate.value, '2026-03-15');
  assert.equal(headerRecords(memory).length, 0);
});

test('L20: a draft may move to an inactive journal and a closed period', async () => {
  const { memory, app } = await harness();
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-old', code: 'ANTIGUO', name: 'Antiguo' });
  await app.registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-old', name: 'Ejercicio 2025', startDate: '2025-01-01', endDate: '2025-12-31' });
  await app.setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-old', status: 'INACTIVE' });
  await app.closePeriod({ ledgerId: 'ledger-1', periodId: 'per-old', idempotencyKey: 'close-old' });
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  const result = await app.changeHeader(headerInput({
    journalId: 'jrn-old',
    periodId: 'per-old',
    accountingDate: '2025-06-30',
  }));

  assert.equal(result.journalId, 'jrn-old');
  assert.equal(result.periodId, 'per-old');
  assert.equal(result.accountingDate, '2025-06-30');

  const after = stored(memory);
  assert.equal(after.journalId, 'jrn-old');
  assert.equal(after.periodId, 'per-old');
  assert.equal(memory.snapshot().journals.find((journal) => journal.id === 'jrn-old').status, 'INACTIVE');
  assert.equal(memory.snapshot().periods.find((period) => period.id === 'per-old').status, 'CLOSED');
});

test('L21: a date outside the period is accepted here and postEntry is the one that rejects it', async () => {
  const { memory, app } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  const result = await app.changeHeader(headerInput({ periodId: 'per-2026', accountingDate: '2025-12-31' }));

  assert.equal(result.periodId, 'per-2026');
  assert.equal(result.accountingDate, '2025-12-31');
  assert.equal(stored(memory).accountingDate.value, '2025-12-31');

  await assert.rejects(
    app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' }),
    assertCode('PERIOD_DATE_OUTSIDE'),
  );
  assert.equal(stored(memory).status, 'DRAFT');
});

test('L22: a reversal draft changes its period and date and keeps the link to the original', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory,
    domainDraft('original', [
      { id: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: money('1000.00') },
      { id: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: money('1000.00') },
    ]),
  );
  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'original', idempotencyKey: 'post-original' });

  // The reversal has to stay a draft: reversePostedEntry posts it, and a posted entry cannot change.
  const original = stored(memory, 'original');
  await saveEntry(memory,
    original.createReversalDraft({
      id: 'reversal',
      periodId: 'per-2026',
      accountingDate: AccountingDate.create('2026-04-01'),
    }),
  );

  const result = await app.changeHeader(headerInput({
    entryId: 'reversal',
    journalId: 'jrn-1',
    periodId: 'per-2027',
    accountingDate: '2027-01-05',
  }));

  assert.equal(result.entryId, 'reversal');
  assert.equal(result.periodId, 'per-2027');
  assert.equal(result.accountingDate, '2027-01-05');

  const after = stored(memory, 'reversal');
  assert.equal(after.status, 'DRAFT');
  assert.equal(after.reversalOfEntryId, 'original');
  assert.equal(after.periodId, 'per-2027');
  assert.equal(after.accountingDate.value, '2027-01-05');
  assert.equal(after.lines.length, 2);
  assert.equal(stored(memory, 'original').status, 'POSTED');
});

test('L23: the same key with the same header replays without a second save', async () => {
  const { memory, app, saves } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  const input = headerInput({ idempotencyKey: 'header-1' });
  const first = await app.changeHeader(input);
  const afterFirst = saves();
  const second = await app.changeHeader(input);

  assert.deepEqual(second, first);
  assert.equal(saves(), afterFirst);
  assert.equal(headerRecords(memory).length, 1);
});

test('L24: the same key with another header is a conflict and changes nothing', async () => {
  const { memory, app, saves } = await harness();
  await app.createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  const input = headerInput({ idempotencyKey: 'header-1' });
  await app.changeHeader(input);
  const afterFirst = saves();

  await assert.rejects(
    app.changeHeader({ ...input, description: 'Otra descripción' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  const after = stored(memory);
  assert.equal(after.description, 'Venta corregida');
  assert.equal(after.journalId, 'jrn-2');
  assert.equal(after.periodId, 'per-2027');
  assert.equal(saves(), afterFirst);
  assert.equal(headerRecords(memory).length, 1);
});
