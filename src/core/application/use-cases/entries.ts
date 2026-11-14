import {
  JournalEntry,
  JournalEntryLine,
  type EntryStatus,
  type PostingSide,
} from '../../domain/entries/index.js';
import { Money, type MoneyJSON } from '../../domain/money/index.js';
import { AccountingDate } from '../../domain/period/index.js';
import * as errors from '../errors.js';
import type { ApplicationDeps } from '../ports/index.js';
import { fingerprintOf, remember, replay } from './shared/index.js';

/** One line of a posted entry, already serializable. */
export interface PostedLineResult {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;
  readonly description?: string;
}

/** One line of a draft, as the caller supplies it. The amount uses the domain's `MoneyJSON`. */
export interface EntryLineInput {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;
  readonly description?: string;
}

export interface CreateEntryDraftInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly EntryLineInput[];
  readonly idempotencyKey?: string;
}

export interface AddEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly line: EntryLineInput;
  readonly idempotencyKey?: string;
}

export interface RemoveEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly lineId: string;
  readonly idempotencyKey?: string;
}

/**
 * A draft reports no totals: it may be empty or unbalanced, so a total is a posting notion.
 * It is also the result of every draft edit: the draft as it stands after the operation.
 */
export interface EntryDraftResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: 'DRAFT';
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly PostedLineResult[];
}

export interface PostEntryInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly idempotencyKey: string;
}

export interface PostEntryResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: EntryStatus;
  readonly accountingDate: string;
  readonly lines: readonly PostedLineResult[];
  readonly totalDebit: MoneyJSON;
  readonly totalCredit: MoneyJSON;
}

export interface ReversePostedEntryInput {
  readonly ledgerId: string;
  readonly originalEntryId: string;
  readonly reversalEntryId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description?: string;
  readonly idempotencyKey: string;
}

export interface ReversePostedEntryResult extends PostEntryResult {
  readonly reversalOfEntryId: string;
}

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
      // Normalized per line so the key order of a line object never changes the fingerprint.
      lines: lines.map(normalizedLine),
    });

    return this.#deps.unitOfWork.run(async (scope) => {
      const stored = await replay<EntryDraftResult>(scope, CREATE_OPERATION, ledgerId, idempotencyKey, fingerprint);
      if (stored !== undefined) return stored;

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      if ((await scope.entries.findById(ledgerId, entryId)) !== undefined) throw errors.entryAlreadyExists(entryId);

      if ((await scope.journals.findById(ledgerId, journalId)) === undefined) throw errors.journalNotFound(journalId);

      if ((await scope.periods.findById(ledgerId, periodId)) === undefined) throw errors.periodNotFound(periodId);

      for (const line of lines) {
        const account = await scope.accounts.findById(line.accountId);
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
          throw errors.accountNotFound(line.accountId);
        }
      }

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

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw errors.entryNotFound(entryId);

      const account = await scope.accounts.findById(line.accountId);
      if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
        throw errors.accountNotFound(line.accountId);
      }

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

      if ((await scope.ledgers.chartOfAccountsIdOf(ledgerId)) === undefined) throw errors.ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw errors.entryNotFound(entryId);

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

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      const entry = await scope.entries.findById(ledgerId, entryId);
      if (entry === undefined) throw errors.entryNotFound(entryId);

      const journal = await scope.journals.findById(ledgerId, entry.journalId);
      if (journal === undefined) throw errors.journalNotFound(entry.journalId);
      if (journal.status !== 'ACTIVE') throw errors.journalInactive(entry.journalId);

      const period = await scope.periods.findById(ledgerId, entry.periodId);
      if (period === undefined) throw errors.periodNotFound(entry.periodId);
      if (period.status !== 'OPEN') throw errors.periodClosed(entry.periodId);
      if (!period.contains(entry.accountingDate)) {
        throw errors.periodDateOutside(entry.periodId, entry.accountingDate.value);
      }

      for (const line of entry.lines) {
        const account = await scope.accounts.findById(line.accountId);
        // An account of another plan is reported as unavailable: the ledger isolation outweighs the diagnosis.
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
          throw errors.accountNotFound(line.accountId);
        }
        if (account.status !== 'ACTIVE') throw errors.accountInactive(line.accountId);
        if (!account.postingAllowed) throw errors.accountNotPostable(line.accountId);
      }

      // A stored reversal draft must obey the same rule as the one created by the reverse use case:
      // posting it here cannot create a second *posted* reversal of the same original. Every reversal is
      // read, not the first one found, and this entry is excluded: a draft saved before the posted
      // reversal must not hide it, and the entry being posted is not another reversal of its own original.
      if (entry.reversalOfEntryId !== undefined) {
        const reversals = await scope.entries.findReversalsOf(ledgerId, entry.reversalOfEntryId);
        const alreadyPosted = reversals.some(
          (reversal) => reversal.id !== entry.id && reversal.status === 'POSTED',
        );
        if (alreadyPosted) throw errors.entryAlreadyReversed(entry.reversalOfEntryId);
      }

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

      const chartOfAccountsId = await scope.ledgers.chartOfAccountsIdOf(ledgerId);
      if (chartOfAccountsId === undefined) throw errors.ledgerNotFound(ledgerId);

      const original = await scope.entries.findById(ledgerId, originalEntryId);
      if (original === undefined) throw errors.entryNotFound(originalEntryId);

      // The aggregate refuses to reverse anything that is not POSTED, with its own ENTRY_STATE code.
      const draft = original.createReversalDraft({
        id: reversalEntryId,
        periodId,
        accountingDate: AccountingDate.create(accountingDate),
        ...(description === undefined ? {} : { description }),
      });

      const journal = await scope.journals.findById(ledgerId, original.journalId);
      if (journal === undefined) throw errors.journalNotFound(original.journalId);
      if (journal.status !== 'ACTIVE') throw errors.journalInactive(original.journalId);

      const period = await scope.periods.findById(ledgerId, periodId);
      if (period === undefined) throw errors.periodNotFound(periodId);
      if (period.status !== 'OPEN') throw errors.periodClosed(periodId);
      if (!period.contains(draft.accountingDate)) {
        throw errors.periodDateOutside(periodId, draft.accountingDate.value);
      }

      for (const line of draft.lines) {
        const account = await scope.accounts.findById(line.accountId);
        if (account === undefined || account.chartOfAccountsId !== chartOfAccountsId) {
          throw errors.accountNotFound(line.accountId);
        }
        if (account.status !== 'ACTIVE') throw errors.accountInactive(line.accountId);
        if (!account.postingAllowed) throw errors.accountNotPostable(line.accountId);
      }

      // The save is an upsert keyed by (ledgerId, entryId): reusing an id would overwrite the stored
      // entry, so the id must be free before the reversal is written. In 007 this is the primary key.
      if ((await scope.entries.findById(ledgerId, reversalEntryId)) !== undefined) {
        throw errors.entryAlreadyExists(reversalEntryId);
      }

      // Checked immediately before the write, inside the same unit of work, so 007 can replace it with
      // a unique constraint on reversalOfEntryId without moving anything. Every reversal counts, in any
      // status: a reversal that already exists means this original is being reversed elsewhere, and
      // adding another one would leave two entries claiming the same original.
      if ((await scope.entries.findReversalsOf(ledgerId, originalEntryId)).length > 0) {
        throw errors.entryAlreadyReversed(originalEntryId);
      }

      const posted = draft.post();
      const result: ReversePostedEntryResult = { ...postedResultOf(posted), reversalOfEntryId: originalEntryId };

      await scope.entries.save(posted);
      await remember(scope, REVERSE_OPERATION, ledgerId, idempotencyKey, fingerprint, result);

      return result;
    });
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
