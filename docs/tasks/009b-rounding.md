# Incremento 009b — Redondeo y operaciones con factor

Cierra Q05. Comportamiento autoritativo en `docs/specs/rounding.md`: 14 reglas y criterios RD01-RD20.
Hasta acá `Money` sumaba, restaba y comparaba en `bigint` y nada más: un 21% de IVA obligaba al anfitrión a
calcular por fuera, redondeando a mano o perdiendo la exactitud del módulo.

## Specs

S1. «Las tres: multiplicar, dividir y repartir» — `multiply(factor, mode?)`, `divide(divisor, mode?)` y
`allocate(parts)`. El reparto garantiza que las partes suman **exactamente** el total.

S2. «parametro opcional con un defaul» — el modo es opcional y tiene un valor por defecto declarado,
`DEFAULT_ROUNDING_MODE = 'HALF_UP'`. Se descartó la política por libro: sería un campo obligatorio del `Ledger`
y otra migración para el anfitrión.

S3. «Tres: media al alza, media al par y truncar» — `HALF_UP`, `HALF_EVEN` y `DOWN`. `CEILING` y `FLOOR` quedan
para cuando haya necesidad demostrada.

S4. «Simétrico respecto del signo» — se redondea la magnitud y se conserva el signo: `-0,005` con `HALF_UP` es
`-0,01`, no `0,00`.

S5. «Mayor resto, desempate por orden» — el resto del reparto se asigna por mayor resto y el empate lo gana el
orden de entrada. Es un orden total explícito, nunca la estabilidad de `Array.prototype.sort`.

S6. Nada de coma flotante: el factor entra como texto decimal y se guarda como `bigint` sobre `bigint`
(`"0.21"` → `21/100`). El cálculo se redondea **una sola vez, al final**.

S7. El reparto no lleva modo de redondeo: la regla del resto **es** la regla del reparto, y aceptar un modo
serían dos reglas sobre la misma decisión.

S8. Ninguna operación existente cambia: `add`, `subtract`, `compare`, `equals`, `toDecimal`, `fromDecimal` y el
JSON quedan byte a byte iguales. La unión pública `MoneyErrorCode` se ensancha con tres códigos, que es un
cambio de contrato de compilación y no una migración.

## Tasks

| ID | Specs | Qué | Commit |
| --- | --- | --- | --- |
| T1 | S1-S3, S6 | `rounding-mode.ts`, `factor.ts`, `multiply`/`divide`/`allocate` en `Money` y los tres códigos nuevos | `234a787` |
| T2 | S4, S5, S7 | Reglas de simetría y de reparto, con RD01-RD20 en `rounding.test.mjs` | `234a787` |
| T3 | S4, S5, S8 | Hallazgos de la verificación independiente: cinco casos correctos pero sin prueba en `rounding-regression.test.mjs`, y el ensanche de la unión declarado en la spec | `234a787`, `3f0d878` |
| T4 | S1-S8 | Documentación del incremento: spec cerrada, `money.md`, `STATUS`, `ROADMAP`, Q05 y `ARCHITECTURE` | `3f0d878` |

## Log

L1. «si cual seria elmplan para abordar q05?»

L2. «po eme las deciciones en seleccion»

L3. Selecciones de las cinco decisiones: las tres operaciones; «parametro opcional con un defaul»; los tres
modos; simétrico respecto del signo; mayor resto con desempate por orden.

L4. «si arranco con el codigo»

L5. «esta bien puedes aeguir» — autorización para correr la verificación independiente.

L6. «uqe hiciste porque lo comiteaste y no oo veo no comitees si. yo decirte que lo hagas» — el commit se
deshizo con `git reset --mixed`, el trabajo quedó intacto en el árbol y desde ahí no se commitea sin pedido
explícito.

L7. «si comitea» — autorización de los dos cortes: código y pruebas, después documentación.

L8. «las dosn» — autorización de publicar la rama, abrir la PR #17 y mergearla.
