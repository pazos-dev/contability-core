# SPEC — Moneda extranjera y conversión

Estado: **implementado y verificado** (incremento 009d). Evidencia en la sección de verificación; las
desviaciones que aparecieron al implementar están en «Lo que la implementación fijó».
Decisiones de origen: Q08 (mitad abierta), respondidas por el humano el 2026-11-17 mediante selección.
Ruta prevista: dominio en `src/core/domain/entries/`, reglas en `src/core/application/use-cases/entries/`.
Depende de: `ledger.md` (L17-L24: moneda funcional del libro), `entries.md` (E05, E12: una sola moneda por
asiento), `rounding.md` (RD01-RD20: `MoneyFactor` y `multiply`), `post-entry.md` y `reverse-entry.md`.

## Objetivo

Que un asiento pueda registrar una operación hecha en una moneda distinta de la funcional del libro, guardando
las dos cosas: **lo que se pactó** en su moneda y **lo que vale en el libro**, con la tasa que se usó.

Hoy el libro tiene una moneda funcional y contabilizar en otra se rechaza con `LEDGER_CURRENCY_MISMATCH`: el
motor no puede representar una compra en dólares dentro de un libro en pesos. Este incremento abre esa puerta sin
abrir la de la conversión automática: el core no trae cotizaciones, sólo aplica la que recibe.

## Alcance y exclusiones

Incluye:

- Importe **original** por línea, en la moneda en que se pactó.
- Importe **funcional** por línea, en la moneda del libro, calculado con la tasa recibida.
- El cuadre del asiento pasa a evaluarse en moneda funcional.
- La tasa viaja en la operación de contabilización y se guarda con la línea.
- La reversión espeja los funcionales sin recalcular, así que no produce diferencia de cambio.

Excluye, declarado para no prometerlo:

- **Tabla de cotizaciones.** El core no guarda tasas ni las busca por fecha: no hay puerto, no hay migración de
  cotizaciones y no hay regla de «no hay tasa de ese día». La elección de la tasa es del anfitrión, que conoce
  su fuente y su normativa.
- **Diferencia de cambio.** Ni por liquidación, ni por revaluación, ni por cierre. Son operaciones contables
  propias y necesitan su cuenta, su política y su momento; la reversión no las produce.
- **Revaluación de saldos al cierre.** Un saldo en moneda extranjera no se actualiza solo.
- **Conversión entre libros.** Consolidar dos libros con monedas distintas es otra cosa y sigue fuera.
- **Tasas que no sean un factor exacto.** Nada de `number`, nada de coma flotante: la tasa es un `MoneyFactor`.

## Entradas y salidas

La línea gana un importe funcional y la tasa que se usó:

```ts
export class ExchangeRate {
  // La tasa es exacta: "41.25" es 4125/100, nunca un número de coma flotante.
  static create(input: {
    readonly from: Currency;      // la moneda de la línea
    readonly to: Currency;        // la moneda funcional del libro
    readonly factor: MoneyFactor; // cuántas unidades de `to` vale una de `from`
  }): ExchangeRate;
  readonly from: Currency;
  readonly to: Currency;
  readonly factor: MoneyFactor;
}
```

El agregado no conoce la moneda del libro, así que `post` la recibe junto con las tasas:

```ts
post(context: {
  readonly number: number;
  readonly functionalCurrency: Currency;
  readonly rates: readonly ExchangeRate[];
}): JournalEntry;
```

```ts
export interface ExchangeRateInput {
  readonly currency: CurrencyJSON;  // la moneda de la línea
  readonly factor: string;         // "41.25", exacto
}

export interface PostEntryInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly idempotencyKey: string;
  readonly rates?: readonly ExchangeRateInput[];  // una por moneda extranjera presente
}
```

Resultado de línea, con dos campos nuevos:

```ts
export interface PostedLineResult {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: PostingSide;
  readonly amount: MoneyJSON;             // el original, en su moneda
  readonly functionalAmount?: MoneyJSON;  // el del libro; presente en una línea contabilizada
  readonly rate?: ExchangeRateJSON;       // sólo si hubo conversión: { from, to, factor }
  readonly description?: string;
}
```

Los totales del resultado (`totalDebit`, `totalCredit`) pasan a estar **en moneda funcional**: son los que
cuadran. El original sigue disponible línea por línea.

## Reglas e invariantes

1. **La moneda funcional del libro es la unidad de cuadre.** Débitos y créditos se comparan en funcional, no en
   las monedas originales. Un asiento con una línea en USD y otra en UYU puede cuadrar perfectamente.
2. **Cada línea conserva su original.** El importe pactado no se pierde ni se reemplaza por el funcional: los dos
   se guardan.
3. **Una línea en la moneda funcional no necesita tasa.** Su funcional es igual al original y no lleva tasa.
4. **Una línea en otra moneda exige tasa.** Sin ella la operación falla cerrada con `ENTRY_RATE_MISSING`;
   nunca se asume una tasa, ni la de otra línea, ni una unidad, ni la de otro asiento.
5. **La tasa es exacta, positiva y con la pareja correcta.** `from` tiene que ser la moneda de la línea y `to` la
   del libro; cualquier otra pareja es `INVALID_EXCHANGE_RATE`, igual que un factor que no sea positivo.
6. **Una sola conversión por línea, al contabilizar.** El funcional se calcula con `multiply` (009b) y el modo
   por defecto de 009b (`HALF_UP`). No se convierte al crear el borrador ni al leerlo. La tasa no lleva modo
   propio: ver «Lo que la implementación fijó».
7. **El funcional y la tasa se persisten con la línea.** El asiento guarda lo que se contabilizó: un cambio
   futuro de cotización o de política de redondeo no mueve el histórico.
8. **La reversión no recalcula.** Reutiliza las tasas del original y espeja los funcionales, que quedan
   exactamente opuestos. No hay diferencia de cambio en una reversión.
9. **Un borrador no convierte.** Puede tener líneas en cualquier moneda y no guarda funcional; las tasas se
   entregan al contabilizar. Sigue siendo tolerante, como con el cuadre y el período.
10. **La tasa entra en la huella de idempotencia.** La misma clave con otra tasa es `IDEMPOTENCY_CONFLICT` y no
    un replay: cambia el asiento.
11. **Los reportes no cambian de contrato.** Siguen sumando en moneda funcional y siguen fallando cerrado con
    `CURRENCY_MISMATCH` si un asiento llegara sin funcional.
12. **El asiento no acepta dos tasas para la misma moneda.** Es `ENTRY_RATE_DUPLICATE`: elegir una sería
    inventar una regla de precedencia.
13. **Nada de reloj ni de entorno.** El core no fecha la tasa; si el anfitrión necesita registrar el momento en
    que la obtuvo, lo guarda él y lo usa para elegirla.
14. **La moneda del libro sigue siendo inmutable.** No se agrega una segunda moneda funcional ni un histórico de
    monedas del libro.

## Errores

Códigos nuevos:

| Código | Familia | Condición |
| --- | --- | --- |
| `INVALID_EXCHANGE_RATE` | `MoneyError` | Factor que no es un `MoneyFactor` positivo, monedas iguales, o pareja que no corresponde |
| `ENTRY_RATE_MISSING` | `EntryError` | Una línea en moneda distinta de la funcional no tiene tasa en el contexto de contabilización |
| `ENTRY_RATE_DUPLICATE` | `EntryError` | Dos tasas con la misma moneda de origen en la misma operación |

Los tres viven en el dominio porque es el agregado el que recibe la moneda funcional y las tasas, y decide.
La aplicación no duplica esas comprobaciones: sólo hidrata el JSON de cada tasa.

`LEDGER_CURRENCY_MISMATCH` **deja de ser el rechazo por defecto**: una línea en otra moneda ya no es un error en
sí, sino un caso que exige tasa. El código se retira de `postEntry` y queda sólo si una reversión intenta
convertir algo que no estaba convertido.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| FX01 | Un libro en UYU y un borrador con `USD 100,00` al debe y `UYU 4.125,00` al haber | `postEntry` con tasa `USD → UYU 41,25` | Contabiliza: el débito funcional es `4.125,00`, el haber funcional también, y el asiento cuadra |
| FX02 | El mismo asiento | Se consulta el resultado | La línea en USD trae `amount` en USD, `functionalAmount` en UYU y la tasa usada; la línea en UYU no trae tasa y su funcional es igual al original |
| FX03 | Un borrador con una línea en USD | `postEntry` sin tasas | `ENTRY_RATE_MISSING`; nada se escribe y el borrador sigue `DRAFT` |
| FX04 | Dos líneas en USD | `postEntry` con dos tasas para USD | `ENTRY_RATE_DUPLICATE`; nada se escribe |
| FX05 | Una tasa con `from` en UYU y `to` en UYU, o con factor `0` o negativo | `postEntry` | `INVALID_EXCHANGE_RATE`; nada se escribe |
| FX06 | Una tasa para una moneda que no aparece en ninguna línea | `postEntry` | Se acepta y no se usa: no cambia el resultado ni la huella de las líneas |
| FX07 | Un asiento contabilizado en moneda extranjera | Se revierte | La reversión usa la **misma** tasa, los funcionales son exactamente opuestos y no hay diferencia de cambio |
| FX08 | Un asiento en moneda extranjera | Se consultan saldos y balance | Los importes están en moneda funcional; el balance cuadra |
| FX09 | Un asiento con dos líneas en monedas distintas que sólo cuadra en funcional | `postEntry` | Contabiliza; el cuadre se evalúa en funcional |
| FX10 | Un borrador con líneas en tres monedas | Se edita una línea con `addEntryLine` | Se acepta: un borrador no convierte ni exige tasas |
| FX11 | Una tasa con 13 decimales | `postEntry` | `INVALID_FACTOR` (009b); nada se escribe |
| FX12 | La misma clave con la misma petición y la misma tasa | Se repite `postEntry` | Replay: mismo asiento, sin segunda conversión |
| FX13 | La misma clave con la misma petición y **otra** tasa | Se repite `postEntry` | `IDEMPOTENCY_CONFLICT`; nada cambia |
| FX14 | Una conversión que no es exacta, por ejemplo `USD 33,33` a `41,25` | `postEntry` | El funcional es `1.374,86` —el redondeo `HALF_UP` por defecto, aplicado una vez— y queda registrado en la línea |
| FX15 | Un asiento ya persistido sin funcional (datos anteriores a este incremento) | Se lee un reporte | Falla cerrado con `CURRENCY_MISMATCH`: el core no inventa una conversión histórica |

## Decisiones pendientes

Resueltas con el humano el 2026-11-17:

- **D1 — Línea con original y funcional.** Se descartó «asiento entero en una moneda» (prohibiría mezclar) y
  «sólo funcional» (el motor no podría auditar la conversión).
- **D2 — La tasa la aporta quien llama, por operación.** Sin tabla de cotizaciones en el core.
- **D3 — La reversión usa la tasa original.** La diferencia de cambio es otra operación.
- **D4 — El funcional se persiste con la línea, junto a la tasa usada.** Recalcularlo movería el histórico.

Siguen abiertas y no bloquean esta entrega:

- **P1 — Dónde se persiste la tasa.** Con la línea, en forma `code/scale/factor`. Si un anfitrión quiere además
  el momento en que la obtuvo, es un campo suyo: el core no fecha tasas.
- **P2 — Qué cuenta de diferencia de cambio.** No existe en este incremento. Cuando exista la liquidación, la
  cuenta se indicará por operación, no en el libro, por el mismo motivo que la tasa.
- **P3 — Revaluación al cierre.** Necesita una política (a qué tasa, con qué frecuencia, qué se revalúa) y su
  propia spec.

## Integración y consistencia

- **Cambio de contrato de dominio (ítem 3).** `JournalEntryLine` gana `functionalAmount` y `rate`, y `post`
  cambia de firma y deja de exigir una sola moneda para pasar a exigir funcionales equilibrados. `PostEntryInput` gana `rates`
  opcional y `PostedLineResult` gana dos campos. Un anfitrión que hoy lea `amount` sigue funcionando; uno que
  asuma que `amount` es la moneda del libro, no.
- **`LEDGER_CURRENCY_MISMATCH` cambia de significado.** Hoy rechaza cualquier línea en otra moneda (L24 de
  `ledger.md`). Después de este incremento, el rechazo se llama `ENTRY_RATE_MISSING` y ocurre por falta de
  tasa. `ledger.md` y `entries.md` (E05, E12) se actualizan en el mismo incremento.
- **Pendiente de este incremento:** la obligación `HA45` de `docs/INTEGRATION.md` no se escribió todavía, porque
  ese documento quedó fuera de la superficie de 009d; la obligación en sí no cambia lo que sigue.
- **Lo que debe dar el anfitrión (obligación nueva).** Persistir por línea `functionalAmount` y la tasa usada, y
  migrar los asientos existentes: un asiento sin funcional **no se puede leer** en un reporte (FX15). Es la
  tercera migración de esta clase, después de la moneda del libro (006f) y los números de asiento (009a).
  Entra en `docs/INTEGRATION.md` como `HA45` cuando la implementación se apruebe.
- **Idempotencia.** Las tasas entran en la huella: la misma clave con otra tasa es conflicto, no replay.
- **Concurrencia.** Sin cambios: la conversión ocurre dentro de la unidad de trabajo de la contabilización.
- **Reportes.** No cambian de contrato; su falla cerrada por moneda pasa a ser la red que atrapa un asiento sin
  funcional.

## Verificación

Prevista, con test-first por criterio:

- `tests/domain/entries/foreign-currency.test.mjs`: reglas 2-6, 8, 12 y la simetría de la reversión (FX02, FX05,
  FX07).
- `tests/application/foreign-currency.test.mjs`: FX01, FX03, FX04, FX06, FX08-FX14 contra el adaptador en
  memoria, con tasas reales y un libro en UYU.
- `tests/domain/shared/money/` no cambia: `multiply` ya existe desde 009b y este incremento lo consume, no lo
  modifica.
- `docs/specs/{ledger,entries}.md`: actualizar E05, E12 y L24 en el mismo commit que el comportamiento.

Comandos reales del repositorio: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

Ejecutada sobre este incremento:

- `tests/domain/entries/foreign-currency.test.mjs`: 13 pruebas. Rojo observado antes de implementar: el módulo
  entero no cargaba (`SyntaxError: The requested module '../../../dist/index.js' does not provide an export
  named 'ExchangeRate'`).
- `tests/application/foreign-currency.test.mjs`: 15 pruebas, FX01, FX03-FX14 (FX02 se fija en las dos) más una
  que fija el comportamiento anterior del huella de idempotencia. Rojo
  observado antes de implementar: 12 de 14 fallaban con el `LEDGER_CURRENCY_MISMATCH` del camino anterior —o
  con la comprobación del código nuevo, que nunca llegaba a ejecutarse—; las dos que pasaban son las que
  fijaban comportamiento que ya existía (un borrador tolerante y el replay de una petición sin tasas).
- `docs/specs/{ledger,entries,post-entry,reverse-entry,reports}.md`: reescritas las reglas que 009d vuelve
  falsas, conservando su numeración.
- `tests/public-api.test.mjs`: fija `ExchangeRate` en el barrel de `money`, el tipo `ExchangeRateJSON`, el tipo
  `ExchangeRateInput` del barrel de aplicación y los tres códigos nuevos en los `.d.ts` emitidos.
- Comandos reales: `pnpm build`, `pnpm test` (383 pruebas, 383 correctas), `pnpm typecheck`,
  `pnpm check:project`.

## Lo que la implementación fijó

Cuatro puntos que el borrador no resolvía, decididos al implementar y probados como se indica:

1. **La tasa no lleva modo de redondeo.** La firma decidida de `ExchangeRate` es `from`/`to`/`factor`, sin
   `RoundingMode`, y `ExchangeRateInput` tampoco lo lleva: la conversión usa `DEFAULT_ROUNDING_MODE` (`HALF_UP`).
   Un modo por tasa sería un campo más y otra migración del anfitrión. Consecuencia: FX14 sólo puede ejercitar
   el modo por defecto; los otros dos modos quedan para cuando se decida llevar el modo en la tasa.
2. **La conversión exige monedas de la misma escala.** `Money.multiply` devuelve el producto en la moneda del
   operando, así que el importe funcional se rotula con la moneda del libro; eso es exacto sólo si ambas
   monedas comparten escala. Con escalas distintas una sola multiplicación redondearía en la unidad
   equivocada, y volver a escalar redondearía dos veces, así que la pareja se rechaza con
   `INVALID_EXCHANGE_RATE` en lugar de convertirse de forma aproximada. Convertir entre escalas distintas
   necesita que la aritmética de 009b acepte una escala destino: es otro incremento, no una regla de esta spec.
3. **La reversión espeja el borrador, no recalcula.** `createReversalDraft` copia el importe funcional y la
   tasa del original, y `reversePostedEntry` contabiliza la reversión con `rates: []`. Es la ruta más simple de
   las dos que el diseño admitía: no hay que reenviar las tasas del original ni comprobar que sigan siendo las
   mismas, y los funcionales quedan exactamente opuestos por construcción. `LEDGER_CURRENCY_MISMATCH` sobrevive
   justo aquí, para revertir un asiento sin importe funcional escrito antes de 009d: sin nada que espejar, la
   aplicación lo rechaza.
4. **FX15 es una guarda, no un camino alcanzable.** `JournalEntry` no se puede construir contabilizado sin
   pasar por `post`, y `post` siempre deja el importe funcional. La guarda vive en los reportes —una línea
   contabilizada sin funcional es `CURRENCY_MISMATCH` de dominio, sin conversión inventada— y se prueba con un
   puerto que miente (TB09 y la regla 3 del mayor), no con un asiento construido a la fuerza. El core no ofrece
   ninguna forma de crear uno.
