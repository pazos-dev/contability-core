# SPEC — Editar las líneas de un borrador

Estado: lista para implementar (incremento 006d).
Ruta: `src/core/application/use-cases/entries/`.
Depende de: `entries.md` (E06, E07), `entry-draft.md` (D01-D13) y el contrato general de `registration.md`.

## Objetivo

Corregir un borrador ya guardado sin borrarlo y sin tocar el repositorio de asientos directamente:
agregar una línea que faltaba o quitar una que sobra.

Hoy un borrador mal cargado no tiene arreglo dentro del core: hay que borrarlo, y borrar tampoco existe.
El core no persiste nada: calcula sobre valores inmutables y entrega el resultado al puerto.

## Alcance y exclusiones

Incluye:

- `addEntryLine`: agrega una línea a un borrador.
- `removeEntryLine`: quita una línea de un borrador por su id.

Excluye, declarado para no prometerlo:

- **Cambiar la cabecera** (diario, período, fecha contable o descripción). El agregado no tiene operación
  para eso: `JournalEntry` sólo expone `addLine`, `removeLine`, `post` y `createReversalDraft`. Exponerlo
  exige primero una operación de dominio con sus propias reglas.
- Editar una línea existente (importe, cuenta o lado). Se quita y se agrega: dos operaciones, un resultado.
- Editar o quitar líneas de un asiento contabilizado: el dominio lo rechaza y no se reabre.
- Borrar el borrador entero.
- Reordenar líneas: el orden es el de inserción y no es significado contable.

## Entrada y salida

```ts
interface AddEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly line: EntryLineInput;      // el mismo tipo que usa createEntryDraft
  readonly idempotencyKey?: string;
}

interface RemoveEntryLineInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly lineId: string;
  readonly idempotencyKey?: string;
}
```

Las dos devuelven ejecutivamente el **borrador resultante**, con la misma forma que `createEntryDraft`
(`EntryDraftResult`): identidad, fecha, descripción y las líneas que quedan. Sin totales, por el mismo
motivo: un borrador puede estar desbalanceado.

La huella de idempotencia cubre `ledgerId`, `entryId` y la línea afectada, normalizada.

## Flujo y orden de validación

1. **Idempotencia.** Huella igual devuelve el resultado guardado; distinta es `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Asiento.** `entries.findById(ledgerId, entryId)`; ausente o de otro libro es `ENTRY_NOT_FOUND`.
4. **Cuenta de la línea nueva** (`addEntryLine` solamente): debe existir y ser del plan del libro;
   `ACCOUNT_NOT_FOUND`. No se exige activa ni contabilizable: es un borrador.
5. **Agregado.** `addLine` o `removeLine`. El dominio decide: asiento `POSTED` → `ENTRY_STATE`; id de línea
   repetido → `DUPLICATE_LINE_ID`; importe no positivo → `INVALID_ENTRY_LINE`; línea inexistente →
   `ENTRY_LINE_NOT_FOUND`.
6. **Entrega al puerto, una sola vez.** Entregar el borrador resultante y registrar la idempotencia en la
   misma unidad de trabajo. Si cualquiera falla, no queda nada.

`removeEntryLine` no consulta cuentas: la línea que se va no necesita validarse.

## Errores

Propios: `LEDGER_NOT_FOUND`, `ENTRY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`.
Burban los de dominio: `ENTRY_STATE`, `DUPLICATE_LINE_ID`, `INVALID_ENTRY_LINE`, `ENTRY_LINE_NOT_FOUND`.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| L01 | Un borrador con una línea | `addEntryLine` con una segunda línea | Devuelve el borrador con las dos líneas; el puerto lo guarda |
| L02 | Un borrador de una línea | `addEntryLine` de la línea que equilibra | Queda equilibrado y es postable |
| L03 | Un asiento `POSTED` | `addEntryLine` | `ENTRY_STATE`; el asiento no cambia |
| L04 | Un borrador con `line-1` | `addEntryLine` con `line-1` otra vez | `DUPLICATE_LINE_ID`; nada cambia |
| L05 | Un borrador | `addEntryLine` con importe cero o negativo | `INVALID_ENTRY_LINE`; nada cambia |
| L06 | Un borrador | `addEntryLine` con una cuenta inexistente o de otro plan | `ACCOUNT_NOT_FOUND`; nada cambia |
| L07 | Un borrador con dos líneas | `removeEntryLine` de la primera | Devuelve el borrador con la segunda, en su orden |
| L08 | Un borrador de dos líneas | `removeEntryLine` de un id que no está | `ENTRY_LINE_NOT_FOUND`; nada cambia |
| L09 | Un asiento `POSTED` | `removeEntryLine` | `ENTRY_STATE`; el asiento no cambia |
| L10 | Un `entryId` de otro libro o inexistente | `addEntryLine` o `removeEntryLine` | `ENTRY_NOT_FOUND`; nada cambia |
| L11 | La misma clave con la misma petición | Repetir `addEntryLine` | Mismo resultado, sin segunda línea |
| L12 | La misma clave con otra línea | Repetir con otro importe | `IDEMPOTENCY_CONFLICT`; nada cambia |
| L13 | Un puerto que falla al guardar | Cualquiera de las dos | El error sube y el borrador entregado antes queda como estaba |

## Integración y consistencia

- Una edición no revalida el resto del borrador: sigue siendo un borrador, con las mismas reglas diferidas
  a `postEntry`.
- Dos ediciones concurrentes del mismo borrador son responsabilidad del anfitrión: el core lee, calcula y
  entrega dentro de una unidad de trabajo, pero sin control de versión no puede detectar la carrera. Queda
  declarado como límite, no como garantía.
- El core no persiste nada: no abre conexiones, no conoce el almacenamiento y no escribe en otro lado que no
  sea el puerto que le entrega el anfitrión.

## Verificación

- Pruebas: `tests/entry-draft-edit.test.mjs`, una por criterio de L01 a L13.
- `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
