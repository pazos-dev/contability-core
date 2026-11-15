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
| `src/core/domain/account/` | Raíz: `account.ts` (agregado). `value-objects/account-code.ts`; `types/account-type.ts`, `types/account-status.ts`; `errors/account-errors.ts`; `dto/account-dto.ts`. |
| `src/core/domain/journal/` | Raíz: `journal.ts` (agregado). `types/journal-status.ts`; `errors/journal-errors.ts`; `dto/journal-dto.ts`. |
| `src/core/domain/entries/` | Raíz: `journal-entry.ts` (agregado) y `entry-text.ts` (ayudante interno). `value-objects/journal-entry-line.ts`; `types/entry-status.ts`, `types/posting-side.ts`; `errors/entry-errors.ts`; `dto/journal-entry-dto.ts`, `dto/journal-entry-line-dto.ts`. |
| `src/core/domain/period/` | Raíz: `accounting-period.ts` (agregado). `value-objects/accounting-date.ts`; `types/period-status.ts`; `errors/period-errors.ts`; `dto/accounting-period-dto.ts`. |
| `src/core/domain/shared/` | Kernel compartido del dominio: `describe-value.ts` y `money/`. |
| `src/core/domain/shared/money/` | Plano: `currency.ts`, `money.ts`, `currency-catalog.ts` (generado), `money-errors.ts`; `dto/currency-dto.ts`, `dto/money-dto.ts`. `rounding-mode.ts` solo al necesitar redondeo. |
| `src/core/application/ports.ts` | Puertos específicos de repositorios, transacción e IDs cuando un caso real los requiera. Sólo contratos de comportamiento: los datos que un puerto persiste viven en `dto.ts`. |
| `src/core/application/dto.ts` | Las 22 entradas y salidas serializables de los casos de uso, más el registro que persiste el puerto de idempotencia. Datos sin comportamiento. Entidades y modelos ORM no son DTOs públicos. |
| `src/core/application/facade/` | La puerta de entrada: `accounting.ts` con la clase `Accounting`, única superficie pública de la capa. |
| `src/core/application/use-cases/` | Una carpeta por área (`accounts/`, `journals/`, `periods/`, `entries/`) con un archivo por caso de uso, más el `rules.ts` de cada área y el `result.ts` de `entries/`; además `guards.ts` y `shared/`. Internos. |
| `src/adapters/` | Memoria para desarrollo/pruebas; persistencia real posterior. |
| `src/composition/` | Ejemplo de consumo una vez que existan capacidades funcionales. |
| `src/index.ts` | Agrega los barrels de dominio; no exporta archivos internos. |

Se incluyen README de responsabilidad en las carpetas preparadas. No hay clases vacías que aparenten implementación.
La organización en singular es una normalización del kit: evitar duplicados con variantes en plural.

### Agrupación por naturaleza

Los cuatro contextos acotados (`account`, `journal`, `entries`, `period`) agrupan sus archivos por naturaleza
y dejan en la raíz sólo su agregado:

| Carpeta | Contenido |
| --- | --- |
| `value-objects/` | Valores inmutables con invariantes propias: `AccountCode`, `AccountingDate`, `JournalEntryLine`. |
| `dto/` | Formas de datos sin comportamiento: entradas de construcción (`*Input`), representaciones serializadas (`*JSON`) y el estado ya validado que recibe el constructor privado (`*Fields`, `*Changes`). |
| `errors/` | La clase de error, sus códigos estables y sus fábricas. |
| `types/` | Las uniones cerradas de las que está hecho el modelo: estados, lado de contabilización, tipo de cuenta. |

La frontera entre `types/` y `dto/` no es de forma sino de intención: `types/` dice de qué está hecho el
modelo y no tiene campos — un estado es un estado; `dto/` son formas de datos que cruzan un límite.
`types/posting-side.ts` es un tipo; `dto/journal-entry-line-dto.ts` son datos.

El kernel compartido no usa esas carpetas: `shared/money/` es todo valores y no tiene agregado, así que
`value-objects/` produciría `value-objects/money.ts` sin separar nada. Queda plano y conserva sólo `dto/`, que
sigue separando datos de comportamiento. El motivo y las alternativas descartadas están en ADR 0003.

Los `*Fields` y `*Changes` se exportan desde su módulo para que la clase los importe, pero nunca desde el
barrel: siguen siendo internos. Quedan fuera de las carpetas, a propósito: el agregado de cada contexto en su
raíz, porque es su puerta de entrada; los ayudantes internos, en la raíz de su carpeta (`entry-text.ts` en
`entries/`) o en `shared/` si los comparten varios contextos (`describe-value.ts`); y los archivos generados,
que conservan la ubicación donde los escribe su generador (`shared/money/currency-catalog.ts` con su
`IsoCurrencyEntry`).

## Nombres de módulos

El mismo nombre se usa en todas las capas para la misma naturaleza, y el empaquetado sigue la convención de su
capa: carpeta con un archivo por concepto cuando hay varias piezas, módulo único cuando la capa concentra una
sola.

| Nombre | Contenido | Dónde |
| --- | --- | --- |
| `dto` | Formas de datos sin comportamiento: entradas y salidas, representaciones serializadas y el estado validado que recibe un constructor privado. | `domain/<contexto>/dto/`, `domain/shared/money/dto/`, `application/dto.ts` |
| `ports` | Contratos de comportamiento que el anfitrión implementa: repositorios, unidad de trabajo, dependencias. | `application/ports.ts` |
| `errors` | La clase de error, sus códigos estables y sus fábricas. | `domain/<contexto>/errors/`, `application/errors.ts` |
| `types` | Uniones cerradas de las que está hecho el modelo: estados, lado de contabilización, tipo de cuenta. | `domain/<contexto>/types/` |
| `value-objects` | Valores inmutables con invariantes propias. | `domain/<contexto>/value-objects/` |
| `shared` | Kernel compartido dentro de su capa. | `domain/shared/`, `application/use-cases/shared/` |

La frontera que más se confunde es `ports` contra `dto`: `ports` es lo que el anfitrión debe implementar y está
lleno de métodos; `dto` es lo que viaja y no tiene ninguno. Un tipo de datos dentro de `ports` está en el lugar
equivocado — así estaba `StoredOperation`, que ahora vive en `application/dto.ts` y los puertos importan de ahí.

## API pública por dominio

Cada contexto acotado expone su superficie en su propio `index.ts`, y el kernel compartido en el suyo. Fuera
de esa carpeta nadie importa un archivo interno: el nombre de los archivos de implementación es libre de
cambiar sin romper el contrato público.

| Barrel | Superficie publicada |
| --- | --- |
| `src/core/domain/shared/money/index.ts` | `Currency`, `Money`, `MoneyError`, `ISO_4217_PUBLISHED`, `listIsoCurrencies`, `listIsoCurrenciesWithoutMinorUnit`, `IsoCurrencyEntry` y sus tipos. |
| `src/core/domain/account/index.ts` | `Account`, `AccountCode`, `AccountType`, `AccountError` y sus tipos. |
| `src/core/domain/journal/index.ts` | `Journal`, `JournalError` y sus tipos. |
| `src/core/domain/period/index.ts` | `AccountingDate`, `AccountingPeriod`, `PeriodStatus`, `PeriodError` y sus tipos. |
| `src/core/domain/entries/index.ts` | `JournalEntry`, `JournalEntryLine`, `EntryError`, `EntryStatus`, `PostingSide`, `JournalEntryInput`, `JournalEntryReversalInput`, `JournalEntryLineInput` y `EntryErrorCode`. |
| `src/core/application/index.ts` | `Accounting`, `ApplicationError` y los tipos de dato (`dto`) y de puerto. Las clases de caso de uso son internas. |
| `src/adapters/memory/index.ts` | `createInMemoryAccounting` y sus tipos. |

`src/index.ts` solo re-exporta esos barrels, nunca archivos internos, y un tipo interno no se publica
por accidente. `pnpm check:project` exige el `index.ts` de los cuatro contextos acotados y el barrel del kernel
compartido; `tests/public-api.test.mjs` fixa la superficie de cada barrel y la del paquete.

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
