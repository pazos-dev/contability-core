import test from 'node:test';
import assert from 'node:assert/strict';

import { Ledger, LedgerError } from '../../../dist/index.js';

const base = {
  id: 'ledger-1',
  name: 'Libro comercial',
  chartOfAccountsId: 'chart-1',
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
  }

  assert.throws(() => {
    ledger.status = 'INACTIVE';
  }, TypeError);
  assert.throws(() => {
    ledger.chartOfAccountsId = 'chart-2';
  }, TypeError);
  assert.equal(ledger.status, 'ACTIVE');
  assert.equal(ledger.chartOfAccountsId, 'chart-1');
});

test('repeating the current status is a no-op that keeps the same values', () => {
  const ledger = Ledger.create({ ...base });

  assert.equal(ledger.activate().status, 'ACTIVE');
  assert.equal(ledger.deactivate().deactivate().status, 'INACTIVE');
  assert.equal(ledger.rename('Libro fiscal').name, 'Libro fiscal');
  assert.equal(ledger.name, 'Libro comercial');
});
