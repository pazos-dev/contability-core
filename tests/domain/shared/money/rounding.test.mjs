import test from 'node:test';
import assert from 'node:assert/strict';

import { Currency, DEFAULT_ROUNDING_MODE, Money, MoneyError, MoneyFactor } from '../../../../dist/index.js';

const uyu = Currency.create('UYU', 2);
const jpy = Currency.create('JPY', 0);

function assertErrorCode(code) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

// A rejection reports its code and leaves the receiver identical: the operations are pure (RD19, M12).
function assertRejected(amount, run, code) {
  const decimal = amount.toDecimal();
  const minorUnits = amount.minorUnits;

  assert.throws(run, assertErrorCode(code));
  assert.equal(amount.minorUnits, minorUnits);
  assert.equal(amount.toDecimal(), decimal);
}

function sumOf(parts) {
  return parts.reduce((total, part) => total + part.minorUnits, 0n);
}

test('RD01: 100.00 multiplied by the exact factor 0.21 is 21.00', () => {
  const amount = Money.fromDecimal('100.00', uyu);

  assert.equal(amount.multiply(MoneyFactor.fromDecimal('0.21')).toDecimal(), '21.00');
});

test('RD02: 10.00 divided by 3 with HALF_UP is 3.33', () => {
  assert.equal(Money.fromDecimal('10.00', uyu).divide(3n).toDecimal(), '3.33');
});

test('RD03: 10.00 divided by 3 with HALF_EVEN is 3.33: one third is not a tie', () => {
  assert.equal(Money.fromDecimal('10.00', uyu).divide(3n, 'HALF_EVEN').toDecimal(), '3.33');
});

test('RD04: 1.00 multiplied by 0.005 with HALF_UP steps away from zero', () => {
  const amount = Money.fromDecimal('1.00', uyu);

  assert.equal(amount.multiply(MoneyFactor.fromDecimal('0.005'), 'HALF_UP').toDecimal(), '0.01');
});

test('RD05: 1.00 multiplied by 0.005 with HALF_EVEN ties to the even minor unit', () => {
  const amount = Money.fromDecimal('1.00', uyu);

  assert.equal(amount.multiply(MoneyFactor.fromDecimal('0.005'), 'HALF_EVEN').toDecimal(), '0.00');
});

test('RD06: HALF_EVEN ties to the even minor unit in both directions', () => {
  assert.equal(Money.fromDecimal('4.01', uyu).divide(2n, 'HALF_EVEN').toDecimal(), '2.00');
  assert.equal(Money.fromDecimal('4.03', uyu).divide(2n, 'HALF_EVEN').toDecimal(), '2.02');
});

test('RD07: DOWN truncates 0.09 divided by 10 to 0.00', () => {
  assert.equal(Money.fromDecimal('0.09', uyu).divide(10n, 'DOWN').toDecimal(), '0.00');
});

test('RD08: -0.01 divided by 2 with HALF_UP is -0.01, symmetric about zero', () => {
  assert.equal(Money.fromDecimal('-0.01', uyu).divide(2n, 'HALF_UP').toDecimal(), '-0.01');
});

test('RD09: DOWN truncates -0.09 divided by 10 to 0.00, not to -0.01', () => {
  const result = Money.fromDecimal('-0.09', uyu).divide(10n, 'DOWN');

  assert.equal(result.toDecimal(), '0.00');
  assert.equal(result.minorUnits, 0n);
});

test('RD10: 100.00 allocated in 3 equal parts is 33.34 33.33 33.33 and adds up to the total', () => {
  const amount = Money.fromDecimal('100.00', uyu);
  const parts = amount.allocate(3);

  assert.deepEqual(
    parts.map((part) => part.toDecimal()),
    ['33.34', '33.33', '33.33'],
  );
  assert.equal(sumOf(parts), amount.minorUnits);
});

test('RD11: 100.00 allocated in 7 equal parts adds up and the largest remainders go first', () => {
  const amount = Money.fromDecimal('100.00', uyu);
  const parts = amount.allocate(7);

  assert.deepEqual(
    parts.map((part) => part.toDecimal()),
    ['14.29', '14.29', '14.29', '14.29', '14.28', '14.28', '14.28'],
  );
  assert.equal(sumOf(parts), amount.minorUnits);
});

test('RD12: 100.00 weighted [1, 2] is 33.33 66.67: the larger remainder takes the extra unit', () => {
  const amount = Money.fromDecimal('100.00', uyu);
  const parts = amount.allocate([1n, 2n]);

  assert.deepEqual(
    parts.map((part) => part.toDecimal()),
    ['33.33', '66.67'],
  );
  assert.equal(sumOf(parts), amount.minorUnits);
});

test('RD13: -100.00 allocated in 3 parts keeps the sign and adds up to the total', () => {
  const amount = Money.fromDecimal('-100.00', uyu);
  const parts = amount.allocate(3);

  assert.deepEqual(
    parts.map((part) => part.toDecimal()),
    ['-33.34', '-33.33', '-33.33'],
  );
  assert.equal(sumOf(parts), amount.minorUnits);
});

test('RD14: a scale 0 currency allocates the leftover whole unit without decimals', () => {
  const amount = Money.fromDecimal('100', jpy);
  const parts = amount.allocate(3);

  assert.deepEqual(
    parts.map((part) => part.toDecimal()),
    ['34', '33', '33'],
  );
  assert.equal(sumOf(parts), amount.minorUnits);
});

test('RD15: divide(0n) is DIVISION_BY_ZERO and leaves the receiver unchanged', () => {
  const amount = Money.fromDecimal('10.00', uyu);

  assertRejected(amount, () => amount.divide(0n), 'DIVISION_BY_ZERO');
});

test('RD16: a factor that is not a canonical decimal of at most 12 places is INVALID_FACTOR', () => {
  for (const text of ['1e3', '0,5', '0.1234567890123', '.5', '+1', ' 1', '1 ', '', '1.']) {
    assert.throws(() => MoneyFactor.fromDecimal(text), assertErrorCode('INVALID_FACTOR'), `factor: ${text}`);
  }

  assert.throws(() => MoneyFactor.fromDecimal(0.21), assertErrorCode('INVALID_FACTOR'), 'factor: number 0.21');
});

// A factor keeps its exact decimal fraction: the denominator is a power of ten and is never reduced.
test('RD16b: accepted factors keep their exact numerator and denominator', () => {
  const cases = [
    ['0.21', 21n, 100n],
    ['3', 3n, 1n],
    ['-0.5', -5n, 10n],
    ['0.123456789012', 123456789012n, 1000000000000n],
  ];

  for (const [text, numerator, denominator] of cases) {
    const factor = MoneyFactor.fromDecimal(text);

    assert.equal(factor.numerator, numerator, `numerator of ${text}`);
    assert.equal(factor.denominator, denominator, `denominator of ${text}`);
  }
});

test('RD17: an unknown rounding mode is INVALID_ROUNDING_MODE on multiply and on divide', () => {
  const amount = Money.fromDecimal('10.00', uyu);
  const factor = MoneyFactor.fromDecimal('0.21');

  assertRejected(amount, () => amount.multiply(factor, 'CEILING'), 'INVALID_ROUNDING_MODE');
  assertRejected(amount, () => amount.divide(3n, 'CEILING'), 'INVALID_ROUNDING_MODE');
});

test('RD18: an allocation without parts, or with weights that cannot distribute, is INVALID_MONEY', () => {
  const amount = Money.fromDecimal('100.00', uyu);

  assertRejected(amount, () => amount.allocate(0), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate([0n, 0n]), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate(-1), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate(2.5), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate([]), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate([1, 2]), 'INVALID_MONEY');
  assertRejected(amount, () => amount.allocate([1n, -2n]), 'INVALID_MONEY');
});

test('RD18: an operand of the wrong type is INVALID_MONEY and does not touch the receiver', () => {
  const amount = Money.fromDecimal('10.00', uyu);

  assertRejected(amount, () => amount.multiply('0.21'), 'INVALID_MONEY');
  assertRejected(amount, () => amount.multiply(0.21), 'INVALID_MONEY');
  assertRejected(amount, () => amount.divide(3), 'INVALID_MONEY');
});

test('RD19: no operation mutates the receiver or shares references between results', () => {
  const amount = Money.fromDecimal('100.00', uyu);
  const factor = MoneyFactor.fromDecimal('0.005');
  const before = amount.toJSON();

  const product = amount.multiply(factor);
  const quotient = amount.divide(3n);
  const first = amount.allocate(3);
  const second = amount.allocate(3);

  assert.equal(amount.minorUnits, 10000n);
  assert.deepEqual(amount.toJSON(), before);
  assert.equal(amount.toDecimal(), '100.00');

  // Only the receiver's state before and after can fail for the reason this rule claims: every operation
  // rebuilds its results, so asserting that a result is not the receiver would pass even if the operation
  // mutated it.
  for (const result of [product, quotient, ...first]) {
    assert.equal(result.currency.equals(uyu), true);
  }

  assert.deepEqual(
    first.map((part) => part.toDecimal()),
    second.map((part) => part.toDecimal()),
  );
});

test('RD20: omitting the mode applies DEFAULT_ROUNDING_MODE, which is HALF_UP', () => {
  assert.equal(DEFAULT_ROUNDING_MODE, 'HALF_UP');

  const amount = Money.fromDecimal('1.00', uyu);
  const factor = MoneyFactor.fromDecimal('0.005');

  assert.equal(amount.multiply(factor).toDecimal(), amount.multiply(factor, 'HALF_UP').toDecimal());
  assert.equal(amount.multiply(factor).toDecimal(), '0.01');
  assert.equal(amount.divide(2n).toDecimal(), amount.divide(2n, 'HALF_UP').toDecimal());
});

// PRESERVE: the operations that existed before this increment still do not round.
test('PRESERVE: add, subtract and compare keep their exact behaviour', () => {
  const amount = Money.fromDecimal('10.25', uyu);

  assert.equal(amount.add(Money.fromDecimal('0.05', uyu)).toDecimal(), '10.30');
  assert.equal(amount.subtract(Money.fromDecimal('0.30', uyu)).toDecimal(), '9.95');
  assert.equal(amount.compare(Money.fromDecimal('10.25', uyu)), 0);
  assert.equal(amount.minorUnits, 1025n);
});
