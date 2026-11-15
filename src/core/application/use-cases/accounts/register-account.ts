import { Account } from '../../../domain/account/index.js';
import type { ApplicationDeps } from '../../ports.js';
import type { RegisterAccountInput, RegisterAccountResult } from '../../dto.js';
import { requireChartOfAccountsId } from '../guards.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreeAccountCode, requireFreeAccountId, requireGroupingParent } from './rules.js';

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
}

