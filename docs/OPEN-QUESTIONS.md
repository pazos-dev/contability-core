# Decisiones resueltas y pendientes

No reabrir el análisis completo para iniciar una tarea. Distinguir acuerdos de las elecciones técnicas
de preparación registradas en ADR 0002.

| ID | Tema | Estado | Documento |
| --- | --- | --- | --- |
| Q01 | Representación monetaria exacta | Consolidada: bigint en unidades mínimas. | specs/money.md |
| Q02 | Moneda explícita y compatibilidad | Resuelta: catálogo ISO 4217 cerrado; el código fija la escala. | specs/currency-catalog.md |
| Q03 | Negativos y entradas | Propuesta técnica: Money con signo; líneas positivas; parser estricto. | decisions/0002-base-tecnica.md |
| Q04 | JSON y errores | Propuesta técnica lista para primer incremento. | specs/money.md |
| Q05 | Redondeo | Aplazado; no bloquea suma/resta exactas. | specs/money.md |
| Q06 | Entorno y módulos | Configurado; instalación/verificación según VALIDACION.md. | README.md |
| Q07 | Empresa/libro | Libro como ámbito propuesto; relación empresa-libros por definir antes del adaptador real. | specs/post-entry.md |
| Q08 | Moneda funcional y conversión | Pendiente; un asiento una moneda inicialmente. | specs/entries.md |
| Q09 | Persistencia, framework y transacciones | Pendiente; no bloquea dominio. | INTEGRATION.md |
| Q10 | Estados y cierre | DRAFT/POSTED, OPEN/CLOSED; reversión con otro asiento. | specs/entries.md y specs/period.md |
| Q11 | Numeración oficial y concurrencia | Pendiente de contrato de aplicación/persistencia; usar IDs explícitos mientras tanto. | specs/post-entry.md |
| Q12 | País y fiscalidad | Fuera de fase; especificar con fuentes y vigencia al incorporarlos. | SCOPE.md |
| Q13 | Monedas retiradas del ISO 4217 | Pendiente; bloquea la primera persistencia con datos históricos. Mitigación aplicada: la escala se persiste y se valida (M14-M15). | specs/currency-catalog.md |

Ejercicio, reapertura, cierres de resultados, contracuentas y contabilización multimoneda necesitan
especificaciones propias. No se incluyen implícitamente al crear el primer período.
