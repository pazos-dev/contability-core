import { JournalEntry } from '../../../domain/entries/index.js';
import { AccountingDate } from '../../../domain/period/index.js';
import type { ApplicationDeps } from '../../ports.js';
import type {
  AddEntryLineInput,
  ChangeEntryHeaderInput,
  CreateEntryDraftInput,
  EntryDraftResult,
  PostEntryInput,
  PostEntryResult,
  RemoveEntryLineInput,
  ReversePostedEntryInput,
  ReversePostedEntryResult,
} from '../../dto.js';
import {
  requireAccountOfPlan,
  requireActiveJournal,
  requireActiveLedger,
  requireChartOfAccountsId,
  requireEntry,
  requireFreeEntryId,
  requireJournal,
  requireOpenPeriodContaining,
  requirePeriod,
  requirePostableAccount,
} from '../shared/rules.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { draftResultOf, lineOf, normalizedLine, postedResultOf } from './result.js';
import { requireLedgerCurrency, requireNoPostedReversal, requireNoReversal } from './rules.js';

const CREATE_OPERATION = 'createEntryDraft';
const ADD_OPERATION = 'addEntryLine';
const REMOVE_OPERATION = 'removeEntryLine';
const CHANGE_HEADER_OPERATION = 'changeEntryHeader';
const POST_OPERATION = 'postEntry';
const REVERSE_OPERATION = 'reversePostedEntry';

export class Entries {

  /**
   * Creates the draft that `postEntry` later posts.
   *
   * It validates only what makes the draft *coherent*: a known ledger, a free entry id, and a journal,
   * a period and accounts that exist in that ledger. It deliberately does not require an active journal,
   * an open period or a balanced entry: a draft may be prepared against a journal that is reactivated
   * later, and every posting rule is re-checked by `postEntry` anyway.
   */
  static async createDraft(deps: ApplicationDeps, input: CreateEntryDraftInput): Promise<EntryDraftResult> {
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

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, CREATE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        await requireFreeEntryId(scope, ledgerId, entryId);
        await requireJournal(scope, ledgerId, journalId);
        await requirePeriod(scope, ledgerId, periodId);
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

        return result;
      });
    });
  }

  /**
   * Adds one line to an existing draft.
   *
   * It only checks that the new line is coherent with the ledger: the account must exist in the same chart
   * of accounts. It does not require the account to be active or postable, and it does not re-check the rest
   * of the draft — an unfinished draft is a legitimate state and `postEntry` re-validates everything.
   */
  static async addLine(deps: ApplicationDeps, input: AddEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, line, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, line: normalizedLine(line) });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, ADD_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const chartOfAccountsId = await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);
        await requireAccountOfPlan(scope, line.accountId, chartOfAccountsId);

        // The aggregate owns the state rules: a posted entry rejects new lines.
        const updated = entry.addLine(lineOf(line));

        const result = draftResultOf(updated);
        await scope.entries.save(updated);

        return result;
      });
    });
  }

  /**
   * Removes one line from an existing draft by id.
   *
   * It does not query accounts: the line that is leaving has nothing to validate. The aggregate owns the
   * state rules: a posted entry rejects removals, and an unknown line id is `ENTRY_LINE_NOT_FOUND`.
   */
  static async removeLine(deps: ApplicationDeps, input: RemoveEntryLineInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, lineId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, lineId });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REMOVE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);

        const updated = entry.removeLine(lineId);

        const result = draftResultOf(updated);
        await scope.entries.save(updated);

        return result;
      });
    });
  }

  /**
   * Replaces the header of an existing draft: journal, period, accounting date and description.
   *
   * It requires the destination journal and period to exist in the same ledger and nothing else: a draft is
   * tolerant, so an inactive journal, a closed period and a date outside that period are all accepted. Those
   * are posting concerns and `postEntry` re-checks them whole. The aggregate owns the state rule, so a posted
   * entry is rejected with `ENTRY_STATE`, and changing the header does not revalidate the lines: a draft may
   * stay unbalanced and be fixed later.
   */
  static async changeHeader(deps: ApplicationDeps, input: ChangeEntryHeaderInput): Promise<EntryDraftResult> {
    const { ledgerId, entryId, journalId, periodId, accountingDate, description, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId, journalId, periodId, accountingDate, description });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, CHANGE_HEADER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireChartOfAccountsId(scope, ledgerId);
        const entry = await requireEntry(scope, ledgerId, entryId);
        await requireJournal(scope, ledgerId, journalId);
        await requirePeriod(scope, ledgerId, periodId);

        // The aggregate owns the state rule and the four fields; the date is parsed here, like on creation.
        const updated = entry.changeHeader({
          journalId,
          periodId,
          accountingDate: AccountingDate.create(accountingDate),
          description,
        });

        const result = draftResultOf(updated);
        await scope.entries.save(updated);

        return result;
      });
    });
  }

  /**
   * Posts a persisted draft.
   *
   * It owns every rule the aggregate cannot decide alone: the ledger resolves the chart of accounts the
   * lines must belong to (Q07) and the functional currency they must be denominated in (Q08), and the
   * journal, the period and the accounts must still admit the posting. The draft's `periodId` is
   * authoritative, but it does not prove the accounting date falls inside that period, so the two are
   * checked together (P05, A06, J05).
   *
   * The entry is never edited here: it is loaded, posted in memory and saved once, together with the
   * idempotency record, inside one unit of work.
   */
  static async post(deps: ApplicationDeps, input: PostEntryInput): Promise<PostEntryResult> {
    const { ledgerId, entryId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, entryId });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, POST_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const ledger = await requireActiveLedger(scope, ledgerId);
        const chartOfAccountsId = ledger.chartOfAccountsId;
        const entry = await requireEntry(scope, ledgerId, entryId);
        requireLedgerCurrency(ledger, entry);
        await requireActiveJournal(scope, ledgerId, entry.journalId);
        await requireOpenPeriodContaining(scope, ledgerId, entry.periodId, entry.accountingDate);
        for (const line of entry.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
        await requireNoPostedReversal(scope, ledgerId, entry);

        // Asked after every application guard and immediately before the save; the aggregate's own checks run
        // after it, so a draft it rejects can burn a number, which rule 7 allows and HA43 accepts as a gap.
        const posted = entry.post(await scope.entryNumbers.nextNumber(ledgerId));
        const result = postedResultOf(posted);

        await scope.entries.save(posted);

        return result;
      });
    });
  }

  /**
   * Reverses a posted entry with a second, mirrored entry.
   *
   * The original is never touched: the reversal is a new entry with its own id, period and date, and the
   * link is `reversalOfEntryId`. Only one full reversal per original is allowed, and the check sits right
   * before the write so persistence can back it with a unique constraint in 007.
   *
   * The destination period must be open even when the original period is already closed, and the accounts
   * of the original must still admit postings: reversing is not a way around a deactivated account. The
   * reversal is denominated in the currency of the original, so it must still be the ledger's functional
   * currency (Q08): the guard is here too because this path also leaves an entry in POSTED.
   */
  static async reverse(deps: ApplicationDeps, input: ReversePostedEntryInput): Promise<ReversePostedEntryResult> {
    const { ledgerId, originalEntryId, reversalEntryId, periodId, accountingDate, description, idempotencyKey } = input;
    const fingerprint = fingerprintOf({
      ledgerId,
      originalEntryId,
      reversalEntryId,
      periodId,
      accountingDate,
      description,
    });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REVERSE_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        const ledger = await requireActiveLedger(scope, ledgerId);
        const chartOfAccountsId = ledger.chartOfAccountsId;
        const original = await requireEntry(scope, ledgerId, originalEntryId);

        // The aggregate refuses to reverse anything that is not POSTED, with its own ENTRY_STATE code.
        const draft = original.createReversalDraft({
          id: reversalEntryId,
          periodId,
          accountingDate: AccountingDate.create(accountingDate),
          ...(description === undefined ? {} : { description }),
        });
        requireLedgerCurrency(ledger, draft);

        await requireActiveJournal(scope, ledgerId, original.journalId);
        await requireOpenPeriodContaining(scope, ledgerId, periodId, draft.accountingDate);
        for (const line of draft.lines) await requirePostableAccount(scope, line.accountId, chartOfAccountsId);
        await requireFreeEntryId(scope, ledgerId, reversalEntryId);
        await requireNoReversal(scope, ledgerId, originalEntryId);

        // Asked after every application guard and immediately before the save; the aggregate's own checks run
        // after it, so a draft it rejects can burn a number, which rule 7 allows and HA43 accepts as a gap.
        const posted = draft.post(await scope.entryNumbers.nextNumber(ledgerId));
        const result: ReversePostedEntryResult = { ...postedResultOf(posted), reversalOfEntryId: originalEntryId };

        await scope.entries.save(posted);

        return result;
      });
    });
  }
}
