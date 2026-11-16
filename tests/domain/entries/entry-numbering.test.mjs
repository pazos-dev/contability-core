import test from 'node:test';
import assert from 'node:assert/strict';

import { AccountingDate, Currency, EntryError, JournalEntry, JournalEntryLine, Money } from '../../../dist/index.js';

const uyu = Currency.create('UYU', 2);

function money(text) {
  return Money.fromDecimal(text, uyu);
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

function balanced() {
  return JournalEntry.createDraft({
    id: 'entry-1',
    ledgerId: 'ledger-1',
    journalId: 'journal-1',
    periodId: 'period-1',
    accountingDate: AccountingDate.create('2026-03-15'),
    description: 'Electricity expense',
  })
    .addLine(line())
    .addLine(line({ id: 'line-2', accountId: 'account-2', side: 'CREDIT' }));
}

function assertEntryError(code) {
  return (error) => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error?.name}: ${error?.message}`);
    assert.equal(error.code, code, error.message);
    return true;
  };
}

test('N01: post stores the number it is given and the entry keeps it', () => {
  const posted = balanced().post(7);

  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.number, 7);
});

test('N09: a draft carries no number', () => {
  assert.equal(balanced().number, undefined);
});

test('N10: post rejects anything that is not a positive integer', () => {
  for (const received of [0, -1, 1.5, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => balanced().post(received), assertEntryError('ENTRY_NUMBER_INVALID'));
  }
});

test('N05: a second post is rejected and the number does not change', () => {
  const posted = balanced().post(1);

  assert.throws(() => posted.post(2), assertEntryError('ENTRY_STATE'));
  assert.equal(posted.number, 1);
});

test('N06: a reversal draft has no number and receives its own when posted', () => {
  const posted = balanced().post(3);
  const reversal = posted.createReversalDraft({
    id: 'entry-2',
    periodId: 'period-2',
    accountingDate: AccountingDate.create('2026-04-15'),
  });

  assert.equal(reversal.status, 'DRAFT');
  assert.equal(reversal.number, undefined);

  const postedReversal = reversal.post(4);

  assert.equal(postedReversal.number, 4);
  assert.equal(postedReversal.reversalOfEntryId, 'entry-1');
  assert.equal(posted.number, 3);
});
