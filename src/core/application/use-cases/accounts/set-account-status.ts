import type {
  SetAccountStatusInput,
  SetAccountStatusResult,
} from '../../contracts/accounts.js';
import { accountNotFound, invalidApplicationInput, ledgerNotFound } from '../../errors.js';
import type { ApplicationDeps } from '../../ports/index.js';

export type SetAccountStatus = (input: SetAccountStatusInput) => Promise<SetAccountStatusResult>;

/**
 * Activates or deactivates an account inside the plan the ledger resolves.
 *
 * Deactivating never deletes: the account keeps its identity, chart, code, name, parent and posting
 * flag, so its history stays readable (A07). Repeating the same status is a no-op, which is why this
 * use case does not ask for an idempotency key.
 */
export function makeSetAccountStatus(deps: ApplicationDeps): SetAccountStatus {
  return async (input) => {
    const { ledgerId, accountId, status } = input;
    // A wrong value would otherwise fall into the "activate" branch and look like a successful call.
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw invalidApplicationInput('status', status);

    return deps.unitOfWork.run(async (scope) => {
      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      const account = await scope.accounts.findById(accountId);
      if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
        throw accountNotFound(accountId);
      }

      const next = status === 'INACTIVE' ? account.deactivate() : account.activate();
      await scope.accounts.save(next);

      return { ledgerId, accountId: next.id, status: next.status };
    });
  };
}
