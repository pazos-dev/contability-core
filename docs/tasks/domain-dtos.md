# DTO del dominio y organización de pruebas

Separar en cada dominio las formas de datos (entradas de construcción, representaciones serializadas y la
forma interna que consume el constructor privado) de los archivos de los objetos de valor, y reagrupar los
archivos de prueba en espejo de `src/`. Rama `refactor/domain-dtos`; `main` queda en `e00a128` hasta el merge.

## Specs

S1. Pedido original, textual: «vamos a refactorizar uqe hay michos errores. en dominio vas a crear dto para
separar las interfaces y tipos que estan y mantener correctamente clean arq value object etc. y su carpeta de
test tmabien de dominio».

S2. Decisión del usuario sobre ubicación, textual del preview aprobado: «dto/ dentro de cada dominio, sigue
público». Los DTO viven en `src/core/domain/<dominio>/dto/` y cada barrel los sigue exportando con los mismos
nombres: la superficie pública del paquete no pierde ni renombra un símbolo.

S3. Decisión del usuario sobre pruebas, textual del preview aprobado: «Espejo de `src/`». `tests/domain/<dominio>/`,
`tests/application/`, `tests/adapters/` y `tests/public-api.test.mjs`.

S4. Regla de separación: `dto/` reúne toda forma de datos del dominio y ninguna de esas formas tiene
comportamiento — las entradas de construcción (`*Input`), las representaciones serializadas (`*JSON`,
`IsoCurrencyEntry`) y las formas internas que consume el constructor privado (`*Fields`, `*Changes`). Cada
archivo de objeto de valor contiene sólo su clase.

S5. Consistencia de tipos de estado: `AccountStatus` y `JournalStatus` dejan de declararse dentro del archivo
de la clase y viven en `account-status.ts` y `journal-status.ts`, igual que `period-status.ts` y
`entry-status.ts`.

S6. Sin cambio de comportamiento: las 217 pruebas y `tests/public-api.test.mjs` pasan sin cambiar una sola
expectativa, y `pnpm check` queda en verde.

S7. Nada fuera del dominio importa un DTO del dominio. Hoy sólo los barrels los reexportan, así que mover los
archivos no toca la capa de aplicación ni los adaptadores.

S8. Los archivos de prueba siguen consumiendo `dist/index.js`, la superficie pública del paquete: sólo cambia
la profundidad relativa del import relativo.

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2, S4, S5, S7 | Extraer las 12 interfaces y los 2 tipos de estado a `dto/` en los cinco dominios; barrels con las rutas nuevas | `refactor(domain): move every data shape into per-domain dto folders` |
| T2 | S3, S8 | Reagrupar los 14 archivos de prueba en espejo de `src/` y ajustar los imports a `dist/` | `test: mirror the source tree in the tests folder` |
| T3 | S2, S3, S6 | Documentar: `ARCHITECTURE.md`, los cinco README de dominio, `tests/README.md` y `STATUS.md` | `docs(domain): document the dto folders and the test layout` |

## Log

L1. «vamos a refactorizar uqe hay michos errores. en dominio vas a crear dto para separar las interfaces y
tipos que estan y mantener correctamente clean arq value object etc. y su carpeta de test tmabien de dominio».

L2. Diagnóstico propio antes de escribir: `pnpm check` estaba en verde, así que «errores» no eran fallos de
compilación ni de prueba. Se identificaron tres defectos reales: los DTO de construcción dentro de los
archivos de los objetos de valor (12 interfaces en 5 archivos), su export en la superficie pública del
paquete (6 símbolos) y las pruebas sin agrupar por capa, contra lo que ya pedía `tests/README.md`.

L3. Se descartó fusionar `EntryLineInput` (aplicación) con `JournalEntryLineInput` (dominio): uno viaja con
`MoneyJSON` y `lineId`, el otro con `Money` e `id`. No son duplicados, son dos concerns con el límite de capa
en el medio.

L4. Decisiones del usuario: los DTO quedan dentro del dominio y siguen siendo públicos; las pruebas se
agrupan en espejo de `src/`.

L5. Se descartó mover los DTO a la capa de aplicación: era la tercera opción del preview y no se eligió, así
que el dominio sigue publicando sus DTO de construcción y `ARCHITECTURE.md` no cambia de modelo de capas.
