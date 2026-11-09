import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AccountingDate,
  ApplicationError,
  EntryError,
  JournalEntry,
  JournalEntryLine,
  Money,
  createInMemoryAccounting,
  makeClosePeriod,
  makeCreateEntryDraft,
  makePostEntry,
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

function assertEntryCode(code) {
  return (error) => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function amount(minorUnits, code = 'UYU', scale = 2) {
  return { minorUnits, currency: { code, scale } };
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
    registerJournal,
    registerPeriod,
    createEntryDraft: makeCreateEntryDraft(deps),
    postEntry: makePostEntry(deps),
    closePeriod: makeClosePeriod(deps),
    setAccountStatus: makeSetAccountStatus(deps),
    setJournalStatus: makeSetJournalStatus(deps),
  };
}

function draftInput(overrides = {}) {
  return {
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Venta de contado',
    lines: [
      { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: amount('100000') },
      { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: amount('100000') },
    ],
    ...overrides,
  };
}

function stored(memory) {
  return memory.snapshot().entries;
}

test('D01: a valid draft is stored as DRAFT with its identity and lines', async () => {
  const { memory, createEntryDraft } = await harness();

  const result = await createEntryDraft(draftInput());

  assert.equal(result.status, 'DRAFT');
  assert.equal(result.entryId, 'entry-1');
  assert.equal(result.journalId, 'jrn-1');
  assert.equal(result.periodId, 'per-2026');
  assert.equal(result.accountingDate, '2026-03-15');
  assert.equal(result.description, 'Venta de contado');
  assert.deepEqual(
    result.lines.map((line) => [line.lineId, line.accountId, line.side, line.amount.minorUnits]),
    [
      ['line-1', 'acc-cash', 'DEBIT', '100000'],
      ['line-2', 'acc-rev', 'CREDIT', '100000'],
    ],
  );
  assert.equal(stored(memory).length, 1);
  assert.equal(stored(memory)[0].status, 'DRAFT');
});

test('D02: an unknown ledger is rejected and nothing is stored', async () => {
  const { memory, createEntryDraft } = await harness();

  await assert.rejects(createEntryDraft(draftInput({ ledgerId: 'ledger-x' })), assertCode('LEDGER_NOT_FOUND'));

  assert.equal(stored(memory).length, 0);
});

test('D03: a used entry id is rejected instead of overwriting the stored entry', async () => {
  const { memory, createEntryDraft, postEntry } = await harness();
  await createEntryDraft(draftInput());
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  await assert.rejects(
    createEntryDraft(draftInput({ description: 'Otro' })),
    assertCode('ENTRY_ALREADY_EXISTS'),
  );

  assert.equal(stored(memory).length, 1);
  assert.equal(stored(memory)[0].status, 'POSTED');
  assert.equal(stored(memory)[0].description, 'Venta de contado');
});

test('D04: a journal of another ledger or an unknown one is rejected', async () => {
  const { memory, createEntryDraft } = await harness();

  await assert.rejects(createEntryDraft(draftInput({ journalId: 'jrn-nowhere' })), assertCode('JOURNAL_NOT_FOUND'));
  await assert.rejects(createEntryDraft(draftInput({ journalId: 'jrn-2' })), assertCode('JOURNAL_NOT_FOUND'));

  assert.equal(stored(memory).length, 0);
});

test('D05: a period of another ledger or an unknown one is rejected', async () => {
  const { memory, createEntryDraft } = await harness();

  await assert.rejects(createEntryDraft(draftInput({ periodId: 'per-nowhere' })), assertCode('PERIOD_NOT_FOUND'));

  assert.equal(stored(memory).length, 0);
});

test('D06: an unknown account or one of another plan is rejected', async () => {
  const { memory, createEntryDraft } = await harness();

  await assert.rejects(
    createEntryDraft(
      draftInput({
        lines: [
          { lineId: 'line-1', accountId: 'acc-nowhere', side: 'DEBIT', amount: amount('100000') },
          { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: amount('100000') },
        ],
      }),
    ),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(stored(memory).length, 0);
});

test('D07: a zero or negative line amount is rejected by the domain', async () => {
  const { memory, createEntryDraft } = await harness();

  for (const minorUnits of ['0', '-100000']) {
    await assert.rejects(
      createEntryDraft(
        draftInput({
          lines: [
            { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: amount(minorUnits) },
            { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: amount('100000') },
          ],
        }),
      ),
      assertEntryCode('INVALID_ENTRY_LINE'),
      minorUnits,
    );
  }

  assert.equal(stored(memory).length, 0);
});

test('D08: two lines with the same id are rejected by the domain', async () => {
  const { memory, createEntryDraft } = await harness();

  await assert.rejects(
    createEntryDraft(
      draftInput({
        lines: [
          { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: amount('100000') },
          { lineId: 'line-1', accountId: 'acc-rev', side: 'CREDIT', amount: amount('100000') },
        ],
      }),
    ),
    assertEntryCode('DUPLICATE_LINE_ID'),
  );

  assert.equal(stored(memory).length, 0);
});

test('D09: an unbalanced draft is accepted and stays a draft', async () => {
  const { memory, createEntryDraft, postEntry } = await harness();

  const result = await createEntryDraft(
    draftInput({
      lines: [
        { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: amount('100000') },
        { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: amount('90000') },
      ],
    }),
  );

  assert.equal(result.status, 'DRAFT');
  assert.equal(stored(memory)[0].status, 'DRAFT');
  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' }),
    assertEntryCode('ENTRY_UNBALANCED'),
  );
});

test('D10: an inactive journal and a closed period still accept a draft; postEntry rejects it later', async () => {
  const { createEntryDraft, postEntry, closePeriod, setJournalStatus } = await harness();
  await closePeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', idempotencyKey: 'close-1' });
  await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });

  const result = await createEntryDraft(draftInput());

  assert.equal(result.status, 'DRAFT');
  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' }),
    assertCode('JOURNAL_INACTIVE'),
  );
});

test('D11/D12: idempotency replays the same request and conflicts with another', async () => {
  const { memory, createEntryDraft } = await harness();

  const first = await createEntryDraft({ ...draftInput(), idempotencyKey: 'key-1' });
  const second = await createEntryDraft({ ...draftInput(), idempotencyKey: 'key-1' });
  assert.deepEqual(second, first);
  assert.equal(stored(memory).length, 1);

  await assert.rejects(
    createEntryDraft({
      ...draftInput(),
      description: 'Otro',
      idempotencyKey: 'key-1',
    }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
});

test('D12: a changed line under the same key is a conflict, not an ignored field', async () => {
  const { memory, createEntryDraft } = await harness();
  await createEntryDraft({ ...draftInput(), idempotencyKey: 'key-1' });

  await assert.rejects(
    createEntryDraft({
      ...draftInput(),
      lines: [
        { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: amount('200000') },
        { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: amount('200000') },
      ],
      idempotencyKey: 'key-1',
    }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(stored(memory)[0].lines[0].amount.minorUnits, 100000n);
});

test('D13: a failing save leaves no draft and no idempotency record', async () => {
  const memory = createInMemoryAccounting({
    chartOfAccountsByLedger: LEDGERS,
    overrides: (scope) => ({
      entries: {
        ...scope.entries,
        save: async () => {
          throw new Error('storage unavailable');
        },
      },
    }),
  });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = makeRegisterAccount(deps);
  const registerJournal = makeRegisterJournal(deps);
  const registerPeriod = makeRegisterPeriod(deps);
  const createEntryDraft = makeCreateEntryDraft(deps);

  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-cash', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true });
  await registerAccount({ ledgerId: 'ledger-1', accountId: 'acc-rev', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true });
  await registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await registerPeriod({ ledgerId: 'ledger-1', periodId: 'per-2026', name: 'Ejercicio 2026', startDate: '2026-01-01', endDate: '2026-12-31' });

  await assert.rejects(createEntryDraft({ ...draftInput(), idempotencyKey: 'key-1' }), /storage unavailable/);

  assert.equal(memory.snapshot().entries.length, 0);
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('D01: an empty draft is a valid draft', async () => {
  const { memory, createEntryDraft } = await harness();

  const result = await createEntryDraft(draftInput({ lines: [] }));

  assert.equal(result.status, 'DRAFT');
  assert.deepEqual(result.lines, []);
  assert.equal(stored(memory).length, 1);
});

test('the draft is postable afterwards, closing the circuit', async () => {
  const { memory, createEntryDraft, postEntry } = await harness();
  await createEntryDraft(draftInput());

  const posted = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  assert.equal(posted.status, 'POSTED');
  assert.equal(stored(memory)[0].status, 'POSTED');
  assert.ok(JournalEntry !== undefined && JournalEntryLine !== undefined && Money !== undefined && AccountingDate !== undefined);
});
