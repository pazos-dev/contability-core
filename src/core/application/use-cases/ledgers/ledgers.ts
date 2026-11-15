import { Ledger } from '../../../domain/ledger/index.js';
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
