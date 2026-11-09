# entries

Responsabilidad: Asiento, líneas, equilibrio, estados y reversión.
Especificación desde la raíz: `docs/specs/entries.md`.
Estado: implementado y probado (criterios E01-E11) por `tests/entries.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `journal-entry.ts` — agregado inmutable: identidad, líneas, contabilización y borrador de reversión.
- `journal-entry-line.ts` — valor inmutable con cuenta, lado DEBIT/CREDIT e importe estrictamente positivo.
- `entry-status.ts` — `DRAFT`/`POSTED`; POSTED es terminal dentro del agregado.
- `posting-side.ts` — `DEBIT`/`CREDIT`.
- `entry-errors.ts` — `EntryError` con códigos estables y fábricas de error.
- `entry-text.ts` — helper interno de validación de texto, compartido por el agregado y la línea.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
Importa `Money` de `money/index.ts` y `AccountingDate` de `period/index.ts`: nunca archivos internos ajenos.

Cada mutación devuelve una copia; el receptor no cambia nunca. Por eso un `post()` rechazado no deja
nada a medio hacer. `lines` entrega una copia congelada en cada lectura.

El agregado no demuestra nada sobre el mundo exterior: no verifica cuentas activas ni contabilizables,
ni la pertenencia al diario o al libro, ni que el período de `periodId` contenga `accountingDate`.
Una segunda reversión del mismo asiento y las carreras entre reversiones son reglas de aplicación.
