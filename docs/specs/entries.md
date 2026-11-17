# SPEC — Asientos y líneas

Estado: invariantes listas para dominio; contabilización completa depende de aplicación.
Ruta: `src/core/domain/entries/`.

## Modelo propuesto

JournalEntry: id, ledgerId, journalId, periodId, accountingDate, description,
status DRAFT/POSTED, líneas y reversalOfEntryId opcional.
JournalEntryLine: id, accountId, side DEBIT/CREDIT, amount Money y description opcional; una línea
contabilizada lleva además `functionalAmount` —el importe en la moneda del libro— y `rate` cuando hubo
conversión, y una línea de borrador no lleva ninguno de los dos (`foreign-currency.md`, reglas 2, 3, 7 y 9).
No devolver arrays ni objetos mutables que permitan cambiar un asiento por fuera de sus métodos.

El borrador puede estar incompleto o desequilibrado. Cada línea añadida debe ser válida y positiva.
API orientativa del agregado: createDraft, addLine, removeLine, post y createReversalDraft.

## Invariantes al contabilizar

1. Estado DRAFT, fecha contable válida y al menos dos líneas.
2. Cada línea tiene cuenta, ID único dentro del asiento, lado válido y Money estrictamente positivo.
3. Toda línea queda expresada en la moneda funcional del libro: la que ya está en ella no necesita tasa, la
   que está en otra se convierte con la tasa de la operación al contabilizar.
4. Suma de débitos exactamente igual a suma de créditos **en unidades mínimas funcionales**, sin tolerancias
   flotantes.
5. La transición a POSTED es irreversible dentro del agregado.

`post({ number, functionalCurrency, rates })` solo protege invariantes locales; el número lo pide la aplicación
al contador del libro y la moneda funcional es la del libro, que el agregado no conoce.
Aplicación comprueba cuentas activas y contabilizables,
plan/libro, diario y período abierto, moneda funcional del libro, permisos externos y consistencia transaccional.
El identificador periodId no demuestra por sí solo que la fecha pertenezca al período.

La moneda funcional es del libro, no del asiento, así que llega con la operación junto con las tasas
(`foreign-currency.md`, reglas 5 y 12): una línea en otra moneda sin tasa es `ENTRY_RATE_MISSING`, dos tasas con
la misma moneda de origen son `ENTRY_RATE_DUPLICATE` y una pareja que no corresponde o un factor que no es un
`MoneyFactor` positivo son `INVALID_EXCHANGE_RATE`. `ENTRY_CURRENCY_MISMATCH` sobrevive como guarda propia del
agregado para un importe funcional heredado en otra moneda: por el camino público no es alcanzable, porque sólo
la contabilización escribe ese campo y siempre con la moneda que recibió. Los borradores no se validan por
moneda ni convierten, igual que no se validan por balance.

## Reversión

El original permanece POSTED e intacto. Crear otro borrador con importes iguales y lados intercambiados,
vinculado al original; recibir nuevo ID, fecha y período de destino explícitos.
El destino debe estar abierto aunque el período original esté cerrado.
El borrador de reversión espeja también el importe funcional y la tasa del original, y se contabiliza sin
tasas y sin recalcular: los funcionales quedan exactamente opuestos y no hay diferencia de cambio
(`foreign-currency.md`, regla 8).
Propuesta inicial: una sola reversión completa contabilizada por original; la aplicación impide duplicados
y carreras. Reversiones parciales y cancelar una reversión necesitan otra especificación.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| E01 | Dos líneas 1.000 Debe / 1.000 Haber | Se puede pasar de DRAFT a POSTED. |
| E02 | Una línea o ninguna | post rechaza. |
| E03 | Debe 1.000 / Haber 999.99 | post rechaza. |
| E04 | Línea cero, negativa o lado inválido | Rechazo al construir/añadir. |
| E05 | Monedas distintas entre líneas | `post` convierte cada línea extranjera con su tasa y cuadra en funcional; si falta la tasa de una línea, `ENTRY_RATE_MISSING`. |
| E06 | Añadir, quitar o editar después de POSTED | Rechazo sin alterar el original. |
| E07 | Repetir ID de línea | Rechazo. |
| E08 | Un post falla | Sigue DRAFT y conserva el estado previo. |
| E09 | Crear borrador de reversión | Lados intercambiados, importes intactos y enlace al original. |
| E10 | Consumidor altera snapshot/array de líneas | El agregado no cambia. |
| E11 | Intentar volver a contabilizar POSTED | Error de estado; el caso de uso maneja reintentos idempotentes. |
| E12 | Un borrador con una línea en otra moneda | `post` sin tasa es `ENTRY_RATE_MISSING` y el asiento sigue DRAFT; con la tasa del libro contabiliza y el cuadre se evalúa en funcional. |

No implementar borrado de asientos contabilizados ni un flag mutable que los convierta en borradores.
