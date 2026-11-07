# money

Responsabilidad: Currency y Money exactos.
Especificación desde la raíz: `docs/specs/money.md`.
Estado: implementado y probado (criterios M01-M13 e IC01-IC10) por `tests/money.test.mjs` y
`tests/currency-catalog.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `currency.ts` — objeto de valor inmutable con `code` y `scale`; el par debe existir en el catálogo
  ISO 4217, así que la escala no la elige el llamador.
- `currency-catalog.ts` — tabla ISO 4217 incorporada generada por `pnpm sync:iso4217`; no editar a mano.
- `money.ts` — importe en unidades mínimas `bigint` junto a su moneda.
- `money-errors.ts` — `MoneyError` con código estable y fábricas de error.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
No usa coma flotante ni convierte importes por `number`; JSON intercambia `minorUnits` como cadena entera.
El catálogo cerrado implica que un código retirado del ISO deja de ser válido: ver IC-Q01 en
`docs/specs/currency-catalog.md` antes de persistir datos históricos.
