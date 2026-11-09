import test from 'node:test';
import assert from 'node:assert/strict';

import { AccountingDate, Currency, EntryError, JournalEntry, JournalEntryLine, Money } from '../dist/index.js';

const uyu = Currency.create('UYU', 2);
const usd = Currency.create('USD', 2);

const draftInput = {
  id: 'entry-1',
  ledgerId: 'ledger-1',
  journalId: 'journal-1',
  periodId: 'period-1',
  accountingDate: AccountingDate.create('2026-03-15'),
  description: 'Electricity expense',
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

// A balanced draft: 1.000,00 debit against 1.000,00 credit.
function balanced() {
  return JournalEntry.createDraft({ ...draftInput })
    .addLine(line())
    .addLine(line({ id: 'line-2', accountId: 'account-2', side: 'CREDIT' }));
}

function assertEntryError(code) {
  return (error) => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('E01: a balanced two-line draft becomes POSTED without altering the draft', () => {
  const draft = balanced();

  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.lines.length, 2);

  const posted = draft.post();

  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.lines.length, 2);
  assert.equal(posted.id, draft.id);
  assert.equal(posted.ledgerId, 'ledger-1');
  assert.equal(posted.journalId, 'journal-1');
  assert.equal(posted.periodId, 'period-1');
  assert.equal(posted.accountingDate.value, '2026-03-15');
  assert.equal(posted.description, 'Electricity expense');
  assert.equal(posted.reversalOfEntryId, undefined);

  // The transition returns a new entry: the draft is still a draft.
  assert.equal(draft.status, 'DRAFT');
});

test('E02: posting needs at least two lines', () => {
  const empty = JournalEntry.createDraft({ ...draftInput });

  assert.throws(() => empty.post(), assertEntryError('ENTRY_INCOMPLETE'));
  assert.equal(empty.status, 'DRAFT');

  const single = JournalEntry.createDraft({ ...draftInput }).addLine(line());

  assert.throws(() => single.post(), assertEntryError('ENTRY_INCOMPLETE'));
  assert.equal(single.status, 'DRAFT');
});

test('E03: unequal totals are rejected exactly, even by one minor unit', () => {
  const offByOneCent = JournalEntry.createDraft({ ...draftInput })
    .addLine(line())
    .addLine(line({ id: 'line-2', side: 'CREDIT', amount: money('999.99') }));

  assert.throws(() => offByOneCent.post(), assertEntryError('ENTRY_UNBALANCED'));
  assert.equal(offByOneCent.status, 'DRAFT');

  // The smallest possible difference: 0,01 against 0,02. No tolerance is applied.
  const oneMinorUnitApart = JournalEntry.createDraft({ ...draftInput })
    .addLine(line({ amount: money('0.01') }))
    .addLine(line({ id: 'line-2', side: 'CREDIT', amount: money('0.02') }));

  assert.throws(() => oneMinorUnitApart.post(), assertEntryError('ENTRY_UNBALANCED'));
  assert.equal(oneMinorUnitApart.status, 'DRAFT');
});

test('E04: a zero or negative amount and an invalid side are rejected when the line is created', () => {
  for (const amount of [money('0.00'), money('-0.01'), money('-1000.00')]) {
    assert.throws(() => line({ amount }), assertEntryError('INVALID_ENTRY_LINE'), `amount: ${amount.toDecimal()}`);
  }

  for (const side of ['debit', 'DEBIT ', ' DEBIT', 'BOTH', '', null, undefined, 1]) {
    assert.throws(() => line({ side }), assertEntryError('INVALID_ENTRY_LINE'), `side: ${String(side)}`);
  }
});

test('E04: a line rejects a malformed id, account or description', () => {
  for (const field of ['id', 'accountId']) {
    for (const value of ['', '   ', ' id', 'id ', null, undefined, 7, {}]) {
      assert.throws(() => line({ [field]: value }), assertEntryError('INVALID_ENTRY_LINE'), `${field}: ${String(value)}`);
    }
  }

  for (const description of ['', ' text', 'text ']) {
    assert.throws(() => line({ description }), assertEntryError('INVALID_ENTRY_LINE'), `description: ${JSON.stringify(description)}`);
  }

  assert.equal(line({ description: 'Utility bill' }).description, 'Utility bill');
  assert.equal(line().description, undefined);
});

test('E05: all lines must share one currency definition, code and scale included', () => {
  const mixedCurrency = JournalEntry.createDraft({ ...draftInput })
    .addLine(line())
    .addLine(line({ id: 'line-2', side: 'CREDIT', amount: money('1000.00', usd) }));

  assert.throws(() => mixedCurrency.post(), assertEntryError('ENTRY_CURRENCY_MISMATCH'));
  assert.equal(mixedCurrency.status, 'DRAFT');

  // Own currencies carry their scale: the same code with another scale is another currency.
  const whole = Currency.create('ABC', 0);
  const thirds = Currency.create('ABC', 3);
  const mixedScale = JournalEntry.createDraft({ ...draftInput })
    .addLine(line({ amount: money('1000', whole) }))
    .addLine(line({ id: 'line-2', side: 'CREDIT', amount: money('1000.000', thirds) }));

  assert.throws(() => mixedScale.post(), assertEntryError('ENTRY_CURRENCY_MISMATCH'));
});

test('E06: a POSTED entry rejects addLine and removeLine and keeps its content', () => {
  const posted = balanced().post();

  assert.throws(() => posted.addLine(line({ id: 'line-3' })), assertEntryError('ENTRY_STATE'));
  assert.throws(() => posted.removeLine('line-1'), assertEntryError('ENTRY_STATE'));

  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.lines.length, 2);
  assert.deepEqual(
    posted.lines.map((entryLine) => entryLine.id),
    ['line-1', 'line-2'],
  );
});

test('E07: two lines cannot share an id inside the same entry', () => {
  const draft = JournalEntry.createDraft({ ...draftInput }).addLine(line());

  assert.throws(() => draft.addLine(line({ side: 'CREDIT' })), assertEntryError('DUPLICATE_LINE_ID'));
  assert.equal(draft.lines.length, 1);
});

test('E08: a rejected post leaves the draft exactly as it was and it can still be fixed', () => {
  const draft = JournalEntry.createDraft({ ...draftInput })
    .addLine(line())
    .addLine(line({ id: 'line-2', side: 'CREDIT', amount: money('1.00') }));

  assert.throws(() => draft.post(), assertEntryError('ENTRY_UNBALANCED'));

  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.lines.length, 2);
  assert.deepEqual(
    draft.lines.map((entryLine) => [entryLine.id, entryLine.side, entryLine.amount.toDecimal()]),
    [
      ['line-1', 'DEBIT', '1000.00'],
      ['line-2', 'CREDIT', '1.00'],
    ],
  );

  const fixed = draft.removeLine('line-2').addLine(line({ id: 'line-3', side: 'CREDIT' }));

  assert.equal(fixed.post().status, 'POSTED');
});

test('E09: a reversal draft swaps sides, keeps amounts and links the original', () => {
  const posted = balanced().post();
  const reversal = posted.createReversalDraft({
    id: 'entry-2',
    periodId: 'period-2',
    accountingDate: AccountingDate.create('2026-04-01'),
  });

  assert.equal(reversal.status, 'DRAFT');
  assert.equal(reversal.id, 'entry-2');
  assert.equal(reversal.periodId, 'period-2');
  assert.equal(reversal.accountingDate.value, '2026-04-01');
  assert.equal(reversal.reversalOfEntryId, 'entry-1');
  assert.equal(reversal.ledgerId, posted.ledgerId);
  assert.equal(reversal.journalId, posted.journalId);

  const original = posted.lines.map((entryLine) => [entryLine.side, entryLine.amount.toDecimal()]);
  const mirrored = reversal.lines.map((entryLine) => [entryLine.side, entryLine.amount.toDecimal()]);

  assert.deepEqual(mirrored, [
    ['CREDIT', '1000.00'],
    ['DEBIT', '1000.00'],
  ]);
  assert.deepEqual(
    original,
    [
      ['DEBIT', '1000.00'],
      ['CREDIT', '1000.00'],
    ],
  );

  // The reversal is a normal draft: it posts, and the original stays POSTED and unchanged.
  assert.equal(reversal.post().status, 'POSTED');
  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.reversalOfEntryId, undefined);
});

test('E09: only a POSTED entry can be reversed and the reversal needs its own id', () => {
  const draft = balanced();

  assert.throws(
    () => draft.createReversalDraft({ id: 'entry-2', periodId: 'period-2', accountingDate: AccountingDate.create('2026-04-01') }),
    assertEntryError('ENTRY_STATE'),
  );

  const posted = draft.post();

  assert.throws(
    () => posted.createReversalDraft({ id: 'entry-1', periodId: 'period-2', accountingDate: AccountingDate.create('2026-04-01') }),
    assertEntryError('INVALID_ENTRY'),
  );
});

test('E10: the lines snapshot cannot be used to change the entry', () => {
  const draft = balanced();
  const snapshot = draft.lines;

  assert.equal(Array.isArray(snapshot), true);
  assert.throws(() => {
    snapshot.push(line({ id: 'line-3' }));
  }, TypeError);
  assert.throws(() => {
    snapshot.length = 0;
  }, TypeError);
  assert.throws(() => {
    snapshot[0].side = 'CREDIT';
  }, TypeError);

  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0].side, 'DEBIT');

  // Every read hands out its own copy.
  assert.notEqual(draft.lines, draft.lines);
});

test('E11: posting a POSTED entry again is a state error', () => {
  const posted = balanced().post();

  assert.throws(() => posted.post(), assertEntryError('ENTRY_STATE'));
  assert.equal(posted.status, 'POSTED');
  assert.equal(posted.lines.length, 2);
});

test('a draft validates its own identity fields', () => {
  for (const field of ['id', 'ledgerId', 'journalId', 'periodId', 'description']) {
    for (const value of ['', '   ', ' value', 'value ', null, undefined, 3, {}]) {
      assert.throws(
        () => JournalEntry.createDraft({ ...draftInput, [field]: value }),
        assertEntryError('INVALID_ENTRY'),
        `${field}: ${String(value)}`,
      );
    }
  }

  assert.throws(
    () => JournalEntry.createDraft({ ...draftInput, accountingDate: '2026-03-15' }),
    assertEntryError('INVALID_ENTRY'),
  );
  assert.throws(() => JournalEntry.createDraft(null), assertEntryError('INVALID_ENTRY'));
});

test('removing a line that is not in the entry is rejected', () => {
  assert.throws(() => balanced().removeLine('line-9'), assertEntryError('ENTRY_LINE_NOT_FOUND'));
  assert.equal(balanced().removeLine('line-1').lines.length, 1);
});

// R1-001: a TypeScript-private constructor is still a normal public constructor at runtime. The
// construction token must make `new JournalEntry(...)` and `new JournalEntryLine(...)` unusable from
// plain JavaScript, so every instance comes from a factory that validates.
test('R1-001: the exported classes cannot be constructed around their factories', () => {
  assert.throws(
    () =>
      new JournalEntry({
        id: 'forged',
        ledgerId: 'ledger-1',
        journalId: 'journal-1',
        periodId: 'period-1',
        accountingDate: AccountingDate.create('2026-03-15'),
        description: 'forged',
        status: 'POSTED',
        lines: [],
        reversalOfEntryId: undefined,
      }),
    assertEntryError('INVALID_ENTRY'),
  );

  assert.throws(
    () =>
      new JournalEntryLine({
        id: 'forged',
        accountId: 'account-1',
        side: 'BOTH',
        amount: money('-1.00'),
        description: undefined,
      }),
    assertEntryError('INVALID_ENTRY_LINE'),
  );
});

// R3-001: the guards below are the only thing standing between a plain caller and a line with no
// usable amount, so each one is pinned instead of assumed.
test('R3-001: a line rejects a non-object input and an amount that is not a Money', () => {
  for (const input of [null, undefined, 'line-1', 42, true]) {
    assert.throws(
      () => JournalEntryLine.create(input),
      assertEntryError('INVALID_ENTRY_LINE'),
      `input: ${String(input)}`,
    );
  }

  for (const input of [[], { id: 'line-1' }]) {
    assert.throws(
      () => JournalEntryLine.create(input),
      assertEntryError('INVALID_ENTRY_LINE'),
      `input: ${JSON.stringify(input)}`,
    );
  }

  for (const amount of ['1000.00', 1000, 1000n, null, undefined, {}, true]) {
    assert.throws(
      () => line({ amount }),
      assertEntryError('INVALID_ENTRY_LINE'),
      `amount: ${String(amount)}`,
    );
  }
});
