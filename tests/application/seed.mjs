/**
 * Registers the ledgers a test needs, the way a host does.
 *
 * There is no configuration that makes a ledger exist anymore: `chartOfAccountsByLedger` is gone, so a
 * test that wants a ledger has to register it through the same use case an application uses.
 */
export async function seedLedgers(app, ledgers) {
  for (const [ledgerId, chartOfAccountsId] of Object.entries(ledgers)) {
    await app.registerLedger({ ledgerId, name: `Ledger ${ledgerId}`, chartOfAccountsId });
  }
}
