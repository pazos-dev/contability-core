# money

Responsabilidad: Currency y Money exactos.
Especificación desde la raíz: `docs/specs/money.md`.
Estado: implementado y probado (criterios M01-M15 e IC01-IC14) por `tests/domain/money/money.test.mjs` y
`tests/domain/money/currency-catalog.test.mjs`.

Archivos:

- `index.ts` — barrel público del dominio; el resto de archivos es interno.
- `value-objects/currency.ts` — objeto de valor inmutable con `code` y `scale`; para un código ISO con unidad
  menor decimal la escala es la oficial y no la elige el llamador, y un código ausente del catálogo se acepta
  como moneda propia con la escala declarada.
- `value-objects/money.ts` — importe en unidades mínimas `bigint` junto a su moneda.
- `currency-catalog.ts` — tabla ISO 4217 incorporada generada por `pnpm sync:iso4217`; no editar a mano.
  Conserva `IsoCurrencyEntry` porque la próxima regeneración reescribe el archivo completo.
- `errors/money-errors.ts` — `MoneyError` con código estable y fábricas de error.
- `dto/currency-dto.ts` y `dto/money-dto.ts` — `CurrencyJSON` y `MoneyJSON`, las representaciones
  serializadas que cruzan el límite.

Este dominio no tiene agregado: es todo valores, así que la raíz sólo guarda el catálogo generado y el
barrel. El resto se agrupa en `value-objects/`, `errors/` y `dto/`; no hay `types/` porque sus uniones
cerradas son códigos de error y viven junto a su error.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
No usa coma flotante ni convierte importes por `number`; JSON intercambia `minorUnits` como cadena entera.
El catálogo ya no es una puerta cerrada: fija la escala oficial de los códigos que publica, y un
código ausente se acepta como moneda propia. Por eso una moneda retirada del ISO sigue siendo legible,
con la escala que se persistió: ver la regla 13 en `docs/specs/currency-catalog.md`.
