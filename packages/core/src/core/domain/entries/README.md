# entries

Responsabilidad: Asiento, líneas, equilibrio, estados y reversión.
Especificación desde la raíz: `docs/specs/entries.md`.
Estado: implementado y probado (criterios E01-E11) por `packages/core/tests/domain/entries/entries.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `journal-entry.ts` — agregado inmutable: identidad, líneas, contabilización y borrador de reversión.
- `entry-text.ts` — helper interno de validación de texto, compartido por el agregado y la línea.
- `value-objects/journal-entry-line.ts` — valor inmutable con cuenta, lado DEBIT/CREDIT e importe
  estrictamente positivo.
- `types/entry-status.ts` — `DRAFT`/`POSTED`; POSTED es terminal dentro del agregado.
- `types/posting-side.ts` — `DEBIT`/`CREDIT`.
- `errors/entry-errors.ts` — `EntryError` con códigos estables y fábricas de error.
- `dto/journal-entry-dto.ts` — `JournalEntryInput` y `JournalEntryReversalInput` (entradas de construcción),
  más `JournalEntryFields` y `JournalEntryChanges` (estado validado y campos reemplazables).
- `dto/journal-entry-line-dto.ts` — `JournalEntryLineInput` y `JournalEntryLineFields`.

El agregado queda en la raíz del dominio porque es su puerta de entrada, junto al helper interno que
comparte con la línea; el resto se agrupa por naturaleza en `value-objects/`, `types/`, `errors/` y `dto/`.
Los `*Fields` y `*Changes` se exportan desde su módulo para que la clase los importe, pero no salen por el
barrel: son internos, igual que antes de tener archivo propio.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
Importa `Money` de `shared/money/index.ts` y `AccountingDate` de `period/index.ts`: nunca archivos internos ajenos.

Cada mutación devuelve una copia; el receptor no cambia nunca. Por eso un `post()` rechazado no deja
nada a medio hacer. `lines` entrega una copia congelada en cada lectura.

El agregado no demuestra nada sobre el mundo exterior: no verifica cuentas activas ni contabilizables,
ni la pertenencia al diario o al libro, ni que el período de `periodId` contenga `accountingDate`.
Una segunda reversión del mismo asiento y las carreras entre reversiones son reglas de aplicación.
