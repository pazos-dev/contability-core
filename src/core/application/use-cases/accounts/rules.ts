import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';
import { requireAccountOfPlan } from '../guards.js';

/** An id already taken is rejected: registering never overwrites a stored account. */
export async function requireFreeAccountId(scope: UnitOfWorkScope, accountId: string): Promise<void> {
  if ((await scope.accounts.findById(accountId)) !== undefined) throw errors.accountAlreadyExists(accountId);
}

/** Code uniqueness is scoped by chart of accounts (A05): the same code in another plan is another account. */
export async function requireFreeAccountCode(
  scope: UnitOfWorkScope,
  chartOfAccountsId: string,
  code: string,
): Promise<void> {
  if ((await scope.accounts.findByCode(chartOfAccountsId, code)) !== undefined) {
    throw errors.accountCodeDuplicate(chartOfAccountsId, code);
  }
}

export async function requireGroupingParent(
  scope: UnitOfWorkScope,
  parentId: string,
  chartOfAccountsId: string,
): Promise<void> {
  const parent = await requireAccountOfPlan(scope, parentId, chartOfAccountsId);

  // Order matters. A postable account is rejected as a parent before the movements query runs, and only a
  // postable account can receive postings, so ACCOUNT_HAS_MOVEMENTS cannot fire through this API: it is a
  // defence-in-depth guard against a store where a grouping account already carries posted lines.
  if (parent.postingAllowed) throw errors.accountParentNotGrouping(parentId);
  if (await scope.postedMovements.hasPostedLines(parentId)) throw errors.accountHasMovements(parentId);
}
