# Decisiones resueltas y pendientes

No reabrir el análisis completo para iniciar una tarea. Distinguir acuerdos de las elecciones técnicas
de preparación registradas en ADR 0002.

| ID | Tema | Estado | Documento |
| --- | --- | --- | --- |
| Q01 | Representación monetaria exacta | Consolidada: bigint en unidades mínimas. | specs/money.md |
| Q02 | Moneda explícita y compatibilidad | Resuelta: modelo mixto. Un código ISO fija la escala oficial; un código ausente del catálogo es moneda propia con escala declarada. | specs/currency-catalog.md |
| Q03 | Negativos y entradas | Propuesta técnica: Money con signo; líneas positivas; parser estricto. | decisions/0002-base-tecnica.md |
| Q04 | JSON y errores | Propuesta técnica lista para primer incremento. | specs/money.md |
| Q05 | Redondeo | Aplazado; no bloquea suma/resta exactas. | specs/money.md |
| Q06 | Entorno y módulos | Configurado; instalación/verificación según VALIDACION.md. | README.md |
| Q07 | Empresa/libro/plan | Resuelta para esta fase: el libro resuelve su plan con el puerto `LedgerDirectory` y el caso de uso no acepta un plan del llamador. Varios libros por plan, o varios planes por libro, siguen pendientes antes del adaptador real. | specs/registration.md |
| Q08 | Moneda funcional y conversión | Pendiente; un asiento una moneda inicialmente. | specs/entries.md |
| Q09 | Persistencia, framework y transacciones | Pendiente; no bloquea dominio. | INTEGRATION.md |
| Q10 | Estados y cierre | DRAFT/POSTED, OPEN/CLOSED; reversión con otro asiento. | specs/entries.md y specs/period.md |
| Q11 | Numeración oficial y concurrencia | Pendiente de contrato de aplicación/persistencia; usar IDs explícitos mientras tanto. La idempotencia ya tiene contrato por libro y operación; la numeración y su ámbito siguen abiertas. | specs/post-entry.md |
| Q12 | País y fiscalidad | Fuera de fase; especificar con fuentes y vigencia al incorporarlos. | SCOPE.md |
| Q13 | Monedas retiradas del ISO 4217 | Resuelta por el modelo mixto: una moneda retirada sale del catálogo y pasa al régimen propio, así que se lee con la escala persistida. Contrapartida: ese código pierde la guardia de escala. | specs/currency-catalog.md |

Ejercicio, reapertura, cierres de resultados, contracuentas y contabilización multimoneda necesitan
especificaciones propias. No se incluyen implícitamente al crear el primer período.
