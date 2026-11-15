import { Ledger } from '../../../domain/ledger/index.js';
import type { RegisterLedgerInput, RegisterLedgerResult } from '../../dto.js';
import type { ApplicationDeps } from '../../ports.js';
import { fingerprintOf, Idempotency } from '../shared/index.js';
import { requireFreeLedgerId } from './rules.js';

const REGISTER_OPERATION = 'registerLedger';

export class Ledgers {
  /**
   * Registers a ledger with its chart of accounts, which is what makes the module self-contained: before
   * this operation the only isolation scope arrived by adapter configuration.
   *
   * The chart is stored as an opaque identifier and is never verified to exist (Q07), and several ledgers
   * may share one chart, so registering a ledger does not touch accounts, journals, periods or entries.
   */
  static async register(deps: ApplicationDeps, input: RegisterLedgerInput): Promise<RegisterLedgerResult> {
    const { ledgerId, name, chartOfAccountsId, idempotencyKey } = input;
    const fingerprint = fingerprintOf({ ledgerId, name, chartOfAccountsId });

    return deps.unitOfWork.run(async (scope) => {
      const idempotency = Idempotency.of(scope, REGISTER_OPERATION, ledgerId);

      return idempotency.execute(idempotencyKey, fingerprint, async () => {
        await requireFreeLedgerId(scope, ledgerId);

        const ledger = Ledger.create({ id: ledgerId, name, chartOfAccountsId });
        const result: RegisterLedgerResult = {
          ledgerId: ledger.id,
          name: ledger.name,
          chartOfAccountsId: ledger.chartOfAccountsId,
          status: ledger.status,
        };

        await scope.ledgers.save(ledger);

        return result;
      });
    });
  }
}
