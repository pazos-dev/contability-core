# money

Responsabilidad: Currency y Money exactos.
Especificación desde la raíz: `docs/specs/money.md`.
Ubicación: `src/core/domain/shared/money/`. Es el kernel compartido del dominio, no un contexto acotado: no
tiene agregado propio y no lo posee ningún dominio del negocio. `entries` y la capa de aplicación lo importan
por su barrel.
Estado: implementado y probado. Criterios M01-M15 e IC01-IC14 por `tests/domain/shared/money/money.test.mjs`
y `tests/domain/shared/money/currency-catalog.test.mjs`; redondeo, factor exacto y reparto (RD01-RD20) por
`tests/domain/shared/money/rounding.test.mjs`, con la especificación en `docs/specs/rounding.md`.

Archivos:

- `index.ts` — barrel público del concepto; el resto de archivos es interno.
- `currency.ts` — objeto de valor inmutable con `code` y `scale`; para un código ISO con unidad menor decimal
  la escala es la oficial y no la elige el llamador, y un código ausente del catálogo se acepta como moneda
  propia con la escala declarada.
- `money.ts` — importe en unidades mínimas `bigint` junto a su moneda: suma, resta, comparación y las tres
  operaciones con factor (`multiply`, `divide`, `allocate`), que redondean una sola vez y al final.
- `factor.ts` — `MoneyFactor`, factor decimal exacto guardado como `numerador/denominador` en potencias de diez;
  nunca pasa por coma flotante.
- `rounding-mode.ts` — `RoundingMode` (`HALF_UP`, `HALF_EVEN`, `DOWN`) y el modo por defecto, `HALF_UP`.
- `currency-catalog.ts` — tabla ISO 4217 incorporada generada por `pnpm sync:iso4217`; no editar a mano.
  Conserva `IsoCurrencyEntry`. Vive junto a `currency.ts` porque es su dato, no el centro de la carpeta.
- `money-errors.ts` — `MoneyError` con código estable y fábricas de error.
- `dto/currency-dto.ts` y `dto/money-dto.ts` — `CurrencyJSON` y `MoneyJSON`, las representaciones serializadas
  que cruzan el límite.

La carpeta queda plana, sin `value-objects/`, `types/` ni `errors/`: son tres valores, un modo de redondeo y su
error, así que esas carpetas no separarían nada y producirían rutas como `value-objects/money.ts`. Sólo `dto/` se mantiene, porque
separa datos de comportamiento y eso sigue siendo cierto en un kernel. Las carpetas por naturaleza son de los
contextos acotados, que sí mezclan agregado, valores, tipos y errores.

Sin dependencias de Node, HTTP, base de datos, framework o aplicación.
No usa coma flotante ni convierte importes por `number`; JSON intercambia `minorUnits` como cadena entera.
El catálogo ya no es una puerta cerrada: fija la escala oficial de los códigos que publica, y un
código ausente se acepta como moneda propia. Por eso una moneda retirada del ISO sigue siendo legible,
con la escala que se persistió: ver la regla 13 en `docs/specs/currency-catalog.md`.
