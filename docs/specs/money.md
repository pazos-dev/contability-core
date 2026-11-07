# SPEC — Money y Currency

Estado: lista para el primer incremento con las propuestas técnicas explícitas de ADR 0002.
Ruta: `src/core/domain/money/`.

## Responsabilidades y contrato propuesto

Currency es un valor inmutable con `code` y `scale`. Money combina `minorUnits: bigint` y Currency.
El par código/escala no es libre: debe existir en el catálogo ISO 4217 cerrado de
`docs/specs/currency-catalog.md`, que fija la escala oficial de cada código.
No usar símbolos ni formato localizado para identificar una moneda.

API orientativa: Currency.create(code, scale), Money.fromMinorUnits(value, currency),
Money.fromDecimal(text, currency), add, subtract, compare, equals, toDecimal y toJSON/fromJSON.
Elegir una firma coherente al implementar; no crear entidades con ID ni repositorios para estos valores.

Parser decimal propuesto: `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`, sin espacios ni notación científica.
Rechazar `+1`, `01`, `.5`, `1.`, comas y decimales que excedan scale incluso si son ceros.
Aceptar `-0` y normalizarlo a cero. Menos decimales se completan con ceros exactos.
Escala de 0 a 6, entera; código de tres letras A-Z y presente en el catálogo ISO 4217 incorporado.
La escala debe coincidir con la oficial del código, no la elige el llamador.
No normalizar entradas inválidas silenciosamente.
Money admite cero y negativos; JournalEntryLine restringe el importe a positivo.

JSON: `{ "minorUnits": "1025", "currency": { "code": "UYU", "scale": 2 } }`.
Validar datos unknown al reconstruir. `minorUnits` usa cadena entera canónica, sin decimales ni exponentes.
Excepciones propuestas: INVALID_CURRENCY, INVALID_MONEY, CURRENCY_MISMATCH.

## Criterios de aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| M01 | 0.10 + 0.20 en UYU escala 2 | 30n; decimal 0.30. |
| M02 | 10.25 - 2.10 | 815n; decimal 8.15. |
| M03 | 1.00 - 2.00 | -100n; decimal -1.00. |
| M04 | Sumar/comparar UYU con USD | CURRENCY_MISMATCH. |
| M05 | Código ISO con escala distinta de la oficial | `INVALID_CURRENCY` al construir; ese par no existe. |
| M06 | 1.001 en escala 2 | Error; no redondear. |
| M07 | NaN, Infinity, texto inválido, null o number como entrada decimal | Error de validación. |
| M08 | Operar con un Money | Operandos sin mutación ni fuga de referencias. |
| M09 | JSON y reconstrucción | Mismo importe y moneda, incluso por encima de MAX_SAFE_INTEGER. |
| M10 | Escala negativa, fraccionaria o mayor que 6 | Error. |
| M11 | Escala 0 con valor entero | Exactitud; rechazar parte decimal. |
| M12 | Modificar objeto de entrada o salida | No altera un Money existente. |
| M13 | Código bien formado y ausente del catálogo ISO | `INVALID_CURRENCY`; el catálogo cerrado vive en `docs/specs/currency-catalog.md`. |

`rounding-mode.ts` se añade solo al especificar una operación que redondee.
Conversión, reparto, multiplicación y límites fiscales quedan fuera del incremento.
El catálogo de monedas, sus criterios IC01-IC10 y el riesgo de monedas retiradas viven en
`docs/specs/currency-catalog.md`.
