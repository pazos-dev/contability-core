import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AccountingDate,
  ApplicationError,
  Currency,
  EntryError,
  JournalEntry,
  JournalEntryLine,
  Money,
  createInMemoryAccounting,
  makePostEntry,
  makeRegisterAccount,
  makeRegisterJournal,
  makeRegisterPeriod,
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

function line(overrides = {}) {
  return JournalEntryLine.create({
    id: 'line-1',
    accountId: 'acc-cash',
    side: 'DEBIT',
    amount: money('1000.00'),
    ...overrides,
  });
}

function balancedDraft(overrides = {}) {
  return JournalEntry.createDraft({
    id: 'entry-1',
    ledgerId: 'ledger-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Venta de contado',
    ...overrides,
  })
    .addLine(line())
    .addLine(line({ id: 'line-2', accountId: 'acc-rev', side: 'CREDIT' }));
}

async function harness(options = {}) {
  const memory = createInMemoryAccounting({ chartOfAccountsByLedger: LEDGERS, ...options });
  const deps = { unitOfWork: memory.unitOfWork };
  const registerAccount = makeRegisterAccount(deps);
  const registerJournal = makeRegisterJournal(deps);
  const registerPeriod = makeRegisterPeriod(deps);
  const postEntry = makePostEntry(deps);

  await registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-cash',
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
  });
  await registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-rev',
    code: '4.1.01',
    name: 'Ventas',
    type: 'REVENUE',
    postingAllowed: true,
  });
  await registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Diario de ventas' });
  await registerPeriod({
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });

  return { memory, deps, registerAccount, registerJournal, registerPeriod, postEntry };
}

function storedEntry(memory, ledgerId = 'ledger-1', entryId = 'entry-1') {
  return memory.snapshot().entries.find((entry) => entry.ledgerId === ledgerId && entry.id === entryId);
}

test('U01: a balanced draft with an active journal, open period and postable accounts is posted', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());

  const result = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  assert.equal(result.status, 'POSTED');
  assert.equal(result.ledgerId, 'ledger-1');
  assert.equal(result.entryId, 'entry-1');
  assert.equal(result.journalId, 'jrn-1');
  assert.equal(result.periodId, 'per-2026');
  assert.equal(result.accountingDate, '2026-03-15');
  assert.deepEqual(
    result.lines.map((item) => [item.lineId, item.accountId, item.side]),
    [
      ['line-1', 'acc-cash', 'DEBIT'],
      ['line-2', 'acc-rev', 'CREDIT'],
    ],
  );
  assert.deepEqual(result.totalDebit, { minorUnits: '100000', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '100000', currency: { code: 'UYU', scale: 2 } });

  assert.equal(storedEntry(memory).status, 'POSTED');
  assert.equal(memory.snapshot().entries.length, 1);
});

test('U02: an unknown ledger leaves the draft untouched and writes nothing', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-x', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('LEDGER_NOT_FOUND'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('U02: an unknown entry is not found', async () => {
  const { memory, postEntry } = await harness();

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-x', idempotencyKey: 'key-1' }),
    assertCode('ENTRY_NOT_FOUND'),
  );

  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('U03a: a failure while recording idempotency rolls the posted entry back', async () => {
  const { memory, postEntry } = await harness({
    overrides: (scope) => ({
      idempotency: {
        ...scope.idempotency,
        record: async () => {
          throw new Error('registry unavailable');
        },
      },
    }),
  });
  await memory.entries.save(balancedDraft());

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    /registry unavailable/,
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
  assert.equal(memory.snapshot().idempotency.length, 0);
});

test('U04: the same key and the same request replays without a second effect', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());

  const first = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });
  const second = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  assert.deepEqual(second, first);
  assert.equal(memory.snapshot().entries.length, 1);
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('U05: the same key with another entry is a conflict', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());
  await memory.entries.save(balancedDraft({ id: 'entry-2' }));
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-2', idempotencyKey: 'key-1' }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.equal(storedEntry(memory, 'ledger-1', 'entry-2').status, 'DRAFT');
});

test('U08: an entry id that belongs to another ledger is not reachable', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft({ ledgerId: 'ledger-2', journalId: 'jrn-2', periodId: 'per-2' }));

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('ENTRY_NOT_FOUND'),
  );

  assert.equal(storedEntry(memory, 'ledger-2').status, 'DRAFT');
});

test('U09: posting into a closed period is rejected', async () => {
  const { memory, postEntry, deps } = await harness();
  await memory.unitOfWork.run(async (scope) => {
    const period = await scope.periods.findById('ledger-1', 'per-2026');
    await scope.periods.save(period.close());
  });
  await memory.entries.save(balancedDraft());

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('PERIOD_CLOSED'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
  assert.ok(deps !== undefined);
});

test('U10: a date outside the closed-over period is rejected', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft({ accountingDate: AccountingDate.create('2027-03-15') }));

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('PERIOD_DATE_OUTSIDE'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('U10: the first and last day of the period are inside it', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft({ id: 'entry-start', accountingDate: AccountingDate.create('2026-01-01') }));
  await memory.entries.save(balancedDraft({ id: 'entry-end', accountingDate: AccountingDate.create('2026-12-31') }));

  const start = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-start', idempotencyKey: 'key-start' });
  const end = await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-end', idempotencyKey: 'key-end' });

  assert.equal(start.status, 'POSTED');
  assert.equal(end.status, 'POSTED');
});

test('U11: a grouping account cannot receive a posting', async () => {
  const { memory, postEntry, registerAccount } = await harness();
  await registerAccount({
    ledgerId: 'ledger-1',
    accountId: 'acc-group',
    code: '1.1',
    name: 'Activo corriente',
    type: 'ASSET',
    postingAllowed: false,
  });
  await memory.entries.save(balancedDraft().removeLine('line-1').addLine(line({ accountId: 'acc-group' })));

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('ACCOUNT_NOT_POSTABLE'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('U12: an inactive account cannot receive a posting', async () => {
  const { memory, postEntry, deps } = await harness();
  const { makeSetAccountStatus } = await import('../dist/index.js');
  const setAccountStatus = makeSetAccountStatus(deps);
  await setAccountStatus({ ledgerId: 'ledger-1', accountId: 'acc-cash', status: 'INACTIVE' });
  await memory.entries.save(balancedDraft());

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('ACCOUNT_INACTIVE'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('U13: an account of another chart of accounts is not reachable', async () => {
  const { memory, postEntry, registerAccount } = await harness();
  await registerAccount({
    ledgerId: 'ledger-2',
    accountId: 'acc-foreign',
    code: '1.1.09',
    name: 'Caja del otro libro',
    type: 'ASSET',
    postingAllowed: true,
  });
  await memory.entries.save(balancedDraft().removeLine('line-1').addLine(line({ accountId: 'acc-foreign' })));

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('ACCOUNT_NOT_FOUND'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('U14: an inactive journal rejects the posting', async () => {
  const { memory, postEntry, deps } = await harness();
  const { makeSetJournalStatus } = await import('../dist/index.js');
  const setJournalStatus = makeSetJournalStatus(deps);
  await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });
  await memory.entries.save(balancedDraft());

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('JOURNAL_INACTIVE'),
  );

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('U14: a journal of another ledger is not found', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft({ journalId: 'jrn-nowhere' }));

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('JOURNAL_NOT_FOUND'),
  );
});

test('U15: an already posted entry with a new key is a state error', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-2' }),
    assertEntryCode('ENTRY_STATE'),
  );

  assert.equal(memory.snapshot().entries.length, 1);
});

test('U16: an unbalanced draft is rejected by the aggregate and stays a draft', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(
    JournalEntry.createDraft({
      id: 'entry-1',
      ledgerId: 'ledger-1',
      journalId: 'jrn-1',
      periodId: 'per-2026',
      accountingDate: AccountingDate.create('2026-03-15'),
      description: 'Desbalanceado',
    })
      .addLine(line())
      .addLine(line({ id: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: money('999.99') })),
  );

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertEntryCode('ENTRY_UNBALANCED'),
  );

  const stored = storedEntry(memory);
  assert.equal(stored.status, 'DRAFT');
  assert.equal(stored.lines.length, 2);
});

test('U17: with several invalid conditions the lowest rule wins', async () => {
  const { memory, postEntry, deps } = await harness();
  const { makeSetJournalStatus } = await import('../dist/index.js');
  const setJournalStatus = makeSetJournalStatus(deps);
  await setJournalStatus({ ledgerId: 'ledger-1', journalId: 'jrn-1', status: 'INACTIVE' });
  await memory.unitOfWork.run(async (scope) => {
    const period = await scope.periods.findById('ledger-1', 'per-2026');
    await scope.periods.save(period.close());
  });
  await memory.entries.save(
    balancedDraft().removeLine('line-1').addLine(line({ accountId: 'acc-unknown' })),
  );

  // Journal (rule 4) outranks period (rule 5) and accounts (rule 6).
  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' }),
    assertCode('JOURNAL_INACTIVE'),
  );
});

// R3-001: the movements query must read real postings, and the ACCOUNT_HAS_MOVEMENTS guard must be
// described for what it is — defence in depth, not a rule this API can reach.

test('the movements query reads real postings from the entry repository', async () => {
  const { memory, postEntry } = await harness();
  await memory.entries.save(balancedDraft());
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  const posted = await memory.unitOfWork.run((scope) => scope.postedMovements.hasPostedLines('acc-cash'));
  const untouched = await memory.unitOfWork.run((scope) => scope.postedMovements.hasPostedLines('acc-rev-2'));

  assert.equal(posted, true);
  assert.equal(untouched, false);
});

test('a posted account is rejected as a parent by the grouping rule, before the movements guard', async () => {
  const { memory, postEntry, registerAccount } = await harness();
  await memory.entries.save(balancedDraft());
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });

  // Only a postable account can hold postings, and that same account cannot be a parent, so this is the
  // code a caller always sees: ACCOUNT_HAS_MOVEMENTS stays unreachable through the public API.
  await assert.rejects(
    registerAccount({
      ledgerId: 'ledger-1',
      accountId: 'acc-child',
      code: '1.1.02',
      name: 'Hijo de caja',
      type: 'ASSET',
      parentId: 'acc-cash',
      postingAllowed: true,
    }),
    assertCode('ACCOUNT_PARENT_NOT_GROUPING'),
  );

  assert.equal(memory.snapshot().accounts.some((account) => account.id === 'acc-child'), false);
});

test('U18: posting a stored reversal draft cannot create a second reversal of the same original', async () => {
  const { memory, postEntry, deps } = await harness();
  const { makeReversePostedEntry } = await import('../dist/index.js');
  const reversePostedEntry = makeReversePostedEntry(deps);

  await memory.entries.save(balancedDraft());
  await postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'key-1' });
  await reversePostedEntry({
    ledgerId: 'ledger-1',
    originalEntryId: 'entry-1',
    reversalEntryId: 'reversal-1',
    periodId: 'per-2026',
    accountingDate: '2026-04-01',
    idempotencyKey: 'reverse-1',
  });

  // A host that builds a second reversal draft itself and posts it through postEntry must be stopped.
  const posted = memory.snapshot().entries.find((entry) => entry.id === 'entry-1');
  const secondDraft = posted.createReversalDraft({
    id: 'reversal-2',
    periodId: 'per-2026',
    accountingDate: AccountingDate.create('2026-04-02'),
  });
  await memory.entries.save(secondDraft);

  await assert.rejects(
    postEntry({ ledgerId: 'ledger-1', entryId: 'reversal-2', idempotencyKey: 'key-2' }),
    assertCode('ENTRY_ALREADY_REVERSED'),
  );

  assert.equal(memory.snapshot().entries.find((entry) => entry.id === 'reversal-2').status, 'DRAFT');
});
