import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Accounting,
  AccountingDate,
  ApplicationError,
  Currency,
  EntryError,
  ExchangeRate,
  JournalEntry,
  JournalEntryLine,
  Money,
  MoneyError,
  MoneyFactor,
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

/** A domain rate, for the cases the application cannot build because it always targets the ledger. */
function exchangeRate(from, factor, to = uyu) {
  return ExchangeRate.create({ from, to, factor: MoneyFactor.fromDecimal(factor) });
}

const USD_41_25 = rateOf(usd, '41.25');

function context(rates) {
  return { number: 1, functionalCurrency: uyu, rates };
}

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

async function harness() {
  const memory = createInMemoryAccounting();
  const app = new Accounting({ unitOfWork: memory.unitOfWork });

  await seedLedgers(app, LEDGERS, TEST_CURRENCY);

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

  return { memory, app };
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

// B1 — the host can rebuild a converted line. `create` stays the draft path; `restore` is the adapter path.
test('B1: create is the draft path and never carries a functional amount', () => {
  const line = JournalEntryLine.create({
    id: 'line-1',
    accountId: 'acc-cash',
    side: 'DEBIT',
    amount: money('100.00', usd),
    // A caller cannot declare what its own line is worth in the book: posting is the only writer.
    functionalAmount: money('4125.00'),
    rate: { from: { code: 'USD', scale: 2 }, to: { code: 'UYU', scale: 2 }, factor: '41.25' },
  });

  assert.equal(line.functionalAmount, undefined);
  assert.equal(line.rate, undefined);
});

test('B1: restore hydrates the stored shape and a rate only travels with its functional amount', () => {
  const base = { id: 'line-1', accountId: 'acc-cash', side: 'DEBIT', amount: money('100.00', usd) };
  const storedFunctional = { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } };
  const storedRate = { from: { code: 'USD', scale: 2 }, to: { code: 'UYU', scale: 2 }, factor: '41.25' };

  // The two stored values are hydrated by their own types, so a defective one is that type's error.
  assert.throws(() => JournalEntryLine.restore(null), assertEntryCode('INVALID_ENTRY_LINE'));
  assert.throws(
    () => JournalEntryLine.restore({ ...base, functionalAmount: { minorUnits: '412500', currency: { code: 'UYU' } } }),
    assertMoneyCode('INVALID_CURRENCY'),
  );
  assert.throws(
    () => JournalEntryLine.restore({ ...base, functionalAmount: storedFunctional, rate: { ...storedRate, factor: '0' } }),
    assertMoneyCode('INVALID_EXCHANGE_RATE'),
  );

  // A rate without the functional amount it produced is not a line any posting could have written.
  assert.throws(
    () => JournalEntryLine.restore({ ...base, rate: storedRate }),
    assertEntryCode('INVALID_ENTRY_LINE'),
  );

  const restored = JournalEntryLine.restore({ ...base, functionalAmount: storedFunctional, rate: storedRate });

  assert.deepEqual(restored.functionalAmount.toJSON(), storedFunctional);
  assert.deepEqual(restored.rate.toJSON(), storedRate);
  assert.deepEqual(restored.amount.toJSON(), base.amount.toJSON());
});

test('B1: a host rebuilds a posted entry with restore and posting keeps what was stored', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());
  await app.postEntry({ ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1', rates: [USD_41_25] });

  const posted = storedEntry(memory);

  // Exactly what a durable adapter persists per line: the input it was given plus what posting stored.
  const stored = posted.lines.map((line) => ({
    id: line.id,
    accountId: line.accountId,
    side: line.side,
    amount: line.amount.toJSON(),
    ...(line.functionalAmount === undefined ? {} : { functionalAmount: line.functionalAmount.toJSON() }),
    ...(line.rate === undefined ? {} : { rate: line.rate.toJSON() }),
    ...(line.description === undefined ? {} : { description: line.description }),
  }));
  assert.deepEqual(stored[0].functionalAmount, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(stored[1].amount, { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });

  // The adapter rebuilds the aggregate with the draft path the core gives it and `restore` for each line.
  const rebuilt = stored.reduce(
    (entry, line) =>
      entry.addLine(
        JournalEntryLine.restore({
          id: line.id,
          accountId: line.accountId,
          side: line.side,
          amount: Money.fromJSON(line.amount),
          ...(line.functionalAmount === undefined ? {} : { functionalAmount: line.functionalAmount }),
          ...(line.rate === undefined ? {} : { rate: line.rate }),
          ...(line.description === undefined ? {} : { description: line.description }),
        }),
      ),
    JournalEntry.createDraft({
      id: 'entry-1',
      ledgerId: 'ledger-1',
      journalId: 'jrn-1',
      periodId: 'per-2026',
      accountingDate: AccountingDate.create('2026-03-15'),
      description: 'Purchase paid in dollars',
    }),
  );

  // Posted with no rate at all: the stored functional amounts are what posting trusts, so nothing is missing.
  const reposted = rebuilt.post(context([]));
  assert.deepEqual(
    reposted.lines.map((line) => [line.id, line.functionalAmount.toJSON(), line.rate?.toJSON().factor]),
    posted.lines.map((line) => [line.id, line.functionalAmount.toJSON(), line.rate?.toJSON().factor]),
  );

  // 100,00 × 42,00 would be 4.200,00: a rate that converts differently still does not move the stored history.
  const withAnotherRate = rebuilt.post(context([exchangeRate(usd, '42.00')]));
  assert.deepEqual(withAnotherRate.lines.map((line) => line.functionalAmount.toJSON()), [
    { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } },
    { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } },
  ]);
  assert.equal(withAnotherRate.lines[0].rate.toJSON().factor, '41.25');
});

// W1 — the fingerprint is canonical for rates: `41.25` and `41.250` are the same rate and the same request.
test('W1: a rate written with trailing zeros replays instead of conflicting', async () => {
  const { memory, app } = await harness();
  await saveEntry(memory, foreignDraft());

  const input = { ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' };
  const first = await app.postEntry({ ...input, rates: [USD_41_25] });
  const before = stateOf(memory);

  for (const factor of ['41.250', '41.2500']) {
    const replayed = await app.postEntry({ ...input, rates: [rateOf(usd, factor)] });

    assert.deepEqual(replayed, first, `factor ${factor}`);
    assert.deepEqual(stateOf(memory), before, `factor ${factor}`);
    assert.equal(memory.snapshot().idempotency.length, 1);
  }

  // Another value is another request: canonicalising the spelling does not blur the value itself.
  await assert.rejects(
    app.postEntry({ ...input, rates: [rateOf(usd, '41.26')] }),
    assertCode('IDEMPOTENCY_CONFLICT'),
  );
  assert.deepEqual(stateOf(memory), before);
});

// Reviewer regressions: the boundaries FX06 leaves open, pinned as they are.
test('the functional currency is not a rate, even when no line needs one', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '1000.00'),
      lineOf('line-2', 'acc-rev', 'CREDIT', '1000.00'),
    ]),
  );
  const before = stateOf(memory);
  const input = { ledgerId: 'ledger-1', entryId: 'entry-1', idempotencyKey: 'post-1' };

  // The ledger's own currency converts nothing: it is refused while hydrating, before the aggregate sees it.
  await assert.rejects(app.postEntry({ ...input, rates: [rateOf(uyu, '1')] }), assertMoneyCode('INVALID_EXCHANGE_RATE'));
  assert.deepEqual(stateOf(memory), before);

  // An unused currency is accepted (FX06), but an unused rate into itself is not an unused currency.
  await saveEntry(memory, foreignDraft('entry-2'));
  const beforeForeign = stateOf(memory);
  await assert.rejects(
    app.postEntry({ ...input, entryId: 'entry-2', rates: [USD_41_25, rateOf(uyu, '1')] }),
    assertMoneyCode('INVALID_EXCHANGE_RATE'),
  );
  assert.deepEqual(stateOf(memory), beforeForeign);
  assert.equal(storedEntry(memory, 'entry-2').status, 'DRAFT');
});

test('a conversion that rounds to zero functional is accepted and stays zero', async () => {
  const { memory, app } = await harness();
  await saveEntry(
    memory,
    draftOf('entry-1', [
      lineOf('line-1', 'acc-cash', 'DEBIT', '0.01', usd),
      lineOf('line-2', 'acc-rev', 'CREDIT', '0.01', usd),
    ]),
  );

  const result = await app.postEntry({
    ledgerId: 'ledger-1',
    entryId: 'entry-1',
    idempotencyKey: 'post-1',
    rates: [rateOf(usd, '0.4')],
  });

  // 0,01 × 0,4 = 0,004, which HALF_UP rounds to 0,00: a posted line may carry a zero functional amount.
  assert.equal(result.status, 'POSTED');
  assert.deepEqual(result.lines.map((line) => line.functionalAmount), [
    { minorUnits: '0', currency: { code: 'UYU', scale: 2 } },
    { minorUnits: '0', currency: { code: 'UYU', scale: 2 } },
  ]);
  assert.deepEqual(result.totalDebit, { minorUnits: '0', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(result.totalCredit, { minorUnits: '0', currency: { code: 'UYU', scale: 2 } });
  assert.equal(storedEntry(memory).lines[0].functionalAmount.minorUnits, 0n);
});

test('the rate list is read in order: the first offending rate decides between duplicate and wrong target', () => {
  const duplicate = () => foreignDraft().post(context([exchangeRate(usd, '41.25'), exchangeRate(usd, '41.50')]));
  assert.throws(duplicate, assertEntryCode('ENTRY_RATE_DUPLICATE'));

  // The target of each rate is checked before its source is registered, so a later wrong target does not
  // hide a duplicate that comes first in the list.
  assert.throws(
    () => foreignDraft().post(context([exchangeRate(usd, '41.25'), exchangeRate(usd, '41.50'), exchangeRate(usd, '41.60', eur)])),
    assertEntryCode('ENTRY_RATE_DUPLICATE'),
  );

  // The other way round, the wrong target is the first problem of the list and it wins.
  assert.throws(
    () => foreignDraft().post(context([exchangeRate(usd, '41.25', eur), exchangeRate(usd, '41.50'), exchangeRate(usd, '41.60')])),
    assertMoneyCode('INVALID_EXCHANGE_RATE'),
  );
  assert.throws(
    () => foreignDraft().post(context([exchangeRate(usd, '41.25'), exchangeRate(usd, '41.50', eur)])),
    assertMoneyCode('INVALID_EXCHANGE_RATE'),
  );
});
