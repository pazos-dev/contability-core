# SPEC — Editar un borrador: líneas y cabecera

Estado: **implementada y verificada**: líneas en el incremento 006d (L01-L13) y cabecera en el 009c
(L14-L24).
Ruta: `src/core/application/use-cases/entries/entries.ts`.
Depende de: `entries.md` (E06, E07), `entry-draft.md` (D01-D13) y el contrato general de `registration.md`.

## Objetivo

Corregir un borrador ya guardado sin borrarlo y sin tocar el repositorio de asientos directamente: agregar una
línea que faltaba, quitar una que sobra, y corregir su cabecera.

Hoy un borrador mal cargado no tiene arreglo completo dentro del core: se arreglan las líneas pero no el diario,
el período, la fecha ni la descripción. El core no persiste nada: calcula sobre valores inmutables y entrega el
resultado al puerto.

## Alcance y exclusiones

Incluye:

- `addEntryLine`: agrega una línea a un borrador.
- `removeEntryLine`: quita una línea de un borrador por su id.
- `changeEntryHeader`: reemplaza diario, período, fecha contable y descripción de un borrador.

Excluye, declarado para no prometerlo:

- **Cambiar el libro o el id del asiento.** El libro es el ámbito de aislamiento y el id es la identidad: un
  borrador no se muda ni cambia de nombre. Mover un borrador de libro es crearlo de nuevo en el otro.
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

interface ChangeEntryHeaderInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description: string;
  readonly idempotencyKey?: string;
}
```

Las tres devuelven ejecutivamente el **borrador resultante**, con la misma forma que `createEntryDraft`
(`EntryDraftResult`): identidad, fecha, descripción y las líneas que quedan. Sin totales, por el mismo motivo:
un borrador puede estar desbalanceado. El número es `null`, porque un borrador no tiene.

`changeEntryHeader` recibe la cabecera **completa**: los cuatro campos son obligatorios. No existe «ausente
significa conservar», que es donde se pierden datos por accidente; si un campo no cambia, se manda igual.

La huella de idempotencia cubre `ledgerId`, `entryId` y lo que la operación toca: la línea afectada normalizada
en las dos primeras, y `journalId`, `periodId`, `accountingDate` y `description` en la tercera.

## Flujo y orden de validación

1. **Idempotencia.** Huella igual devuelve el resultado guardado; distinta es `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Asiento.** `entries.findById(ledgerId, entryId)`; ausente o de otro libro es `ENTRY_NOT_FOUND`.
4. **Cuenta de la línea nueva** (`addEntryLine` solamente): debe existir y ser del plan del libro;
   `ACCOUNT_NOT_FOUND`. No se exige activa ni contabilizable: es un borrador.
5. **Diario y período de la cabecera nueva** (`changeEntryHeader` solamente): tienen que existir en el mismo
   libro; ausentes o de otro libro son `JOURNAL_NOT_FOUND` y `PERIOD_NOT_FOUND`. **No** se exige diario activo
   ni período abierto, y no se comprueba que la fecha caiga dentro del período: eso es coherencia de
   contabilización y `postEntry` la vuelve a exigir entera.
6. **Agregado.** `addLine`, `removeLine` o `changeHeader`. El dominio decide: asiento `POSTED` → `ENTRY_STATE`;
   id de línea repetido → `DUPLICATE_LINE_ID`; importe no positivo → `INVALID_ENTRY_LINE`; línea inexistente →
   `ENTRY_LINE_NOT_FOUND`; texto vacío o con espacios exteriores → `INVALID_ENTRY`.
7. **Entrega al puerto, una sola vez.** Entregar el borrador resultante y registrar la idempotencia en la
   misma unidad de trabajo. Si cualquiera falla, no queda nada.

`removeEntryLine` no consulta cuentas: la línea que se va no necesita validarse.

## Reglas de la cabecera

1. La operación de dominio es `changeHeader(changes)`: recibe los cuatro campos y devuelve una copia. Conserva
   id, libro, estado, número, líneas y `reversalOfEntryId`.
2. Un asiento `POSTED` la rechaza con `ENTRY_STATE`: un asiento contabilizado no se edita, se revierte.
3. Un borrador **de reversión** sí puede cambiar su fecha y su período, que es justo lo que necesita cuando el
   original está en un período ya cerrado. El enlace con el original no se toca.
4. La descripción sigue las mismas reglas que al crear el borrador: obligatoria, sin espacios exteriores.
5. La fecha contable entra como `AccountingDate`: un `YYYY-MM-DD` inexistente falla en el dominio con
   `INVALID_DATE`, y no se normaliza.
6. Cambiar el diario o el período no revalida las líneas: un borrador puede seguir desbalanceado, con cuentas
   inactivas o con una fecha fuera del período, y `postEntry` lo rechazará al contabilizar.
7. No hay efectos: si la validación falla después de leer, no se entrega nada al puerto.

## Errores

Propios: `LEDGER_NOT_FOUND`, `ENTRY_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `JOURNAL_NOT_FOUND`, `PERIOD_NOT_FOUND`,
`IDEMPOTENCY_CONFLICT`.
Burban los de dominio: `ENTRY_STATE`, `DUPLICATE_LINE_ID`, `INVALID_ENTRY_LINE`, `ENTRY_LINE_NOT_FOUND`,
`INVALID_ENTRY`, `INVALID_DATE`.

## Criterios de aceptación

### Líneas (implementadas, 006d)

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

### Cabecera (009c)

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| L14 | Un borrador con diario, período, fecha y descripción A | `changeEntryHeader` con los cuatro campos B | Devuelve el borrador con B, las mismas líneas y el mismo id; el puerto lo guarda |
| L15 | Un borrador de dos líneas | `changeEntryHeader` que cambia **sólo** el diario | El diario cambia, las dos líneas siguen igual y el resultado las incluye |
| L16 | Un asiento `POSTED` | `changeEntryHeader` | `ENTRY_STATE`; el asiento no cambia y conserva su número |
| L17 | Un borrador | `changeEntryHeader` con descripción vacía o con espacios exteriores | `INVALID_ENTRY`; nada cambia |
| L18 | Un borrador | `changeEntryHeader` con una fecha inexistente como `2026-02-30` | `INVALID_DATE`; nada cambia |
| L19 | Un borrador | `changeEntryHeader` con un diario o un período de otro libro, o inexistente | `JOURNAL_NOT_FOUND` o `PERIOD_NOT_FOUND`; nada cambia |
| L20 | Un borrador de un libro con el diario `INACTIVE` y el período `CLOSED` | `changeEntryHeader` hacia ese diario y ese período | Se acepta: un borrador no exige diario activo ni período abierto |
| L21 | Un borrador con la fecha fuera del período indicado | `changeEntryHeader` con esa fecha y ese período | Se acepta; `postEntry` es quien rechaza con `PERIOD_DATE_OUTSIDE` |
| L22 | Un borrador de reversión con su `reversalOfEntryId` | `changeEntryHeader` con otro período y otra fecha | Se acepta y el enlace al original se conserva |
| L23 | La misma clave con la misma petición | Repetir `changeEntryHeader` | Mismo resultado, sin segundo guardado |
| L24 | La misma clave con otra cabecera | Repetir con otra descripción | `IDEMPOTENCY_CONFLICT`; nada cambia |

## Integración y consistencia

- Una edición no revalida el resto del borrador: sigue siendo un borrador, con las mismas reglas diferidas
  a `postEntry`.
- La cabecera nueva no se comprueba contra las líneas ni contra la moneda del libro: contabilizar vuelve a
  exigir la moneda funcional (`LEDGER_CURRENCY_MISMATCH`) sobre el asiento tal como quede.
- Dos ediciones concurrentes del mismo borrador son responsabilidad del anfitrión: el core lee, calcula y
  entrega dentro de una unidad de trabajo, pero sin control de versión no puede detectar la carrera. Queda
  declarado como límite, no como garantía.
- `EntryDraftResult` no cambia de forma: las tres operaciones devuelven el mismo tipo, así que un anfitrión que
  ya lo consume no necesita tocarlo.
- El core no persiste nada: no abre conexiones, no conoce el almacenamiento y no escribe en otro lado que no
  sea el puerto que le entrega el anfitrión.

## Verificación

- Líneas: `tests/application/entry-draft-edit.test.mjs`, una por criterio de L01 a L13.
- Cabecera: `tests/application/entry-draft-header.test.mjs`, una por criterio de L14 a L24, más las reglas de
  la cabecera en `tests/domain/entries/entries.test.mjs` (la copia conserva identidad, líneas y enlace; un
  `POSTED` la rechaza).
- `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
