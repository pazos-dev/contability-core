# Orden de implementación

| Orden | Resultado | Condición para terminar |
| --- | --- | --- |
| 001 | Money y Currency | Aceptación M01-M12, tipos y compilación. |
| 002 | Account | Invariantes locales A01-A03 y A08; distinguir las validaciones de aplicación pendientes. |
| 003 | Journal | J01-J02 y estado; unicidad y pertenencia diferidas a aplicación. |
| 004 | AccountingDate y AccountingPeriod | P01-P04 y P06; sin prometer cierre transaccional. |
| 005 | JournalEntry y líneas | E01-E11 con reversión como borrador y sin mutación externa. |
| 006 | Aplicación y adaptador en memoria | Registro, contabilización, cierre, reversión y aislamiento por libro con sus specs. Dos entregas: 006a registro y catálogo; 006b contabilización, cierre y reversión. Después, 006c: crear el borrador que 006b contabiliza, y 006d: editar sus líneas. Las garantías que exigen base real no se aprueban con pruebas en memoria: son del anfitrión. |
| 006e | Libro contable como agregado | `docs/specs/ledger.md`: entidad `Ledger` (id, nombre, plan, estado), puerto `LedgerRepository` que reemplaza `LedgerDirectory`, `registerLedger` y `setLedgerStatus` en la fachada, y `LEDGER_INACTIVE` en los once casos de uso. Implementado y verificado. |
| 006f | Moneda funcional del libro | `docs/specs/ledger.md` L17-L24: `Ledger` declara una moneda funcional inmutable, `registerLedger` la exige y la incluye en su idempotencia, y contabilizar en otra moneda es `LEDGER_CURRENCY_MISMATCH`. Cierra Q08 como moneda única por libro, sin conversión. Implementado y verificado. |
| 007 | Contrato para el adaptador del anfitrión | `docs/INTEGRATION.md`: qué garantiza el core y qué debe garantizar un adaptador durable, con 42 obligaciones numeradas `HA01`-`HA42` por puerto (unidad de trabajo, idempotencia, lectura, migraciones). Cada garantía auditada contra el código: dos de las que la tabla atribuía al core prometían de más y quedaron corregidas. Implementado y verificado. Este repositorio no incluye base de datos. |
| 008 | Consultas e informes básicos | `docs/specs/reports.md`: saldos por cuenta y balance de comprobación (008a) y mayor por cuenta (008b), con puerto de lectura propio y cálculos derivados. Implementado y verificado: `accountBalances`, `trialBalance` y `accountMovements`, fachada de dieciséis métodos, AB01-AB05, TB00-TB11 y GL01-GL11. |
| 009a | Numeración de asientos | `docs/specs/entry-numbering.md`: `JournalEntry` gana `number` y `post(number)`, puerto `EntryNumberSequence` por libro y asignación en `post` y `reverse` después de todas las guardas. Ámbito por libro, entero pelado, sin renumeración y con huecos permitidos; formato y unicidad durable son del anfitrión. Implementado y verificado. |
| 009 | Extensiones | Ejercicio, multimoneda, país, impuestos o integraciones según necesidad demostrada. |

001-005 son incrementos del dominio. La contabilización usable por otra aplicación llega con 006; el
guardado durable lo aporta el anfitrión con su propio adaptador. 006e cierra el único concepto del módulo que
todavía era configuración del adaptador en vez de entidad, 006f le da al libro su unidad de cuenta y 008 abre
la lectura. Ninguna etapa se marca hecha por tener una carpeta o documento.
