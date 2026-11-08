# SPEC — Catálogo de monedas ISO 4217

Estado: revisada; modelo mixto decidido el 2026-11-08.
Entrega: revisión del incremento 005 del core. El catálogo deja de ser una puerta cerrada y pasa a ser
la fuente de la escala oficial donde existe, sin impedir las monedas propias del usuario.
Fuente: ISO 4217, lista oficial de una moneda por país y por fondo publicada por SIX Group
(`list-one.xml`, `Pblshd="2026-09-17"`), incorporada el 2026-11-06.
Ruta: `src/core/domain/money/currency-catalog.ts` y `src/core/domain/money/currency.ts`.

## Objetivo

Que `Currency` no pueda representar un código ISO 4217 con una escala distinta de la oficial, y que a
la vez el usuario pueda crear la moneda que realmente usa sin quedar bloqueado por la tabla.
El catálogo es la lista de códigos ISO 4217 con unidad menor decimal y su escala canónica.

## Alcance y exclusiones

Incluye: validación de forma en `Currency.create` y `Currency.fromJSON`; exigitividad de la escala
oficial para los códigos que el catálogo publica; aceptación de códigos ausentes del catálogo como
monedas propias con escala declarada; tabla versionada generada desde la fuente oficial; comando de
regeneración.

Excluye: símbolos y nombres de moneda, formato localizado, tasas de cambio, conversión, moneda
funcional por libro y redondeo. `Currency` conserva únicamente `code` y `scale`. La vigencia histórica
no se modela como tal: una moneda retirada se resuelve por el régimen propio (regla 13).

## Entradas y salidas

`Currency.create(code, scale)` y `Currency.fromJSON({ code, scale })` reciben el código de tres
letras A-Z y la escala entera. La salida es un `Currency` inmutable cuyo par `(code, scale)` es válido
en el régimen que corresponde al código:

- **régimen ISO**: el código está en el catálogo con unidad menor decimal y la escala debe ser la
  oficial;
- **régimen propio**: el código no está en el catálogo y la escala es la que declara el llamador.

Datos de la tabla vigente incorporada:

| Grupo | Cantidad | Escalas |
| --- | --- | --- |
| Monedas con unidad menor decimal | 165 | 0: 17 · 2: 139 · 3: 7 · 4: 2 |
| Códigos ISO sin unidad menor decimal | 13 | `N.A.`: XAG XAU XBA XBB XBC XBD XDR XPD XPT XSU XTS XUA XXX |

Escala 0: BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF.
Escala 3: BHD IQD JOD KWD LYD OMR TND. Escala 4: CLF UYW. El resto de los códigos con escala
decimal usa escala 2.

## Reglas e invariantes

1. El código debe tener forma de tres letras mayúsculas A-Z; el formato se valida antes que la pertenencia.
2. Todo código pertenece a uno de dos regímenes y la pertenencia al catálogo decide cuál. El régimen
   no es opcional: un código publicado por el catálogo no puede tratarse como propio.
3. Régimen ISO: la escala debe ser exactamente la oficial del código. Un `(code, scale)` que no
   coincide se rechaza: para una moneda ISO la escala no es un parámetro libre del llamador.
4. Régimen propio: un código bien formado y ausente del catálogo se acepta con cualquier escala entera
   de 0 a 6, y el llamador asume la escala que declara. Es la vía para monedas fuera de ISO 4217 y
   para monedas que ISO retiró.
5. Un código ISO sin unidad menor decimal se rechaza con razón propia y distinta de "no es ISO".
   Está en el catálogo, así que no admite régimen propio, y el core no puede representar una moneda
   que no tiene unidad menor.
6. La escala admitida es un entero de 0 a 6 por límite estructural de `Currency`; hoy la tabla usa
   0, 2, 3 y 4.
7. `fromJSON` aplica exactamente las reglas 1 a 6; JSON no es una vía para saltar el catálogo ni para
   reinterpretar la escala de una moneda ISO.
8. Para una moneda ISO, el código fija la escala. Para una moneda propia, el par `(code, scale)` es la
   identidad completa: dos `Currency` con el mismo código propio y escalas distintas son monedas
   distintas, `equals` las distingue y `Money` las rechaza juntas con `CURRENCY_MISMATCH`.
9. La tabla incorporada es el dato canónico en tiempo de ejecución. Regenerarla con
   `pnpm sync:iso4217` desde la fuente oficial, nunca editando entradas a mano.
10. El generador falla cerrado y **no escribe el catálogo** ante: documento truncado o sin fecha de
    publicación, unidad menor fuera del patrón `N.A.` o un dígito 0-6, entrada sin código que no sea
    `No universal currency`, código repetido con dos escalas distintas, o tabla con menos de 100
    monedas con escala decimal.
11. La tabla se ordena por punto de código y registra fuente, fecha de publicación y SHA-256 del XML
    incorporado. La huella es trazabilidad, no una comprobación en ejecución: el ancla contra un
    cambio no buscado son los criterios IC10 e IC11.
12. La escala se persiste junto al importe y **nunca se deduce del código**. Un importe reconstruido
    sin escala, o con una escala que no coincide con la oficial, falla en lugar de reinterpretar el
    valor. El catálogo responde "qué escala tiene hoy esta moneda", no "qué escala tenía el dato
    guardado". Ver M14 y M15 en `docs/specs/money.md`.
13. Una moneda retirada del ISO sale del catálogo y pasa al régimen propio, así que un importe guardado
    con ella se sigue leyendo con la escala que se persistió. El costo explícito: ese código pierde la
    guardia de escala, porque la tabla ya no puede corregir una escala equivocada.

## Errores

Todos son `MoneyError` con código `INVALID_CURRENCY`. El texto final lo compone el envoltorio ya
vigente de `money-errors.ts` como `Invalid currency: <razón>.`; las filas de abajo son la **razón**,
no el mensaje completo. No hay efectos parciales porque `Currency` es un valor inmutable sin estado
externo.

Precedencia: forma del código, luego rango estructural de la escala; recién después se consulta el
catálogo. Por eso `Currency.create('ABC', 7)` informa el rango y no la ausencia del catálogo, y un
código ausente nunca produce error.

| Condición | Mensaje esperado |
| --- | --- |
| Forma inválida | `code "usd" must be three uppercase letters A-Z` |
| Moneda ISO sin unidad menor decimal | `code "XAU" is an ISO 4217 currency without a decimal minor unit` |
| Escala no oficial | `scale 3 does not match ISO 4217 scale 2 for code "UYU"` |
| Escala fuera de rango o fraccionaria | `scale ... must be an integer between 0 and 6` |

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| IC01 | `UYU` en el catálogo con escala 2 | `Currency.create('UYU', 2)` | Válido; `scale` es 2. |
| IC02 | `UYU` oficial escala 2 | `Currency.create('UYU', 3)` | `INVALID_CURRENCY`; no se crea la moneda. |
| IC03 | `ABC` bien formado y ausente del catálogo | `Currency.create('ABC', 2)` | Válido; moneda propia con escala 2. |
| IC04 | `XAU` presente con unidad menor `N.A.` | `Currency.create('XAU', 0)` | `INVALID_CURRENCY` por moneda sin unidad menor decimal. |
| IC05 | Escalas oficiales 0, 3 y 4 | `CLP`, `KWD` y `CLF` con su escala | Los tres válidos. |
| IC06 | JSON con código ausente del catálogo | `Currency.fromJSON({ code: 'ABC', scale: 3 })` | Válido; conserva la escala 3 del JSON. |
| IC07 | JSON con escala no oficial | `Currency.fromJSON({ code: 'UYU', scale: 0 })` | `INVALID_CURRENCY`. |
| IC08 | Forma inválida | `usd`, `US`, `USDX`, ` UYU` | `INVALID_CURRENCY` por forma. |
| IC09 | Escala no entera, negativa o mayor que 6 | `Currency.create('UYU', value)` | `INVALID_CURRENCY` por rango estructural. |
| IC10 | Tabla incorporada | Recorrer el catálogo | 165 códigos con escala decimal y 13 sin unidad menor decimal. |
| IC11 | Escalas 0, 3, 4 y códigos sin unidad menor decimal | Recorrer el catálogo | Coinciden código por código con las listas ancladas: un cambio de tabla exige actualizar la prueba. |
| IC12 | Moneda propia en los extremos de escala | `Currency.create('ABC', 0)` y `Currency.create('XYZ', 6)` | Válidos con `scale` 0 y 6. |
| IC13 | Mismo código propio con dos escalas | `ABC` con escala 0 y con escala 6 | Dos monedas distintas: `equals` es falso y `Money.add` entre ambas da `CURRENCY_MISMATCH`. |
| IC14 | Código que ISO retiró | `Currency.fromJSON({ code: 'HRK', scale: 2 })` | Válido; se lee con la escala persistida porque el código está fuera del catálogo. |

## Decisiones pendientes

| ID | Tema | Estado e impacto |
| --- | --- | --- |
| IC-Q01 | Monedas retiradas del ISO | **Resuelto por el modelo mixto (regla 13).** Una moneda retirada sale del catálogo y pasa al régimen propio, así que su importe histórico se lee con la escala persistida y deja de romper. Contrapartida registrada: ese código pierde la guardia de escala, y la tabla ya no puede corregirlo. Mitigación previa que sigue vigente (opción C): la escala se persiste y se valida (regla 12, M14-M15). |

## Integración y consistencia

Sin persistencia, autorización, transacciones ni concurrencia: la tabla es un dato de solo lectura
versionado con el código. Actualizarla exige una revisión del diff de la tabla y sus pruebas.

## Verificación

`tests/currency-catalog.test.mjs` cubre IC01-IC14 y `tests/money.test.mjs` conserva M01-M12 adaptados,
más M13-M15. Comando: `pnpm check`. El generador se probó además a mano contra documentos truncados,
sin fecha, con unidad menor fuera de patrón, sin código y con escalas en conflicto: los seis casos
salen con código 1 sin escribir el catálogo. Evidencia al terminar en `docs/STATUS.md`.
