# Arquitectura del módulo

El core comprende dominio y aplicación. No contiene servidor HTTP ni ORM.
Una aplicación anfitriona importa el módulo y conecta adaptadores; también puede exponerlo mediante una API propia.

| Capa | Responsabilidad | Dependencias permitidas |
| --- | --- | --- |
| Dominio | Valores, entidades e invariantes locales. | Dominio y bibliotecas puras justificadas. |
| Aplicación | Orquestación, reglas que cruzan entidades, atomicidad y puertos. | Dominio y contratos internos. |
| Adaptadores | Base de datos, HTTP, serialización externa y traducciones. | Aplicación, dominio y tecnología concreta. |
| Composición | Construir y conectar dependencias. | Las capas necesarias. |

## Estructura canónica

| Ruta | Archivos previstos; crear al implementar su especificación |
| --- | --- |
| `src/core/domain/money/` | `currency.ts`, `currency-catalog.ts`, `money.ts`, `money-errors.ts`; `rounding-mode.ts` solo al necesitar redondeo. |
| `src/core/domain/account/` | `account.ts`, `account-code.ts`, `account-type.ts`, `account-errors.ts`. |
| `src/core/domain/journal/` | `journal.ts`, `journal-errors.ts`. |
| `src/core/domain/entries/` | `journal-entry.ts`, `journal-entry-line.ts`, `entry-status.ts`, `posting-side.ts`, `entry-errors.ts`, `entry-text.ts`. |
| `src/core/domain/period/` | `accounting-date.ts`, `accounting-period.ts`, `period-status.ts`, `period-errors.ts`. |
| `src/core/application/ports/` | Puertos específicos de repositorios, transacción e IDs cuando un caso real los requiera. |
| `src/core/application/use-cases/` | Crear/contabilizar/revertir asiento y cerrar período. |
| `src/core/application/contracts/` | Entradas/salidas serializables; entidades y modelos ORM no son DTOs públicos. |
| `src/adapters/` | Memoria para desarrollo/pruebas; persistencia real posterior. |
| `src/composition/` | Ejemplo de consumo una vez que existan capacidades funcionales. |
| `src/index.ts` | Agrega los barrels de dominio; no exporta archivos internos. |

Se incluyen README de responsabilidad en las carpetas preparadas. No hay clases vacías que aparenten implementación.
La organización en singular es una normalización del kit: evitar duplicados con variantes en plural.

## API pública por dominio

Cada dominio expone su superficie en su propio `index.ts`. Fuera de esa carpeta nadie importa un archivo
interno: el nombre de los archivos de implementación es libre de cambiar sin romper el contrato público.

| Barrel | Superficie publicada |
| --- | --- |
| `src/core/domain/money/index.ts` | `Currency`, `Money`, `MoneyError`, `ISO_4217_PUBLISHED`, `listIsoCurrencies`, `listIsoCurrenciesWithoutMinorUnit`, `IsoCurrencyEntry` y sus tipos. |
| `src/core/domain/account/index.ts` | `Account`, `AccountCode`, `AccountType`, `AccountError` y sus tipos. |
| `src/core/domain/journal/index.ts` | `Journal`, `JournalError` y sus tipos. |
| `src/core/domain/period/index.ts` | `AccountingDate`, `AccountingPeriod`, `PeriodStatus`, `PeriodError` y sus tipos. |
| `src/core/domain/entries/index.ts` | `JournalEntry`, `JournalEntryLine`, `EntryError`, `EntryStatus`, `PostingSide`, `JournalEntryInput`, `JournalEntryReversalInput`, `JournalEntryLineInput` y `EntryErrorCode`. |
| `src/core/application/index.ts` | `ApplicationError`, los `make*` de los seis casos de uso y sus tipos de contrato y de puerto. |
| `src/adapters/memory/index.ts` | `createInMemoryAccounting` y sus tipos. |

`src/index.ts` solo re-exporta esos barrels, nunca archivos internos, y un tipo interno no se publica
por accidente. `pnpm check:project` exige el `index.ts` de los cinco dominios; `tests/public-api.test.mjs`
fixa la superficie de cada barrel y la del paquete.

## Límites importantes

- Journal representa el diario; JournalEntry representa el asiento. Las líneas pertenecen al asiento.
- La entidad asiento comprueba equilibrio, estados e importes. El caso de uso verifica cuentas, diario y período vigentes.
- Un método `post()` del agregado por sí solo no prueba que el período esté abierto ni persiste nada.
- Un saldo se calcula a partir de líneas contabilizadas; no es un campo editable de Account.
- Un dominio no importa archivos internos de otro dominio: usa su `index.ts`.
- El dominio no importa Node, DOM, HTTP, Prisma, adaptadores ni variables de entorno.
- Aplicación no importa adaptadores. Componer desde fuera mediante puertos pequeños.
- No usar reloj/UUID global en entidades. Recibir fechas e IDs explícitos.
- No crear clases base, repositorios genéricos, bus de eventos o microservicios por completar una estructura.

## Consistencia

Contabilizar y cerrar período deben coordinarse dentro de una transacción real cuando exista persistencia.
Consultar el período antes de escribir sin proteger la concurrencia permite contabilizar durante un cierre.
Prever versión/bloqueo del período y asiento, unicidad por libro y control de idempotencia.
El adaptador en memoria sirve para comportamiento funcional; no demuestra aislamiento ni durabilidad.
Esas garantías no son un pendiente del core: son el contrato que cumple el adaptador del anfitrión. Ver la
tabla de frontera en `INTEGRATION.md`.

## API y errores

Propuesta técnica: excepciones tipadas con código estable en el core. Traducir a HTTP en el adaptador.
Money intercambia `minorUnits` como cadena entera, nunca bigint directo en JSON.
Un contrato externo debe distinguir fecha contable YYYY-MM-DD de instante de auditoría ISO UTC.
Mantener `private: true` hasta que haya una API implementada y revisada.
