import test from 'node:test';
import assert from 'node:assert/strict';

import { Journal, JournalError } from '../dist/index.js';

const base = {
  id: 'jrn-1',
  ledgerId: 'ledger-1',
  code: 'GEN',
  name: 'Diario general',
};

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof JournalError, `expected JournalError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('J01: a valid journal is created active inside its ledger', () => {
  const journal = Journal.create({ ...base });

  assert.equal(journal.id, 'jrn-1');
  assert.equal(journal.ledgerId, 'ledger-1');
  assert.equal(journal.code, 'GEN');
  assert.equal(journal.name, 'Diario general');
  assert.equal(journal.status, 'ACTIVE');
  assert.equal(journal.isActive(), true);
  assert.throws(() => {
    journal.name = 'Ventas';
  }, TypeError);
  assert.equal(journal.name, 'Diario general');
});

test('J02: empty id, ledger, code or name are rejected', () => {
  for (const field of ['id', 'ledgerId', 'code', 'name']) {
    for (const value of ['', '   ', null, undefined, 5, {}]) {
      assert.throws(
        () => Journal.create({ ...base, [field]: value }),
        assertCode('INVALID_JOURNAL'),
        `${field}: ${String(value)}`,
      );
    }
  }

  assert.throws(() => Journal.create(null), assertCode('INVALID_JOURNAL'));
});

test('deactivating keeps identity and ledger and leaves the original active', () => {
  const original = Journal.create({ ...base });
  const inactive = original.deactivate();

  assert.equal(inactive.status, 'INACTIVE');
  assert.equal(inactive.isActive(), false);
  assert.equal(inactive.id, original.id);
  assert.equal(inactive.ledgerId, original.ledgerId);
  assert.equal(inactive.code, original.code);
  assert.equal(inactive.name, original.name);
  assert.equal(original.status, 'ACTIVE');
  assert.equal(inactive.deactivate().status, 'INACTIVE');
});

test('mutating the received input does not alter an existing journal', () => {
  const input = { ...base };
  const journal = Journal.create(input);

  input.id = 'jrn-other';
  input.ledgerId = 'ledger-other';
  input.code = 'SAL';
  input.name = 'Ventas';

  assert.equal(journal.id, 'jrn-1');
  assert.equal(journal.ledgerId, 'ledger-1');
  assert.equal(journal.code, 'GEN');
  assert.equal(journal.name, 'Diario general');
});

test('a journal keeps no entries: it only identifies the journal within the ledger', () => {
  const journal = Journal.create({ ...base, entries: [] });

  assert.equal('entries' in journal, false);
  assert.equal(Object.keys(journal).length, 0);
});
