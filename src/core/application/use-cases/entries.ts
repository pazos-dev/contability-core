import { JournalEntry, JournalEntryLine, type PostingSide } from '../../domain/entries/index.js';
import { Money } from '../../domain/money/index.js';
import { AccountingDate } from '../../domain/period/index.js';
import * as errors from '../errors.js';
import type { ApplicationDeps, UnitOfWorkScope } from '../ports/index.js';
import type {
  AddEntryLineInput,
  CreateEntryDraftInput,
  EntryDraftResult,
  EntryLineInput,
  PostEntryInput,
  PostEntryResult,
  PostedLineResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
} from './contracts.js';
import {
  requireAccountOfPlan,
  requireActiveJournal,
  requireChartOfAccountsId,
  requireEntry,
  requireFreeEntryId,
  requireOpenPeriodContaining,
  requirePostableAccount,
} from './guards.js';
import { fingerprintOf, remember, replay } from './shared/index.js';

const CREATE_OPERATION = 'createEntryDraft';
const ADD_OPERATION = 'addEntryLine';
const REMOVE_OPERATION = 'removeEntryLine';
const POST_OPERATION = 'postEntry';
const REVERSE_OPERATION = 'reversePostedEntry';

/**
 * Creates the draft that `postEntry` later posts.
 *
 * It validates only what makes the draft *coherent*: a known ledger, a free entry id, and a journal,
 * a period and accounts that exist in that ledger. It deliberately does not require an active journal,
 * an open period or a balanced entry: a draft may be prepared against a journal that is reactivated
 * later, and every posting rule is re-checked by `postEntry` anyway.
 */
export class CreateEntryDraft {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: CreateEntryDraftInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, journalId, periodId, accountingDate, description, lines, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      entryId,
      journalId,
      periodId,
      accountingDate,
      description,
      lines: lines.map(normalizedLine),
    });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, CREATE_OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
      await requireFreeEntryId(scope, ledgerId, entryId);
      await requireJournalInLedger(scope, ledgerId, journalId);
      await requirePeriodInLedger(scope, ledgerId, periodId);
      for (const line of lines) await requireAccountOfPlan(scope, line.accountId, chartOfAccountsId);

      const draft = lines.reduce(
        (entry, line) => entry.addLine(lineOf(line)),
        JournalEntry.createDraft({
          id: entryId,
          ledgerId,
          journalId,
          periodId,
          accountingDate: AccountingDate.create(accountingDate),
          description,
        }),
      );

      const result = draftResultOf(draft);

      await scope.entries.save(draft);
      await remember(scope, CREATE_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/**
 * Adds one line to an existing draft.
 *
 * It only checks that the new line is coherent with the ledger: the account must exist in the same chart
 * of accounts. It does not require the account to be active or postable, and it does not re-check the rest
 * of the draft — an unfinished draft is a legitimate state and `postEntry` re-validates everything.
 */
export class AddEntryLine {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: AddEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, line, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, line: normalizedLine(line) });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, ADD_OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
      const entry = await requireEntry(scope, ledgerId, entryId);
      await requireAccountOfPlan(scope, line.accountId, chartOfAccountsId);

      // The aggregate owns the state rules: a posted entry rejects new lines.
      const updated = entry.addLine(lineOf(line));

      const result = draftResultOf(updated);
      await scope.entries.save(updated);
      await remember(scope, ADD_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/**
 * Removes one line from an existing draft by id.
 *
 * It does not query accounts: the line that is leaving has nothing to validate. The aggregate owns the
 * state rules: a posted entry rejects removals, and an unknown line id is `ENTRY_LINE_NOT_FOUND`.
 */
export class RemoveEntryLine {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: RemoveEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, lineId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, lineId });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, REMOVE_OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      await requireChartOfAccountsId(scope, ledgerId);
      const entry = await requireEntry(scope, ledgerId, entryId);

      const updated = entry.removeLine(lineId);

      const result = draftResultOf(updated);
      await scope.entries.save(updated);
      await remember(scope, REMOVE_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

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
export class PostEntry {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: PostEntryInput): Promise<PostEntryResult> {
    const { ledgerId, entryId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<PostEntryResult>(scope, POST_OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
      const entry = await requireEntry(scope, ledgerId, entryId);
      await requireActiveJournal(scope, ledgerId, entry.journalId);
      await requireOpenPeriodContaining(scope, ledgerId, entry.periodId, entry.accountingDate);
      for (const line of entry.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
      await requireNoPostedReversal(scope, ledgerId, entry);

      const posted = entry.post();
      const result = postedResultOf(posted);

      await scope.entries.save(posted);
      await remember(scope, POST_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/**
 * Reverses a posted entry with a second, mirrored entry.
 *
 * The original is never touched: the reversal is a new entry with its own id, period and date, and the
 * link is `reversalOfEntryId`. Only one full reversal per original is allowed, and the check sits right
 * before the write so persistence can back it with a unique constraint in 007.
 *
 * The destination period must be open even when the original period is already closed, and the accounts
 * of the original must still admit postings: reversing is not a way around a deactivated account.
 */
export class ReversePostedEntry {
  readonly #deps: ApplicationDeps;

  constructor(deps: ApplicationDeps) {
    this.#deps = deps;
  }

  async execute(input: ReversePostedEntryInput): Promise<ReversePostedEntryResult> {
    const { ledgerId, originalEntryId, reversalEntryId, periodId, accountingDate, description, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      originalEntryId,
      reversalEntryId,
      periodId,
      accountingDate,
      description,
    });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<ReversePostedEntryResult>(
        scope,
        REVERSE_OPERATION,
        ledgerId,
        idempotencyKey,
        fingerprint,
      );
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
      const original = await requireEntry(scope, ledgerId, originalEntryId);

      // The aggregate refuses to reverse anything that is not POSTED, with its own ENTRY_STATE code.
      const draft = original.createReversalDraft({
        id: reversalEntryId,
        periodId,
        accountingDate: AccountingDate.create(accountingDate),
        ...(description === undefined ? {} : { description }),
      });

      await requireActiveJournal(scope, ledgerId, original.journalId);
      await requireOpenPeriodContaining(scope, ledgerId, periodId, draft.accountingDate);
      for (const line of draft.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
      await requireFreeEntryId(scope, ledgerId, reversalEntryId);
      await requireNoReversal(scope, ledgerId, originalEntryId);

      const posted = draft.post();
      const result: ReversePostedEntryResult = { ...postedResultOf(posted), reversalOfEntryId: originalEntryId };

      await scope.entries.save(posted);
      await remember(scope, REVERSE_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
  }
}

/** A draft may point to any journal of the ledger; it does not have to be active yet. */
async function requireJournalInLedger(
  scope: UnitOfWorkScope,
  ledgerId: string,
  journalId: string,
): Promise<void> {
  if ((await scope.journals.findById(ledgerId, journalId)) === undefined) throw errors.journalNotFound(journalId);
}

/** A draft may point to any period of the ledger; it does not have to be open yet. */
async function requirePeriodInLedger(
  scope: UnitOfWorkScope,
  ledgerId: string,
  periodId: string,
): Promise<void> {
  if ((await scope.periods.findById(ledgerId, periodId)) === undefined) throw errors.periodNotFound(periodId);
}

/**
 * Posting a stored reversal draft cannot create a second *posted* reversal of the same original. Every
 * reversal is read, not the first one found, and this entry is excluded: a draft saved before the posted
 * reversal must not hide it, and the entry being posted is not another reversal of its own original.
 */
async function requireNoPostedReversal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  entry: JournalEntry,
): Promise<void> {
  if (entry.reversalOfEntryId === undefined) return;

  const reversals = await scope.entries.findReversalsOf(ledgerId, entry.reversalOfEntryId);
  const alreadyPosted = reversals.some((reversal) => reversal.id !== entry.id && reversal.status === 'POSTED');
  if (alreadyPosted) throw errors.entryAlreadyReversed(entry.reversalOfEntryId);
}

/**
 * Reversing creates a new entry, so any reversal of that original -in any status- blocks it. Checked
 * immediately before the write, inside the same unit of work, so 007 can replace it with a unique
 * constraint on `reversalOfEntryId` without moving anything.
 */
async function requireNoReversal(
  scope: UnitOfWorkScope,
  ledgerId: string,
  originalEntryId: string,
): Promise<void> {
  if ((await scope.entries.findReversalsOf(ledgerId, originalEntryId)).length > 0) {
    throw errors.entryAlreadyReversed(originalEntryId);
  }
}

/** Serializes one line: a domain value never leaves the module raw. */
function serializeLine(line: JournalEntryLine): PostedLineResult {
  return {
    lineId: line.id,
    accountId: line.accountId,
    side: line.side,
    amount: line.amount.toJSON(),
    ...(line.description === undefined ? {} : { description: line.description }),
  };
}

/**
 * A line as the fingerprint sees it: the fields in a fixed order, with an absent description as `null`,
 * so the key order of a line object never changes the fingerprint.
 */
function normalizedLine(line: EntryLineInput): readonly (string | number | null)[] {
  return [
    line.lineId,
    line.accountId,
    line.side,
    line.amount.minorUnits,
    line.amount.currency.code,
    line.amount.currency.scale,
    line.description ?? null,
  ];
}

function lineOf(line: EntryLineInput): JournalEntryLine {
  return JournalEntryLine.create({
    id: line.lineId,
    accountId: line.accountId,
    side: line.side,
    amount: Money.fromJSON(line.amount),
    ...(line.description === undefined ? {} : { description: line.description }),
  });
}

/**
 * Sums one side of an entry with exact `Money` arithmetic.
 * Only called on a posted entry, which is balanced with at least two positive lines, so a side is
 * never empty; the throw is an invariant guard, not a user-facing condition.
 */
function sumSide(lines: readonly JournalEntryLine[], side: PostingSide): Money {
  let total: Money | undefined;
  for (const line of lines) {
    if (line.side !== side) continue;
    total = total === undefined ? line.amount : total.add(line.amount);
  }
  if (total === undefined) {
    throw new Error(`Invariant violated: a posted entry must have at least one ${side} line.`);
  }
  return total;
}

/** Serializes a posted entry for the host: domain values never leave the module raw. */
function postedResultOf(entry: JournalEntry): PostEntryResult {
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

/**
 * Serializes a draft. The status is always DRAFT here: every draft operation starts from a draft and the
 * aggregate refuses to change a posted entry, so no other status can reach this function.
 */
function draftResultOf(entry: JournalEntry): EntryDraftResult {
  return {
    ledgerId: entry.ledgerId,
    entryId: entry.id,
    journalId: entry.journalId,
    periodId: entry.periodId,
    status: 'DRAFT',
    accountingDate: entry.accountingDate.value,
    description: entry.description,
    lines: entry.lines.map(serializeLine),
  };
}
