# Estado del proyecto

Actualizado: 2026-11-06. Entrega: preparación 2.0. Último incremento verificado: 001-money.

## Implementado y verificado

- `docs/specs/money.md` completo: M01-M12 con prueba en `tests/money.test.mjs` (16 pruebas).
- `src/core/domain/money/`: `currency.ts`, `money.ts`, `money-errors.ts`.
- `Currency`: código de tres letras A-Z y escala entera de 0 a 6; inmutable, `equals`, `toJSON`/`fromJSON`.
- `Money`: `bigint` en unidades mínimas, parser decimal exacto sin redondeo, `add`, `subtract`,
  `compare`, `equals`, `toDecimal`, `toJSON`/`fromJSON`.
- `MoneyError` con códigos estables `INVALID_CURRENCY`, `INVALID_MONEY`, `CURRENCY_MISMATCH`.
- API pública desde `src/index.ts`: `Currency`, `Money`, `MoneyError`, `CurrencyJSON`, `MoneyJSON`, `MoneyErrorCode`.

## Comprobaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Correcto: rutas, enlaces, configuración y seis skills. |
| `pnpm typecheck` | Correcto sobre `src/`. |
| `pnpm build` | Correcto; emite `dist/` con declaraciones. |
| `pnpm test` | 16 pruebas, 16 correctas, 0 fallos (`tests/money.test.mjs`). |

Las pruebas consumen `dist/index.js`, por lo que requieren `pnpm build` antes de `pnpm test`.

## Límites de esta entrega

Sin redondeo (`rounding-mode.ts` no existe aún), sin conversión de moneda, sin multiplicación,
división ni reparto. La escala admitida es 0-6 y el código de moneda es la forma A-Z de tres letras,
no un catálogo oficial. `Money` admite cero y negativos; la restricción a importes positivos
pertenece a las líneas de asiento (tarea 005).

## Pendiente de implementar

Cuentas, diario, períodos, asientos, casos de uso, adaptadores y la API pública restante.
Sin ORM, HTTP ni interfaz visual.

## Siguiente tarea

`docs/tasks/002-account.md`. Invariantes locales A01-A03 y A08; mantener las validaciones que
cruzan entidades en aplicación.

## Relevo de sesión

Al terminar, registrar tarea completada, archivos relevantes, comandos ejecutados, errores pendientes
y siguiente incremento. No confundir un criterio de aceptación documentado con uno verificado en código.
