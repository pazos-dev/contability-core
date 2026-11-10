import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApplicationError,
  EntryError,
  createInMemoryAccounting,
  makeAddEntryLine,
  makeCreateEntryDraft,
  makePostEntry,
  makeRegisterAccount,
  makeRegisterJournal,
  makeRegisterPeriod,
  makeRemoveEntryLine,
} from '../dist/index.js';

const LEDGERS = { 'ledger-1': 'chart-1', 'ledger-2': 'chart-2' };

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

function amount(minorUnits) {
  return { minorUnits, currency: { code: 'UYU', scale: 2 } };
}

function debit(lineId, minorUnits = '100000') {
  return { lineId, accountId: 'acc-cash', side: 'DEBIT', amount: amount(minorUnits) };
}

function credit(lineId, minorUnits = '100000') {
  return { lineId, accountId: 'acc-rev', side: 'CREDIT', amount: amount(minorUnits) };
}

async function harness() {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = makeRegisterAccount(deps);
  const registerJournal = makeRegisterJournal(deps);
  const registerPeriod = makeRegisterPeriod(deps);

  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-cash', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-rev', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
  await registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });

  return {
    memory,
    deps,
    createEntryDraft: makeCreateEntryDraft(deps),
    addEntryLine: makeAddEntryLine(deps),
    removeEntryLine: makeRemoveEntryLine(deps),
    postEntry: makePostEntry(deps),
  };
}

function draftInput(lines) {
  return {
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines,
  };
}

function stored(memory) {
  return memory.snapshot().entries.find((entry) => entry.id === 'entry-1');
}

test('L01: adding a line returns the draft with both lines and stores it', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  const result = await addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2') });

  assert.equal(result.status, 'DRAFT');
  assert.deepEqual(
    result.lines.map((line) => [line.lineId, line.side]),
    [
      ['line-1', 'DEBIT'],
      ['line-2', 'CREDIT'],
    ],
  );
  assert.equal(stored(memory).lines.length, 2);
});

test('L02: adding the balancing line turns an incomplete draft into a postable one', async () => {
  const { memory, createEntryDraft, addEntryLine, postEntry } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  await addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2') });
  const posted = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  assert.equal(posted.status, 'POSTED');
  assert.equal(stored(memory).status, 'POSTED');
});

test('L03: a posted entry rejects a new line', async () => {
  const { memory, createEntryDraft, addEntryLine, postEntry } = await harness();
  await createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  await assert.rejects(
    addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: debit('line-3', '1') }),
    assertEntryCode('ENTRY_STATE'),
  );

  const after = stored(memory);
  assert.equal(after.status, 'POSTED');
  assert.equal(after.lines.length, 2);
});

test('L04: a repeated line id is rejected and nothing changes', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  await assert.rejects(
    addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-1') }),
    assertEntryCode('DUPLICATE_LINE_ID'),
  );

  assert.equal(stored(memory).lines.length, 1);
});

test('L05: a zero or negative amount is rejected by the domain', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  for (const minorUnits of ['0', '-100000']) {
    await assert.rejects(
      addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2', minorUnits) }),
      assertEntryCode('INVALID_ENTRY_LINE'),
      minorUnits,
    );
  }

  assert.equal(stored(memory).lines.length, 1);
});

test('L06: a line with an unknown account or one of another plan is rejected', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  await assert.rejects(
    addEntryLine({
      ledgerId: 'ledger-1',
      entryId: 'entry-1',
      line: { lineId: 'line-2', accountId: 'acc-nowhere', side: 'CREDIT', amount: amount('100000') },
    }),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(stored(memory).lines.length, 1);
});

test('L07: removing a line returns the draft with the rest in order', async () => {
  const { memory, createEntryDraft, removeEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1'), credit('line-2'), debit('line-3', '1')]));

  const result = await removeEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', lineId: 'line-1' });

  assert.deepEqual(
    result.lines.map((line) => line.lineId),
    ['line-2', 'line-3'],
  );
  assert.equal(stored(memory).lines.length, 2);
});

test('L08: removing an unknown line is rejected and nothing changes', async () => {
  const { memory, createEntryDraft, removeEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));

  await assert.rejects(
    removeEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', lineId: 'line-9' }),
    assertEntryCode('ENTRY_LINE_NOT_FOUND'),
  );

  assert.equal(stored(memory).lines.length, 2);
});

test('L09: a posted entry rejects a removal', async () => {
  const { memory, createEntryDraft, removeEntryLine, postEntry } = await harness();
  await createEntryDraft(draftInput([debit('line-1'), credit('line-2')]));
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  await assert.rejects(
    removeEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', lineId: 'line-1' }),
    assertEntryCode('ENTRY_STATE'),
  );

  assert.equal(stored(memory).lines.length, 2);
});

test('L10: an entry of another ledger or an unknown one is not reachable', async () => {
  const { createEntryDraft, addEntryLine, removeEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  await assert.rejects(
    addEntryLine({ ledgerId: 'ledger-2', entryId: 'entry-1', line: credit('line-2') }),
    assertCode('ENTRY_NOT_FOUND'),
  );
  await assert.rejects(
    removeEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-9', lineId: 'line-1' }),
    assertCode('ENTRY_NOT_FOUND'),
  );
});

test('L11: the same key and the same edit replay without a second line', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));

  const input = { ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2'), idempotencyKey: 'key-1' };
  const first = await addEntryLine(input);
  const second = await addEntryLine(input);

  assert.deepEqual(second, first);
  assert.equal(stored(memory).lines.length, 2);
});

test('L12: the same key with another line is a conflict', async () => {
  const { memory, createEntryDraft, addEntryLine } = await harness();
  await createEntryDraft(draftInput([debit('line-1')]));
  const input = { ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2'), idempotencyKey: 'key-1' };
  await addEntryLine(input);

  await assert.rejects(
    addEntryLine({ ...input, line: credit('line-3', '50000') }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(stored(memory).lines.length, 2);
});

test('L13: a failing save leaves the stored draft untouched', async () => {
  const memory = createInMemoryAccounting({
    chartOfAccountsByLedger: LEDGERS,
    overrides: (scope) => ({
      entries: {
        ...scope.entries,
        save: async (entry) => {
          // Only the edit has to fail; seeding writes a one-line draft first.
          if (entry.lines.length > 1) throw new Error('storage unavailable');
          await scope.entries.save(entry);
        },
      },
    }),
  });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = makeRegisterAccount(deps);
  const registerJournal = makeRegisterJournal(deps);
  const registerPeriod = makeRegisterPeriod(deps);
  const createEntryDraft = makeCreateEntryDraft(deps);
  const addEntryLine = makeAddEntryLine(deps);

  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-cash', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-rev', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
  await registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
  await createEntryDraft(draftInput([debit('line-1')]));

  await assert.rejects(
    addEntryLine({ ledgerId: 'ledger-1', entryId: 'entry-1', line: credit('line-2'), idempotencyKey: 'key-1' }),
    /storage unavailable/,
  );

  assert.equal(stored(memory).lines.length, 1);
  assert.equal(memory.snapshot().idempotency.length, 0);
});
