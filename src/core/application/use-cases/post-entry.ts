import type { JournalEntry, JournalEntryLine, PostingSide } from '../../domain/entries/index.js';
import { Money } from '../../domain/money/index.js';
import type { PostEntryInput, PostEntryResult, PostedLineResult } from '../contracts/posting.js';
import {
  accountInactive,
  accountNotFound,
  accountNotPostable,
  entryNotFound,
  journalInactive,
  journalNotFound,
  ledgerNotFound,
  periodClosed,
  periodDateOutside,
  periodNotFound,
} from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './idempotency.js';

const OPERATION = 'postEntry';

export type PostEntry = (input: PostEntryInput) => Promise<PostEntryResult>;

/**
 * Posts a persisted draft.
 *
 * It owns every rule the aggregate cannot decide alone: the ledger resolves the chart of accounts the
 * lines must belong to (Q07), and the journal, the period and the accounts must still admit the
 * posting. The draft's `periodId` is authoritative, but it does not prove the accounting date falls
 * inside that period, so the two are checked together (P05, A06, J05).
 *
 * The entry is never edited here: it is loaded, posted in memory and saved once, together with the
 * idempotency record, inside one unit of work.
 */
export function makePostEntry(deps: ApplicationDeps): PostEntry {
  return async (input) => {
    const { ledgerId, entryId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId });

    return deps.unitOfWork.run(async (scope) => {
      const stored = await replay<PostEntryResult>(scope, OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw entryNotFound(entryId);

      const journal = await scope.journals.findById(ledgerId, entry.journalId);
      if (journal === undefined) throw journalNotFound(entry.journalId);
      if (journal.status !== 'ACTIVE') throw journalInactive(entry.journalId);

      const period = await scope.periods.findById(ledgerId, entry.periodId);
      if (period === undefined) throw periodNotFound(entry.periodId);
      if (period.status !== 'OPEN') throw periodClosed(entry.periodId);
      if (!period.contains(entry.accountingDate)) throw periodDateOutside(entry.periodId, entry.accountingDate.value);

      for (const line of entry.lines) {
        const account = await scope.accounts.findById(line.accountId);
        // An account of another plan is reported as unavailable: the ledger isolation outweighs the diagnosis.
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) throw accountNotFound(line.accountId);
        if (account.status !== 'ACTIVE') throw accountInactive(line.accountId);
        if (!account.postingAllowed) throw accountNotPostable(line.accountId);
      }

      const posted = entry.post();
      const result = resultOf(posted);

      await scope.entries.save(posted);
      await remember(scope, OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  };
}

/** Serializes a posted entry for the host: domain values never leave the module raw. */
export function resultOf(entry: JournalEntry): PostEntryResult {
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    // `post()` is the only path here, so the status is POSTED by construction.
    status: 'POSTED',
    accountingDate: entry.accountingDate.value,
    lines: entry.lines.map(serializeLine),
    totalDebit: sumSide(entry.lines, 'DEBIT').toJSON(),
    totalCredit: sumSide(entry.lines, 'CREDIT').toJSON(),
  };
}

function serializeLine(line: JournalEntryLine): PostedLineResult {
  return {
    lineId: line.id,
    accountId: line.accountId,
    side: line.side,
    amount: line.amount.toJSON(),
    ...(line.description === undefined ? {} : { description: line.description }),
  };
}

function sumSide(lines: readonly JournalEntryLine[], side: PostingSide): Money {
  let total: Money | undefined;
  for (const line of lines) {
    if (line.side !== side) continue;
    total = total === undefined ? line.amount : total.add(line.amount);
  }
  if (total === undefined) {
    // A posted entry is balanced with at least two positive lines, so a side can never be empty here.
    throw new Error(`Invariant violated: a posted entry must have at least one ${side} line.`);
  }
  return total;
}
