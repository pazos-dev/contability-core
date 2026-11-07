import { describeValue } from '../describe-value.js';
import { AccountCode } from './account-code.js';
import { accountSelfParent, invalidAccount } from './account-errors.js';
import { ACCOUNT_TYPES, isAccountType, type AccountType } from './account-type.js';

export type AccountStatus = 'ACTIVE' | 'INACTIVE';

/** Input data of a new account; ids are opaque values received from the caller. */
export interface AccountInput {
  readonly id: string;
  readonly chartOfAccountsId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId?: string;
  readonly postingAllowed: boolean;
}

interface AccountFields {
  readonly id: string;
  readonly chartOfAccountsId: string;
  readonly code: AccountCode;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId: string | undefined;
  readonly postingAllowed: boolean;
  readonly status: AccountStatus;
}

/**
 * Immutable accounting account. It only enforces local invariants: hierarchy
 * inside one plan, cycles, code uniqueness and posting rules across accounts
 * belong to the application layer with a repository.
 */
export class Account {
  readonly #id: string;
  readonly #chartOfAccountsId: string;
  readonly #code: AccountCode;
  readonly #name: string;
  readonly #type: AccountType;
  readonly #parentId: string | undefined;
  readonly #postingAllowed: boolean;
  readonly #status: AccountStatus;

  private constructor(fields: AccountFields) {
    this.#id = fields.id;
    this.#chartOfAccountsId = fields.chartOfAccountsId;
    this.#code = fields.code;
    this.#name = fields.name;
    this.#type = fields.type;
    this.#parentId = fields.parentId;
    this.#postingAllowed = fields.postingAllowed;
    this.#status = fields.status;
    Object.freeze(this);
  }

  static create(input: AccountInput): Account {
    if (typeof input !== 'object' || input === null) {
      throw invalidAccount(`expected an input object, received ${describeValue(input)}`);
    }

    const id = requireIdentifier(input.id, 'id');
    const chartOfAccountsId = requireIdentifier(input.chartOfAccountsId, 'chartOfAccountsId');
    const code = AccountCode.create(input.code);
    const name = requireName(input.name);
    const type = requireType(input.type);
    const parentId = input.parentId === undefined ? undefined : requireParentId(input.parentId, id);
    const postingAllowed = requirePostingAllowed(input.postingAllowed);

    return new Account({ id, chartOfAccountsId, code, name, type, parentId, postingAllowed, status: 'ACTIVE' });
  }

  get id(): string {
    return this.#id;
  }

  get chartOfAccountsId(): string {
    return this.#chartOfAccountsId;
  }

  get code(): AccountCode {
    return this.#code;
  }

  get name(): string {
    return this.#name;
  }

  get type(): AccountType {
    return this.#type;
  }

  get parentId(): string | undefined {
    return this.#parentId;
  }

  get postingAllowed(): boolean {
    return this.#postingAllowed;
  }

  get status(): AccountStatus {
    return this.#status;
  }

  isActive(): boolean {
    return this.#status === 'ACTIVE';
  }

  /** Returns a renamed copy; the original instance stays unchanged. */
  rename(name: string): Account {
    return this.#copyWith({ name: requireName(name) });
  }

  /** Returns an inactive copy; deactivation keeps history and is idempotent. */
  deactivate(): Account {
    return this.#copyWith({ status: 'INACTIVE' });
  }

  #copyWith(changes: { readonly name?: string; readonly status?: AccountStatus }): Account {
    return new Account({
      id: this.#id,
      chartOfAccountsId: this.#chartOfAccountsId,
      code: this.#code,
      name: changes.name ?? this.#name,
      type: this.#type,
      parentId: this.#parentId,
      postingAllowed: this.#postingAllowed,
      status: changes.status ?? this.#status,
    });
  }
}

function requireIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidAccount(`${field} must be a non-empty string, received ${describeValue(value)}`);
  }
  return value;
}

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidAccount(`name must be a non-empty string, received ${describeValue(value)}`);
  }
  if (value !== value.trim()) {
    throw invalidAccount(`name must not have leading or trailing whitespace, received ${describeValue(value)}`);
  }
  return value;
}

function requireType(value: unknown): AccountType {
  if (!isAccountType(value)) {
    throw invalidAccount(`type ${describeValue(value)} must be one of ${ACCOUNT_TYPES.join(', ')}`);
  }
  return value;
}

function requireParentId(value: unknown, id: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidAccount(`parentId must be a non-empty string, received ${describeValue(value)}`);
  }
  if (value === id) {
    throw accountSelfParent(id);
  }
  return value;
}

function requirePostingAllowed(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw invalidAccount(`postingAllowed must be a boolean, received ${describeValue(value)}`);
  }
  return value;
}
