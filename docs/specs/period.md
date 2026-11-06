# SPEC — Período contable y fecha

Estado: reglas locales listas; cierre concurrente se completa con aplicación/persistencia.
Ruta: `src/core/domain/period/`.

## Modelo

AccountingDate: fecha de calendario válida YYYY-MM-DD, sin zona horaria.
AccountingPeriod: id, ledgerId, name, startDate, endDate y status OPEN/CLOSED.
Límites inclusivos. No usar instantes UTC para decidir a qué día contable pertenece un asiento.
Ejercicio y períodos son conceptos relacionados pero distintos; no crear FiscalYear sin especificar sus reglas.

## Reglas

- Fechas reales, incluidos años bisiestos; rechazar normalización automática de fechas inexistentes.
- startDate <= endDate. Períodos de un solo día son válidos.
- contains(date) incluye ambos extremos.
- OPEN admite contabilizar; CLOSED rechaza nuevas contabilizaciones y su propia edición ordinaria.
- Cerrar cambia el estado sin borrar ni alterar asientos históricos.
- Propuesta inicial: no solapar períodos ordinarios dentro de un mismo libro. Validar en aplicación/BD.
- El cierre no convierte borradores en POSTED ni genera automáticamente asientos de resultados.
- Propuesta inicial: cerrar dos veces produce error de estado; un caso de uso puede tratar reintentos por idempotencia.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| P01 | Fecha en el inicio o fin | Pertenece al período. |
| P02 | Día anterior o posterior | No pertenece. |
| P03 | Inicio posterior al fin | Error. |
| P04 | 2024-02-29 / 2026-02-29 | Primera válida; segunda rechazada. |
| P05 | Contabilizar en CLOSED | Rechazo sin cambios. |
| P06 | Cerrar OPEN | CLOSED; historial intacto. |
| P07 | Dos períodos del mismo libro solapados | Rechazo desde aplicación. |
| P08 | Cierre y contabilización simultáneos | Persistencia serializa o detecta conflicto; no aceptar post después de cierre. |

Reapertura, ajustes especiales, cierre fiscal, permisos de cierre y bloqueo por borradores quedan para
sus propios casos de uso. En esta base el cierre no exige automáticamente eliminar o contabilizar borradores.
