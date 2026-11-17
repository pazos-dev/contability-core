import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AccountingDate,
  Currency,
  EntryError,
  ExchangeRate,
  JournalEntry,
  JournalEntryLine,
  Money,
  MoneyError,
  MoneyFactor,
} from '../../../dist/index.js';

const uyu = Currency.create('UYU', 2);
const usd = Currency.create('USD', 2);
const eur = Currency.create('EUR', 2);
const gbp = Currency.create('GBP', 2);

const draftInput = {
  id: 'entry-1',
  ledgerId: 'ledger-1',
  journalId: 'journal-1',
  periodId: 'period-1',
  accountingDate: AccountingDate.create('2026-03-15'),
  description: 'Purchase paid in dollars',
};

function money(text, currency = uyu) {
  return Money.fromDecimal(text, currency);
}

function line(overrides = {}) {
  return JournalEntryLine.create({
    id: 'line-1',
    accountId: 'account-1',
    side: 'DEBIT',
    amount: money('1000.00'),
    ...overrides,
  });
}

function draft(lines) {
  return lines.reduce(
    (entry, next) => entry.addLine(next),
    JournalEntry.createDraft({ ...draftInput }),
  );
}

function rate(from, to, factor) {
  return ExchangeRate.create({ from, to, factor: MoneyFactor.fromDecimal(factor) });
}

/** The context `post` receives: the number, the ledger's currency and one rate per foreign line. */
function context(overrides = {}) {
  return { number: 1, functionalCurrency: uyu, rates: [], ...overrides };
}

/** USD 100,00 debit against UYU 4.125,00 credit: only the functional amount balances it. */
function foreignDraft() {
  return draft([
    line({ amount: money('100.00', usd) }),
    line({ id: 'line-2', accountId: 'account-2', side: 'CREDIT', amount: money('4125.00') }),
  ]);
}

function assertEntryError(code) {
  return (error) => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

function assertMoneyError(code) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

test('ExchangeRate: keeps the pair and the exact factor, never a floating point number', () => {
  const usdToUyu = rate(usd, uyu, '41.25');

  assert.equal(usdToUyu.from.code, 'USD');
  assert.equal(usdToUyu.to.code, 'UYU');
  assert.equal(usdToUyu.factor.numerator, 4125n);
  assert.equal(usdToUyu.factor.denominator, 100n);
  assert.ok(Object.isFrozen(usdToUyu));

  assert.ok(usdToUyu.equals(rate(usd, uyu, '41.25')));
  // The decimal is a value, not its spelling: `41.25` and `41.250` are the same rate…
  assert.ok(usdToUyu.equals(rate(usd, uyu, '41.250')));
  // …and another pair or another value is another rate.
  assert.equal(usdToUyu.equals(rate(uyu, usd, '41.25')), false);
  assert.equal(usdToUyu.equals(rate(usd, uyu, '41.50')), false);
  assert.equal(usdToUyu.equals({ from: usd, to: uyu }), false);

  assert.deepEqual(usdToUyu.toJSON(), {
    from: { code: 'USD', scale: 2 },
    to: { code: 'UYU', scale: 2 },
    factor: '41.25',
  });
});

test('ExchangeRate: only an exact positive factor between two different currencies is a rate', () => {
  // The factor has to be a MoneyFactor: a number, its text or a Money would each lose the exactness.
  for (const factor of [41.25, '41.25', 4125n, money('41.25'), null, undefined]) {
    assert.throws(() => ExchangeRate.create({ from: usd, to: uyu, factor }), assertMoneyError('INVALID_EXCHANGE_RATE'));
  }

  // Zero and negative factors are not a rate: a pair of currencies is worth something.
  for (const factor of ['0', '-41.25', '-0.001']) {
    assert.throws(
      () => ExchangeRate.create({ from: usd, to: uyu, factor: MoneyFactor.fromDecimal(factor) }),
      assertMoneyError('INVALID_EXCHANGE_RATE'),
      `factor ${factor}`,
    );
  }

  // Both operands are currencies: a plain JSON shape or a code is not one.
  for (const side of ['from', 'to']) {
    for (const value of [{ code: 'USD', scale: 2 }, 'USD', null, undefined]) {
      assert.throws(
        () => ExchangeRate.create({ from: usd, to: uyu, [side]: value, factor: MoneyFactor.fromDecimal('41.25') }),
        assertMoneyError('INVALID_EXCHANGE_RATE'),
        `${side}: ${String(value)}`,
      );
    }
  }

  // A currency is not converted into itself, and the scale is part of the identity: ABC/2 and ABC/4 are two.
  assert.throws(
    () => ExchangeRate.create({ from: usd, to: usd, factor: MoneyFactor.fromDecimal('1') }),
    assertMoneyError('INVALID_EXCHANGE_RATE'),
  );
  assert.ok(
    rate(Currency.create('ABC', 2), Currency.create('ABC', 4), '1').equals(
      ExchangeRate.create({
        from: Currency.create('ABC', 2),
        to: Currency.create('ABC', 4),
        factor: MoneyFactor.fromDecimal('1'),
      }),
    ),
  );

  assert.throws(() => ExchangeRate.create(null), assertMoneyError('INVALID_EXCHANGE_RATE'));
});

test('MoneyFactor.toDecimal: rebuilds the literal it was parsed from, and multiply is untouched', () => {
  for (const literal of ['0.21', '-0.5', '3', '0.125', '0.210', '0', '12.345678901234']) {
    assert.equal(MoneyFactor.fromDecimal(literal).toDecimal(), literal, literal);
  }
  assert.equal(MoneyFactor.fromDecimal('41.25').toDecimal(), '41.25');

  // Additive: the exact product of 009b still rounds once, at the end.
  assert.equal(money('100.00').multiply(MoneyFactor.fromDecimal('0.21')).toDecimal(), '21.00');
});

test('FX02 / rule 2: a converted line keeps its original, gains the functional amount and the rate', () => {
  const foreign = foreignDraft();
  const posted = foreign.post(context({ rates: [rate(usd, uyu, '41.25')] }));

  const [converted, local] = posted.lines;

  // The original is never replaced: what was agreed stays in its own currency.
  assert.deepEqual(converted.amount.toJSON(), { minorUnits: '10000', currency: { code: 'USD', scale: 2 } });
  assert.deepEqual(converted.functionalAmount.toJSON(), { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });
  assert.deepEqual(converted.rate.toJSON(), {
    from: { code: 'USD', scale: 2 },
    to: { code: 'UYU', scale: 2 },
    factor: '41.25',
  });

  // A line already in the functional currency needs no rate and converts to itself.
  assert.equal(local.rate, undefined);
  assert.deepEqual(local.functionalAmount.toJSON(), local.amount.toJSON());
  assert.deepEqual(local.amount.toJSON(), { minorUnits: '412500', currency: { code: 'UYU', scale: 2 } });

  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.number, 1);

  // The draft is untouched: a draft never converts (rule 9).
  assert.equal(foreign.status, 'DRAFT');
  assert.equal(foreign.lines[0].functionalAmount, undefined);
  assert.equal(foreign.lines[0].rate, undefined);
});

test('rule 3: a line in the functional currency needs no rate at all', () => {
  const local = draft([
    line({ amount: money('1000.00') }),
    line({ id: 'line-2', accountId: 'account-2', side: 'CREDIT', amount: money('1000.00') }),
  ]);

  const posted = local.post(context());

  for (const postedLine of posted.lines) {
    assert.equal(postedLine.rate, undefined);
    assert.deepEqual(postedLine.functionalAmount.toJSON(), postedLine.amount.toJSON());
  }
});

test('FX03 / rule 4: a foreign line without a rate fails closed, and no rate is ever assumed', () => {
  const foreign = foreignDraft();

  assert.throws(() => foreign.post(context()), assertEntryError('ENTRY_RATE_MISSING'));
  assert.equal(foreign.status, 'DRAFT');
  assert.equal(foreign.number, undefined);
  assert.equal(foreign.lines[0].functionalAmount, undefined);

  // The rate of another currency is not borrowed: the pair has to match the line.
  assert.throws(
    () => foreign.post(context({ rates: [rate(eur, uyu, '41.25')] })),
    assertEntryError('ENTRY_RATE_MISSING'),
  );

  // A rate that converts into another currency is not usable either (rule 5).
  assert.throws(
    () => foreign.post(context({ rates: [rate(usd, eur, '41.25')] })),
    assertMoneyError('INVALID_EXCHANGE_RATE'),
  );
});

test('FX04 / rule 12: two rates for the same currency are refused instead of picking one', () => {
  const foreign = foreignDraft();

  assert.throws(
    () => foreign.post(context({ rates: [rate(usd, uyu, '41.25'), rate(usd, uyu, '41.50')] })),
    assertEntryError('ENTRY_RATE_DUPLICATE'),
  );
  assert.equal(foreign.status, 'DRAFT');
  assert.equal(foreign.lines[0].functionalAmount, undefined);
});

test('rule 5: the rates list only admits exchange rates, and the pair is checked at posting', () => {
  const foreign = foreignDraft();

  for (const rates of [[{ from: usd, to: uyu, factor: '41.25' }], ['41.25'], [null]]) {
    assert.throws(
      () => foreign.post(context({ rates })),
      assertMoneyError('INVALID_EXCHANGE_RATE'),
      `rates: ${JSON.stringify(rates)}`,
    );
  }

  // The functional currency is a currency, and the context is an object.
  assert.throws(() => foreign.post(context({ functionalCurrency: 'UYU' })), assertEntryError('INVALID_ENTRY'));
  assert.throws(() => foreign.post(context({ rates: '41.25' })), assertEntryError('INVALID_ENTRY'));
  assert.equal(foreign.status, 'DRAFT');
});

test('FX06: a rate for a currency no line uses is accepted and changes nothing', () => {
  const posting = (rates) => foreignDraft().post(context({ rates }));

  const withOnlyUsed = posting([rate(usd, uyu, '41.25')]);
  const withSpare = posting([rate(usd, uyu, '41.25'), rate(gbp, uyu, '52.00')]);

  assert.deepEqual(
    withSpare.lines.map((postedLine) => [postedLine.id, postedLine.functionalAmount.toJSON()]),
    withOnlyUsed.lines.map((postedLine) => [postedLine.id, postedLine.functionalAmount.toJSON()]),
  );
  assert.equal(withSpare.lines[0].rate.toJSON().factor, '41.25');
});

test('rule 6 / FX14: the functional amount is one exact multiply, rounded once with the default mode', () => {
  const exact = draft([
    line({ amount: money('33.33', usd) }),
    line({ id: 'line-2', accountId: 'account-2', side: 'CREDIT', amount: money('1374.86') }),
  ]);

  const posted = exact.post(context({ rates: [rate(usd, uyu, '41.25')] }));
  const converted = posted.lines[0];

  // 33,33 × 41,25 = 1.374,8625 → 1.374,86 with the default HALF_UP, applied once.
  assert.deepEqual(converted.functionalAmount.toJSON(), { minorUnits: '137486', currency: { code: 'UYU', scale: 2 } });
  assert.equal(converted.functionalAmount.toDecimal(), '1374.86');
  assert.equal(converted.amount.toDecimal(), '33.33');

  // The functional minor units are exactly the product of the original by the factor, rounded once.
  assert.equal(
    converted.amount.multiply(MoneyFactor.fromDecimal('41.25')).minorUnits,
    converted.functionalAmount.minorUnits,
  );
});

test('FX07 / rule 8: the reversal mirrors the functional amounts without recalculating them', () => {
  const posted = foreignDraft().post(context({ rates: [rate(usd, uyu, '41.25')] }));

  const reversalDraft = posted.createReversalDraft({
    id: 'entry-2',
    periodId: 'period-2',
    accountingDate: AccountingDate.create('2026-04-15'),
  });

  // The mirrored draft already carries what was posted: sides opposite, functional opposite, same rate.
  assert.equal(reversalDraft.status, 'DRAFT');
  assert.deepEqual(
    reversalDraft.lines.map((reversalLine) => [reversalLine.side, reversalLine.functionalAmount.toDecimal()]),
    [
      ['CREDIT', '4125.00'],
      ['DEBIT', '4125.00'],
    ],
  );
  assert.equal(reversalDraft.lines[0].rate.toJSON().factor, '41.25');

  // Posted without any rate: nothing is recalculated, so no exchange difference can appear.
  const postedReversal = reversalDraft.post(context({ number: 2 }));

  // The functional amounts are not negated: the amount stays what it is worth and the side says the direction.
  assert.deepEqual(
    postedReversal.lines.map((reversalLine) => reversalLine.functionalAmount.minorUnits),
    [412500n, 412500n],
  );
  assert.deepEqual(
    postedReversal.lines.map((reversalLine) => [
      reversalLine.side,
      reversalLine.amount.minorUnits,
      reversalLine.amount.currency.code,
    ]),
    [
      ['CREDIT', 10000n, 'USD'],
      ['DEBIT', 412500n, 'UYU'],
    ],
  );

  // Each mirrored functional amount is the original one, exactly, on the opposite side: net zero.
  assert.deepEqual(
    postedReversal.lines.map((reversalLine) => reversalLine.functionalAmount.toJSON()),
    posted.lines.map((postedLine) => postedLine.functionalAmount.toJSON()),
  );

  // Net zero in functional: the original's functional amounts are exactly cancelled, and it stays posted.
  const net = postedReversal.lines.reduce((sum, postedLine) => {
    const signedIdentity = postedLine.side === 'DEBIT' ? 1n : -1n;
    return sum + postedLine.functionalAmount.minorUnits * signedIdentity;
  }, 0n);
  assert.equal(net, 0n);

  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.number, 1);
  assert.equal(posted.lines[0].functionalAmount.toDecimal(), '4125.00');
});

test('rule 9: a draft may mix currencies and never converts while it is a draft', () => {
  const mixed = draft([
    line({ amount: money('100.00') }),
    line({ id: 'line-2', side: 'CREDIT', amount: money('100.00', usd) }),
    line({ id: 'line-3', accountId: 'account-2', side: 'DEBIT', amount: money('50.00', eur) }),
  ]);

  assert.equal(mixed.status, 'DRAFT');
  assert.equal(mixed.lines.length, 3);
  for (const draftLine of mixed.lines) {
    assert.equal(draftLine.functionalAmount, undefined);
    assert.equal(draftLine.rate, undefined);
  }

  const grown = mixed.addLine(line({ id: 'line-4', accountId: 'account-3', side: 'CREDIT', amount: money('7.00', gbp) }));
  assert.equal(grown.status, 'DRAFT');
  assert.equal(grown.lines.length, 4);
  assert.equal(grown.lines[3].functionalAmount, undefined);
});
