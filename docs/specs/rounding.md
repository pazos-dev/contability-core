# SPEC — Redondeo y operaciones con factor

Estado: **implementado y verificado** (incremento 009b). Evidencia en la sección de verificación.
Decisiones de origen: Q05, respondidas por el humano el 2026-11-16 mediante selección (D1-D5, abajo).
Ruta prevista: `packages/core/src/core/domain/shared/money/` (`rounding-mode.ts`, `factor.ts`, y las operaciones en `money.ts`).
Depende de: `money.md` (M01-M15: exactitud, escala obligatoria, cero y negativos admitidos),
`currency-catalog.md` (la escala es parte de la identidad de la moneda) y ADR 0002.

## Objetivo

Que el motor pueda aplicar una tasa, dividir un importe y repartirlo entre partes sin salir de la aritmética
exacta, y que la única pérdida posible —una fracción de la unidad mínima— sea una decisión declarada por quien
llama, no un efecto lateral del cálculo.

Hoy `Money` suma, resta y compara en `bigint`, y nada más. Un 21% de IVA obliga al anfitrión a multiplicar por
fuera, con dos resultados posibles: redondea a mano y el core no puede auditar cómo, o usa coma flotante y pierde
la exactitud que el módulo entero garantiza.

## Alcance y exclusiones

Incluye:

- **`multiply`**: importe por un factor decimal exacto.
- **`divide`**: importe por un divisor entero.
- **`allocate`**: reparto de un importe en partes iguales o ponderadas, que **suman exactamente el total**.
- Tres modos de redondeo y un modo por defecto para cuando no se declara.

Excluye, declarado para no prometerlo:

- **Conversión de moneda.** Cambiar de moneda es Q08 y necesita tasa con fecha; multiplicar un importe por un
  factor en su misma moneda no es convertir.
- **División entre importes.** `10,00 / 2,00` no devuelve un número: eso es una razón, no dinero, y no tiene
  moneda. `divide` acepta un divisor entero.
- **Política por libro o por moneda.** La elige quien llama, en cada operación. Un campo del `Ledger` sería otra
  migración obligatoria para el anfitrión y otra operación que hoy no existe para cambiarla.
- **Interés compuesto, amortización, prorrateo por días.** Son reglas de negocio sobre estas operaciones, no
  aritmética de dinero.
- **Límites fiscales y tasas oficiales.** El core no conoce ninguna tasa.

## Entradas y salidas

```ts
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN';

/** El modo que se aplica cuando la operación no declara uno. */
export const DEFAULT_ROUNDING_MODE: RoundingMode = 'HALF_UP';

/** Factor decimal exacto: `0.21` se guarda como 21/100, nunca como un número de coma flotante. */
export class MoneyFactor {
  static fromDecimal(text: string): MoneyFactor;   // "0.21", "-0.5", "3", "0.125"
  readonly numerator: bigint;
  readonly denominator: bigint;                    // potencia de diez, siempre positiva
}

// En `Money`:
multiply(factor: MoneyFactor, mode?: RoundingMode): Money;
divide(divisor: bigint, mode?: RoundingMode): Money;
allocate(parts: number | readonly bigint[]): readonly Money[];
```

El resultado conserva **la moneda y la escala del operando**. `Money` sigue siendo inmutable: ninguna operación
altera el receptor ni comparte referencia con el resultado (M08, M12).

## Reglas e invariantes

1. **Nada de coma flotante.** El cálculo es `bigint` sobre `bigint`: el producto exacto es
   `minorUnits × numerator / denominator`, y el redondeo actúa sólo al final, sobre el cociente. Un factor
   decimal nunca se convierte a `number`.
2. **La moneda y la escala no cambian.** Multiplicar o repartir un importe de UYU/2 devuelve UYU/2. La operación
   no crea escalas intermedias.
3. **El modo es opcional y explícito cuando existe.** Omitirlo aplica `DEFAULT_ROUNDING_MODE` (`HALF_UP`). El
   modo nunca se deduce del código de la moneda ni de una tabla: es un parámetro del llamador.
4. **Redondeo simétrico respecto del signo.** Se redondea la magnitud y se conserva el signo: `HALF_UP` aleja del
   cero (`-0,005` → `-0,01`), `DOWN` trunca la magnitud (`-0,009` → `0,00`), `HALF_EVEN` empata al dígito par con
   el mismo criterio en ambos signos.
5. **`HALF_EVEN` empata al par.** `2,005` → `2,00` y `2,015` → `2,02` en escala 2. No es una variante de
   `HALF_UP`: cambia el resultado exactamente en los empates.
6. **`DOWN` trunca, no aproxima.** `0,009` → `0,00`. No existe un modo que redondee hacia arriba por magnitud en
   esta entrega; agregarlo es un valor más del tipo y no rompe importes ya calculados.
7. **El reparto no crea ni destruye dinero.** La suma de las partes es **exactamente** el importe repartido, con
   su signo y su moneda. Es la invariante de la que dependen los asientos que después usen esas partes.
8. **El resto se asigna por mayor resto, con desempate por orden de entrada.** `100,00` en tres partes iguales no
   es `33,33 × 3`: son `33,34 · 33,33 · 33,33`, y el primero se lleva la unidad porque es el primero con el mayor
   resto. Con pesos, el mayor resto se calcula sobre la parte proporcional de cada uno.
9. **Repartir de a partes iguales y con pesos son la misma operación.** `allocate(n)` equivale a `allocate` con
   `n` pesos iguales; no hay dos algoritmos que puedan dar resultados distintos para el mismo caso.
10. **El factor es exacto y acotado.** `MoneyFactor.fromDecimal` acepta hasta **12 decimales**, sin exponentes, sin
    comas y sin espacios, con signo opcional. Un factor negativo invierte el signo del importe; no se prohíbe.
    El techo de decimales evita que un factor absurdo haga crecer los `bigint` sin control.
11. **Los enteros no tienen techo artificial.** El importe y el resultado son `bigint`; no se truncan a
    `MAX_SAFE_INTEGER`. El modo de redondeo opera sobre el cociente exacto, no sobre una aproximación previa.
12. **Un reparto vacío no es un reparto.** Cero partes, o pesos que suman cero, no tienen resultado posible y se
    rechazan: devolver una lista vacía o un reparto sin base sería inventar una regla.
13. **Ninguna operación tiene efectos.** No lee reloj, no consulta catálogo, no escribe nada y no guarda estado: son
    cálculos sobre valores inmutables, igual que `add` y `subtract`.
14. **El reparto no acepta un modo de redondeo.** La regla del resto (mayor resto, D5) ya decide qué parte recibe
    la unidad sobrante; un modo sería una segunda regla sobre la misma decisión y las dos podrían contradecirse.
    El modo sólo existe en `multiply` y `divide`, donde hay una única fracción que redondear.

## Errores

Códigos nuevos, estables, en `money-errors.ts`:

| Código | Condición |
| --- | --- |
| `INVALID_FACTOR` | Factor que no es un decimal canónico, con más de 12 decimales, con exponente, con coma decimal, o que no es texto |
| `DIVISION_BY_ZERO` | `divide(0n)` |
| `INVALID_ROUNDING_MODE` | Modo que no es uno de los tres admitidos. Omitirlo elige el default; un valor desconocido es error |

Se reutiliza `INVALID_MONEY` para un divisor que no es `bigint`, un número de partes que no es un entero positivo,
y pesos que no son `bigint` positivos. Un rechazo no modifica el importe: no hay estado que deshacer (M12).

## Criterios de aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| RD01 | `100,00 × 0,21` HALF_UP | `21,00` |
| RD02 | `10,00 / 3` HALF_UP | `3,33` |
| RD03 | `10,00 / 3` HALF_EVEN | `3,33` |
| RD04 | `1,00 × 0,005` HALF_UP | `0,01` |
| RD05 | `1,00 × 0,005` HALF_EVEN | `0,00` |
| RD06 | `4,01 / 2` por `HALF_EVEN` | `2,00`; y `4,03 / 2` → `2,02`: los dos empates, cociente par e impar (`2,005` y `2,015` no son representables en escala 2, así que el empate se produce dividiendo) |
| RD07 | `0,009` con `DOWN` | `0,00` |
| RD08 | `-0,005` HALF_UP | `-0,01`: simétrico, no asimétrico |
| RD09 | `-0,009` con `DOWN` | `0,00` |
| RD10 | `100,00` repartido en 3 | `33,34 · 33,33 · 33,33`, suma exacta |
| RD11 | `100,00` repartido en 7 | Suma exacta; las que reciben la unidad extra son las de mayor resto, desempate por orden |
| RD12 | `100,00` con pesos `[1, 2]` | `33,33 · 66,67`, suma exacta: los restos son 1 y 2, así que la unidad extra es del segundo |
| RD13 | `-100,00` repartido en 3 | `-33,34 · -33,33 · -33,33`, suma exacta con signo |
| RD14 | Moneda de escala 0: `100 / 3` | `33` y el resto se reparte: `34 · 33 · 33` |
| RD15 | `divide(0n)` | `DIVISION_BY_ZERO`, sin efecto |
| RD16 | Factor `"1e3"`, `"0,5"`, `"0.1234567890123"` (13 decimales) o `number 0.21` | `INVALID_FACTOR` |
| RD17 | Modo desconocido | `INVALID_ROUNDING_MODE` |
| RD18 | `allocate(0)` o pesos `[0, 0]` | `INVALID_MONEY`, sin efecto |
| RD19 | Cualquier operación de esta spec | El importe receptor queda idéntico; el resultado no comparte referencia (M08, M12) |
| RD20 | `multiply` sin `mode` | Aplica `HALF_UP`: mismo resultado que pasarlo explícito |

## Decisiones pendientes

Resueltas con el humano el 2026-11-16:

- **D1 — Las tres operaciones.** Multiplicar, dividir y repartir. Sin reparto, el anfitrión resuelve el centavo
  sobrante por fuera y el core no puede comprobar que la suma cierra.
- **D2 — El modo es un parámetro opcional con un valor por defecto.** El humano descartó la política por libro.
  **El default queda en `HALF_UP`**; cambiarlo es una línea y no toca importes ya calculados, porque el modo
  aplicado no se persiste.
- **D3 — Tres modos.** `HALF_UP`, `HALF_EVEN` y `DOWN`. `CEILING` y `FLOOR` quedan para cuando haya una necesidad
  demostrada: agregar un valor al tipo no rompe nada, quitarlo sí.
- **D4 — Redondeo simétrico respecto del signo.** La magnitud se redondea y el signo se conserva.
- **D5 — Mayor resto, desempate por orden de entrada.**

Siguen abiertas y no bloquean esta entrega:

- **P1 — Techo de decimales del factor.** Se eligen 12. Es una cota de sanidad, no una regla contable: subirla no
  cambia ningún resultado y sólo amplía lo que se acepta.
- **P2 — Pesos como `bigint`.** Se aceptan `1n`, `2n`; un peso que no es `bigint` positivo se rechaza con
  `INVALID_MONEY` en lugar de convertirse, porque inferir la intención de `allocate([1, 2])` sería adivinar. Si
  alguna vez hace falta un peso decimal, es un tipo nuevo y otra decisión.
- **P3 — Política por defecto del libro.** Queda fuera a propósito (D2). Si un anfitrión la necesita, la pide él
  en cada llamada, y una política por libro sería un incremento con su migración.

## Integración y consistencia

- **Los métodos existentes no cambian.** `add`, `subtract`, `compare`, `equals`, `toDecimal`, `toJSON` y
  `fromJSON` quedan byte a byte iguales, y las pruebas M01-M15 siguen pinchándolos. `Money` gana tres métodos y el
  dominio dos archivos nuevos; ningún caso de uso cambia.
- **La unión pública `MoneyErrorCode` se ensancha** con tres códigos. Un anfitrión con un `switch` exhaustivo
  sobre esos códigos (patrón `never`) deja de compilar hasta que los contemple: es un cambio en tiempo de
  compilación, visible y de arreglo directo, no una migración de datos. No hay nada que persistir y nada que
  versionar.
- **`money.md` deja de diferirlo.** Ese documento decía que `rounding-mode.ts` "se añade solo al especificar una
  operación que redondee"; esta spec es esa especificación y 009b actualizó esa frase con el número de
  incremento.
- **El anfitrión no hereda obligaciones nuevas.** Un importe sigue guardándose con `minorUnits`, `code` y `scale`
  (`INTEGRATION.md`, sección de persistencia). No hay nada que migrar: ninguna tasa se persiste.
- **Multimoneda no se abre.** Un factor no tiene moneda; multiplicar dentro de una moneda no es convertir (Q08
  sigue abierta en su mitad de conversión).
- **Concurrencia y atomicidad no aplican con motivo:** no hay escritura, ni puerto, ni lectura de estado.
- **Autorización no aplica:** son operaciones puras del dominio, sin superficie nueva de casos de uso. Si un
  anfitrión quiere exponer "aplicar IVA", compone `multiply` en su propia capa.

## Verificación

Implementada con test-first por criterio en `packages/core/tests/domain/shared/money/rounding.test.mjs`: 23 pruebas, el rojo
observado antes de implementar (`does not provide an export named 'DEFAULT_ROUNDING_MODE'`).

- RD01-RD09: los tres modos sobre los casos de empate, incluidos negativos y escala 0; RD06 separa los dos
  empates de `HALF_EVEN` (cociente par y cociente impar) en la misma prueba.
- RD10-RD14: reparto igual, ponderado, negativo y de escala 0, cada uno con `Σ partes === total` como aserción
  independiente del arreglo esperado.
- RD15-RD18: los rechazos, con código y con el importe receptor intacto después del error. RD18 cubre además el
  operando de tipo equivocado (`multiply` sin `MoneyFactor`, `divide` sin `bigint`) con `INVALID_MONEY`.
- RD19-RD20: inmutabilidad, referencias distintas entre dos repartos y el default explícito.

Comandos reales del repositorio, ejecutados sobre este incremento:

- `pnpm build`: correcto, sin diagnósticos (`tsc -p tsconfig.build.json`).
- `node --test packages/core/tests/domain/shared/money/rounding.test.mjs`: 23 pruebas, 23 correctas.
- `pnpm test`: 335 pruebas, 335 correctas.
- `pnpm typecheck`: correcto, sin diagnósticos (`tsc --noEmit`).
- `pnpm check:project`: correcto.
