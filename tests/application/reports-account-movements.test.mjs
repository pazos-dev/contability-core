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
  createInMemoryAccounting,
} from '../../dist/index.js';

import { seedLedgers } from './seed.mjs';

// Reports 008b: the account ledger (docs/specs/reports.md, GL01-GL08).
//
// Every criterion is exercised through the facade, never against an internal function, so what stays fixed
// here is the public contract: the page of a single account with its opening balance, the running balance per
// row and the cursor that chains two pages without skipping or repeating a line. Each test also proves that a
// report writes nothing, because that is the one effect a read has to prove by absence.

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

function assertMoneyCode(code) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

/**
 * A registered ledger with a chart, a journal and a period. The chart and the memory options are parameters
 * so a criterion can register the accounts it needs or replace the posted-entries port.
 */
async function harness({ chart = DEFAULT_CHART, ledgers = LEDGERS, memoryOptions } = {}) {
  const memory = createInMemoryAccounting(memoryOptions);
  const app = new Accounting({ unitOfWork: memory.unitOfWork });
  const charts = Array.isArray(chart) ? { 'ledger-1': chart } : chart;

  await seedLedgers(app, ledgers);
  for (const [ledgerId, accounts] of Object.entries(charts)) {
    for (const account of accounts) await app.registerAccount({ ledgerId, ...account });
  }
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

/** Posts a balanced entry through the same path a host uses. */
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

/**
 * One account with six rows in five entries: `e3` carries two cash lines, so a page boundary can fall
 * between two lines of the same entry (GL03 and GL04).
 */
async function pagingScenario(app) {
  await post(app, {
    entryId: 'e1',
    accountingDate: '2026-03-01',
    lines: [line('l1', 'acc-cash', 'DEBIT', '10.00'), line('l2', 'acc-rev', 'CREDIT', '10.00')],
  });
  await post(app, {
    entryId: 'e2',
    accountingDate: '2026-03-02',
    lines: [line('l1', 'acc-cash', 'DEBIT', '20.00'), line('l2', 'acc-rev', 'CREDIT', '20.00')],
  });
  await post(app, {
    entryId: 'e3',
    accountingDate: '2026-03-03',
    lines: [
      line('l1', 'acc-cash', 'DEBIT', '30.00'),
      line('l3', 'acc-cash', 'CREDIT', '5.00'),
      line('l2', 'acc-rev', 'CREDIT', '25.00'),
    ],
  });
  await post(app, {
    entryId: 'e4',
    accountingDate: '2026-03-04',
    lines: [line('l1', 'acc-cash', 'DEBIT', '40.00'), line('l2', 'acc-rev', 'CREDIT', '40.00')],
  });
  await post(app, {
    entryId: 'e5',
    accountingDate: '2026-03-05',
    lines: [line('l1', 'acc-cash', 'DEBIT', '50.00'), line('l2', 'acc-rev', 'CREDIT', '50.00')],
  });
}

/** Walks the cursor chain until the report says there is no next page. */
async function walkPages(app, input) {
  const pages = [];
  let cursor;
  for (;;) {
    const page = await app.accountMovements({ ...input, ...(cursor === undefined ? {} : { cursor }) });
    pages.push(page);
    cursor = page.nextCursor;
    if (cursor === null) return pages;
    assert.ok(pages.length < 20, 'the cursor chain did not terminate');
  }
}

/** The row stream of every page in order, plus the running balance copied out for compact assertions. */
function collectRows(pages) {
  return pages.flatMap((page) => page.rows.map((row) => row));
}

function keyOf(row) {
  return [row.accountingDate, row.entryId, row.lineId].join('|');
}

function summary(row) {
  return [row.accountingDate, row.entryId, row.lineId, row.side, row.amount.minorUnits];
}

/**
 * Everything a report must not touch: the entries with their lines, the idempotency registry and the
 * accounts. A domain object is immutable, so a plain projection is the comparable form.
 */
function stateOf(memory) {
  const snapshot = memory.snapshot();
  return {
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      reversalOfEntryId: entry.reversalOfEntryId ?? null,
      lines: entry.lines.map((entryLine) => [
        entryLine.id,
        entryLine.accountId,
        entryLine.side,
        entryLine.amount.minorUnits,
      ]),
    })),
    idempotency: snapshot.idempotency.map((record) => ({ ...record })),
    accounts: snapshot.accounts.map((account) => [account.id, account.code.value, account.status]),
  };
}

test('GL01: rows are chronological with a running balance per row and the closing balance of the last row', async () => {
  // The port is allowed to return a page in any order (rule 16), so this harness reverses every page it
  // hands back: the order of the result has to come from the core, not from the storage.
  const { memory, app } = await harness({
    memoryOptions: {
      overrides: (defaults) => ({
        postedEntries: {
          findPostedMovements: async (ledgerId, criteria, page) => {
            const result = await defaults.postedEntries.findPostedMovements(ledgerId, criteria, page);
            return { entries: [...result.entries].reverse(), nextCursor: result.nextCursor };
          },
        },
      }),
    },
  });

  await post(app, {
    entryId: 'e1',
    accountingDate: '2026-03-01',
    lines: [line('l1', 'acc-cash', 'DEBIT', '10.00'), line('l2', 'acc-rev', 'CREDIT', '10.00')],
  });
  // Two entries on the same date whose id order is the reverse of their insertion order.
  await post(app, {
    entryId: 'e-b',
    accountingDate: '2026-03-02',
    lines: [line('l1', 'acc-cash', 'DEBIT', '20.00'), line('l2', 'acc-rev', 'CREDIT', '20.00')],
  });
  await post(app, {
    entryId: 'e-a',
    accountingDate: '2026-03-02',
    lines: [line('l1', 'acc-cash', 'DEBIT', '5.00'), line('l2', 'acc-rev', 'CREDIT', '5.00')],
  });
  // Two cash lines in one entry, written in the reverse order of their ids.
  await post(app, {
    entryId: 'e3',
    accountingDate: '2026-03-03',
    lines: [
      line('l9', 'acc-cash', 'DEBIT', '30.00'),
      line('l1', 'acc-cash', 'CREDIT', '5.00'),
      line('l2', 'acc-rev', 'CREDIT', '25.00'),
    ],
  });
  const before = stateOf(memory);

  const result = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });

  // The result contract, exactly: the window reports no `from`/`to` of its own — the range travels in the
  // input, and `openingBalance` is what makes the first row understandable without it.
  assert.deepEqual(Object.keys(result).sort(), [
    'accountId',
    'closingBalance',
    'currency',
    'ledgerId',
    'nextCursor',
    'openingBalance',
    'rows',
  ]);
  assert.equal(result.ledgerId, 'ledger-1');
  assert.equal(result.accountId, 'acc-cash');
  assert.deepEqual(result.currency, { code: 'UYU', scale: 2 });
  assert.deepEqual(result.openingBalance, zero());
  assert.equal(result.nextCursor, null);

  // Rule 8: accountingDate, then entryId, then lineId. Both ties are exercised above.
  assert.deepEqual(result.rows.map(summary), [
    ['2026-03-01', 'e1', 'l1', 'DEBIT', '1000'],
    ['2026-03-02', 'e-a', 'l1', 'DEBIT', '500'],
    ['2026-03-02', 'e-b', 'l1', 'DEBIT', '2000'],
    ['2026-03-03', 'e3', 'l1', 'CREDIT', '500'],
    ['2026-03-03', 'e3', 'l9', 'DEBIT', '3000'],
  ]);

  // Rule 13: the running balance is signed, debit minus credit, after each row.
  assert.deepEqual(
    result.rows.map((row) => row.runningBalance.minorUnits),
    ['1000', '1500', '3500', '3000', '6000'],
  );
  assert.deepEqual(result.rows[3].runningBalance, amount('30.00'));
  assert.deepEqual(result.rows[3].amount, amount('5.00'));
  assert.deepEqual(result.closingBalance, amount('60.00'));

  // A row carries the entry data, the line data and money as MoneyJSON, never a domain instance.
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [
    'accountingDate',
    'amount',
    'description',
    'entryId',
    'journalId',
    'lineId',
    'runningBalance',
    'side',
  ]);
  assert.equal(result.rows[0].entryId, 'e1');
  assert.equal(result.rows[0].journalId, 'jrn-1');
  assert.equal(result.rows[0].description, 'Asiento e1');
  assert.deepEqual(result.rows[0].amount, amount('10.00'));

  assert.deepEqual(stateOf(memory), before);
});

test('GL02: openingBalance is the net before from and the first row continues from it', async () => {
  const { app } = await harness({ chart: [CASH, REVENUE] });
  const scenario = [
    ['before', '2026-02-28', '100.00'],
    ['at-from', '2026-03-01', '20.00'],
    ['middle', '2026-03-15', '30.00'],
    ['at-to', '2026-03-31', '40.00'],
    ['after', '2026-04-01', '50.00'],
  ];
  for (const [entryId, accountingDate, text] of scenario) {
    await post(app, {
      entryId,
      accountingDate,
      lines: [line('l1', 'acc-cash', 'DEBIT', text), line('l2', 'acc-rev', 'CREDIT', text)],
    });
  }

  const result = await app.accountMovements({
    ledgerId: 'ledger-1',
    accountId: 'acc-cash',
    from: '2026-03-01',
    to: '2026-03-31',
  });

  assert.deepEqual(result.openingBalance, amount('100.00'));

  // Rules 4 and 5: `from` and `to` are inclusive on the accounting date; what falls outside is out.
  assert.deepEqual(result.rows.map((row) => [row.accountingDate, row.entryId]), [
    ['2026-03-01', 'at-from'],
    ['2026-03-15', 'middle'],
    ['2026-03-31', 'at-to'],
  ]);
  // The first running balance starts from the opening balance, not from zero.
  assert.deepEqual(
    result.rows.map((row) => row.runningBalance.minorUnits),
    ['12000', '15000', '19000'],
  );
  assert.deepEqual(result.closingBalance, amount('190.00'));
  assert.equal(result.nextCursor, null);

  // Without `from` the opening balance is zero, which is not the same as an empty range.
  const whole = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });
  assert.deepEqual(whole.openingBalance, zero());
  assert.deepEqual(whole.closingBalance, amount('240.00'));
  assert.equal(whole.rows.length, 5);
});

test('GL03: a page returns limit rows with a cursor and the closing balance of its last row', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await pagingScenario(app);
  const before = stateOf(memory);

  const first = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 3 });

  assert.equal(first.rows.length, 3);
  assert.equal(typeof first.nextCursor, 'string');
  assert.ok(first.nextCursor.length > 0);
  // Rule 13: closing is after the last returned row, not the end of the range.
  assert.deepEqual(first.closingBalance, first.rows[2].runningBalance);
  assert.deepEqual(first.closingBalance, amount('60.00'));

  // The same account walked across chained cursors: every row exactly once and the running balance continuous
  // across the page boundary, which falls between two lines of the same entry (`e3`).
  const pages = await walkPages(app, { ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 3 });
  const rows = collectRows(pages);

  assert.deepEqual(rows.map(keyOf), [
    '2026-03-01|e1|l1',
    '2026-03-02|e2|l1',
    '2026-03-03|e3|l1',
    '2026-03-03|e3|l3',
    '2026-03-04|e4|l1',
    '2026-03-05|e5|l1',
  ]);
  assert.equal(new Set(rows.map(keyOf)).size, rows.length, 'a line is repeated across pages');
  assert.deepEqual(
    rows.map((row) => row.runningBalance.minorUnits),
    ['1000', '3000', '6000', '5500', '9500', '14500'],
  );

  // The boundary splits entry e3: the page ends with its debit and the next one starts with its credit.
  assert.equal(pages.length, 2);
  assert.equal(pages[0].rows.at(-1).entryId, 'e3');
  assert.equal(pages[1].rows[0].entryId, 'e3');
  assert.deepEqual(pages[1].rows[0].runningBalance, amount('55.00'));
  // Continuity in arithmetic terms: next running = previous running + signed amount of the new row.
  assert.equal(
    BigInt(pages[0].closingBalance.minorUnits) - 500n,
    BigInt(pages[1].rows[0].runningBalance.minorUnits),
  );
  assert.deepEqual(pages[1].closingBalance, amount('145.00'));
  assert.deepEqual(stateOf(memory), before);
});

test('GL04: the last page reports no next cursor and the closing balance at the end of the range', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await pagingScenario(app);
  const before = stateOf(memory);

  const pages = await walkPages(app, { ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 3 });
  const first = pages[0];
  const last = pages.at(-1);

  assert.equal(last.nextCursor, null);
  assert.equal(pages.length > 1, true);
  // Every page before the last announces that rows remain.
  for (const page of pages.slice(0, -1)) assert.equal(typeof page.nextCursor, 'string');

  // Rule 13: on the last page the closing balance is the balance at the end of the range, and every page's
  // closing balance is the running balance of its own last row.
  for (const page of pages) {
    assert.deepEqual(page.closingBalance, page.rows.at(-1).runningBalance);
  }
  assert.deepEqual(last.closingBalance, amount('145.00'));
  assert.equal(last.rows.at(-1).entryId, 'e5');
  assert.deepEqual(last.openingBalance, zero());

  // The whole range walked by cursor equals the whole range read in one page.
  const single = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 1000 });
  assert.deepEqual(collectRows(pages), single.rows);
  assert.deepEqual(single.closingBalance, last.closingBalance);
  assert.equal(single.nextCursor, null);
  assert.deepEqual(stateOf(memory), before);
});

test('GL05: an unknown account and an account of another chart are both ACCOUNT_NOT_FOUND', async () => {
  const { memory, app } = await harness({
    chart: { 'ledger-1': [CASH, REVENUE], 'ledger-2': [BANK] },
    ledgers: { 'ledger-1': 'chart-1', 'ledger-2': 'chart-2' },
  });
  await post(app, {
    entryId: 'e1',
    accountingDate: '2026-03-01',
    lines: [line('l1', 'acc-cash', 'DEBIT', '10.00'), line('l2', 'acc-rev', 'CREDIT', '10.00')],
  });
  const before = stateOf(memory);

  // Rule 11: an account of another chart is reported as unavailable, exactly like a missing one.
  await assert.rejects(
    app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-bank' }),
    assertApplicationCode('ACCOUNT_NOT_FOUND'),
  );
  await assert.rejects(
    app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-unknown' }),
    assertApplicationCode('ACCOUNT_NOT_FOUND'),
  );
  // The account exists, in another chart: still not this ledger's.
  assert.deepEqual(
    memory.snapshot().accounts.map((account) => account.id).sort(),
    ['acc-bank', 'acc-cash', 'acc-rev'],
  );
  assert.deepEqual(stateOf(memory), before);
});

test('GL06: a posted reversal is another entry whose lines appear and take the running balance back to zero', async () => {
  const { app } = await harness();
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

  const cash = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });
  const revenue = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-rev' });

  // Rule 2: the original keeps counting and the reversal is one more entry, so the four lines of the pair
  // are all visible: two on cash, two on revenue, with the two accounting dates.
  assert.deepEqual(cash.rows.map(summary), [
    ['2026-03-15', 'original', 'l1', 'DEBIT', '10000'],
    ['2026-04-01', 'reversal', 'l1', 'CREDIT', '10000'],
  ]);
  assert.deepEqual(revenue.rows.map(summary), [
    ['2026-03-15', 'original', 'l2', 'CREDIT', '10000'],
    ['2026-04-01', 'reversal', 'l2', 'DEBIT', '10000'],
  ]);
  assert.equal(cash.rows.length + revenue.rows.length, 4);
  // The original row carries no reversal link; the reversal row does.
  assert.equal('reversalOfEntryId' in cash.rows[0], false);
  assert.equal(cash.rows[1].reversalOfEntryId, 'original');
  assert.equal(revenue.rows[1].reversalOfEntryId, 'original');

  // The running balance nets to zero and each step is the signed movement of its own row.
  assert.deepEqual(
    cash.rows.map((row) => row.runningBalance.minorUnits),
    ['10000', '0'],
  );
  assert.deepEqual(
    revenue.rows.map((row) => row.runningBalance.minorUnits),
    ['-10000', '0'],
  );
  assert.deepEqual(cash.closingBalance, zero());
  assert.deepEqual(revenue.closingBalance, zero());
});

test('GL07: two identical calls return the same result, even paged, and write nothing', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await pagingScenario(app);
  const before = stateOf(memory);

  const input = { ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 2 };
  const first = await app.accountMovements(input);
  const second = await app.accountMovements(input);
  assert.deepEqual(second, first);

  // A cursor is as repeatable as the first page: same cursor, same answer, no second effect.
  const cursor = first.nextCursor;
  const pageA = await app.accountMovements({ ...input, cursor });
  const pageB = await app.accountMovements({ ...input, cursor });
  assert.deepEqual(pageB, pageA);

  // Rule 17: the report carries no idempotency key and no write happened.
  assert.equal('idempotencyKey' in second, false);
  assert.equal(memory.snapshot().idempotency.length, 5, 'only the five postings recorded a key');
  assert.deepEqual(stateOf(memory), before);
});

test('GL08: limit defaults to 100, accepts 1..1000 and rejects anything else', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  for (let index = 0; index < 101; index += 1) {
    await post(app, {
      entryId: `e${String(index).padStart(3, '0')}`,
      accountingDate: '2026-03-15',
      lines: [line('l1', 'acc-cash', 'DEBIT', '1.00'), line('l2', 'acc-rev', 'CREDIT', '1.00')],
    });
  }
  const before = stateOf(memory);

  // Absent means 100, which is a page, not "everything".
  const byDefault = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });
  assert.equal(byDefault.rows.length, 100);
  assert.equal(typeof byDefault.nextCursor, 'string');
  assert.deepEqual(byDefault.closingBalance, amount('100.00'));

  // The bounds themselves are valid.
  const one = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 1 });
  assert.equal(one.rows.length, 1);
  const max = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', limit: 1000 });
  assert.equal(max.rows.length, 101);
  assert.equal(max.nextCursor, null);

  // Rule 14: outside the range is INVALID_APPLICATION_INPUT.
  for (const limit of [0, 1001, -1]) {
    await assert.rejects(
      app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', limit }),
      assertApplicationCode('INVALID_APPLICATION_INPUT'),
    );
  }
  assert.deepEqual(stateOf(memory), before);
});

// Rules 1, 3 and 9 are invariants of every report, not GL criteria of their own; the account ledger still has
// to prove them.

test('report rule 1: a draft never appears in the account ledger', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await post(app, {
    entryId: 'posted',
    accountingDate: '2026-03-01',
    lines: [line('l1', 'acc-cash', 'DEBIT', '10.00'), line('l2', 'acc-rev', 'CREDIT', '10.00')],
  });
  await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId: 'draft',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-02',
    description: 'Borrador',
    lines: [line('l1', 'acc-cash', 'DEBIT', '999.00'), line('l2', 'acc-rev', 'CREDIT', '999.00')],
  });
  const before = stateOf(memory);

  const result = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });

  assert.deepEqual(result.rows.map((row) => row.entryId), ['posted']);
  assert.deepEqual(result.closingBalance, amount('10.00'));
  assert.deepEqual(stateOf(memory), before);
});

test('report rule 3: a line in another currency fails closed with CURRENCY_MISMATCH', async () => {
  // No legitimate path can produce this state: posting rejects another currency, so the double lies and the
  // core has to be the one that refuses to add two currencies together.
  const usd = Currency.create('USD', 2);
  const foreignEntry = JournalEntry.createDraft({
    id: 'foreign',
    ledgerId: 'ledger-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Moneda extranjera',
  })
    .addLine(
      JournalEntryLine.create({ id: 'l1', accountId: 'acc-cash', side: 'DEBIT', amount: Money.fromDecimal('10.00', usd) }),
    )
    .addLine(
      JournalEntryLine.create({ id: 'l2', accountId: 'acc-rev', side: 'CREDIT', amount: Money.fromDecimal('10.00', usd) }),
    )
    .post();

  const { memory, app } = await harness({
    chart: [CASH, REVENUE],
    memoryOptions: {
      overrides: () => ({
        postedEntries: { findPostedMovements: async () => ({ entries: [foreignEntry], nextCursor: null }) },
      }),
    },
  });
  const before = stateOf(memory);

  await assert.rejects(
    app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' }),
    assertMoneyCode('CURRENCY_MISMATCH'),
  );
  // The opening balance path fails closed too, not just the page.
  await assert.rejects(
    app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', from: '2026-04-01' }),
    assertMoneyCode('CURRENCY_MISMATCH'),
  );

  assert.deepEqual(stateOf(memory), before);
});

test('report rule 9: an INACTIVE ledger is reported normally', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await post(app, {
    entryId: 'e1',
    accountingDate: '2026-03-01',
    lines: [line('l1', 'acc-cash', 'DEBIT', '10.00'), line('l2', 'acc-rev', 'CREDIT', '10.00')],
  });

  const active = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });
  await app.setLedgerStatus({ ledgerId: 'ledger-1', status: 'INACTIVE' });
  const inactive = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });

  assert.equal(memory.snapshot().ledgers[0].status, 'INACTIVE');
  assert.deepEqual(inactive, active);
  assert.deepEqual(inactive.closingBalance, amount('10.00'));
});

test('GL09: a cursor the report did not produce is INVALID_APPLICATION_INPUT', async () => {
  const { memory, app } = await harness({ chart: [CASH, REVENUE] });
  await pagingScenario(app);
  const before = stateOf(memory);

  // A cursor is opaque, so the only valid values are the ones this report produced. Starting over on a
  // forged one would repeat rows, and continuing from it would skip them.
  const forged = [
    'not-a-cursor',
    '[]',
    JSON.stringify(['am1', '2026-03-02']),
    JSON.stringify(['other', '2026-03-02', 'e2', 'l1']),
    JSON.stringify(['am1', '2026-02-30', 'e2', 'l1']),
  ];
  for (const cursor of forged) {
    await assert.rejects(
      app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash', cursor }),
      assertApplicationCode('INVALID_APPLICATION_INPUT'),
    );
  }

  assert.deepEqual(stateOf(memory), before);
});
