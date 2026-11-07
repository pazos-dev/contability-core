import test from 'node:test';
import assert from 'node:assert/strict';

import { Account, AccountCode, AccountError } from '../dist/index.js';

const base = {
  id: 'acc-1',
  chartOfAccountsId: 'plan-1',
  code: '001.01',
  name: 'Caja',
  type: 'ASSET',
  postingAllowed: true,
};

function assertCode(code) {
  return (error) => {
    assert.ok(error instanceof AccountError, `expected AccountError, got ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

test('A01: account code is preserved as text', () => {
  const account = Account.create({ ...base, code: '0001.0100' });

  assert.equal(account.code.value, '0001.0100');
  assert.equal(account.code.toString(), '0001.0100');
  assert.equal(AccountCode.create('001.01').equals(AccountCode.create('001.01')), true);
  assert.equal(AccountCode.create('001.01').equals(AccountCode.create('1.01')), false);
});

test('A02: empty id, chart, code or name are rejected', () => {
  for (const field of ['id', 'chartOfAccountsId', 'name']) {
    assert.throws(() => Account.create({ ...base, [field]: '' }), assertCode('INVALID_ACCOUNT'), `field: ${field}`);
  }

  assert.throws(() => Account.create({ ...base, code: '' }), assertCode('INVALID_ACCOUNT_CODE'));
});

test('A03: an account cannot be its own parent', () => {
  assert.throws(() => Account.create({ ...base, parentId: base.id }), assertCode('ACCOUNT_SELF_PARENT'));

  const child = Account.create({ ...base, id: 'acc-child', parentId: 'acc-1' });
  assert.equal(child.parentId, 'acc-1');
  assert.notEqual(child.parentId, child.id);
});

test('A08: mutating the received input does not alter protected state', () => {
  const input = { ...base };
  const account = Account.create(input);

  input.id = 'acc-other';
  input.chartOfAccountsId = 'plan-other';
  input.code = '999';
  input.name = 'Hackeada';
  input.type = 'EXPENSE';
  input.parentId = 'acc-parent';
  input.postingAllowed = false;

  assert.equal(account.id, 'acc-1');
  assert.equal(account.chartOfAccountsId, 'plan-1');
  assert.equal(account.code.value, '001.01');
  assert.equal(account.name, 'Caja');
  assert.equal(account.type, 'ASSET');
  assert.equal(account.parentId, undefined);
  assert.equal(account.postingAllowed, true);
  assert.throws(() => {
    account.name = 'Hackeada';
  }, TypeError);
  assert.equal(account.name, 'Caja');
});

test('code and name reject outer whitespace instead of trimming it', () => {
  for (const code of [' 001', '001 ', ' 001 ']) {
    assert.throws(() => Account.create({ ...base, code }), assertCode('INVALID_ACCOUNT_CODE'), `code: ${code}`);
  }
  for (const name of [' Caja', 'Caja ', '  Caja  ', '   ']) {
    assert.throws(() => Account.create({ ...base, name }), assertCode('INVALID_ACCOUNT'), `name: ${name}`);
  }
});

test('AccountCode rejects empty and whitespace-padded values', () => {
  for (const value of ['', ' ', ' 001', '001 ']) {
    assert.throws(() => AccountCode.create(value), assertCode('INVALID_ACCOUNT_CODE'), `value: ${value}`);
  }

  assert.equal(AccountCode.create('001.01').value, '001.01');
});

test('type must be one of the closed account types', () => {
  for (const type of ['ASSET ', 'asset', 'OTHER', '', null, undefined, 1, {}]) {
    assert.throws(() => Account.create({ ...base, type }), assertCode('INVALID_ACCOUNT'), `type: ${String(type)}`);
  }

  for (const type of ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']) {
    assert.equal(Account.create({ ...base, type }).type, type);
  }
});

test('postingAllowed must be an explicit boolean', () => {
  for (const postingAllowed of ['true', 1, 0, null, undefined]) {
    assert.throws(
      () => Account.create({ ...base, postingAllowed }),
      assertCode('INVALID_ACCOUNT'),
      `postingAllowed: ${String(postingAllowed)}`,
    );
  }

  assert.equal(Account.create({ ...base, postingAllowed: false }).postingAllowed, false);
});

test('identifiers must be non-empty strings', () => {
  for (const field of ['id', 'chartOfAccountsId']) {
    for (const value of ['', '   ', ' acc-1', 'acc-1 ', null, undefined, 5, {}]) {
      assert.throws(
        () => Account.create({ ...base, [field]: value }),
        assertCode('INVALID_ACCOUNT'),
        `${field}: ${String(value)}`,
      );
    }
  }

  assert.throws(() => Account.create(null), assertCode('INVALID_ACCOUNT'));
});

test('parentId is optional but must be a non-empty identifier', () => {
  assert.equal(Account.create({ ...base }).parentId, undefined);
  assert.equal(Account.create({ ...base, parentId: 'acc-parent' }).parentId, 'acc-parent');

  for (const parentId of ['', '   ', ' acc-parent', 'acc-parent ', 5, null]) {
    assert.throws(() => Account.create({ ...base, parentId }), assertCode('INVALID_ACCOUNT'), `parentId: ${String(parentId)}`);
  }
});

test('rename returns a new account and keeps its identity', () => {
  const original = Account.create({ ...base });
  const renamed = original.rename('Caja chica');

  assert.equal(renamed.name, 'Caja chica');
  assert.equal(original.name, 'Caja');
  assert.equal(renamed.id, original.id);
  assert.equal(renamed.chartOfAccountsId, original.chartOfAccountsId);
  assert.equal(renamed.code.value, original.code.value);
  assert.equal(renamed.type, original.type);
  assert.equal(renamed.status, 'ACTIVE');

  assert.throws(() => original.rename(''), assertCode('INVALID_ACCOUNT'));
  assert.throws(() => original.rename(' Caja chica '), assertCode('INVALID_ACCOUNT'));
});

test('deactivate returns an inactive copy and keeps the original active', () => {
  const original = Account.create({ ...base });
  const inactive = original.deactivate();

  assert.equal(original.status, 'ACTIVE');
  assert.equal(original.isActive(), true);
  assert.equal(inactive.status, 'INACTIVE');
  assert.equal(inactive.isActive(), false);
  assert.equal(inactive.id, original.id);
  assert.equal(inactive.postingAllowed, true);
  assert.equal(inactive.deactivate().status, 'INACTIVE');
});

test('activate returns an active copy keeping identity and history', () => {
  const original = Account.create({ ...base });
  const inactive = original.deactivate();
  const active = inactive.activate();

  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.isActive(), true);
  assert.equal(inactive.status, 'INACTIVE');
  assert.equal(active.id, original.id);
  assert.equal(active.chartOfAccountsId, original.chartOfAccountsId);
  assert.equal(active.code.value, original.code.value);
  assert.equal(active.name, original.name);
  assert.equal(active.activate().status, 'ACTIVE');
});
