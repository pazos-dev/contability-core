# Orden de implementación

| Orden | Resultado | Condición para terminar |
| --- | --- | --- |
| 001 | Money y Currency | Aceptación M01-M12, tipos y compilación. |
| 002 | Account | Invariantes locales A01-A03 y A08; distinguir las validaciones de aplicación pendientes. |
| 003 | Journal | J01-J02 y estado; unicidad y pertenencia diferidas a aplicación. |
| 004 | AccountingDate y AccountingPeriod | P01-P04 y P06; sin prometer cierre transaccional. |
| 005 | JournalEntry y líneas | E01-E11 con reversión como borrador y sin mutación externa. |
| 006 | Aplicación y adaptador en memoria | Registro, contabilización, cierre, reversión y aislamiento por libro con sus specs. Dos entregas: 006a registro y catálogo; 006b contabilización, cierre y reversión. Después, 006c: crear el borrador que 006b contabiliza, y 006d: editar sus líneas. Las garantías que exigen base real no se aprueban con pruebas en memoria: son del anfitrión. |
| 006e | Libro contable como agregado | `docs/specs/ledger.md`: entidad `Ledger` (id, nombre, plan, estado), puerto `LedgerRepository` que reemplaza `LedgerDirectory`, `registerLedger` y `setLedgerStatus` en la fachada, y `LEDGER_INACTIVE` en los once casos de uso. Spec escrita, código no. |
| 007 | Contrato para el adaptador del anfitrión | Documentar qué debe garantizar un adaptador durable: transacción, unicidad, clave primaria, detección de conflicto. Este repositorio no incluye base de datos. |
| 008 | Consultas e informes básicos | Mayor, balance de comprobación y saldos por moneda, con especificaciones propias. |
| 009 | Extensiones | Ejercicio, multimoneda, país, impuestos o integraciones según necesidad demostrada. |

001-005 son incrementos del dominio. La contabilización usable por otra aplicación llega con 006; el
guardado durable lo aporta el anfitrión con su propio adaptador. 006e cierra el único concepto del módulo que
todavía era configuración del adaptador en vez de entidad. Ninguna etapa se marca hecha por tener una carpeta
o documento.
