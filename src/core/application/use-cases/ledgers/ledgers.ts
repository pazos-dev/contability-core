import { Ledger } from '../../../domain/ledger/index.js';
import { Currency } from '../../../domain/shared/money/index.js';
import type {
  RegisterLedgerInput,
  RegisterLedgerResult,
  SetLedgerStatusInput,
  SetLedgerStatusResult,
} from '../../dto.js';
import * as errors from '../../errors.js';
import type { ApplicationDeps } from '../../ports.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreeLedgerId, requireLedger } from './rules.js';

const REGISTER_OPERATION = 'registerLedger';

export class Ledgers {
  /**
   * Registers a ledger with its chart of accounts and its functional currency, which is what makes the module
   * self-contained: before this operation the only isolation scope arrived by adapter configuration.
   *
   * The chart is stored as an opaque identifier and is never verified to exist (Q07), and several ledgers
   * may share one chart, so registering a ledger does not touch accounts, journals, periods or entries.
   *
   * The currency is hydrated here and not in the domain, the same way the lines of an entry hydrate their
   * `Money`: the serializable surface carries `CurrencyJSON`, and the domain only ever sees a `Currency`. It
   * goes into the idempotency fingerprint because it is part of the request; leaving it out would answer a
   * retry that changes the ledger's unit of account with the stored result.
   */
  static async register(deps: ApplicationDeps, input: RegisterLedgerInput): Promise<RegisterLedgerResult> {
    const { ledgerId, name, chartOfAccountsId, currency, idempotencyKey } = input;

    // Hydrated before the fingerprint and before the idempotency lookup, for two reasons. The fingerprint has
    // to be built from the canonical currency and not from the key order the caller happened to write, or the
    // same request sent as `{scale, code}` would conflict with `{code, scale}`. And an unusable currency must
    // fail as the domain error it is, instead of matching a stored fingerprint and replaying a result for a
    // ledger whose currency cannot even be read.
    const ledgerCurrency = Currency.fromJSON(currency);
    const fingerprint = fingerprintOf({
      ledgerId,
      name,
      chartOfAccountsId,
      currency: `${ledgerCurrency.code}/${ledgerCurrency.scale}`,
    });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireFreeLedgerId(scope, ledgerId);

        const ledger = Ledger.create({
          id: ledgerId,
          name,
          chartOfAccountsId,
          currency: ledgerCurrency,
        });
        const result: RegisterLedgerResult = {
          ledgerId: ledger.id,
          name: ledger.name,
          chartOfAccountsId: ledger.chartOfAccountsId,
          currency: ledger.currency.toJSON(),
          status: ledger.status,
        };

        await scope.ledgers.save(ledger);

        return result;
      });
    });
  }

  /**
   * Activates or deactivates a ledger. Deactivating keeps the ledger and its history (R5) and never touches
   * the accounts, journals, periods or entries that reference it; activating returns it to ACTIVE (R7).
   *
   * Repeating the current status is a no-op, which is why this operation takes no idempotency key: there is
   * no second effect to avoid.
   */
  static async setStatus(deps: ApplicationDeps, input: SetLedgerStatusInput): Promise<SetLedgerStatusResult> {
    const { ledgerId, status } = input;
    // Without this guard an unknown status would fall into the activation branch and look like a success.
    if (status !== 'ACTIVE' && status !== 'INACTIVE') throw errors.invalidApplicationInput('status', status);

    return deps.unitOfWork.run(async (scope) => {
      const ledger = await requireLedger(scope, ledgerId);

      const next = status === 'INACTIVE' ? ledger.deactivate() : ledger.activate();
      await scope.ledgers.save(next);

      return { ledgerId: next.id, status: next.status };
    });
  }
}
