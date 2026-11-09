# SPEC — Crear un borrador de asiento

Estado: lista para implementar (incremento 006c).
Ruta: `src/core/application/use-cases/entries/`.
Depende de: `entries.md` (E01-E11) y del contrato general de `registration.md` (puertos, errores, unidad
de trabajo, huella de idempotencia).

## Objetivo

Que el anfitrión pueda **crear el borrador** que después contabiliza `postEntry`, sin tocar el repositorio
de asientos directamente. Es la puerta que faltaba: hasta ahora `postEntry` exigía un borrador persistido
y ninguna operación del core lo producía.

## Alcance y exclusiones

Incluye:

- `createEntryDraft`: alta de un borrador con su cabecera y sus líneas en una sola operación.

Excluye, declarado para no prometerlo:

- **Editar** un borrador existente (`addEntryLine`, `removeEntryLine`, cambiar descripción o fecha). El
  dominio sabe hacerlo sobre copias; exponerlo necesita su propia spec y sus propias reglas de bloqueo.
- Borrar borradores.
- Validar que el borrador esté equilibrado: un borrador puede estar incompleto o desbalanceado.
- Exigir diario activo o período abierto: eso es asunto de `postEntry`. Un borrador puede prepararse
  contra un diario que hoy está inactivo y activarse antes de contabilizar.
- Numeración de asientos (Q11).

## Entrada y salida

```ts
interface CreateEntryDraftInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: string;      // YYYY-MM-DD
  readonly description: string;
  readonly lines: readonly EntryLineInput[];
  readonly idempotencyKey?: string;
}

interface EntryLineInput {
  readonly lineId: string;
  readonly accountId: string;
  readonly side: 'DEBIT' | 'CREDIT';
  readonly amount: MoneyJSON;           // el tipo que publica Money.toJSON()
  readonly description?: string;
}
```

Salida:

```ts
interface CreateEntryDraftResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: 'DRAFT';
  readonly accountingDate: string;
  readonly description: string;
  readonly lines: readonly PostedLineResult[];
}
```

**Sin totales**: un borrador puede estar vacío o desbalanceado, así que un total es una noción de la
contabilización, no del borrador. Si el anfitrión quiere mostrarlos, los calcula de las líneas.

La huella de idempotencia cubre todos los campos salvo la clave, con las líneas normalizadas en orden
(`lineId`, `accountId`, `side`, importe, descripción) para que el orden de claves del objeto no cuente.

## Flujo y orden de validación

Todo dentro de una sola llamada a `unitOfWork.run`.

1. **Idempotencia.** Huella igual devuelve el resultado guardado; distinta es `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Id libre.** `entries.findById(ledgerId, entryId)` presente es `ENTRY_ALREADY_EXISTS`: un id de asiento
   nunca se reutiliza, porque el guardado es un *upsert*.
4. **Diario.** `journals.findById(ledgerId, journalId)`; ausente es `JOURNAL_NOT_FOUND`. **No** se exige
   activo.
5. **Período.** `periods.findById(ledgerId, periodId)`; ausente es `PERIOD_NOT_FOUND`. **No** se exige
   abierto ni se comprueba que contenga la fecha: eso es de `postEntry`.
6. **Cuentas.** Cada línea: `accounts.findById(accountId)`; ausente o de otro plan es `ACCOUNT_NOT_FOUND`.
   **No** se exige activa ni contabilizable.
7. **Construcción.** `JournalEntry.createDraft` y `addLine` por línea. El dominio valida fecha, texto,
   lado, importe estrictamente positivo e ids de línea únicos.
8. **Escritura única.** Guardar el borrador y registrar la idempotencia.

## Errores

Propios: `LEDGER_NOT_FOUND`, `ENTRY_ALREADY_EXISTS`, `JOURNAL_NOT_FOUND`, `PERIOD_NOT_FOUND`,
`ACCOUNT_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`.
Burban los de dominio: `INVALID_ENTRY`, `INVALID_ENTRY_LINE`, `DUPLICATE_LINE_ID`, `INVALID_DATE`,
`INVALID_MONEY`, `INVALID_CURRENCY`.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| D01 | Un libro con plan, diario y período | `createEntryDraft` con dos líneas | Devuelve `status: DRAFT` con identidad, fecha y líneas; queda guardado |
| D02 | Un libro desconocido | `createEntryDraft` | `LEDGER_NOT_FOUND`; nada guardado |
| D03 | Un `entryId` ya usado por un asiento contabilizado | `createEntryDraft` | `ENTRY_ALREADY_EXISTS`; el asiento existente queda intacto |
| D04 | Un diario de otro libro o inexistente | `createEntryDraft` | `JOURNAL_NOT_FOUND`; nada guardado |
| D05 | Un período de otro libro o inexistente | `createEntryDraft` | `PERIOD_NOT_FOUND`; nada guardado |
| D06 | Una cuenta inexistente o de otro plan | `createEntryDraft` | `ACCOUNT_NOT_FOUND`; nada guardado |
| D07 | Una línea con importe cero o negativo | `createEntryDraft` | `INVALID_ENTRY_LINE` del dominio; nada guardado |
| D08 | Dos líneas con el mismo `lineId` | `createEntryDraft` | `DUPLICATE_LINE_ID` del dominio; nada guardado |
| D09 | Dos líneas de 1.000 Debe y 900 Haber | `createEntryDraft` | Se acepta: un borrador desbalanceado es válido y sigue `DRAFT` |
| D10 | Un diario inactivo y un período cerrado, con todo lo demás válido | `createEntryDraft` | Se acepta el borrador; `postEntry` es quien después los rechaza |
| D11 | La misma clave con la misma petición | Repetir | Mismo resultado, sin segunda escritura |
| D12 | La misma clave con otra línea | Repetir | `IDEMPOTENCY_CONFLICT`; nada guardado |
| D13 | Un repositorio que falla al guardar | `createEntryDraft` | El error sube y no queda borrador ni registro |

## Integración y consistencia

- Cierra el circuito: `createEntryDraft` → `postEntry` → `reversePostedEntry`.
- Con esta operación el anfitrión ya no necesita el repositorio de asientos para trabajar; queda expuesto
  en el adaptador en memoria sólo para composición y pruebas.
- Un borrador creado contra un diario o un período que después cambian no se rompe: la validación se repite
  al contabilizar.

## Verificación

- Pruebas: `tests/entry-draft.test.mjs`, una por criterio de D01 a D13, consumiendo `dist/`.
- `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
