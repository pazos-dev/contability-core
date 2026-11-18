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
  MoneyError,
  createInMemoryAccounting,
} from '../../dist/index.js';

import { saveEntry, seedLedgers, TEST_CURRENCY } from './seed.mjs';

const LEDGERS = { 'ledger-1': 'chart-1' };
const uyu = Currency.create('UYU', 2);
const usd = Currency.create('USD', 2);
const eur = Currency.create('EUR', 2);

function money(text, currency = uyu) {
  return Money.fromDecimal(text, currency);
}

function lineOf(id, accountId, side, text, currency = uyu) {
  return JournalEntryLine.create({ id, accountId, side, amount: money(text, currency) });
}

function draftOf(id, lines) {
  return lines.reduce(
    (entry, line) => entry.addLine(line),
    JournalEntry.createDraft({
      id,
      ledgerId: 'ledger-1',
      journalId: 'jrn-1',
      periodId: 'per-2026',
      accountingDate: AccountingDate.create('2026-03-15'),
      description: 'Purchase paid in dollars',
    }),
  );
}

/** USD 100,00 debit against UYU 4.125,00 credit: balanced only in the functional currency (FX01). */
function foreignDraft(entryId = 'entry-1') {
  return draftOf(entryId, [
    lineOf('line-1', 'acc-cash', 'DEBIT', '100.00', usd),
    lineOf('line-2', 'acc-rev', 'CREDIT', '4125.00'),
  ]);
}

function rateOf(currency, factor) {
  return { currency: { code: currency.code, scale: currency.scale }, factor };
}

const USD_41_25 = rateOf(usd, '41.25');

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

function assertMoneyCode(code) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

async function harness({ currency = TEST_CURRENCY, ...memoryOptions } = {}) {
  const memory = createInMemoryAccounting(memoryOptions);
  const deps = { unitOfWork: memory.unitOfWork };
  const app = new Accounting(deps);

  await seedLedgers(app, LEDGERS, currency);

  for (const [accountId, code, name, type] of [
    ['acc-cash', '1.1.01', 'Caja', 'ASSET'],
    ['acc-rev', '4.1.01', 'Ventas', 'REVENUE'],
  ]) {
    await app.registerAccount({ ledgerId: 'ledger-1', accountId, code, name, type, postingAllowed: true });
  }
  await app.registerJournal({ ledgerId: 'ledger-1', journalId: 'jrn-1', code: 'VENTAS', name: 'Diario de ventas' });
  await app.registerPeriod({
    ledgerId: 'ledger-1',
    periodId: 'per-2026',
    name: 'Ejercicio 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });

  return { memory, deps, app };
}

function storedEntry(memory, entryId = 'entry-1') {
  return memory.snapshot().entries.find((entry) => entry.id === entryId);
}

/** Everything the adapter holds, so a rejection can prove it wrote nothing at all. */
function stateOf(memory) {
  const snapshot = memory.snapshot();
  return {
    entries: snapshot.entries.map((entry) => [
      entry.id,
      entry.status,
      entry.number ?? null,
      entry.lines.map((line) => [
        line.id,
        line.side,
        line.amount.minorUnits,
        line.amount.currency.code,
        line.functionalAmount?.minorUnits ?? null,
        line.functionalAmount?.currency.code ?? null,
        line.rate?.toJSON().factor ?? null,
      ]),
    ]),
    idempotency: snapshot.idempotency.length,
  };
}

test('FX01 / FX02: a foreign entry is posted and balanced in the functional currency', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());

  const result = await app.postEntry({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    idempotencyKey: 'post-1',
    rates: [USD_41_25],
  });

  assert.equal(result.status, 'POSTED');
  assert.equal(result.number, 1);
  assert.deepEqual(result.totalDebit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });

  const [converted, local] = result.lines;

  // The original travels with the result; the functional amount is what balances the entry.
  assert.deepEqual(converted.amount, { minorUnits: '10000', currency: { code: 'USD', scale: 2 } });
  assert.deepEqual(converted.functionalAmount, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(converted.rate, {
    from: { code: 'USD', scale: 2 },
    to: { code: 'UYU', scale: 2 },
    factor: '41.25',
  });

  // A line already in the ledger currency carries no rate and converts to itself.
  assert.equal('rate' in local, false);
  assert.deepEqual(local.functionalAmount, local.amount);

  // Both amounts are persisted with the line: a later rate does not move the history.
  const stored = storedEntry(memory);
  assert.equal(stored.status, 'POSTED');
  assert.equal(stored.lines[0].functionalAmount.toDecimal(), '4125.00');
  assert.equal(stored.lines[0].rate.toJSON().factor, '41.25');
  assert.equal(stored.lines[0].amount.toDecimal(), '100.00');
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('FX03: a foreign draft posted without a rate fails closed and stays a draft', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  const before = stateOf(memory);

  await assert.rejects(
    app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' }),
    assertEntryCode('ENTRY_RATE_MISSING'),
  );
  await assert.rejects(
    app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [] }),
    assertEntryCode('ENTRY_RATE_MISSING'),
  );

  assert.deepEqual(stateOf(memory), before);
  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('FX04: two rates for the same currency are refused and nothing is written', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  const before = stateOf(memory);

  await assert.rejects(
    app.postEntry({
      ledgerId: 'ledger-1',
      entryId: 'entry-1',
      idempotencyKey: 'post-1',
      rates: [USD_41_25, rateOf(usd, '41.50')],
    }),
    assertEntryCode('ENTRY_RATE_DUPLICATE'),
  );

  assert.deepEqual(stateOf(memory), before);
  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('FX05: a rate that is not positive between two currencies is refused before writing', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());

  for (const [rates, expected] of [
    [[rateOf(uyu, '1')], 'INVALID_EXCHANGE_RATE'],
    [[rateOf(usd, '0')], 'INVALID_EXCHANGE_RATE'],
    [[rateOf(usd, '-41.25')], 'INVALID_EXCHANGE_RATE'],
  ]) {
    const before = stateOf(memory);

    await assert.rejects(
      app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates }),
      assertMoneyCode(expected),
      `rates: ${JSON.stringify(rates)}`,
    );
    assert.deepEqual(stateOf(memory), before);
  }

  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('FX06: a rate for a currency no line uses is accepted, unused and harmless', async () => {
  const post = async (rates) => {
    const { memory, app } = await harness();
    await saveEntry(memory, foreignDraft());
    const result = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates });
    return { result, stored: storedEntry(memory) };
  };

  const used = await post([USD_41_25]);
  const spare = await post([USD_41_25, rateOf(Currency.create('GBP', 2), '52.00')]);

  assert.deepEqual(spare.result, used.result);
  assert.deepEqual(
    spare.stored.lines.map((line) => [line.id, line.functionalAmount.toJSON(), line.rate?.toJSON().factor]),
    used.stored.lines.map((line) => [line.id, line.functionalAmount.toJSON(), line.rate?.toJSON().factor]),
  );
});

test('FX07: the reversal reuses the original rate and leaves no exchange difference', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [USD_41_25] });

  const result = await app.reversePostedEntry({
    ledgerId: 'ledger-1',
    originalEntryId: 'entry-1',
    reversalEntryId: 'entry-rev',
    periodId: 'per-2026',
    accountingDate: '2026-04-01',
    idempotencyKey: 'rev-1',
  });

  assert.equal(result.status, 'POSTED');
  assert.equal(result.reversalOfEntryId, 'entry-1');
  assert.deepEqual(result.totalDebit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });

  const reversal = storedEntry(memory, 'entry-rev');
  const original = storedEntry(memory, 'entry-1');

  // Exactly opposite in the book: the amounts keep their sign, the sides are mirrored, the rate is the same.
  assert.deepEqual(
    reversal.lines.map((line) => [line.side, line.amount.currency.code, line.functionalAmount.minorUnits]),
    [
      ['CREDIT', 'USD', 412500n],
      ['DEBIT', 'UYU', 412500n],
    ],
  );
  assert.equal(reversal.lines[0].rate.toJSON().factor, '41.25');
  assert.deepEqual(
    reversal.lines.map((line) => line.functionalAmount.toJSON()),
    original.lines.map((line) => line.functionalAmount.toJSON()),
  );
  assert.deepEqual(
    original.lines.map((line) => [line.side, line.functionalAmount.minorUnits]),
    [
      ['DEBIT', 412500n],
      ['CREDIT', 412500n],
    ],
  );
  assert.equal(original.status, 'POSTED');

  // The book carries no exchange difference: the reversal cancels what the original moved, account by account.
  const balances = await app.accountBalances({ ledgerId: 'ledger-1' });
  for (const row of balances.rows) {
    assert.deepEqual(row.balance, { minorUnits: '0', currency: { code: 'UYU', scale: 2 } }, row.accountId);
  }
});

test('FX08: the reports score the functional amounts and the balance closes', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [USD_41_25] });

  const balances = await app.accountBalances({ ledgerId: 'ledger-1' });
  const cash = balances.rows.find((row) => row.accountId === 'acc-cash');

  assert.deepEqual(balances.currency, { code: 'UYU', scale: 2 });
  assert.deepEqual(cash.debit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(cash.balance, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });

  const trial = await app.trialBalance({ ledgerId: 'ledger-1' });
  assert.equal(trial.balanced, true);
  assert.deepEqual(trial.totals, {
    debit: { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } },
    credit: { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } },
  });

  const movements = await app.accountMovements({ ledgerId: 'ledger-1', accountId: 'acc-cash' });
  assert.deepEqual(movements.currency, { code: 'UYU', scale: 2 });
  assert.deepEqual(movements.rows[0].amount, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(movements.rows[0].runningBalance, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(movements.closingBalance, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
});

test('FX09: two foreign currencies that only balance in the functional one are accepted', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '100.00', usd),
      lineOf('line-2', 'acc-rev', 'CREDIT', '50.00', eur),
    ]),
  );

  const result = await app.postEntry({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    idempotencyKey: 'post-1',
    rates: [USD_41_25, rateOf(eur, '82.50')],
  });

  assert.equal(result.status, 'POSTED');
  assert.deepEqual(result.totalDebit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(
    result.lines.map((line) => [line.amount.currency.code, line.functionalAmount.minorUnits, line.rate.factor]),
    [
      ['USD', '412500', '41.25'],
      ['EUR', '412500', '82.50'],
    ],
  );
});

test('FX10: a draft may mix currencies and needs no rate until it is posted', async () => {
  const { memory, app } = await harness();

  const created = await app.createEntryDraft({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    accountingDate: '2026-03-15',
    description: 'Three currencies',
    lines: [
      { lineId: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: money('100.00').toJSON() },
      { lineId: 'line-2', accountId: 'acc-rev', side: 'CREDIT', amount: money('100.00', usd).toJSON() },
      { lineId: 'line-3', accountId: 'acc-cash', side: 'DEBIT', amount: money('50.00', eur).toJSON() },
    ],
    idempotencyKey: 'draft-1',
  });

  assert.equal(created.status, 'DRAFT');
  assert.equal(created.lines.length, 3);

  // Adding one more line of still another currency is a draft edit, not a conversion.
  const edited = await app.addEntryLine({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    line: { lineId: 'line-4', accountId: 'acc-rev', side: 'CREDIT', amount: money('7.00', Currency.create('GBP', 2)).toJSON() },
    idempotencyKey: 'line-4',
  });

  assert.equal(edited.status, 'DRAFT');
  assert.equal(edited.lines.length, 4);
  for (const line of storedEntry(memory).lines) {
    assert.equal(line.functionalAmount, undefined);
    assert.equal(line.rate, undefined);
  }
});

test('FX11: a factor with 13 decimals is invalid and nothing is written', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  const before = stateOf(memory);

  await assert.rejects(
    app.postEntry({
      ledgerId: 'ledger-1',
      entryId: 'entry-1',
      idempotencyKey: 'post-1',
      rates: [rateOf(usd, '0.1234567890123')],
    }),
    assertMoneyCode('INVALID_FACTOR'),
  );

  assert.deepEqual(stateOf(memory), before);
  assert.equal(storedEntry(memory).status, 'DRAFT');
});

test('FX12: the same key with the same rate is a replay without a second conversion', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());

  const input = { ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [USD_41_25] };
  const first = await app.postEntry(input);
  const before = stateOf(memory);
  const second = await app.postEntry(input);

  assert.deepEqual(second, first);
  assert.deepEqual(stateOf(memory), before);
  assert.equal(memory.snapshot().entries.length, 1);
  assert.equal(memory.snapshot().idempotency.length, 1);
  assert.equal(storedEntry(memory).lines[0].functionalAmount.minorUnits, 412500n);
});

test('PRESERVE: a key stored before 009d still replays, so the fingerprint without rates did not change', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '1000.00'),
      lineOf('line-2', 'acc-rev', 'CREDIT', '1000.00'),
    ]),
  );

  // The fingerprint `postEntry` wrote before this increment covered the ledger and the entry only.
  const stored = {
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    journalId: 'jrn-1',
    periodId: 'per-2026',
    status: 'POSTED',
    number: 1,
    accountingDate: '2026-03-15',
    lines: [],
    totalDebit: { minorUnits: '100000', currency: { code: 'UYU', scale: 2 } },
    totalCredit: { minorUnits: '100000', currency: { code: 'UYU', scale: 2 } },
  };
  const fingerprint = JSON.stringify([
    ['entryId', 'entry-1'],
    ['ledgerId', 'ledger-1'],
  ]);
  await memory.unitOfWork.run((scope) =>
    scope.idempotency.record('ledger-1', 'postEntry', 'post-1', { fingerprint, result: stored }),
  );

  const replayed = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });

  assert.deepEqual(replayed, stored);
  assert.equal(storedEntry(memory).status, 'DRAFT');
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('FX12: an absent rates list and an empty one are the same request', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '1000.00'),
      lineOf('line-2', 'acc-rev', 'CREDIT', '1000.00'),
    ]),
  );

  const first = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' });
  const second = await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [] });

  assert.deepEqual(second, first);
  assert.equal(memory.snapshot().entries.length, 1);
  assert.equal(memory.snapshot().idempotency.length, 1);
});

test('FX13: the same key with another rate is a conflict, not a replay', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());

  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [USD_41_25] });
  const before = stateOf(memory);

  await assert.rejects(
    app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [rateOf(usd, '41.50')] }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );

  assert.deepEqual(stateOf(memory), before);
  assert.equal(storedEntry(memory).lines[0].functionalAmount.minorUnits, 412500n);
});

test('FX14: an inexact conversion is rounded once with the default mode and stays recorded', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '33.33', usd),
      lineOf('line-2', 'acc-rev', 'CREDIT', '1374.86'),
    ]),
  );

  const result = await app.postEntry({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    idempotencyKey: 'post-1',
    rates: [USD_41_25],
  });

  // 33,33 × 41,25 = 1.374,8625, which HALF_UP rounds to 1.374,86 exactly once.
  assert.deepEqual(result.lines[0].functionalAmount, { minorUnits: '137486', currency: { code: 'UYU', scale: 2 } });
  assert.equal(result.lines[0].rate.factor, '41.25');
  assert.deepEqual(result.totalDebit, { minorUnits: '137486', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '137486', currency: { code: 'UYU', scale: 2 } });

  const stored = storedEntry(memory);
  assert.equal(stored.lines[0].functionalAmount.minorUnits, 137486n);
  assert.equal(stored.lines[0].rate.toJSON().factor, '41.25');
});
