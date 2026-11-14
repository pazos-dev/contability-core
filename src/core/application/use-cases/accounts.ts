import { Account, type AccountStatus, type AccountType } from '../../domain/account/index.js';
import * as errors from '../errors.js';
import type { ApplicationDeps, UnitOfWorkScope } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './shared/index.js';

/** Serializable input of `registerAccount`: text and booleans only, no domain instances. */
export interface RegisterAccountInput {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  readonly type: AccountType;
  readonly parentId?: string;
  readonly postingAllowed: boolean;
  readonly idempotencyKey?: string;
}

export interface RegisterAccountResult {
  readonly ledgerId: string;
  readonly chartOfAccountsId: string;
  readonly accountId: string;
  readonly code: string;
  readonly status: AccountStatus;
}

/** Serializable input of `setAccountStatus`. */
export interface SetAccountStatusInput {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly status: AccountStatus;
}

export interface SetAccountStatusResult {
  readonly ledgerId: string;
  readonly accountId: string;
  readonly status: AccountStatus;
}

const REGISTER_OPERATION = 'registerAccount';

/**
 * Registers an account inside the chart of accounts the ledger resolves.
 *
 * It owns the rules the entity cannot decide alone: ledger-plan resolution (Q07), code uniqueness
 * inside the plan (A05), and the parent rules — same plan (A04), grouping parent, and no posted
 * movements (A06 precondition). A cycle is not reachable here: `parentId` never changes and a new id
 * has no descendants, so hierarchy stays acyclic by construction.
 */
export class RegisterAccount {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const { ledgerId, accountId, code, name, type, parentId, postingAllowed, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, accountId, code, name, type, parentId, postingAllowed });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<RegisterAccountResult>(
        scope,
        REGISTER_OPERATION,
        ledgerId,
        idempotencyKey,
        fingerprint,
      );
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      if ((await scope.accounts.findById(accountId)) !== undefined) throw errors.accountAlreadyExists(accountId);

      if ((await scope.accounts.findByCode(chartOfAccountsId, code)) !== undefined) {
        throw errors.accountCodeDuplicate(chartOfAccountsId, code);
      }

      if (parentId !== undefined) await requireGroupingParent(scope, parentId, chartOfAccountsId);

      const account = Account.create({
        id: accountId,
        chartOfAccountsId,
        code,
        name,
        type,
        postingAllowed,
        ...(parentId === undefined ? {} : { parentId }),
      });

      const result: RegisterAccountResult = {
        ledgerId,
        chartOfAccountsId,
        accountId: account.id,
        code: account.code.value,
        status: account.status,
      };

      await scope.accounts.save(account);
      await remember(scope, REGISTER_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/**
 * Activates or deactivates an account inside the plan the ledger resolves.
 *
 * Deactivating never deletes: the account keeps its identity, chart, code, name, parent and posting
 * flag, so its history stays readable (A07). Repeating the same status is a no-op, which is why this
 * use case does not ask for an idempotency key.
 */
export class SetAccountStatus {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: SetAccountStatusInput): Promise<SetAccountStatusResult> {
    const { ledgerId, accountId, status } = input;
    // A wrong value would otherwise fall into the "activate" branch and look like a successful call.
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw errors.invalidApplicationInput('status', status);

    return this.#deps.unitOfWork.run(async (scope) => {
      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      const account = await scope.accounts.findById(accountId);
      if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
        throw errors.accountNotFound(accountId);
      }

      const next = status === 'INACTIVE' ? account.deactivate() : account.activate();
      await scope.accounts.save(next);

      return { ledgerId, accountId: next.id, status: next.status };
    });
  }
}

async function requireGroupingParent(
  scope: UnitOfWorkScope,
  parentId: string,
  chartOfAccountsId: string,
): Promise<void> {
  const parent = await scope.accounts.findById(parentId);
  // A parent in another plan is reported as unavailable: the isolation of the ledger outweighs the diagnosis.
  if (parent === undefined || parent.chartOfAccountsId !== chartOfAccountsId) throw errors.accountNotFound(parentId);

  // Order matters. A postable account is rejected as a parent before the movements query runs, and only a
  // postable account can receive postings, so ACCOUNT_HAS_MOVEMENTS cannot fire through this API: it is a
  // defence-in-depth guard against a store where a grouping account already carries posted lines.
  if (parent.postingAllowed) throw errors.accountParentNotGrouping(parentId);
  if (await scope.postedMovements.hasPostedLines(parentId)) throw errors.accountHasMovements(parentId);
}
