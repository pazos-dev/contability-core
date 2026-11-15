import { Account } from '../../../domain/account/index.js';
import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import type {
  RegisterAccountInput,
  RegisterAccountResult,
  SetAccountStatusInput,
  SetAccountStatusResult,
} from '../../dto.js';
import { requireAccountOfPlan, requireChartOfAccountsId } from '../shared/rules.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreeAccountCode, requireFreeAccountId, requireGroupingParent } from './rules.js';

const REGISTER_OPERATION = 'registerAccount';

export class Accounts {

  /**
   * Registers an account inside the chart of accounts the ledger resolves.
   *
   * It owns the rules the entity cannot decide alone: ledger-plan resolution (Q07), code uniqueness
   * inside the plan (A05), and the parent rules — same plan (A04), grouping parent, and no posted
   * movements (A06 precondition). A cycle is not reachable here: `parentId` never changes and a new id
   * has no descendants, so hierarchy stays acyclic by construction.
   */
  static async register(deps: ApplicationDeps, input: RegisterAccountInput): Promise<RegisterAccountResult> {
    const { ledgerId, accountId, code, name, type, parentId, postingAllowed, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, accountId, code, name, type, parentId, postingAllowed });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        await requireFreeAccountId(scope, accountId);
        await requireFreeAccountCode(scope, chartOfAccountsId, code);
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

        return result;
      });
    });
  }

  /**
   * Activates or deactivates an account inside the plan the ledger resolves.
   *
   * Deactivating never deletes: the account keeps its identity, chart, code, name, parent and posting
   * flag, so its history stays readable (A07). Repeating the same status is a no-op, which is why this
   * use case does not ask for an idempotency key.
   */
  static async setStatus(deps: ApplicationDeps, input: SetAccountStatusInput): Promise<SetAccountStatusResult> {
    const { ledgerId, accountId, status } = input;
    // A wrong value would otherwise fall into the "activate" branch and look like a successful call.
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw errors.invalidApplicationInput('status', status);

    return deps.unitOfWork.run(async (scope) => {
      const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
      const account = await requireAccountOfPlan(scope, accountId, chartOfAccountsId);

      const next = status === 'INACTIVE' ? account.deactivate() : account.activate();
      await scope.accounts.save(next);

      return { ledgerId, accountId: next.id, status: next.status };
    });
  }
}
