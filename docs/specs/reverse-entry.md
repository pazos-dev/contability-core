# SPEC — Revertir un asiento contabilizado

Estado: lista para implementar (incremento 006b).
Ruta: `src/core/application/use-cases/`.
Depende de: `entries.md` (E09), `post-entry.md` (invariantes de contabilización reutilizadas).
Contrato general de casos de uso y puertos: `registration.md`.

## Objetivo

Corregir un asiento contabilizado emitiendo otro asiento que invierte sus lados, dejando el original
intacto y POSTED, y sin permitir una segunda reversión completa del mismo original.

## Alcance y exclusiones

Incluye:

- `reversePostedEntry`: crea el borrador de reversión y lo contabiliza en una sola unidad de trabajo.

Excluye, declarado para no prometerlo:

- Reversiones parciales: sólo se revierte el asiento completo.
- Cancelar una reversión ya contabilizada: se corrige con otra reversión de la reversión, fuera de alcance.
- Editar el asiento original o devolverlo a DRAFT.
- Numeración de asientos (Q11).
- Carreras entre dos reversiones simultáneas del mismo original: diferido a 007, donde la unicidad la
  garantiza la persistencia.

## Entrada y salida

```ts
interface ReversePostedEntryInput {
  readonly ledgerId: string;
  readonly originalEntryId: string;
  readonly reversalEntryId: string;
  readonly periodId: string;
  readonly accountingDate: string;
  readonly description?: string;
  readonly idempotencyKey: string;
}
```

El diario no es una entrada: la reversión usa el mismo diario que el original. Tampoco lo son las líneas:
se derivan del original con los lados intercambiados y los importes intactos.

Salida: el mismo contrato que `PostEntryResult` en `post-entry.md`, más `reversalOfEntryId`. Los importes
viajan como `MoneyJSON`, el mismo tipo que publica el dominio.

```ts
interface ReversePostedEntryResult extends PostEntryResult {
  readonly reversalOfEntryId: string;
}
```

La huella de idempotencia es `ledgerId` + `originalEntryId` + `reversalEntryId`. Operación
`'reversePostedEntry'`.

## Flujo y orden de validación

Todo dentro de una sola llamada a `unitOfWork.run`.

1. **Idempotencia.** `find(ledgerId, 'reversePostedEntry', key)`: huella igual devuelve el resultado
   guardado; huella distinta es `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Original.** `findById(ledgerId, originalEntryId)`; ausente o de otro libro es `ENTRY_NOT_FOUND`.
4. **Borrador de reversión.** `original.createReversalDraft({ id: reversalEntryId, periodId,
   accountingDate, description })`. El dominio exige que el original esté POSTED: un original en DRAFT
   recibe `ENTRY_STATE` y no se escribe nada (E09). Las líneas del borrador invierten DEBIT/CREDIT,
   conservan importe y descripción, y **reutilizan los ids de línea del original**, que son únicos dentro
   de su asiento.
5. **Diario.** `findById(ledgerId, original.journalId)`; ausente es `JOURNAL_NOT_FOUND`, `INACTIVE` es
   `JOURNAL_INACTIVE`.
6. **Período destino.** `findById(ledgerId, periodId)`; ausente es `PERIOD_NOT_FOUND`. No `OPEN` es
   `PERIOD_CLOSED`; que no contenga la fecha es `PERIOD_DATE_OUTSIDE`. El período **destino** debe estar
   abierto aunque el período del original ya esté cerrado.
7. **Cuentas.** Para cada línea del borrador de reversión, en orden: `ACCOUNT_NOT_FOUND` si la cuenta no
   existe o es de otro plan, `ACCOUNT_INACTIVE` si está inactiva, `ACCOUNT_NOT_POSTABLE` si no admite
   movimientos. Son las mismas reglas que `postEntry` aplica a un borrador nuevo: revertir no es una vía
   para contabilizar en una cuenta desactivada.
8. **Id de reversión libre.** `findById(ledgerId, reversalEntryId)`: si ya existe un asiento con ese id, es
   `ENTRY_ALREADY_EXISTS`. El guardado es un *upsert* por `(ledgerId, entryId)`, así que reutilizar un id
   sobrescribiría el asiento guardado; en 007 la clave primaria lo impide. El dominio ya rechaza el caso
   `reversalEntryId === originalEntryId` con `INVALID_ENTRY`.
9. **Reversión existente.** `entries.findByReversalOf(ledgerId, originalEntryId)` no vacío es
   `ENTRY_ALREADY_REVERSED`. La comprobación va inmediatamente antes de escribir, dentro de la unidad de
   trabajo, para que 007 pueda sustituirla por una restricción única sin moverla.
10. **Contabilizar.** `reversalDraft.post()`: sus errores burbujean (en la práctica no debería fallar,
   porque las líneas espejadas conservan equilibrio y moneda del original).
11. **Escritura única.** `entries.save(postedReversal)` y `idempotency.record(...)` en la misma unidad de
    trabajo. El original nunca se guarda: no se toca.
12. **Resultado.** Se arma a partir de la reversión posteada.

## Reglas e invariantes

1. El original permanece `POSTED`, con las mismas líneas, y no se reescribe.
2. La reversión es un asiento nuevo con identidad propia: id, período y fecha los elige el llamador.
3. Un original admite como máximo una reversión completa contabilizada.
4. Revertir no reabre períodos ni modifica cierres.
5. La reversión hereda moneda, importes y cuentas del original: no se leen de la entrada del caso de uso.
6. El caso de uso no lee reloj, no genera ids y no lee variables de entorno.

## Errores

Códigos propios: `LEDGER_NOT_FOUND`, `ENTRY_NOT_FOUND`, `ENTRY_ALREADY_EXISTS`, `ENTRY_ALREADY_REVERSED`, `JOURNAL_NOT_FOUND`,
`JOURNAL_INACTIVE`, `PERIOD_NOT_FOUND`, `PERIOD_CLOSED`, `PERIOD_DATE_OUTSIDE`, `ACCOUNT_NOT_FOUND`,
`ACCOUNT_INACTIVE`, `ACCOUNT_NOT_POSTABLE`, `IDEMPOTENCY_CONFLICT`.

Burbujea `ENTRY_STATE` del dominio cuando el original no está POSTED.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| V01 | E09 | Un asiento `POSTED` con Debe 1.000 en A y Haber 1.000 en B | `reversePostedEntry` | Queda un asiento nuevo `POSTED` con Haber 1.000 en A y Debe 1.000 en B, `reversalOfEntryId` apuntando al original y los mismos ids de línea |
| V02 | — | El original de V01 | Después de la reversión | Sigue `POSTED` con sus líneas originales sin cambios |
| V03 | — | Un original ya revertido | Segunda `reversePostedEntry` con otra clave | `ENTRY_ALREADY_REVERSED`; nada escrito |
| V04 | E09 | Un asiento en `DRAFT` | `reversePostedEntry` | `ENTRY_STATE` del dominio; nada escrito |
| V05 | — | Un período destino `CLOSED` | `reversePostedEntry` | `PERIOD_CLOSED`; nada escrito |
| V06 | — | Un original en un período `CLOSED` y un destino `OPEN` que contiene la fecha | `reversePostedEntry` | La reversión se contabiliza; el período original sigue `CLOSED` |
| V07 | — | Un período destino abierto que no contiene la fecha pedida | `reversePostedEntry` | `PERIOD_DATE_OUTSIDE`; nada escrito |
| V08 | A06 | Una cuenta del original hoy `INACTIVE` o con `postingAllowed: false` | `reversePostedEntry` | `ACCOUNT_INACTIVE` o `ACCOUNT_NOT_POSTABLE`; nada escrito |
| V09 | J05 | El diario del original hoy `INACTIVE` | `reversePostedEntry` | `JOURNAL_INACTIVE`; nada escrito |
| V10 | — | Un `originalEntryId` que existe en otro libro | `reversePostedEntry` en este libro | `ENTRY_NOT_FOUND`; el asiento del otro libro queda intacto |
| V11 | — | La misma clave y la misma petición | Repetir `reversePostedEntry` | Mismo resultado, sin segunda reversión |
| V12 | — | La misma clave y otro `reversalEntryId` | `reversePostedEntry` | `IDEMPOTENCY_CONFLICT`; nada escrito |
| V13 | — | Un repositorio que falla al guardar | `reversePostedEntry` | El error sube; no queda reversión ni registro y el original sigue `POSTED` |
| V14 | — | Un `reversalEntryId` que ya pertenece a otro asiento del libro | `reversePostedEntry` | `ENTRY_ALREADY_EXISTS`; el asiento existente y el original quedan intactos |
| V15 | — | Un `reversalEntryId` que ya pertenece a un borrador del libro | `reversePostedEntry` | `ENTRY_ALREADY_EXISTS`; el borrador queda `DRAFT` y sin enlace de reversión |

## Decisiones pendientes

| ID | Tema | Impacto |
| --- | --- | --- |
| — | Reversión parcial y cancelación de una reversión | Necesitan especificación propia; hoy sólo existe la reversión completa simple. |
| — | Dos reversiones simultáneas del mismo original | Diferido a 007: hoy la comprobación previa es de aplicación, sin unicidad durable. |
| Q11 | Numeración del asiento de reversión | Sin numeración en esta fase; ids explícitos. |

## Integración y consistencia

- La unicidad "una sola reversión completa por original" se verifica en aplicación dentro de la unidad de
  trabajo. Su garantía durable (restricción única sobre `reversalOfEntryId`) queda para 007.
- El adaptador en memoria no prueba concurrencia ni durabilidad.
- La reversión no participa del cierre de período: puede revertirse un asiento de un período cerrado
  siempre que el destino esté abierto.

## Verificación

- Pruebas: `tests/reverse-entry.test.mjs`.
- Una prueba por criterio V01-V13, más el caso de un asiento de tres líneas con dos cuentas y lado mixto
  para confirmar que el espejado no depende de la posición.
- V13 se prueba con el adaptador en memoria real, inyectando el fallo en `record` y comparando el estado
  del repositorio de asientos antes y después.
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
