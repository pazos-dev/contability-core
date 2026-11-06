# SPEC — Contabilizar un asiento

Estado: diseño de aplicación propuesto; implementar después del dominio.
Ruta: `src/core/application/use-cases/`.

## Entrada y salida propuestas

Entrada: ledgerId, entryId e idempotencyKey explícitos. La autenticación vive en el anfitrión.
La clave se aísla por libro y operación; guardar huella de la petición y resultado.
Salida serializable con entryId, status y datos de confirmación definidos por el contrato.
No exponer directamente la instancia mutable ni modelos ORM.

## Flujo

Dentro de una unidad de trabajo: resolver reintento, cargar borrador y entidades necesarias;
comprobar pertenencia al libro, diario activo, período abierto que contiene la fecha y cuentas activas
contabilizables del plan del libro; ejecutar invariantes del agregado; persistir agregado e idempotencia
en la misma transacción. Publicación de eventos, si llega a existir, necesita un mecanismo transaccional propio.

Ledger configura la relación libro-plan de cuentas. Antes del adaptador persistente, especificar esa relación
y si una empresa puede tener varios libros. No confundir ledgerId con chartOfAccountsId.

## Puertos mínimos candidatos

Repositorio de asientos, consulta de cuentas/diario/período/libro, registro de idempotencia y frontera de
transacción compartida. Introducir solo los que la implementación use. Las operaciones dentro de la transacción
deben utilizar el mismo contexto transaccional, nunca conexiones independientes disfrazadas de unidad de trabajo.

## Aceptación

| ID | Caso | Resultado |
| --- | --- | --- |
| U01 | Todo válido | Una única escritura atómica a POSTED. |
| U02 | Cuenta, diario o período inválido | Nada persistido; error estable. |
| U03 | Fallo de BD tras preparar líneas | Rollback de cabecera, líneas e idempotencia. |
| U04 | Misma clave y misma petición | Mismo resultado; sin segundo efecto. |
| U05 | Misma clave y otra petición | Conflicto explícito. |
| U06 | Dos post simultáneos | Uno se confirma; otro reintenta o recibe conflicto. |
| U07 | Cerrar período durante el post | Se serializa o detecta conflicto. |
| U08 | ID existente en otro libro | No se filtra ni modifica ese registro. |

El adaptador en memoria debe documentar su falta de durabilidad y aislamiento de producción.
No presentar una prueba en memoria como prueba de transacciones PostgreSQL.
