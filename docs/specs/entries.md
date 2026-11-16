# SPEC — Asientos y líneas

Estado: invariantes listas para dominio; contabilización completa depende de aplicación.
Ruta: `src/core/domain/entries/`.

## Modelo propuesto

JournalEntry: id, ledgerId, journalId, periodId, accountingDate, description,
status DRAFT/POSTED, líneas y reversalOfEntryId opcional.
JournalEntryLine: id, accountId, side DEBIT/CREDIT, amount Money y description opcional.
No devolver arrays ni objetos mutables que permitan cambiar un asiento por fuera de sus métodos.

El borrador puede estar incompleto o desequilibrado. Cada línea añadida debe ser válida y positiva.
API orientativa del agregado: createDraft, addLine, removeLine, post y createReversalDraft.

## Invariantes al contabilizar

1. Estado DRAFT, fecha contable válida y al menos dos líneas.
2. Cada línea tiene cuenta, ID único dentro del asiento, lado válido y Money estrictamente positivo.
3. Todas las líneas utilizan la misma definición de moneda.
4. Suma de débitos exactamente igual a suma de créditos, sin tolerancias flotantes.
5. La transición a POSTED es irreversible dentro del agregado.

`post(number)` solo protege invariantes locales; el número lo pide la aplicación al contador del libro.
Aplicación comprueba cuentas activas y contabilizables,
plan/libro, diario y período abierto, moneda funcional del libro, permisos externos y consistencia transaccional.
El identificador periodId no demuestra por sí solo que la fecha pertenezca al período.

La moneda funcional es del libro, no del asiento. La invariante 3 es intra-agregado: todas las líneas comparten
una moneda. Que esa moneda sea la del libro es una regla cruzada —el asiento conoce `ledgerId`, no el libro— y
por eso vive en la aplicación (`docs/specs/ledger.md`, regla 15): contabilizar en otra moneda es
`LEDGER_CURRENCY_MISMATCH`. Los borradores no se validan por moneda, igual que no se validan por balance.

## Reversión

El original permanece POSTED e intacto. Crear otro borrador con importes iguales y lados intercambiados,
vinculado al original; recibir nuevo ID, fecha y período de destino explícitos.
El destino debe estar abierto aunque el período original esté cerrado.
Propuesta inicial: una sola reversión completa contabilizada por original; la aplicación impide duplicados
y carreras. Reversiones parciales y cancelar una reversión necesitan otra especificación.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| E01 | Dos líneas 1.000 Debe / 1.000 Haber | Se puede pasar de DRAFT a POSTED. |
| E02 | Una línea o ninguna | post rechaza. |
| E03 | Debe 1.000 / Haber 999.99 | post rechaza. |
| E04 | Línea cero, negativa o lado inválido | Rechazo al construir/añadir. |
| E05 | Monedas o escalas incompatibles | post rechaza. |
| E06 | Añadir, quitar o editar después de POSTED | Rechazo sin alterar el original. |
| E07 | Repetir ID de línea | Rechazo. |
| E08 | Un post falla | Sigue DRAFT y conserva el estado previo. |
| E09 | Crear borrador de reversión | Lados intercambiados, importes intactos y enlace al original. |
| E10 | Consumidor altera snapshot/array de líneas | El agregado no cambia. |
| E11 | Intentar volver a contabilizar POSTED | Error de estado; el caso de uso maneja reintentos idempotentes. |
| E12 | Un borrador balanceado cuya moneda no es la funcional del libro | `post` rechaza con `LEDGER_CURRENCY_MISMATCH`; el asiento sigue DRAFT. |

No implementar borrado de asientos contabilizados ni un flag mutable que los convierta en borradores.
