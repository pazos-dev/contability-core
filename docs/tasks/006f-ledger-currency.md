# Incremento 006f — Moneda funcional del libro

Cierra Q08 con la opción A: un libro declara una sola moneda funcional, el asiento en otra moneda se rechaza
al contabilizar y el core no convierte. Especificación de comportamiento en `docs/specs/ledger.md` (L17-L23) y
`docs/specs/entries.md` (E12).

## Specs

S1. El libro declara su moneda funcional como dato **obligatorio** del alta. En el contrato serializable entra
como `CurrencyJSON { code, scale }`; el dominio recibe un `Currency`. Un libro sin moneda no se registra.

S2. La moneda funcional es **inmutable**. `rename`, `deactivate` y `activate` devuelven copias que la
conservan, y no existe ninguna operación que la cambie. Mismo criterio que Q07 aplicó a `chartOfAccountsId`:
cambiarla dejaría asientos posted en una moneda que ya no es la del libro, sin operación que los migre.

S3. La moneda se valida con las reglas que `Currency` ya tiene: código `/^[A-Z]{3}$/`, escala entera de 0 a 6 y
escala oficial de la tabla ISO para los códigos catalogados. Un `CurrencyJSON` inválido en el alta burbujea
como `INVALID_CURRENCY` de dominio, sin envolver en un error de aplicación.

S4. La moneda forma parte de la huella de idempotencia de `registerLedger`: la clave cubre todo el campo de la
petición salvo la clave misma, y la moneda es campo de la petición. La misma clave con otra moneda es
`IDEMPOTENCY_CONFLICT`, no el resultado guardado.

S5. Contabilizar exige que la moneda del asiento —la única de sus líneas, ya exigida por el agregado
(`entryCurrencyMismatch`)— sea la moneda funcional del libro. Si no lo es: `LEDGER_CURRENCY_MISMATCH`, nada
escrito, el asiento sigue `DRAFT`. Aplica a las dos únicas vías que dejan un asiento en `POSTED`:
`postEntry` y `reversePostedEntry`.

S6. Los **borradores no se validan por moneda**. Igual que con el balance, el período abierto o la cuenta
activa, el borrador admite lo que todavía no se contabilizó, y `post` es el punto estricto. Rechazar en
`createEntryDraft` o `addEntryLine` duplicaría la regla y contradiría la separación ya establecida entre
borrador tolerante y post estricto.

S7. **No hay conversión.** `Money` no gana API de tasas, `CURRENCY_MISMATCH` sigue igual en las operaciones
cruzadas, y no se crean `FxRate`, puerto de tasas ni cuentas de diferencia de cambio. Llevar más de una moneda
se modela como un libro por moneda, o el anfitrión convierte antes de entregar el asiento.

S8. `registerLedger` devuelve la moneda registrada en su resultado, para que el anfitrión pueda leerla sin un
caso de uso de consulta nuevo. La fachada no gana métodos: siguen siendo trece.

S9. La moneda funcional no se puede cambiar ni siquiera por `setLedgerStatus`. Los únicos datos mutables del
libro son el nombre y el estado.

S10. Migración: los libros que un anfitrión ya tenga persistidos no tienen moneda. El core no persiste (Q09),
así que el anfitrión la rellena antes de reutilizarlos. El core **no** inventa una moneda por defecto: una
moneda supuesta contabilizaría mal en silencio.

## Tasks

| ID | Specs | Qué | Commit |
| --- | --- | --- | --- |
| T1 | S1, S2, S3, S9 | `Ledger` exige `currency: Currency` en `create`; inmutable en `#copyWith`; `INVALID_LEDGER` si no es una instancia de `Currency`; barrel y README del área | `43f7090` |
| T2 | S4, S8 | `RegisterLedgerInput.currency: CurrencyJSON`, hidratación con `Currency.fromJSON`, moneda en la huella y en `RegisterLedgerResult` | `43f7090` |
| T3 | S5, S6, S7 | `requireLedgerCurrency` en `use-cases/entries/rules.ts`; `LEDGER_CURRENCY_MISMATCH` en el catálogo de errores; guarda en `post` y `reverse` | `43f7090` |
| T4 | S10 | Adaptar los call sites de prueba y el seed, escribir las pruebas nuevas y actualizar `STATUS.md`, `OPEN-QUESTIONS.md` y los README de área | `43f7090` + este commit |

## Log

L1. «si como se hace la moneda funcional del libro ?»

L2. «ipcion a» — decisión sobre la propuesta de tres opciones presentada al humano. Se lee como opción A:
«Libro monomoneda. Se rechaza [el asiento en otra moneda]. La multimoneda operativa se modela como un libro por
moneda, o el anfitrión convierte antes de entregar el asiento.»

L3. S6 se decidió leyendo el código, no por preferencia: `Entries.createDraft` documenta que valida sólo lo
que hace coherente el borrador y que «every posting rule is re-checked by `postEntry` anyway». Ubicar la
moneda en el borrador habría invertido ese reparto.

L4. La moneda entra como `Currency` en el DTO de dominio siguiendo el único precedente del módulo: `Money`
contiene un `Currency` y `JournalEntryLineInput.amount` es un `Money`, no un JSON. La hidratación desde
`CurrencyJSON` es responsabilidad de la capa de aplicación, como en las líneas.

L5. No se agrega `Ledger.toJSON`. `Account`, `Journal` y `AccountingPeriod` tampoco lo tienen: sólo los value
objects (`Currency`, `Money`, `AccountingDate`) serializan. El anfitrión mapea el libro desde sus getters.

L6. `pnpm test` **no** prueba el código actual: corre sobre `dist/`, y el build es un paso aparte. La primera
corrida dio 244 en verde con las pruebas rotas, porque `dist/` era de las 13:09 y el fuente de las 18:23. La
suite de verdad es `pnpm check`, que encadena `check:project`, `typecheck`, `build` y `test`.

L7. La verificación independiente se disparó por el ítem 3 de riesgo: `RegisterLedgerInput` gana un campo
**obligatorio** y eso rompe el contrato que un anfitrión ya consume. Reportó un bloqueante y cinco
advertencias, todas corregidas: (a) el ejemplo de `README.md` no compilaba (`TS2345`), reproducido con `tsc`;
(b) la huella guardada por un alta anterior ya no coincide, así que un reintento legítimo tras migrar es
`IDEMPOTENCY_CONFLICT` — decisión del anfitrión y ahora documentada en `ledger.md`; (c) la huella usaba el
objeto crudo, así que `{scale, code}` contradecía el contrato «mismos valores, mismo texto» de
`idempotency.ts`; se pasa a forma canónica `code/scale` y se hidrata antes de buscar el registro, con lo que
un llamador viejo recibe `INVALID_CURRENCY` en vez de un resultado sin moneda; (d) la guarda de `reverse` no
tenía prueba; (e) L18 y L19 no cubrían toda la regla 14 ni el registro de idempotencia, y la regla 18 no
tenía prueba; (f) faltaba la fila 006f en `docs/ROADMAP.md`.

L8. Las pruebas nuevas no son vacuas: se rompieron las dos guardas a propósito (el `instanceof` de
`requireCurrency` y las dos llamadas a `requireLedgerCurrency`) y fallaron exactamente L19, L22, L23 y L24.
Después se restauró el código y la suite volvió a verde.

L9. Rebanadas: `d3ac19a` (especificación y decisiones) y `43f7090` (dominio, aplicación, pruebas y README) suman
756 líneas, más de las ~400 de una rebanada. El corte no se forzó más porque el campo nuevo no compila con la
mitad del cambio: dominio, DTO, caso de uso y las 23 llamadas de prueba van juntos o no van.
