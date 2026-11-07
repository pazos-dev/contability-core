import test from 'node:test';
import assert from 'node:assert/strict';

import { AccountingDate, AccountingPeriod, PeriodError } from '../dist/index.js';

const d = (text) => AccountingDate.create(text);

const base = () => ({
  id: 'per-1',
  ledgerId: 'ledger-1',
  name: 'Enero 2026',
  startDate: d('2026-01-01'),
  endDate: d('2026-01-31'),
});

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof PeriodError, `expected PeriodError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('P01: the start and end dates belong to the period', () => {
  const period = AccountingPeriod.create(base());

  assert.equal(period.contains(d('2026-01-01')), true);
  assert.equal(period.contains(d('2026-01-31')), true);
  assert.equal(period.contains(d('2026-01-15')), true);
});

test('P02: the day before or after does not belong to the period', () => {
  const period = AccountingPeriod.create(base());

  assert.equal(period.contains(d('2025-12-31')), false);
  assert.equal(period.contains(d('2026-02-01')), false);
});

test('P03: a start date after the end date is rejected and a single day is valid', () => {
  assert.throws(() => AccountingPeriod.create({ ...base(), startDate: d('2026-02-01') }), assertCode('INVALID_PERIOD'));

  const singleDay = AccountingPeriod.create({ ...base(), startDate: d('2026-01-15'), endDate: d('2026-01-15') });
  assert.equal(singleDay.contains(d('2026-01-15')), true);
  assert.equal(singleDay.contains(d('2026-01-16')), false);
});

test('P04: only real dates are accepted, including leap years', () => {
  assert.equal(d('2024-02-29').value, '2024-02-29');
  assert.equal(d('2000-02-29').value, '2000-02-29');

  assert.throws(() => d('2026-02-29'), assertCode('INVALID_DATE'));
  assert.throws(() => d('1900-02-29'), assertCode('INVALID_DATE'));
  assert.throws(() => d('2023-02-29'), assertCode('INVALID_DATE'));
});

test('P06: closing an open period marks it CLOSED and keeps its data', () => {
  const open = AccountingPeriod.create(base());
  const closed = open.close();

  assert.equal(open.status, 'OPEN');
  assert.equal(open.isOpen(), true);
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.isOpen(), false);
  assert.equal(closed.id, open.id);
  assert.equal(closed.ledgerId, open.ledgerId);
  assert.equal(closed.name, open.name);
  assert.equal(closed.startDate.value, open.startDate.value);
  assert.equal(closed.endDate.value, open.endDate.value);
  assert.equal(closed.contains(d('2026-01-15')), true);
});

test('closing an already closed period fails with a state error', () => {
  const closed = AccountingPeriod.create(base()).close();

  assert.throws(() => closed.close(), assertCode('PERIOD_ALREADY_CLOSED'));
});

test('date text must follow YYYY-MM-DD exactly', () => {
  for (const text of ['2026-1-09', '2026-01-9', '20260109', ' 2026-01-09', '2026-01-09 ', '2026/01/09', '', 'x']) {
    assert.throws(() => d(text), assertCode('INVALID_DATE'), `text: ${JSON.stringify(text)}`);
  }

  for (const value of [null, undefined, 20260109, new Date('2026-01-09'), {}, true]) {
    assert.throws(() => AccountingDate.create(value), assertCode('INVALID_DATE'), `value: ${String(value)}`);
  }
});

test('impossible month and day numbers are rejected without normalisation', () => {
  for (const text of ['2026-00-10', '2026-13-10', '2026-01-00', '2026-01-32', '2026-04-31', '0000-01-01']) {
    assert.throws(() => d(text), assertCode('INVALID_DATE'), `text: ${text}`);
  }

  assert.equal(d('2026-04-30').value, '2026-04-30');
  assert.equal(d('2026-12-31').value, '2026-12-31');
});

test('period identifiers, name and dates are validated', () => {
  for (const field of ['id', 'ledgerId', 'name']) {
    for (const value of ['', '   ', ' per-1', 'per-1 ', null, 5]) {
      assert.throws(() => AccountingPeriod.create({ ...base(), [field]: value }), assertCode('INVALID_PERIOD'));
    }
  }

  assert.throws(() => AccountingPeriod.create({ ...base(), startDate: '2026-01-01' }), assertCode('INVALID_PERIOD'));
  assert.throws(() => AccountingPeriod.create({ ...base(), endDate: null }), assertCode('INVALID_PERIOD'));
  assert.throws(() => AccountingPeriod.create(null), assertCode('INVALID_PERIOD'));
});

test('mutating the received input does not alter an existing period', () => {
  const input = base();
  const period = AccountingPeriod.create(input);

  input.id = 'per-other';
  input.name = 'Otro';
  input.startDate = d('2020-01-01');

  assert.equal(period.id, 'per-1');
  assert.equal(period.name, 'Enero 2026');
  assert.equal(period.startDate.value, '2026-01-01');
  assert.throws(() => {
    period.name = 'Otro';
  }, TypeError);
});

test('AccountingDate compares and equals by calendar position', () => {
  const early = d('2024-02-29');
  const late = d('2024-03-01');

  assert.equal(early.compare(late), -1);
  assert.equal(late.compare(early), 1);
  assert.equal(early.compare(d('2024-02-29')), 0);
  assert.equal(early.equals(d('2024-02-29')), true);
  assert.equal(early.equals(late), false);
  assert.equal(early.toString(), '2024-02-29');
  assert.deepEqual(early.toJSON(), '2024-02-29');
  assert.throws(() => early.compare('2024-03-01'), assertCode('INVALID_DATE'));
});
