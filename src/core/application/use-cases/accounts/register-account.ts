import { Account } from '../../../domain/account/index.js';
import type { RegisterAccountInput, RegisterAccountResult } from '../../contracts/accounts.js';
import {
  accountAlreadyExists,
  accountCodeDuplicate,
  accountHasMovements,
  accountNotFound,
  accountParentNotGrouping,
  ledgerNotFound,
} from '../../errors.js';
import type { ApplicationDeps, UnitOfWorkScope } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/idempotency.js';

const OPERATION = 'registerAccount';

export type RegisterAccount = (input: RegisterAccountInput) => Promise<RegisterAccountResult>;

/**
 * Registers an account inside the chart of accounts the ledger resolves.
 *
 * It owns the rules the entity cannot decide alone: ledger-plan resolution (Q07), code uniqueness
 * inside the plan (A05), and the parent rules — same plan (A04), grouping parent, and no posted
 * movements (A06 precondition). A cycle is not reachable here: `parentId` never changes and a new id
 * has no descendants, so hierarchy stays acyclic by construction.
 */
export function makeRegisterAccount(deps: ApplicationDeps): RegisterAccount {
  return async (input) => {
    const { ledgerId, accountId, code, name, type, parentId, postingAllowed, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, accountId, code, name, type, parentId, postingAllowed });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<RegisterAccountResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      if ((await scope.accounts.findById(accountId)) !== undefined) throw accountAlreadyExists(accountId);

      if ((await scope.accounts.findByCode(chartOfAccountsId, code)) !== undefined) {
        throw accountCodeDuplicate(chartOfAccountsId, code);
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
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}

async function requireGroupingParent(
  scope: UnitOfWorkScope,
  parentId: string,
  chartOfAccountsId: string,
): Promise<void> {
  const parent = await scope.accounts.findById(parentId);
  // A parent in another plan is reported as unavailable: the isolation of the ledger outweighs the diagnosis.
  if (parent === undefined || parent.chartOfAccountsId !== chartOfAccountsId) throw accountNotFound(parentId);

  // Order matters. A postable account is rejected as a parent before the movements query runs, and only a
  // postable account can receive postings, so ACCOUNT_HAS_MOVEMENTS cannot fire through this API: it is a
  // defence-in-depth guard against a store where a grouping account already carries posted lines.
  if (parent.postingAllowed) throw accountParentNotGrouping(parentId);
  if (await scope.postedMovements.hasPostedLines(parentId)) throw accountHasMovements(parentId);
}
