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
  MoneyError,
  PeriodError,
  createInMemoryAccounting,
} from '../../dist/index.js';

import { seedLedgers } from './seed.mjs';

// Reports 008a: account balances and trial balance (docs/specs/reports.md, AB01-AB05 and TB00-TB11).
//
// Every criterion is exercised through the facade, never against an internal function, so what stays
// fixed here is the public contract: the port the host implements, the two result shapes and the
// aggregation the core performs. Each test also pins the fact that a report writes nothing, because
// that is the one effect a read has to prove by absence.

const LEDGERS = { 'ledger-1': 'chart-1' };
const uyu = Currency.create('UYU', 2);

const CASH = { accountId: 'acc-cash', code: '1.1.01', name: 'Caja', type: 'ASSET', postingAllowed: true };
const BANK = { accountId: 'acc-bank', code: '1.1.02', name: 'Banco', type: 'ASSET', postingAllowed: true };
const REVENUE = { accountId: 'acc-rev', code: '4.1.01', name: 'Ventas', type: 'REVENUE', postingAllowed: true };
const DEFAULT_CHART = [CASH, BANK, REVENUE];

function amount(text) {
  return Money.fromDecimal(text, uyu).toJSON();
}

function zero() {
  return Money.fromMinorUnits(0n, uyu).toJSON();
}

function line(lineId, accountId, side, text) {
  return { lineId, accountId, side, amount: amount(text) };
}

function assertApplicationCode(code) {
  return (error) => {
    assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function assertDomainCode(Kind, code) {
  return (error) => {
    assert.ok(error instanceof Kind, `expected ${Kind.name}, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

const assertMoneyCode = (code) => assertDomainCode(MoneyError, code);
const assertPeriodCode = (code) => assertDomainCode(PeriodError, code);

/**
 * A registered ledger with a chart, a journal and a period. The chart is a parameter so a criterion can
 * register the codes or the hierarchy it needs instead of the default three accounts.
 */
async function harness({ chart = DEFAULT_CHART, memoryOptions } = {}) {
  const memory = createInMemoryAccounting(memoryOptions);
  const app = new Accounting({ unitOfWork: memory.unitOfWork });

  await seedLedgers(app, LEDGERS);
  for (const account of chart) await app.registerAccount({ ledgerId: 'ledger-1', ...account });
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Ventas' });
  await app.registerPeriod({
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });

  return { memory, app };
}

/** Posts a balanced two-line entry through the same path a host uses. */
async function post(app, { entryId, accountingDate = '2026-03-15', lines }) {
  await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId,
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate,
    description: `Asiento ${entryId}`,
    lines,
  });
  return app.postEntry({ ledgerId: 'ledger-1', entryId, idempotencyKey: `post-${entryId}` });
}

async function postTwoEntries(app) {
  await post(app, {
    entryId: 'e1',
    accountingDate: '2026-03-15',
    lines: [line('l1', 'acc-cash', 'DEBIT', '1000.00'), line('l2', 'acc-rev', 'CREDIT', '1000.00')],
  });
  await post(app, {
    entryId: 'e2',
    accountingDate: '2026-03-20',
    lines: [line('l1', 'acc-bank', 'DEBIT', '250.00'), line('l2', 'acc-rev', 'CREDIT', '250.00')],
  });
}

async function reverseFirstEntry(app) {
  await post(app, {
    entryId: 'original',
    accountingDate: '2026-03-15',
    lines: [line('l1', 'acc-cash', 'DEBIT', '100.00'), line('l2', 'acc-rev', 'CREDIT', '100.00')],
  });
  await app.reversePostedEntry({
    ledgerId: 'ledger-1',
    originalEntryId: 'original',
    reversalEntryId: 'reversal',
    periodId: 'per-2026',
    accountingDate: '2026-04-01',
    idempotencyKey: 'reverse-original',
  });
}

/** Rows keyed by account, plus the compact form each assertion compares. */
function rowsById(result) {
  return Object.fromEntries(result.rows.map((row) => [row.accountId, row]));
}

function summary(row) {
  return [row.code, row.debit.minorUnits, row.credit.minorUnits, row.balance.minorUnits, row.side];
}

/**
 * Everything a report must not touch: the books, the chart, the journals, the periods, the entries with their
 * lines and the idempotency registry. Rule 17 says a report writes **nothing**, so the proof has to cover the
 * whole module and not only the entries. A domain object is immutable and stores in private fields, so each
 * snapshot is projected through its getters into a comparable form.
 */
function stateOf(memory) {
  const snapshot = memory.snapshot();
  return {
    ledgers: snapshot.ledgers.map((ledger) => [
      ledger.id,
      ledger.name,
      ledger.chartOfAccountsId,
      ledger.currency.code,
      ledger.currency.scale,
      ledger.status,
    ]),
    journals: snapshot.journals.map((journal) => [
      journal.ledgerId,
      journal.id,
      journal.code,
      journal.name,
      journal.status,
    ]),
    periods: snapshot.periods.map((period) => [
      period.ledgerId,
      period.id,
      period.name,
      period.startDate.value,
      period.endDate.value,
      period.status,
    ]),
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      reversalOfEntryId: entry.reversalOfEntryId ?? null,
      lines: entry.lines.map((entryLine) => [entryLine.id, entryLine.accountId, entryLine.side, entryLine.amount.minorUnits]),
    })),
    idempotency: snapshot.idempotency.map((record) => ({ ...record })),
    accounts: snapshot.accounts.map((account) => [account.id, account.code.value, account.status]),
  };
}

test('AB01: accountBalances lists every account of the chart with debit, credit, balance and side', async () => {
  const { memory, app } = await harness();
  await postTwoEntries(app);
  const before = stateOf(memory);

  const result = await app.accountBalances({ ledgerId: 'ledger-1' });

  // The result contract, exactly: no totals and no balanced field (rule 18).
  assert.deepEqual(Object.keys(result).sort(), ['currency', 'from', 'ledgerId', 'rows', 'to']);
  assert.equal('totals' in result, false);
  assert.equal('balanced' in result, false);

  assert.equal(result.ledgerId, 'ledger-1');
  assert.deepEqual(result.currency, { code: 'UYU', scale: 2 });
  assert.equal(result.from, null);
  assert.equal(result.to, null);

  // Rule 7: every account of the chart, including the one without movements is not here (both moved).
  assert.deepEqual(result.rows.map((row) => row.accountId).sort(), ['acc-bank', 'acc-cash', 'acc-rev']);

  const rows = rowsById(result);
  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '100000', '0', '100000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-bank']), ['1.1.02', '25000', '0', '25000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '0', '125000', '-125000', 'CREDIT']);

  assert.equal(rows['acc-cash'].name, 'Caja');
  assert.equal(rows['acc-cash'].type, 'ASSET');
  assert.equal(rows['acc-rev'].type, 'REVENUE');

  // Money travels as MoneyJSON in the ledger's currency, never as a domain instance.
  assert.deepEqual(rows['acc-cash'].debit, amount('1000.00'));
  assert.deepEqual(rows['acc-cash'].credit, zero());
  assert.deepEqual(rows['acc-cash'].balance, amount('1000.00'));
  assert.deepEqual(rows['acc-rev'].balance, amount('-1250.00'));

  assert.deepEqual(stateOf(memory), before);
});

test('AB02: a ledger without entries reports every account at zero with side ZERO', async () => {
  const { app } = await harness();

  const result = await app.accountBalances({ ledgerId: 'ledger-1' });

  assert.equal(result.rows.length, 3);
  for (const row of result.rows) {
    assert.deepEqual([row.debit.minorUnits, row.credit.minorUnits, row.balance.minorUnits], ['0', '0', '0']);
    assert.equal(row.side, 'ZERO');
    assert.deepEqual(row.debit, zero());
  }
  assert.deepEqual(result.rows.map((row) => row.accountId).sort(), ['acc-bank', 'acc-cash', 'acc-rev']);
});

test('AB03: a posted reversal nets its original to zero and the original keeps counting', async () => {
  const { memory, app } = await harness();
  await reverseFirstEntry(app);

  const result = await app.accountBalances({ ledgerId: 'ledger-1' });
  const rows = rowsById(result);

  // Rule 2: the original is never excluded, so the account sees both sides and nets to zero.
  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '10000', '10000', '0', 'ZERO']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '10000', '10000', '0', 'ZERO']);

  const entries = memory.snapshot().entries;
  assert.deepEqual(entries.map((entry) => [entry.id, entry.status]), [
    ['original', 'POSTED'],
    ['reversal', 'POSTED'],
  ]);
  assert.equal(entries[1].reversalOfEntryId, 'original');
});

test('AB04: rows are ordered by code as text and the same query returns the same order', async () => {
  const { app } = await harness({
    chart: [
      { accountId: 'acc-nine', code: '1.9', name: 'Nueve', type: 'ASSET', postingAllowed: true },
      { accountId: 'acc-ten', code: '1.10', name: 'Diez', type: 'ASSET', postingAllowed: true },
    ],
  });

  const first = await app.accountBalances({ ledgerId: 'ledger-1' });
  const second = await app.accountBalances({ ledgerId: 'ledger-1' });

  // Rule 8: text order keeps the separator, so "1.10" sorts before "1.9".
  assert.deepEqual(first.rows.map((row) => row.code), ['1.10', '1.9']);
  assert.deepEqual(second.rows.map((row) => row.code), ['1.10', '1.9']);
  assert.deepEqual(second, first);
});

test('AB05: accountBalances writes nothing', async () => {
  const { memory, app } = await harness();
  await postTwoEntries(app);
  const before = stateOf(memory);

  const result = await app.accountBalances({ ledgerId: 'ledger-1' });
  await app.accountBalances({ ledgerId: 'ledger-1', from: '2026-03-01', to: '2026-03-31' });

  assert.equal(result.rows.length, 3);
  assert.deepEqual(stateOf(memory), before);
  assert.equal(memory.snapshot().entries.length, 2);
  assert.equal(memory.snapshot().idempotency.length, 2);
});

test('TB00: trialBalance adds totals and balanced to the same rows accountBalances returns', async () => {
  const { app } = await harness();
  await postTwoEntries(app);

  const balances = await app.accountBalances({ ledgerId: 'ledger-1', from: '2026-01-01', to: '2026-12-31' });
  const trial = await app.trialBalance({ ledgerId: 'ledger-1', from: '2026-01-01', to: '2026-12-31' });

  assert.deepEqual(Object.keys(trial).sort(), ['balanced', 'currency', 'from', 'ledgerId', 'rows', 'to', 'totals']);
  assert.equal('totals' in balances, false);
  assert.deepEqual(trial.rows, balances.rows);
  assert.equal(trial.ledgerId, balances.ledgerId);
  assert.deepEqual(trial.currency, balances.currency);
  assert.equal(trial.from, '2026-01-01');
  assert.equal(trial.to, '2026-12-31');
  assert.deepEqual(trial.totals, { debit: amount('1250.00'), credit: amount('1250.00') });
  assert.equal(trial.balanced, true);
});

test('TB01: trialBalance reports each account and totals that agree', async () => {
  const { app } = await harness();
  await postTwoEntries(app);

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });

  assert.equal(result.ledgerId, 'ledger-1');
  assert.deepEqual(result.currency, { code: 'UYU', scale: 2 });
  assert.equal(result.from, null);
  assert.equal(result.to, null);
  assert.deepEqual(result.rows.map((row) => row.accountId).sort(), ['acc-bank', 'acc-cash', 'acc-rev']);

  const rows = rowsById(result);
  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '100000', '0', '100000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-bank']), ['1.1.02', '25000', '0', '25000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '0', '125000', '-125000', 'CREDIT']);

  assert.deepEqual(result.totals, { debit: amount('1250.00'), credit: amount('1250.00') });
  assert.equal(result.balanced, true);
});

test('TB02: a ledger without entries reports zero rows, zero totals and balanced', async () => {
  const { app } = await harness();

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });

  assert.equal(result.rows.length, 3);
  for (const row of result.rows) {
    assert.deepEqual([row.debit.minorUnits, row.credit.minorUnits, row.balance.minorUnits], ['0', '0', '0']);
    assert.equal(row.side, 'ZERO');
  }
  assert.deepEqual(result.totals, { debit: zero(), credit: zero() });
  assert.equal(result.balanced, true);
});

test('TB03: trialBalance counts only POSTED entries', async () => {
  const { memory, app } = await harness();
  await post(app, {
    entryId: 'posted',
    accountingDate: '2026-03-15',
    lines: [line('l1', 'acc-cash', 'DEBIT', '100.00'), line('l2', 'acc-rev', 'CREDIT', '100.00')],
  });
  // A draft of the same amount: it balances and has lines, and still is not an accounting fact.
  await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId: 'draft',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-16',
    description: 'Borrador',
    lines: [line('l1', 'acc-cash', 'DEBIT', '100.00'), line('l2', 'acc-rev', 'CREDIT', '100.00')],
  });

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });
  const rows = rowsById(result);

  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '10000', '0', '10000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '0', '10000', '-10000', 'CREDIT']);
  assert.deepEqual(result.totals, { debit: amount('100.00'), credit: amount('100.00') });
  assert.equal(result.balanced, true);
  assert.deepEqual(memory.snapshot().entries.map((entry) => [entry.id, entry.status]), [
    ['posted', 'POSTED'],
    ['draft', 'DRAFT'],
  ]);
});

test('TB04: a posted reversal leaves the account at zero without double counting', async () => {
  const { app } = await harness();
  await reverseFirstEntry(app);

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });
  const rows = rowsById(result);

  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '10000', '10000', '0', 'ZERO']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '10000', '10000', '0', 'ZERO']);
  // The totals are the column sums of the rows, so each side carries the original plus its mirror; the
  // balances above are what proves there is no double counting.
  assert.deepEqual(result.totals, { debit: amount('200.00'), credit: amount('200.00') });
  assert.equal(result.balanced, true);
});

test('TB05: from and to are inclusive on the accounting date and exclude what falls outside', async () => {
  const { app } = await harness({ chart: [CASH, REVENUE] });
  const scenario = [
    ['before', '2026-02-28', '10.00'],
    ['from', '2026-03-01', '20.00'],
    ['to', '2026-03-31', '30.00'],
    ['after', '2026-04-01', '40.00'],
  ];
  for (const [entryId, accountingDate, text] of scenario) {
    await post(app, {
      entryId,
      accountingDate,
      lines: [line('l1', 'acc-cash', 'DEBIT', text), line('l2', 'acc-rev', 'CREDIT', text)],
    });
  }

  const result = await app.trialBalance({ ledgerId: 'ledger-1', from: '2026-03-01', to: '2026-03-31' });
  const rows = rowsById(result);

  assert.equal(result.from, '2026-03-01');
  assert.equal(result.to, '2026-03-31');
  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '5000', '0', '5000', 'DEBIT']);
  assert.deepEqual(summary(rows['acc-rev']), ['4.1.01', '0', '5000', '-5000', 'CREDIT']);
  assert.deepEqual(result.totals, { debit: amount('50.00'), credit: amount('50.00') });
  assert.equal(result.balanced, true);
});

test('TB06: a range without movements is a valid result', async () => {
  const { memory, app } = await harness();
  const before = stateOf(memory);

  const result = await app.trialBalance({ ledgerId: 'ledger-1', from: '2030-01-01', to: '2030-12-31' });

  assert.equal(result.rows.length, 3);
  for (const row of result.rows) {
    assert.equal(row.side, 'ZERO');
    assert.deepEqual(row.balance, zero());
  }
  assert.deepEqual(result.totals, { debit: zero(), credit: zero() });
  assert.equal(result.balanced, true);
  assert.equal(result.from, '2030-01-01');
  assert.equal(result.to, '2030-12-31');
  assert.deepEqual(stateOf(memory), before);
});

test('TB07: trialBalance orders rows by code as text and the same query returns the same order', async () => {
  const { app } = await harness({
    chart: [
      { accountId: 'acc-nine', code: '1.9', name: 'Nueve', type: 'ASSET', postingAllowed: true },
      { accountId: 'acc-ten', code: '1.10', name: 'Diez', type: 'ASSET', postingAllowed: true },
    ],
  });

  const first = await app.trialBalance({ ledgerId: 'ledger-1' });
  const second = await app.trialBalance({ ledgerId: 'ledger-1' });

  assert.deepEqual(first.rows.map((row) => row.code), ['1.10', '1.9']);
  assert.deepEqual(second.rows.map((row) => row.code), ['1.10', '1.9']);
  assert.deepEqual(second, first);
});

test('TB08: an INACTIVE ledger is reported normally', async () => {
  const { memory, app } = await harness();
  await postTwoEntries(app);

  const active = await app.trialBalance({ ledgerId: 'ledger-1' });
  await app.setLedgerStatus({ ledgerId: 'ledger-1', status: 'INACTIVE' });
  const inactive = await app.trialBalance({ ledgerId: 'ledger-1' });

  assert.equal(memory.snapshot().ledgers[0].status, 'INACTIVE');
  assert.deepEqual(inactive, active);
  assert.deepEqual(inactive.totals, { debit: amount('1250.00'), credit: amount('1250.00') });
  assert.equal(inactive.balanced, true);
});

test('TB09: a line in another currency fails closed with CURRENCY_MISMATCH and reports nothing', async () => {
  // No legitimate path can produce this state: posting rejects another currency. The double lies so the
  // core has to be the one that refuses to add two currencies together (rule 3).
  const usd = Currency.create('USD', 2);
  const foreignEntry = JournalEntry.createDraft({
    id: 'foreign',
    ledgerId: 'ledger-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Moneda extranjera',
  })
    .addLine(JournalEntryLine.create({ id: 'l1', accountId: 'acc-cash', side: 'DEBIT', amount: Money.fromDecimal('10.00', usd) }))
    .addLine(JournalEntryLine.create({ id: 'l2', accountId: 'acc-rev', side: 'CREDIT', amount: Money.fromDecimal('10.00', usd) }))
    .post(1);

  const { memory, app } = await harness({
    memoryOptions: {
      overrides: () => ({
        postedEntries: {
          findPostedMovements: async () => ({ entries: [foreignEntry], nextCursor: null }),
        },
      }),
    },
  });
  const before = stateOf(memory);

  await assert.rejects(app.accountBalances({ ledgerId: 'ledger-1' }), assertMoneyCode('CURRENCY_MISMATCH'));
  await assert.rejects(app.trialBalance({ ledgerId: 'ledger-1' }), assertMoneyCode('CURRENCY_MISMATCH'));

  assert.deepEqual(stateOf(memory), before);
});

test('TB10: a group account row does not include its child', async () => {
  const GROUP = { accountId: 'acc-group', code: '1', name: 'Activo', type: 'ASSET', postingAllowed: false };
  const CHILD = {
    accountId: 'acc-child',
    code: '1.1.01',
    name: 'Caja',
    type: 'ASSET',
    postingAllowed: true,
    parentId: 'acc-group',
  };
  const { app } = await harness({ chart: [GROUP, CHILD, REVENUE] });
  await post(app, {
    entryId: 'child-movement',
    accountingDate: '2026-03-15',
    lines: [line('l1', 'acc-child', 'DEBIT', '1000.00'), line('l2', 'acc-rev', 'CREDIT', '1000.00')],
  });

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });
  const rows = rowsById(result);

  // Rule 10: the group row is listed and stays at zero; the child owns the amount.
  assert.ok(rows['acc-group']);
  assert.deepEqual(summary(rows['acc-group']), ['1', '0', '0', '0', 'ZERO']);
  assert.deepEqual(summary(rows['acc-child']), ['1.1.01', '100000', '0', '100000', 'DEBIT']);
  assert.deepEqual(result.totals, { debit: amount('1000.00'), credit: amount('1000.00') });
  assert.equal(result.balanced, true);
});

test('TB11: from after to is INVALID_APPLICATION_INPUT and an impossible date is INVALID_DATE', async () => {
  const { memory, app } = await harness();
  await postTwoEntries(app);
  const before = stateOf(memory);

  await assert.rejects(
    app.trialBalance({ ledgerId: 'ledger-1', from: '2026-04-01', to: '2026-03-01' }),
    assertApplicationCode('INVALID_APPLICATION_INPUT'),
  );
  await assert.rejects(
    app.trialBalance({ ledgerId: 'ledger-1', from: '2026-02-30' }),
    assertPeriodCode('INVALID_DATE'),
  );
  // Both ends are created before the range is compared, so an impossible `to` is a date error too.
  await assert.rejects(
    app.trialBalance({ ledgerId: 'ledger-1', to: '2026-02-30' }),
    assertPeriodCode('INVALID_DATE'),
  );
  // The date rule is lower-numbered than the ordering rule, so an impossible date wins over a bad range.
  await assert.rejects(
    app.trialBalance({ ledgerId: 'ledger-1', from: '2026-02-30', to: '2026-01-01' }),
    assertPeriodCode('INVALID_DATE'),
  );

  assert.deepEqual(stateOf(memory), before);
});

test('S7: a trial balance that does not agree reports the totals and balanced false', async () => {
  // The credit leg points at an account outside the ledger's chart. No legitimate posting path can build it
  // (posting resolves every line against the plan), so the port lies and the report has to show the gap
  // instead of hiding it: `balanced: false` with the two totals is the whole use of a trial balance.
  const outsideEntry = JournalEntry.createDraft({
    id: 'outside',
    ledgerId: 'ledger-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Cuenta fuera del plan',
  })
    .addLine(
      JournalEntryLine.create({
        id: 'l1',
        accountId: 'acc-cash',
        side: 'DEBIT',
        amount: Money.fromDecimal('100.00', uyu),
      }),
    )
    .addLine(
      JournalEntryLine.create({
        id: 'l2',
        accountId: 'acc-outside',
        side: 'CREDIT',
        amount: Money.fromDecimal('100.00', uyu),
      }),
    )
    .post(1);

  const { memory, app } = await harness({
    memoryOptions: {
      overrides: () => ({
        postedEntries: {
          findPostedMovements: async () => ({ entries: [outsideEntry], nextCursor: null }),
        },
      }),
    },
  });
  const before = stateOf(memory);

  const result = await app.trialBalance({ ledgerId: 'ledger-1' });
  const rows = rowsById(result);

  // Rule 7: the account outside the chart is never listed, so its credit is not in the rows.
  assert.deepEqual(Object.keys(rows).sort(), ['acc-bank', 'acc-cash', 'acc-rev']);
  assert.deepEqual(summary(rows['acc-cash']), ['1.1.01', '10000', '0', '10000', 'DEBIT']);
  // The totals are the column sums of the rows, so they disagree and the report says so.
  assert.deepEqual(result.totals, { debit: amount('100.00'), credit: zero() });
  assert.equal(result.balanced, false);

  assert.deepEqual(stateOf(memory), before);
});
