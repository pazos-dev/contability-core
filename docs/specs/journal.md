# SPEC — Diario contable

Estado: propuesta concreta para implementar tras Account.
Ruta: `src/core/domain/journal/`.

Journal es la entidad que identifica un diario dentro del libro. No es JournalEntry.
Modelo mínimo propuesto: id, ledgerId, code, name y estado ACTIVE/INACTIVE.
Un asiento referencia journalId; no almacenar dentro de Journal una lista creciente de todos sus asientos.

## Reglas

- IDs, código y nombre no vacíos y sin espacios exteriores; se rechazan, no se recortan.
  Código único dentro del libro, validado en aplicación y BD.
- Un diario inactivo conserva historial y rechaza nuevas contabilizaciones; reactivarlo lo devuelve a
  ACTIVE sin borrar el historial.
- Diario y asiento pertenecen al mismo libro; comprobar en aplicación.
- El equilibrio y las líneas pertenecen a JournalEntry, no a Journal.
- Ejemplos de clasificación: general, ventas o compras. No crear diarios por defecto sin necesidad del consumidor.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| J01 | Crear diario con datos válidos | Queda activo dentro del libro indicado. |
| J02 | ID, código o nombre vacío | Error local. |
| J03 | Código repetido en el mismo libro | Rechazo por aplicación. |
| J04 | Desactivar un diario usado | Se conserva historial. |
| J05 | Contabilizar en diario inactivo o de otro libro | Rechazo sin escrituras. |
| J06 | Reactivar un diario inactivo | Vuelve a ACTIVE conservando identidad e historial. |

Numeración secuencial de asientos y su ámbito quedan pendientes del contrato de aplicación.
No usar `max(numero)+1` sin control de concurrencia ni tratar el ID técnico como número oficial.
