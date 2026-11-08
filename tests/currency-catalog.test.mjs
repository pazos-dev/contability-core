import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Currency,
  Money,
  MoneyError,
  ISO_4217_PUBLISHED,
  listIsoCurrencies,
  listIsoCurrenciesWithoutMinorUnit,
} from '../dist/index.js';

// Reason-specific matchers: the spec requires the error to distinguish why a currency was rejected.
const FORMAT = /must be three uppercase letters A-Z/;
const RANGE = /must be an integer between 0 and 6/;
const NO_MINOR_UNIT = /is an ISO 4217 currency without a decimal minor unit/;
const OFFICIAL_SCALE = /does not match ISO 4217 scale/;

function assertInvalidCurrency(reason) {
  return (error) => {
    assert.ok(error instanceof MoneyError, `expected MoneyError, got ${error?.name}`);
    assert.equal(error.code, 'INVALID_CURRENCY');
    if (reason !== undefined) assert.match(error.message, reason);
    return true;
  };
}

test('IC01: an ISO code with its official scale is accepted', () => {
  const uyu = Currency.create('UYU', 2);

  assert.equal(uyu.code, 'UYU');
  assert.equal(uyu.scale, 2);
  assert.deepEqual(uyu.toJSON(), { code: 'UYU', scale: 2 });
});

test('IC02: an ISO code with a scale other than the official one is rejected', () => {
  for (const scale of [0, 1, 3, 4, 5, 6]) {
    assert.throws(() => Currency.create('UYU', scale), assertInvalidCurrency(OFFICIAL_SCALE), `scale: ${scale}`);
  }
});

test('IC03: a well-formed code missing from ISO 4217 is accepted as an own currency', () => {
  const own = Currency.create('ABC', 2);

  assert.equal(own.code, 'ABC');
  assert.equal(own.scale, 2);
  assert.deepEqual(own.toJSON(), { code: 'ABC', scale: 2 });
});

test('IC04: an ISO code without a decimal minor unit is rejected with its own reason', () => {
  for (const code of listIsoCurrenciesWithoutMinorUnit()) {
    assert.throws(() => Currency.create(code, 0), assertInvalidCurrency(NO_MINOR_UNIT), `code: ${code}`);
  }
});

test('IC05: the official scales 0, 3 and 4 are representable', () => {
  assert.equal(Currency.create('CLP', 0).scale, 0);
  assert.equal(Currency.create('KWD', 3).scale, 3);
  assert.equal(Currency.create('CLF', 4).scale, 4);
  assert.equal(Currency.create('JPY', 0).scale, 0);
});

test('IC06: fromJSON accepts a code outside ISO 4217 and keeps its stored scale', () => {
  assert.deepEqual(Currency.fromJSON({ code: 'ABC', scale: 3 }), Currency.create('ABC', 3));
});

test('IC07: fromJSON with a non-official scale fails like create', () => {
  assert.throws(() => Currency.fromJSON({ code: 'UYU', scale: 0 }), assertInvalidCurrency(OFFICIAL_SCALE));
});

test('IC08: a malformed code is rejected before the catalog is consulted', () => {
  for (const code of ['usd', 'US', 'USDX', ' UYU', 'U U', '12A', '', 'ÜYU']) {
    assert.throws(() => Currency.create(code, 2), assertInvalidCurrency(FORMAT), `code: ${code}`);
  }
});

test('IC09: a scale outside the structural range is rejected', () => {
  for (const scale of [-1, 2.5, 7, NaN, Infinity]) {
    assert.throws(() => Currency.create('UYU', scale), assertInvalidCurrency(RANGE), `scale: ${String(scale)}`);
  }
});

test('IC10: the incorporated table holds 165 decimal currencies and 13 without a minor unit', () => {
  const withScale = listIsoCurrencies();
  const withoutMinorUnit = listIsoCurrenciesWithoutMinorUnit();

  assert.equal(withScale.length, 165);
  assert.equal(withoutMinorUnit.length, 13);
  assert.match(ISO_4217_PUBLISHED, /^\d{4}-\d{2}-\d{2}$/);
});

test('IC10: the table is ordered, disjoint and every entry is constructible', () => {
  const withScale = listIsoCurrencies();
  const withoutMinorUnit = listIsoCurrenciesWithoutMinorUnit();
  const codes = withScale.map((entry) => entry.code);

  assert.deepEqual(codes, [...codes].sort());
  assert.deepEqual(withoutMinorUnit, [...withoutMinorUnit].sort());
  assert.equal(codes.some((code) => withoutMinorUnit.includes(code)), false);

  for (const { code, scale } of withScale) {
    assert.ok(Number.isInteger(scale) && scale >= 0 && scale <= 6, `scale of ${code}: ${scale}`);
    assert.equal(Currency.create(code, scale).scale, scale, `code: ${code}`);
  }
});

// IC11 anchors: counts alone let an unintended table change pass. These lists are the tripwire.
test('IC11: every non-2 scale is anchored code by code', () => {
  const expected = {
    0: ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'],
    3: ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'],
    4: ['CLF', 'UYW'],
  };

  for (const [scale, codes] of Object.entries(expected)) {
    const actual = listIsoCurrencies()
      .filter((entry) => entry.scale === Number(scale))
      .map((entry) => entry.code);

    assert.deepEqual(actual, codes, `scale ${scale}`);
  }
});

test('IC11: the codes without a decimal minor unit are anchored', () => {
  assert.deepEqual(listIsoCurrenciesWithoutMinorUnit(), [
    'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XDR', 'XPD', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX',
  ]);
});

// Own currencies: the caller owns the scale, and the range stays structural.
test('IC12: an own currency is accepted at both ends of the scale range', () => {
  assert.equal(Currency.create('ABC', 0).scale, 0);
  assert.equal(Currency.create('XYZ', 6).scale, 6);

  for (const scale of [-1, 7, 1.5]) {
    assert.throws(() => Currency.create('ABC', scale), assertInvalidCurrency(RANGE), `scale: ${String(scale)}`);
  }
});

test('IC13: the same own code with two scales is two different currencies', () => {
  const whole = Currency.create('XBT', 0);
  const fractional = Currency.create('XBT', 6);

  assert.equal(whole.equals(fractional), false);
  assert.throws(
    () => Money.fromDecimal('1', whole).add(Money.fromDecimal('1', fractional)),
    (error) => {
      assert.equal(error.code, 'CURRENCY_MISMATCH');
      return true;
    },
  );
});

// A code ISO retired leaves the catalog and falls into the own-currency regime, so the
// persisted scale becomes the only authority and the historical amount stays readable.
test('IC14: a code retired by ISO is read with the scale that was persisted', () => {
  const hrk = Currency.fromJSON({ code: 'HRK', scale: 2 });

  assert.equal(hrk.scale, 2);
  assert.equal(Money.fromJSON({ minorUnits: '1050', currency: { code: 'HRK', scale: 2 } }).toDecimal(), '10.50');
});
