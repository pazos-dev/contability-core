import type { JournalEntry } from '../../../domain/entries/index.js';
import type { Ledger } from '../../../domain/ledger/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import * as errors from '../../errors.js';
import type { UnitOfWorkScope } from '../../ports.js';

/**
 * Preconditions of the report area.
 *
 * They live here and not in `shared/rules.ts` because only this area decides them: the shared module holds
 * the rules two or more areas invoke, and no writing use case reads without an active ledger.
 */

/** Inclusive window over the accounting date; an absent end is unbounded, not empty. */
export interface ReportRange {
  readonly from: AccountingDate | undefined;
  readonly to: AccountingDate | undefined;
}

/**
 * The ledger of a report exists, whatever its status (rule 9).
 *
 * It deliberately is not `requireActiveLedger`: deactivating a ledger closes writing, not access to its
 * history, so an `INACTIVE` ledger is reported like any other.
 */
export async function requireReportLedger(scope: UnitOfWorkScope, ledgerId: string): Promise<Ledger> {
  const ledger = await scope.ledgers.findById(ledgerId);
  if (ledger === undefined) throw errors.ledgerNotFound(ledgerId);
  return ledger;
}

/**
 * The window of the report, in the order the specification fixes: every supplied date is created first —
 * an impossible date is the domain's `INVALID_DATE` and bubbles unwrapped — and only then is the order
 * compared. A `from` after a `to` is `INVALID_APPLICATION_INPUT`, so an impossible `from` wins over a
 * reversed range.
 */
export function requireReportRange(input: { readonly from?: string; readonly to?: string }): ReportRange {
  const from = input.from === undefined ? undefined : AccountingDate.create(input.from);
  const to = input.to === undefined ? undefined : AccountingDate.create(input.to);

  if (from !== undefined && to !== undefined && from.compare(to) > 0) {
    throw errors.invalidApplicationInput('from', input.from);
  }

  return { from, to };
}

/** Default and bounds of the account ledger's page (rule 14): absent means one page of 100 rows. */
const DEFAULT_MOVEMENTS_LIMIT = 100;
const MAX_MOVEMENTS_LIMIT = 1000;

/**
 * The page size of the account ledger: absent is the default, and anything outside 1..1000 is
 * `INVALID_APPLICATION_INPUT`.
 *
 * It is not clamped. A limit the caller did not ask for is a result the caller cannot reproduce, and "give me
 * everything" is expressed by walking the cursor, not by a number the report silently lowers.
 */
export function requireReportLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_MOVEMENTS_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MOVEMENTS_LIMIT) {
    throw errors.invalidApplicationInput('limit', limit);
  }
  return limit;
}

/**
 * Rule 1 applied again at the port boundary: only a `POSTED` entry of the requested ledger belongs to a
 * report.
 *
 * The port is asked for exactly that, and the core checks it again because a report states its result as its
 * own and a draft — which has lines and can balance — would otherwise be indistinguishable from an accounting
 * fact. Entries of another ledger are dropped for the same reason: they are not part of the book being read.
 *
 * It is a discard and not an error. A host that returns more than it was asked for made a mistake the report
 * can correct by ignoring the excess, and a report may not fail over data it never requested.
 */
export function isReportEntry(entry: JournalEntry, ledgerId: string): boolean {
  return entry.status === 'POSTED' && entry.ledgerId === ledgerId;
}
