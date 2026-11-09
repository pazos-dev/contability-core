# Responsabilidad

Operaciones de la aplicación: registrar cuentas, diarios y períodos; después contabilizar, cerrar y
revertir.

Estado: 006a implementado (`register-account.ts`, `set-account-status.ts`, `register-journal.ts`,
`set-journal-status.ts`, `register-period.ts`, más el auxiliar interno `idempotency.ts`).
Cada caso de uso es una fábrica de función asíncrona: `makeX(deps)` devuelve `(input) => Promise<result>`.
Consultar `docs/specs/registration.md`.
