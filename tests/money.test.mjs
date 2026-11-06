import test from 'node:test';
import assert from 'node:assert/strict';

import { Currency, Money, MoneyError } from '../dist/index.js';

const uyu = Currency.create('UYU', 2);
const usd = Currency.create('USD', 2);

function assertErrorCode(code) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('M01: 0.10 + 0.20 in UYU scale 2 is 30n and 0.30', () => {
  const total = Money.fromDecimal('0.10', uyu).add(Money.fromDecimal('0.20', uyu));

  assert.equal(total.minorUnits, 30n);
  assert.equal(total.toDecimal(), '0.30');
});

test('M02: 10.25 - 2.10 is 815n and 8.15', () => {
  const result = Money.fromDecimal('10.25', uyu).subtract(Money.fromDecimal('2.10', uyu));

  assert.equal(result.minorUnits, 815n);
  assert.equal(result.toDecimal(), '8.15');
});

test('M03: 1.00 - 2.00 is -100n and -1.00', () => {
  const result = Money.fromDecimal('1.00', uyu).subtract(Money.fromDecimal('2.00', uyu));

  assert.equal(result.minorUnits, -100n);
  assert.equal(result.toDecimal(), '-1.00');
});

test('M04: mixing UYU and USD fails with CURRENCY_MISMATCH', () => {
  const amount = Money.fromDecimal('1.00', uyu);

  assert.throws(() => amount.add(Money.fromDecimal('1.00', usd)), assertErrorCode('CURRENCY_MISMATCH'));
  assert.throws(() => amount.subtract(Money.fromDecimal('1.00', usd)), assertErrorCode('CURRENCY_MISMATCH'));
  assert.throws(() => amount.compare(Money.fromDecimal('1.00', usd)), assertErrorCode('CURRENCY_MISMATCH'));
});

test('M05: same code with a different scale is incompatible', () => {
  const uyuZero = Currency.create('UYU', 0);
  const scaleTwo = Money.fromDecimal('1.00', uyu);
  const scaleZero = Money.fromDecimal('1', uyuZero);

  assert.equal(scaleTwo.equals(scaleZero), false);
  assert.throws(() => scaleTwo.add(scaleZero), assertErrorCode('CURRENCY_MISMATCH'));
  assert.throws(() => scaleTwo.compare(scaleZero), assertErrorCode('CURRENCY_MISMATCH'));
});

test('M06: 1.001 in scale 2 is rejected instead of rounded', () => {
  assert.throws(() => Money.fromDecimal('1.001', uyu), assertErrorCode('INVALID_MONEY'));
  assert.throws(() => Money.fromDecimal('1.000', uyu), assertErrorCode('INVALID_MONEY'));
  assert.throws(() => Money.fromDecimal('-0.001', uyu), assertErrorCode('INVALID_MONEY'));
});

test('M07: NaN, Infinity, invalid text, null and number decimals are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, 1, 1.5, null, undefined, {}, [], true, '']) {
    assert.throws(() => Money.fromDecimal(value, uyu), assertErrorCode('INVALID_MONEY'), `value: ${String(value)}`);
  }

  for (const value of ['+1', '01', '.5', '1.', '1,5', '1e3', ' 1', '1 ', '1.2.3', '--1', '- 1', '0x10']) {
    assert.throws(() => Money.fromDecimal(value, uyu), assertErrorCode('INVALID_MONEY'), `value: ${value}`);
  }
});

test('M08: operations do not mutate their operands or leak references', () => {
  const left = Money.fromDecimal('0.10', uyu);
  const right = Money.fromDecimal('0.20', uyu);
  const jsonBefore = left.toJSON();

  const sum = left.add(right);
  const difference = right.subtract(left);

  assert.notEqual(sum, left);
  assert.notEqual(sum, right);
  assert.equal(left.minorUnits, 10n);
  assert.equal(right.minorUnits, 20n);
  assert.deepEqual(left.toJSON(), jsonBefore);
  assert.equal(sum.minorUnits + difference.minorUnits, 40n);
});

test('M09: JSON round trip keeps amount and currency above MAX_SAFE_INTEGER', () => {
  const amount = Money.fromMinorUnits(900719925474099301n, uyu);
  const json = amount.toJSON();

  assert.deepEqual(json, { minorUnits: '900719925474099301', currency: { code: 'UYU', scale: 2 } });
  assert.equal(JSON.parse(JSON.stringify(json)).minorUnits, '900719925474099301');

  const restored = Money.fromJSON(json);
  assert.equal(restored.minorUnits, 900719925474099301n);
  assert.equal(restored.equals(amount), true);
  assert.equal(restored.currency.equals(uyu), true);
  assert.equal(restored.toDecimal(), '9007199254740993.01');
});

test('M10: negative, fractional or out-of-range scales are rejected', () => {
  for (const scale of [-1, 2.5, 7, NaN, Infinity]) {
    assert.throws(() => Currency.create('UYU', scale), assertErrorCode('INVALID_CURRENCY'), `scale: ${String(scale)}`);
  }
});

test('M11: scale 0 accepts integers and rejects any decimal part', () => {
  const point = Currency.create('JPY', 0);

  assert.equal(Money.fromDecimal('100', point).toDecimal(), '100');
  assert.equal(Money.fromDecimal('-100', point).minorUnits, -100n);
  assert.throws(() => Money.fromDecimal('100.0', point), assertErrorCode('INVALID_MONEY'));
  assert.throws(() => Money.fromDecimal('100.5', point), assertErrorCode('INVALID_MONEY'));
});

test('M12: mutating inputs or outputs does not alter an existing Money', () => {
  const amount = Money.fromDecimal('10.25', uyu);
  const output = amount.toJSON();

  output.minorUnits = '999999';
  output.currency.code = 'ARS';
  output.currency.scale = 0;

  assert.equal(amount.minorUnits, 1025n);
  assert.equal(amount.toDecimal(), '10.25');
  assert.equal(amount.currency.code, 'UYU');
  assert.equal(amount.currency.scale, 2);

  const source = { minorUnits: '1025', currency: { code: 'UYU', scale: 2 } };
  const restored = Money.fromJSON(source);
  source.minorUnits = '1';
  source.currency.code = 'ARS';

  assert.equal(restored.minorUnits, 1025n);
  assert.equal(restored.currency.code, 'UYU');

  assert.throws(() => {
    amount.currency.scale = 4;
  }, TypeError);
  assert.equal(amount.currency.scale, 2);
});

test('decimal entry accepts fewer decimals, -0 and exact padding', () => {
  assert.equal(Money.fromDecimal('5', uyu).minorUnits, 500n);
  assert.equal(Money.fromDecimal('5.1', uyu).toDecimal(), '5.10');
  assert.equal(Money.fromDecimal('-0', uyu).minorUnits, 0n);
  assert.equal(Money.fromDecimal('-0.00', uyu).toDecimal(), '0.00');
  assert.equal(Money.fromDecimal('0', uyu).toDecimal(), '0.00');
});

test('currency validation rejects malformed codes', () => {
  for (const code of ['uyu', 'US', 'USDX', 'U U', '12A', '', 'ÜYU']) {
    assert.throws(() => Currency.create(code, 2), assertErrorCode('INVALID_CURRENCY'), `code: ${code}`);
  }
});

test('currency and money JSON reconstruction validate unknown data', () => {
  assert.deepEqual(Currency.fromJSON({ code: 'UYU', scale: 2 }).toJSON(), { code: 'UYU', scale: 2 });

  for (const value of [null, undefined, {}, { code: 'UYU' }, { code: 'uyu', scale: 2 }, { code: 'UYU', scale: '2' }]) {
    assert.throws(() => Currency.fromJSON(value), assertErrorCode('INVALID_CURRENCY'));
  }

  for (const value of [
    null,
    undefined,
    {},
    { currency: { code: 'UYU', scale: 2 } },
    { minorUnits: 1025, currency: { code: 'UYU', scale: 2 } },
    { minorUnits: '1.25', currency: { code: 'UYU', scale: 2 } },
    { minorUnits: '1e3', currency: { code: 'UYU', scale: 2 } },
    { minorUnits: '-0', currency: { code: 'UYU', scale: 2 } },
  ]) {
    assert.throws(() => Money.fromJSON(value), assertErrorCode('INVALID_MONEY'), `value: ${JSON.stringify(value)}`);
  }

  for (const currency of [{ code: 'UYU', scale: 7 }, 'UYU', null]) {
    assert.throws(
      () => Money.fromJSON({ minorUnits: '1025', currency }),
      assertErrorCode('INVALID_CURRENCY'),
      `currency: ${JSON.stringify(currency)}`,
    );
  }
});

test('compare orders exact amounts within the same currency', () => {
  const small = Money.fromDecimal('0.10', uyu);
  const large = Money.fromDecimal('0.20', uyu);

  assert.equal(small.compare(large), -1);
  assert.equal(large.compare(small), 1);
  assert.equal(small.compare(Money.fromDecimal('0.10', uyu)), 0);
  assert.equal(Money.fromMinorUnits(0n, uyu).equals(Money.fromDecimal('0.00', uyu)), true);
});
