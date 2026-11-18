/**
 * Registers the ledgers a test needs, the way a host does.
 *
 * There is no configuration that makes a ledger exist anymore: `chartOfAccountsByLedger` is gone, so a
 * test that wants a ledger has to register it through the same use case an application uses.
 */
export async function seedLedgers(app, ledgers, currency = TEST_CURRENCY) {
  for (const [ledgerId, chartOfAccountsId] of Object.entries(ledgers)) {
    await app.registerLedger({
      ledgerId,
      name: `Ledger ${ledgerId}`,
      chartOfAccountsId,
      currency,
    });
  }
}

/**
 * The functional currency the fixtures register their ledgers in. It is a choice of the harness, not a
 * default of the core: a suite that needs another currency registers its ledger itself, because the core
 * deliberately has no currency to fall back to.
 */
export const TEST_CURRENCY = { code: 'UYU', scale: 2 };

/**
 * Stores an entry the way a host persists one it built itself: through the unit of work, never through a
 * repository held outside it. A write outside a run is not covered by the backup, so a later failing run
 * could silently discard it.
 */
export async function saveEntry(memory, entry) {
  await memory.unitOfWork.run((scope) => scope.entries.save(entry));
}
