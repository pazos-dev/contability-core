import test from 'node:test';
import assert from 'node:assert/strict';

import { Currency, Ledger, LedgerError } from '../../../dist/index.js';

const base = {
  id: 'ledger-1',
  name: 'Libro comercial',
  chartOfAccountsId: 'chart-1',
  currency: Currency.create('UYU', 2),
};

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof LedgerError, `expected LedgerError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('L01: a valid ledger is created active with its chart of accounts', () => {
  const ledger = Ledger.create({ ...base });

  assert.equal(ledger.id, 'ledger-1');
  assert.equal(ledger.name, 'Libro comercial');
  assert.equal(ledger.chartOfAccountsId, 'chart-1');
  assert.equal(ledger.currency.code, 'UYU');
  assert.equal(ledger.currency.scale, 2);
  assert.equal(ledger.status, 'ACTIVE');
  assert.equal(ledger.isActive(), true);
});

test('L03: empty or padded id, name or chart of accounts are rejected instead of trimmed', () => {
  for (const field of ['id', 'name', 'chartOfAccountsId']) {
    for (const value of ['', '   ', ' ledger-1', 'ledger-1 ', null, undefined, 5, {}]) {
      assert.throws(
        () => Ledger.create({ ...base, [field]: value }),
        assertCode('INVALID_LEDGER'),
        `${field}: ${String(value)}`,
      );
    }
  }

  assert.throws(() => Ledger.create(null), assertCode('INVALID_LEDGER'));
});

test('L14: a ledger id with surrounding spaces is rejected at creation', () => {
  assert.throws(() => Ledger.create({ ...base, id: ' ledger-1 ' }), assertCode('INVALID_LEDGER'));
});

test('a ledger is immutable: status changes return copies and the original keeps its state', () => {
  const ledger = Ledger.create({ ...base });
  const inactive = ledger.deactivate();
  const activeAgain = inactive.activate();

  assert.notEqual(inactive, ledger);
  assert.equal(inactive.status, 'INACTIVE');
  assert.equal(inactive.isActive(), false);
  assert.equal(ledger.status, 'ACTIVE');

  assert.equal(activeAgain.status, 'ACTIVE');
  assert.equal(inactive.status, 'INACTIVE');

  for (const copy of [inactive, activeAgain]) {
    assert.equal(copy.id, 'ledger-1');
    assert.equal(copy.name, 'Libro comercial');
    assert.equal(copy.chartOfAccountsId, 'chart-1');
    assert.equal(copy.currency.code, 'UYU');
    assert.equal(copy.currency.scale, 2);
  }

  assert.throws(() => {
    ledger.status = 'INACTIVE';
  }, TypeError);
  assert.throws(() => {
    ledger.chartOfAccountsId = 'chart-2';
  }, TypeError);
  assert.throws(() => {
    ledger.currency = Currency.create('USD', 2);
  }, TypeError);
  assert.equal(ledger.status, 'ACTIVE');
  assert.equal(ledger.chartOfAccountsId, 'chart-1');
  assert.equal(ledger.currency.code, 'UYU');
});

test('L17: the ledger keeps the functional currency it was created with', () => {
  const ledger = Ledger.create({ ...base, currency: Currency.create('ABC', 4) });

  assert.equal(ledger.currency.code, 'ABC');
  assert.equal(ledger.currency.scale, 4);
});

test('L19: a ledger without a functional currency is rejected instead of assuming one', () => {
  for (const value of [undefined, null, '', 'UYU', { code: 'UYU', scale: 2 }]) {
    assert.throws(
      () => Ledger.create({ ...base, currency: value }),
      assertCode('INVALID_LEDGER'),
      `currency: ${String(value)}`,
    );
  }
});

test('repeating the current status is a no-op that keeps the same values', () => {
  const ledger = Ledger.create({ ...base });

  assert.equal(ledger.activate().status, 'ACTIVE');
  assert.equal(ledger.deactivate().deactivate().status, 'INACTIVE');
  assert.equal(ledger.rename('Libro fiscal').name, 'Libro fiscal');
  assert.equal(ledger.name, 'Libro comercial');
});

test('L21: renaming keeps the functional currency alongside the rest of the identity', () => {
  const ledger = Ledger.create({ ...base });
  const renamed = ledger.rename('Libro fiscal');

  assert.equal(renamed.name, 'Libro fiscal');
  assert.equal(renamed.currency.code, 'UYU');
  assert.equal(renamed.currency.scale, 2);
});
