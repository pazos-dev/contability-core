import type { Account } from '../../../domain/account/index.js';
import type { AccountingDate } from '../../../domain/period/index.js';
import type { Ledger } from '../../../domain/ledger/index.js';
import type { Money } from '../../../domain/shared/money/index.js';
import type { ApplicationDeps, UnitOfWorkScope } from '../../ports.js';
import type {
  AccountBalancesInput,
  AccountBalancesResult,
  AccountBalanceRow,
  AccountMovementsInput,
  AccountMovementsResult,
  TrialBalanceResult,
} from '../../dto.js';
import { requireAccountOfPlan } from '../shared/rules.js';
import { aggregateRows, totalsByAccount } from './aggregate.js';
import { decodeCursor, movementPage, movementRows, openingBalanceOf } from './movements.js';
import { requireReportLedger, requireReportLimit, requireReportRange } from './rules.js';

/** What both reports read before returning a contract of their own; neither writes and neither has a key. */
interface PreparedReport {
  readonly ledger: Ledger;
  readonly from: AccountingDate | undefined;
  readonly to: AccountingDate | undefined;
  readonly rows: readonly AccountBalanceRow[];
  readonly debit: Money;
  readonly credit: Money;
}

/**
 * The read-only use cases of the module: balances per account, the trial balance and the account ledger.
 *
 * Reads, not writes: none of them takes an idempotency key — repeating them has no second effect — and none
 * checks the ledger's status, because deactivating a ledger closes writing, not access to its history.
 *
 * The two balance reports share one aggregation and differ in the contract (rule 18): `accountBalances`
 * returns the rows, and `trialBalance` returns the same rows plus the general totals and the check. There is
 * no second calculation, so the two answers for the same input cannot disagree about a row. `accountMovements`
 * answers a different question — how one account got to its balance — and has its own contract, paged from
 * the first version (D5).
 */
export class Reports {

  /**
   * Balances per account for the range, one row per account of the chart.
   *
   * The result carries no `totals` and no `balanced` on purpose: a balance per account does not assert that
   * the books agree, and a check nobody asked for is a claim the caller did not make.
   */
  static async accountBalances(
    deps: ApplicationDeps,
    input: AccountBalancesInput,
  ): Promise<AccountBalancesResult> {
    return deps.unitOfWork.run(async (scope) => {
      const report = await prepare(scope, input);

      return {
        ledgerId: report.ledger.id,
        currency: report.ledger.currency.toJSON(),
        from: report.from?.value ?? null,
        to: report.to?.value ?? null,
        rows: report.rows,
      };
    });
  }

  /**
   * The same rows as `accountBalances` for the same input, plus the totals and whether they agree.
   *
   * A balance that does not agree is not an error: the result reports the totals and `balanced: false`,
   * because finding the difference is the main use of a trial balance and an exception would hide it behind
   * the error the caller is already looking for.
   */
  static async trialBalance(deps: ApplicationDeps, input: AccountBalancesInput): Promise<TrialBalanceResult> {
    return deps.unitOfWork.run(async (scope) => {
      const report = await prepare(scope, input);

      return {
        ledgerId: report.ledger.id,
        currency: report.ledger.currency.toJSON(),
        from: report.from?.value ?? null,
        to: report.to?.value ?? null,
        rows: report.rows,
        totals: { debit: report.debit.toJSON(), credit: report.credit.toJSON() },
        balanced: report.debit.compare(report.credit) === 0,
      };
    });
  }

  /**
   * The account ledger: one account of the ledger's chart, its movements of the range in chronological order,
   * the running balance after each row, the opening balance and a cursor for the next page.
   *
   * `openingBalance` is the net of everything before `from` for that account (rule 12), and the running balance
   * of the page continues from it. `closingBalance` is the balance after the last row returned (rule 13), not
   * the balance at the end of the range — which is why `nextCursor` is not decoration.
   *
   * The cursor carries a position and never an amount: a page reached by a cursor re-drains the rows before it
   * and rebuilds the running balance, so no caller can hand the report a balance it would state as its own. The
   * cost of a cursor page is therefore proportional to the rows already reported, and it is accepted: a stored
   * or cached balance is exactly the state that could disagree with the entries (D1). See `movements.ts`.
   */
  static async accountMovements(
    deps: ApplicationDeps,
    input: AccountMovementsInput,
  ): Promise<AccountMovementsResult> {
    return deps.unitOfWork.run(async (scope) => {
      const ledger = await requireReportLedger(scope, input.ledgerId);
      const range = requireReportRange(input);
      // Rule 11: an account of another chart is reported as unavailable, exactly like a missing one.
      const account = await requireAccountOfPlan(scope, input.accountId, ledger.chartOfAccountsId);
      const limit = requireReportLimit(input.limit);
      const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);

      const opening = await openingBalanceOf(scope, ledger.id, ledger.currency, account.id, range.from);
      const rows = await movementRows(scope, ledger.id, account.id, range, opening);
      const page = movementPage(rows, opening, limit, after);

      return {
        ledgerId: ledger.id,
        accountId: account.id,
        currency: ledger.currency.toJSON(),
        openingBalance: opening.toJSON(),
        rows: page.rows,
        closingBalance: page.closingBalance.toJSON(),
        nextCursor: page.nextCursor,
      };
    });
  }
}

/**
 * The flow both reports follow, in the order the specification numbers it, so the lower-numbered rule wins
 * when two conditions are invalid at once: the ledger, the dates, the accounts of its chart, the movements
 * of the range, and the rows derived from that accumulated work.
 */
async function prepare(scope: UnitOfWorkScope, input: AccountBalancesInput): Promise<PreparedReport> {
  const ledger = await requireReportLedger(scope, input.ledgerId);
  const range = requireReportRange(input);
  const accounts: readonly Account[] = await scope.accounts.findByChart(ledger.chartOfAccountsId);
  const totals = await totalsByAccount(scope, ledger.id, ledger.currency, range);
  const { rows, debit, credit } = aggregateRows(accounts, totals, ledger.currency);

  return { ledger, from: range.from, to: range.to, rows, debit, credit };
}
