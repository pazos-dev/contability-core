import type { Account } from '../../../domain/account/index.js';
import type { JournalEntryLine } from '../../../domain/entries/index.js';
import { Money, MoneyError, type Currency } from '../../../domain/shared/money/index.js';
import type { AccountBalanceRow } from '../../dto.js';
import type { UnitOfWorkScope } from '../../ports.js';
import { isReportEntry, type ReportRange } from './rules.js';

/**
 * The single aggregation both balance reports share.
 *
 * The difference between `accountBalances` and `trialBalance` is the contract they return, not the work
 * they do (rule 18): this module sums, and each use case decides whether the totals leave the building.
 *
 * The accumulation is keyed by account, so the memory it uses depends on the number of **accounts** and
 * never on the number of entries — the pages are drained and forgotten (rule 15).
 */

/** One entry page is small enough to keep the drain bounded and large enough not to round-trip per entry. */
const PAGE_SIZE = 200;

/** Mutable per-account bucket; amounts are immutable, so the bucket only replaces them. */
export interface AccountTotals {
  debit: Money;
  credit: Money;
}

export type TotalsByAccount = ReadonlyMap<string, AccountTotals>;

/**
 * The amount of a reported line, in the ledger's functional currency.
 *
 * A report is of the book, not of the transaction: the original stays on the line, and what a report sums and
 * shows is what the line is worth in the only currency the book has (`foreign-currency.md`, rule 11).
 *
 * A posted line without a functional amount is host data written before 009d. The core does not invent a
 * historical conversion, so the report fails closed with the domain's `CURRENCY_MISMATCH` instead of returning
 * a sum of two currencies. It is a guard and not a reachable path: posting always attaches the functional
 * amount, and the aggregate cannot be built without going through it.
 */
export function functionalAmountOf(line: JournalEntryLine): Money {
  const amount = line.functionalAmount;
  if (amount === undefined) {
    throw new MoneyError(
      'CURRENCY_MISMATCH',
      `Currency mismatch: posted line ${JSON.stringify(line.id)} carries no functional amount, so it cannot be reported.`,
    );
  }
  return amount;
}

/**
 * Drains the posted entries of the range page by page and accumulates debit and credit per account.
 *
 * The port returns entries with their lines and no totals, so what is verified here — one functional currency
 * and the posting side of every line — is verified by the core. A line without a functional amount is the
 * domain `CURRENCY_MISMATCH` from `functionalAmountOf`, and a functional amount in another currency makes
 * `Money.add` throw the same code: a report that cannot add must fail closed rather than return a sum that
 * silently mixed currencies (rule 3).
 *
 * What the port returns beyond what it was asked for — a draft, or an entry of another ledger — is discarded
 * here rather than accumulated (rule 1): a report states its result as its own, and an excess is a host bug
 * that is corrected by ignoring it, not by failing the read.
 */
export async function totalsByAccount(
  scope: UnitOfWorkScope,
  ledgerId: string,
  currency: Currency,
  range: ReportRange,
): Promise<TotalsByAccount> {
  const zero = Money.fromMinorUnits(0n, currency);
  const totals = new Map<string, AccountTotals>();

  let cursor: string | undefined;
  for (;;) {
    const page = await scope.postedEntries.findPostedMovements(
      ledgerId,
      {
        ...(range.from === undefined ? {} : { from: range.from }),
        ...(range.to === undefined ? {} : { to: range.to }),
      },
      { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    );

    for (const entry of page.entries) {
      if (!isReportEntry(entry, ledgerId)) continue;

      for (const line of entry.lines) {
        let totalsOfAccount = totals.get(line.accountId);
        if (totalsOfAccount === undefined) {
          totalsOfAccount = { debit: zero, credit: zero };
          totals.set(line.accountId, totalsOfAccount);
        }

        const amount = functionalAmountOf(line);
        if (line.side === 'DEBIT') totalsOfAccount.debit = totalsOfAccount.debit.add(amount);
        else totalsOfAccount.credit = totalsOfAccount.credit.add(amount);
      }
    }

    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }

  return totals;
}

export interface AggregatedRows {
  readonly rows: readonly AccountBalanceRow[];
  readonly debit: Money;
  readonly credit: Money;
}

/**
 * Turns the accounts of the chart and their accumulated movements into the rows both reports return.
 *
 * Every account of the chart is listed, including those with no movement (rule 7), each row is its own
 * account and never its children (rule 10), and the order is the code compared as text with the account id
 * as tie-break (rule 8) — so the same query twice returns the same order whatever the storage returned.
 */
export function aggregateRows(
  accounts: readonly Account[],
  totals: TotalsByAccount,
  currency: Currency,
): AggregatedRows {
  const zero = Money.fromMinorUnits(0n, currency);

  let debit = zero;
  let credit = zero;

  const rows = [...accounts]
    .sort((left, right) => compareText(left.code.value, right.code.value) || compareText(left.id, right.id))
    .map((account): AccountBalanceRow => {
      const totalsOfAccount = totals.get(account.id);
      const accountDebit = totalsOfAccount?.debit ?? zero;
      const accountCredit = totalsOfAccount?.credit ?? zero;
      const balance = accountDebit.subtract(accountCredit);

      debit = debit.add(accountDebit);
      credit = credit.add(accountCredit);

      return {
        accountId: account.id,
        code: account.code.value,
        name: account.name,
        type: account.type,
        debit: accountDebit.toJSON(),
        credit: accountCredit.toJSON(),
        balance: balance.toJSON(),
        side: sideOf(balance.minorUnits),
      };
    });

  return { rows, debit, credit };
}

/** Text order, not numeric and not locale-aware: `1.10` sorts before `1.9`, as the code is written. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** The signed balance already says the side; this only names it for whoever does not want to read a sign. */
function sideOf(minorUnits: bigint): 'DEBIT' | 'CREDIT' | 'ZERO' {
  if (minorUnits > 0n) return 'DEBIT';
  if (minorUnits < 0n) return 'CREDIT';
  return 'ZERO';
}
