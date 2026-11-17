import test from 'node:test';
import assert from 'node:assert/strict';

import { Currency, Money, MoneyFactor } from '../../../../dist/index.js';

const uyu = Currency.create('UYU', 2);
const u = (minorUnits) => Money.fromMinorUnits(minorUnits, uyu);
const sum = (parts) => parts.reduce((total, part) => total + part.minorUnits, 0n);

// Cases the independent review found correct by probing and unguarded against refactoring:
// the symmetry rules (4 and 5), the negative divisor path, rule 9's equivalence and rule 11's ceiling.

test('RB1: HALF_EVEN ties are symmetric on negative values', () => {
  assert.equal(u(-100n).multiply(MoneyFactor.fromDecimal('0.005'), 'HALF_EVEN').minorUnits, 0n);
  assert.equal(u(-300n).multiply(MoneyFactor.fromDecimal('0.005'), 'HALF_EVEN').minorUnits, -2n);
  assert.equal(u(-5n).divide(2n, 'HALF_EVEN').minorUnits, -2n);
  assert.equal(u(-7n).divide(2n, 'HALF_EVEN').minorUnits, -4n);
});

test('RB2: a negative divisor is the negation of the positive division in every mode', () => {
  for (const mode of ['HALF_UP', 'HALF_EVEN', 'DOWN']) {
    for (const [minorUnits, divisor] of [[100n, 3n], [-100n, 3n], [1n, 7n], [-7n, 2n]]) {
      assert.equal(u(minorUnits).divide(-divisor, mode).minorUnits, -u(minorUnits).divide(divisor, mode).minorUnits);
    }
  }
});

test('RB3: a negative factor flips the sign of the amount', () => {
  const factor = MoneyFactor.fromDecimal('-0.21');

  assert.equal(u(10000n).multiply(factor).toDecimal(), '-21.00');
  assert.equal(u(-10000n).multiply(factor).toDecimal(), '21.00');
});

test('RB4: allocate(n) equals allocate with n unit weights, and always adds up', () => {
  for (const count of [1, 3, 7, 11]) {
    for (const total of [0n, 1n, -1n, 10000n, -10000n, 10n ** 30n + 7n]) {
      const equalParts = u(total).allocate(count).map((part) => part.minorUnits);
      const weighted = u(total).allocate(Array.from({ length: count }, () => 1n)).map((part) => part.minorUnits);

      assert.deepEqual(equalParts, weighted);
      assert.equal(sum(equalParts.map(u)), total);
    }
  }
});

test('RB5: amounts above MAX_SAFE_INTEGER keep exact allocation and multiplication', () => {
  const total = 900719925474099301n;

  assert.equal(sum(u(total).allocate(7)), total);
  assert.equal(u(total).multiply(MoneyFactor.fromDecimal('3')).minorUnits, total * 3n);
});
