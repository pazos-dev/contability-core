import type { Account } from '../../../domain/account/index.js';
import type { AccountingDate } from '../../../domain/period/index.js';
import type { Ledger } from '../../../domain/ledger/index.js';
import type { Money } from '../../../domain/shared/money/index.js';
import type { ApplicationDeps, UnitOfWorkScope } from '../../ports.js';
import type {
  AccountBalancesInput,
  AccountBalancesResult,
  AccountBalanceRow,
  TrialBalanceResult,
} from '../../dto.js';
import { aggregateRows, totalsByAccount } from './aggregate.js';
import { requireReportLedger, requireReportRange } from './rules.js';

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
 * The read-only use cases of the module: balances per account and the trial balance.
 *
 * Reads, not writes: neither takes an idempotency key — repeating them has no second effect — and neither
 * checks the ledger's status, because deactivating a ledger closes writing, not access to its history.
 *
 * They share one aggregation and differ in the contract (rule 18): `accountBalances` returns the rows, and
 * `trialBalance` returns the same rows plus the general totals and the check. There is no second
 * calculation, so the two answers for the same input cannot disagree about a row.
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
