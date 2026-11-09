# 006 — Aplicación en memoria

Estado: especificado, pendiente de implementar en dos entregas. Leer AGENTS.md.
Reemplaza la versión anterior de este documento, que apuntaba a una sola spec inexistente.

## Resultado

Casos de uso de registro, contabilización, cierre y reversión sobre un adaptador en memoria, con las
validaciones cruzadas de `account.md`, `journal.md`, `period.md` y `entries.md`. Sin HTTP, ORM ni interfaz.

Las garantías que exigen una base real —rollback de base, aislamiento entre transacciones concurrentes, unicidad
durable— quedan declaradas como diferidas al incremento 007 y no se escriben como pruebas verdes.

## Alcance congelado

Decisiones tomadas con el usuario antes de escribir las specs:

| Tema | Decisión |
| --- | --- |
| Corte | Dos entregas: 006a registro y catálogo; 006b contabilización, cierre y reversión. |
| Q07 libro–plan | Puerto `LedgerDirectory`: el libro resuelve su plan. Sin entidad `Ledger` en esta fase. |
| Período al contabilizar | `periodId` del borrador es autoridad **y** se exige `contains(accountingDate)` sobre un período `OPEN`. |
| Idempotencia | Puerto y adaptador en memoria: U04/U05 verificados. U06 y la atomicidad de base diferidos a 007. |
| Cuenta agrupadora | Un hijo sólo se registra bajo un padre con `postingAllowed: false` (`ACCOUNT_PARENT_NOT_GROUPING`). No se agrega una operación nueva al dominio. |

## Specs

| Entrega | Spec | Criterios |
| --- | --- | --- |
| 006a | `docs/specs/registration.md` | R01-R16 |
| 006b | `docs/specs/post-entry.md` | U01-U05, U08-U17 (U03b, U06, U07 diferidos) |
| 006b | `docs/specs/close-period.md` | C01-C04, C06, C07 (C05 diferido) |
| 006b | `docs/specs/reverse-entry.md` | V01-V13 |

Procedimiento común: cargar las skills `accounting-implement` y `typescript-best-practices`, y
`clean-code-architecture` al distribuir responsabilidades. Implementar con test-first por regla. Actualizar
`docs/STATUS.md` con evidencia real y no marcar terminado porque existan las rutas.

## 006a — Registro y catálogo

Casos de uso: `registerAccount`, `setAccountStatus`, `registerJournal`, `setJournalStatus`, `registerPeriod`.

Piezas nuevas:

- `src/core/application/ports/`: `UnitOfWork` (con su alcance), `LedgerDirectory`, `AccountRepository`,
  `JournalRepository`, `PeriodRepository`, `IdempotencyRegistry`, `PostedMovementsQuery`.
- `src/core/application/contracts/`: entradas y salidas serializables de los cinco casos.
- `src/core/application/use-cases/`: los cinco casos, cada uno como fábrica de función asíncrona.
- `src/core/application/errors.ts`: `ApplicationError` y sus códigos.
- `src/core/application/index.ts` y `src/adapters/memory/index.ts`: barrels públicos.
- `src/adapters/memory/`: repositorios, registro de idempotencia y unidad de trabajo con restauración del
  estado previo ante error.
- `src/index.ts`: agrega los barrels nuevos. `tests/public-api.test.mjs` fija la superficie ampliada.

Reglas verificadas acá: A04, A05, A07, A09 (lado aplicación), J03, P07 y la regla de padre agrupador.

`PostedMovementsQuery` se declara y se prueba con un doble; su adaptador contra asientos llega en 006b.

## 006b — Contabilización, cierre y reversión

Casos de uso: `postEntry`, `closePeriod`, `reversePostedEntry`.

Piezas nuevas: `EntryRepository` (`findById` por libro, `save`, `findByReversalOf`), su adaptador en
memoria, el adaptador real de `PostedMovementsQuery` y una prueba por criterio de las tres specs.

Reglas verificadas acá: A06, J05, P05, la contención de fecha en el período, la prohibición de una segunda
reversión completa y la idempotencia de las tres operaciones.

## Diferido a 007, declarado en las specs

| Criterio | Por qué |
| --- | --- |
| U03b | Rollback con base real. |
| U06 | Dos `postEntry` simultáneos: requiere aislamiento. |
| U07 / P08 / C05 | Cierre y contabilización concurrentes: requiere serialización. |
| Unicidad durable de la reversión | Restricción única sobre `reversalOfEntryId`. |

## Cierre de la entrega

- `pnpm check:project`, `pnpm typecheck`, `pnpm build` y `pnpm test` en verde, con el conteo real.
- `docs/STATUS.md` con criterio por criterio, y los diferidos listados como pendientes y no como resueltos.
- `docs/OPEN-QUESTIONS.md` actualizado en Q07 y Q11.
