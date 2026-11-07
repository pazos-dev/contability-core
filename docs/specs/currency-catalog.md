# SPEC — Catálogo de monedas ISO 4217

Estado: lista para implementación.
Entrega: incremento 005 del core; reemplaza el modelo abierto de `Currency` de `docs/specs/money.md`.
Fuente: ISO 4217, lista oficial de una moneda por país y por fondo publicada por SIX Group
(`list-one.xml`, `Pblshd="2026-09-17"`), incorporada el 2026-11-06.
Ruta: `src/core/domain/money/currency-catalog.ts` y `src/core/domain/money/currency.ts`.

## Objetivo

Que `Currency` no pueda representar una moneda inexistente ni una escala distinta de la oficial.
El catálogo es la lista cerrada de códigos ISO 4217 con unidad menor decimal y su escala canónica.

## Alcance y exclusiones

Incluye: validación de forma y pertenencia al catálogo en `Currency.create` y `Currency.fromJSON`;
tabla versionada generada desde la fuente oficial; comando de regeneración.

Excluye: símbolos y nombres de moneda, formato localizado, tasas de cambio, conversión, moneda
funcional por libro, vigencia histórica de monedas retiradas y redondeo. `Currency` conserva
únicamente `code` y `scale`.

## Entradas y salidas

`Currency.create(code, scale)` y `Currency.fromJSON({ code, scale })` reciben el código de tres
letras A-Z y la escala entera. La salida es un `Currency` inmutable cuyo par `(code, scale)` existe
en el catálogo.

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
2. El código debe existir en la tabla ISO 4217 incorporada. Un código bien formado y ausente se rechaza.
3. La escala debe ser exactamente la oficial del código. Un `(code, scale)` que no coincide se rechaza:
   la escala no es un parámetro libre del llamador.
4. Un código ISO sin unidad menor decimal se rechaza con razón propia y distinta de "no es ISO".
5. La escala admitida sigue siendo un entero de 0 a 6 por límite estructural de `Currency`; hoy la
   tabla usa 0, 2, 3 y 4.
6. `fromJSON` aplica exactamente las reglas 1 a 5; JSON no es una vía para saltar el catálogo.
7. Dos `Currency` con el mismo código tienen siempre la misma escala; `equals` puede comparar solo el
   código sin cambiar su resultado observado.
8. La tabla incorporada es el dato canónico en tiempo de ejecución. Regenerarla con
   `pnpm sync:iso4217` desde la fuente oficial, nunca editando entradas a mano.
9. El generador falla cerrado y **no escribe el catálogo** ante: documento truncado o sin fecha de
   publicación, unidad menor fuera del patrón `N.A.` o un dígito 0-6, entrada sin código que no sea
   `No universal currency`, código repetido con dos escalas distintas, o tabla con menos de 100
   monedas con escala decimal.
10. La tabla se ordena por punto de código y registra fuente, fecha de publicación y SHA-256 del XML
    incorporado. La huella es trazabilidad, no una comprobación en ejecución: el ancla contra un
    cambio no buscado son los criterios IC10 e IC11.
11. La escala se persiste junto al importe y **nunca se deduce del código**. Un importe reconstruido
    sin escala, o con una escala que no coincide con la oficial, falla en lugar de reinterpretar el
    valor. El catálogo responde "qué escala tiene hoy esta moneda", no "qué escala tenía el dato
    guardado". Ver M14 y M15 en `docs/specs/money.md`.

## Errores

Todos son `MoneyError` con código `INVALID_CURRENCY`. El texto final lo compone el envoltorio ya
vigente de `money-errors.ts` como `Invalid currency: <razón>.`; las filas de abajo son la **razón**,
no el mensaje completo. No hay efectos parciales porque `Currency` es un valor inmutable sin estado
externo.

Precedencia: forma del código, luego rango estructural de la escala, después pertenencia al catálogo
y coincidencia con la escala oficial. Por eso `Currency.create('ABC', 7)` informa el rango y no la
ausencia del catálogo.

| Condición | Mensaje esperado |
| --- | --- |
| Forma inválida | `code "usd" must be three uppercase letters A-Z` |
| Código ausente del catálogo | `code "ABC" is not an ISO 4217 currency` |
| Moneda ISO sin unidad menor decimal | `code "XAU" is an ISO 4217 currency without a decimal minor unit` |
| Escala no oficial | `scale 3 does not match ISO 4217 scale 2 for code "UYU"` |
| Escala fuera de rango o fraccionaria | `scale ... must be an integer between 0 and 6` |

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| IC01 | `UYU` en el catálogo con escala 2 | `Currency.create('UYU', 2)` | Válido; `scale` es 2. |
| IC02 | `UYU` oficial escala 2 | `Currency.create('UYU', 3)` | `INVALID_CURRENCY`; no se crea la moneda. |
| IC03 | `ABC` con forma válida y ausente del catálogo | `Currency.create('ABC', 2)` | `INVALID_CURRENCY` por código no ISO. |
| IC04 | `XAU` presente con unidad menor `N.A.` | `Currency.create('XAU', 0)` | `INVALID_CURRENCY` por moneda sin unidad menor decimal. |
| IC05 | Escalas oficiales 0, 3 y 4 | `CLP`, `KWD` y `CLF` con su escala | Los tres válidos. |
| IC06 | JSON con código no ISO | `Currency.fromJSON({ code: 'ABC', scale: 2 })` | `INVALID_CURRENCY`, igual que `create`. |
| IC07 | JSON con escala no oficial | `Currency.fromJSON({ code: 'UYU', scale: 0 })` | `INVALID_CURRENCY`. |
| IC08 | Forma inválida | `usd`, `US`, `USDX`, ` UYU` | `INVALID_CURRENCY` por forma. |
| IC09 | Escala no entera, negativa o mayor que 6 | `Currency.create('UYU', value)` | `INVALID_CURRENCY` por rango estructural. |
| IC10 | Tabla incorporada | Recorrer el catálogo | 165 códigos con escala decimal y 13 sin unidad menor decimal. |
| IC11 | Escalas 0, 3, 4 y códigos sin unidad menor decimal | Recorrer el catálogo | Coinciden código por código con las listas ancladas: un cambio de tabla exige actualizar la prueba. |

## Decisiones pendientes

| ID | Tema | Estado e impacto |
| --- | --- | --- |
| IC-Q01 | Monedas retiradas del ISO | **Pendiente y bloqueante antes de persistir producción.** La tabla incorpora solo la lista vigente. Si ISO retira un código, `fromJSON` de un importe histórico guardado con ese código fallará. Opciones: incorporar la lista histórica de SIX, o aceptar la pérdida como error de lectura explícito. Mitigación aplicada (opción C): la escala se persiste y se valida contra la tabla (regla 11, M14-M15), así que un cambio de escala falla con error visible en lugar de corromper el importe en silencio. Hoy no bloquea: no hay persistencia ni datos históricos. |

## Integración y consistencia

Sin persistencia, autorización, transacciones ni concurrencia: la tabla es un dato de solo lectura
versionado con el código. Actualizarla exige una revisión del diff de la tabla y sus pruebas.

## Verificación

`tests/currency-catalog.test.mjs` cubre IC01-IC11 y `tests/money.test.mjs` conserva M01-M12 adaptados,
más M13. Comando: `pnpm check`. El generador se probó además a mano contra documentos truncados,
sin fecha, con unidad menor fuera de patrón, sin código y con escalas en conflicto: los seis casos
salen con código 1 sin escribir el catálogo. Evidencia al terminar en `docs/STATUS.md`.
