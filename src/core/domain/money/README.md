# money

Responsabilidad: Currency y Money exactos.
Especificación desde la raíz: `docs/specs/money.md`.
Estado: implementado y probado (criterios M01-M12) por `tests/money.test.mjs`.

Archivos:

- `currency.ts` — objeto de valor inmutable con `code` y `scale`; la escala forma parte de la identidad.
- `money.ts` — importe en unidades mínimas `bigint` junto a su moneda.
- `money-errors.ts` — `MoneyError` con código estable y fábricas de error.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
No usa coma flotante ni convierte importes por `number`; JSON intercambia `minorUnits` como cadena entera.
