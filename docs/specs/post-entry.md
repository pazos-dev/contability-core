# SPEC — Contabilizar un asiento

Estado: lista para implementar (incremento 006b), con U06, U07 y U03b diferidos a 007.
Ruta: `src/core/application/use-cases/`.
Depende de: `entries.md` (E01-E11), `account.md` (A06), `journal.md` (J05), `period.md` (P05).
Contrato general de casos de uso, puertos y errores: `registration.md`, que fija las convenciones que
este documento no repite.

## Objetivo

Pasar un borrador persistido de DRAFT a POSTED comprobando, en una sola unidad de trabajo, que la cuenta,
el diario y el período del libro lo admiten; y que repetir la misma petición no produce un segundo efecto.

Este incremento es el único lugar donde se verifican A06, J05, P05 y U01-U05, U08 y U09.

## Alcance y exclusiones

Incluye:

- `postEntry`, su puerto de asientos y su registro de idempotencia.
- Contra `registration.md`, el adaptador en memoria de `PostedMovementsQuery` deja de ser un doble.

Excluye, declarado para no prometerlo:

- **U03b — rollback de una base real.** El adaptador en memoria no prueba transacciones de producción.
  Se verifica recién en 007, con una BD real.
- **U06 — dos `postEntry` simultáneos.** Requiere aislamiento de transacción. Diferido a 007.
- **U07 — cierre de período durante el `postEntry`.** Requiere bloqueo o detección de conflicto sobre el
  período. Diferido a 007.
- Numeración de asientos y su ámbito (Q11): los ids siguen siendo explícitos.
- Publicación de eventos, reintentos automáticos del anfitrión y autorización.
- Instante de auditoría: el caso de uso no lee reloj y el resultado no lleva marca de tiempo.

## Entrada y salida

Entrada:

```ts
interface PostEntryInput {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly idempotencyKey: string;
}
```

`idempotencyKey` es obligatoria: contabilizar es la operación repetible por excelencia. La clave se aísla
por libro y por operación (`'postEntry'`).

Salida:

```ts
interface PostEntryResult {
  readonly ledgerId: string;
  readonly entryId: string;
  readonly journalId: string;
  readonly periodId: string;
  readonly status: 'POSTED';
  readonly accountingDate: string;
  readonly lines: readonly {
    readonly lineId: string;
    readonly accountId: string;
    readonly side: 'DEBIT' | 'CREDIT';
    readonly amount: { readonly minorUnits: string; readonly code: string; readonly scale: number };
    readonly description?: string;
  }[];
  readonly totalDebit: { readonly minorUnits: string; readonly code: string; readonly scale: number };
  readonly totalCredit: { readonly minorUnits: string; readonly code: string; readonly scale: number };
}
```

La huella de idempotencia es `ledgerId` + `entryId`: es todo lo que la petición identifica además de la
clave. Otra `entryId` con la misma clave y el mismo libro es otra petición (U05).

El resultado no expone la instancia del agregado ni nada mutable: `lines` es una copia serializada.

## Flujo y orden de validación

El orden es parte del contrato: con dos condiciones inválidas a la vez, el error reportado es el de la
regla de menor número. Todas las lecturas y la escritura viven en una sola llamada a `unitOfWork.run`.

1. **Idempotencia.** `find(ledgerId, 'postEntry', key)`.
   - Huella igual: devolver el resultado guardado. Sin lecturas de estado y sin segundo efecto.
   - Huella distinta: `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Asiento.** `findById(ledgerId, entryId)`; ausente es `ENTRY_NOT_FOUND`. La búsqueda está acotada por
   libro: un id de otro libro es indistinguible de uno inexistente.
4. **Diario.** `findById(ledgerId, journalId)`; ausente es `JOURNAL_NOT_FOUND`, incluido el caso de un
   diario de otro libro (J05). `INACTIVE` es `JOURNAL_INACTIVE` (J05).
5. **Período.** `findById(ledgerId, periodId)`; ausente es `PERIOD_NOT_FOUND`. Un período de otro libro
   cae en el mismo código.
   - `status` distinto de `OPEN` es `PERIOD_CLOSED` (P05).
   - `!contains(accountingDate)` es `PERIOD_DATE_OUTSIDE`: el `periodId` del borrador no demuestra que la
     fecha caiga adentro.
6. **Cuentas.** Para cada línea, en orden, sin deduplicar:
   - `findById(accountId)`; ausente o de otro plan es `ACCOUNT_NOT_FOUND`.
   - `status` distinto de `ACTIVE` es `ACCOUNT_INACTIVE` (A06).
   - `postingAllowed` en `false` es `ACCOUNT_NOT_POSTABLE` (A06).
7. **Invariantes del agregado.** `entry.post()`: sus errores burbujean tal cual
   (`ENTRY_STATE`, `ENTRY_INCOMPLETE`, `ENTRY_UNBALANCED`, `ENTRY_CURRENCY_MISMATCH`). Un asiento ya
   `POSTED` sin coincidencia de idempotencia llega acá y recibe `ENTRY_STATE` (E11).
8. **Escritura única.** Dentro de la misma unidad de trabajo: `entries.save(posted)` y
   `idempotency.record(...)` con la huella y el resultado. Si cualquiera falla, ninguno de los dos queda.
9. **Resultado.** Se arma a partir del agregado posteado.

Un fallo en cualquier paso no escribe nada: el borrador nunca se guarda a medias.

## Reglas e invariantes

1. `postEntry` no acepta líneas: contabiliza exactamente el borrador persistido. Editar es cosa de otro
   caso de uso, hoy inexistente.
2. El asiento nace congelado: el resultado se calcula después de guardar y no permite volver a DRAFT.
3. El asiento debe pertenecer al libro: `entry.ledgerId` es siempre el de la búsqueda, así que una
   cabecera de otro libro no se alcanza.
4. Todas las líneas comparten moneda y escala; eso lo decide E05 en el dominio, no el caso de uso.
5. Los importes viajan como `minorUnits` en cadena. Nunca `number`, nunca `bigint` crudo en JSON.
6. El caso de uso no lee reloj, no genera ids y no lee variables de entorno.
7. `chartOfAccountsIdOf` participa aunque el asiento no lo lleve: es lo que impide que las cuentas de las
   líneas vengan de otro plan de cuentas.

## Errores

Códigos propios: `LEDGER_NOT_FOUND`, `ENTRY_NOT_FOUND`, `JOURNAL_NOT_FOUND`, `JOURNAL_INACTIVE`,
`PERIOD_NOT_FOUND`, `PERIOD_CLOSED`, `PERIOD_DATE_OUTSIDE`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_INACTIVE`,
`ACCOUNT_NOT_POSTABLE`, `IDEMPOTENCY_CONFLICT`.

Burban los de dominio sin envolver, con su código original.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| U01 | — | Borrador equilibrado con cuentas activas, diario activo y período abierto que contiene la fecha | `postEntry` | Devuelve `status: POSTED` con las líneas y los totales; queda un único asiento guardado |
| U02 | — | Un borrador con una cuenta, diario o período inválido | `postEntry` | Error estable y el borrador sigue `DRAFT`; nada más escrito |
| U03a | — | Una unidad de trabajo en memoria cuyo registro de idempotencia falla **después** de guardar el asiento | `postEntry` | El asiento guardado se revierte y no queda registro de idempotencia: no hay efecto parcial |
| U03b | — | Fallo de base real tras preparar las líneas | `postEntry` | **Diferido a 007.** Rollback de cabecera, líneas e idempotencia con BD real |
| U04 | — | La misma clave y la misma petición | Repetir `postEntry` | Mismo resultado, sin segundo efecto ni segunda escritura |
| U05 | — | La misma clave y otro `entryId` en el mismo libro | `postEntry` | `IDEMPOTENCY_CONFLICT`; nada escrito |
| U06 | — | Dos `postEntry` simultáneos | — | **Diferido a 007.** Requiere aislamiento de transacción |
| U07 | — | Cierre de período durante el `postEntry` | — | **Diferido a 007.** Requiere bloqueo o detección de conflicto |
| U08 | — | Un `entryId` que existe en otro libro | `postEntry` en este libro | `ENTRY_NOT_FOUND`; el asiento del otro libro no se lee, ni se modifica, ni se menciona |
| U09 | P05 | Un período `CLOSED` al que pertenece la fecha | `postEntry` | `PERIOD_CLOSED`; el borrador sigue `DRAFT` |
| U10 | — | Un período `OPEN` de enero y un borrador con fecha de marzo | `postEntry` | `PERIOD_DATE_OUTSIDE`; el borrador sigue `DRAFT` |
| U11 | A06 | Una línea con cuenta `postingAllowed: false` | `postEntry` | `ACCOUNT_NOT_POSTABLE`; nada contabilizado |
| U12 | A06 | Una línea con cuenta `INACTIVE` | `postEntry` | `ACCOUNT_INACTIVE`; nada contabilizado |
| U13 | A06 | Una línea con cuenta de otro plan de cuentas | `postEntry` | `ACCOUNT_NOT_FOUND`; nada contabilizado |
| U14 | J05 | Un diario `INACTIVE` o de otro libro | `postEntry` | `JOURNAL_INACTIVE` o `JOURNAL_NOT_FOUND`; nada contabilizado |
| U15 | E11 | Un asiento ya `POSTED` y una clave nueva | `postEntry` | `ENTRY_STATE` del dominio; sin escrituras |
| U16 | — | Un borrador desequilibrado con todo lo demás válido | `postEntry` | `ENTRY_UNBALANCED` del dominio; sigue `DRAFT` con sus líneas |
| U17 | — | Varias condiciones inválidas a la vez | `postEntry` | Se reporta el error de la regla de menor número del flujo |

## Decisiones pendientes

| ID | Tema | Impacto |
| --- | --- | --- |
| Q11 | Numeración oficial de asientos y su ámbito | Hoy no se numera. Introducirla exige contrato y control de concurrencia. |
| Q07 | Varios libros por plan o varios planes por libro | Cambia `LedgerDirectory` y la comprobación de plan de las líneas. |
| — | Editar líneas de un borrador persistido | No hay caso de uso; el agregado permite `addLine`/`removeLine` sobre copias. |
| — | Reintento automático del anfitrión ante `ENTRY_STATE` | El core no reintenta; devuelve el error con código estable. |

## Integración y consistencia

- Atomicidad real entre asiento e idempotencia es de 007. Este incremento fija el contrato de
  `UnitOfWork` y demuestra que el caso de uso no deja escrituras sueltas.
- El adaptador en memoria documenta que no hay aislamiento: dos llamadas concurrentes pueden intercalarse.
- El asiento guardado es un valor inmutable; no queda ninguna ruta para devolverlo a `DRAFT`.
- 007 deberá apoyarse en la huella registrada para detectar `IDEMPOTENCY_CONFLICT` con una restricción
  única por `(ledgerId, operación, clave)`.

## Verificación

- Pruebas: `tests/post-entry.test.mjs`.
- Una prueba por criterio U01-U05 y U08-U17, más el caso límite de la fecha igual al inicio y al fin del
  período (P01 aplicado desde el caso de uso).
- U03a se prueba con el adaptador en memoria real, inyectando el fallo en `record` y comparando el estado
  del repositorio antes y después.
- U06, U07 y U03b no se escriben como pruebas verdes: figuran como diferidos en este documento y en
  `docs/STATUS.md` hasta que exista persistencia real.
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
