# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incrementos 006a y 006e implementados — registro de cuentas, diarios, períodos y libros; el libro es la primera regla de todo flujo.
Todos corren dentro de `UnitOfWork`, no aceptan un plan de cuentas del llamador y no leen reloj ni
generan identificadores. Especificación: `docs/specs/registration.md`. Consultar docs/ARCHITECTURE.md
desde la raíz.

El anfitrión habla con un solo objeto: `Accounting` (`facade/accounting.ts`) expone un método por operación y es
la única pieza pública de esta capa. Por dentro, cada área es una clase con operaciones estáticas
(`use-cases/`): no tienen estado, reciben las dependencias como primer parámetro y la fachada se las pasa en
cada llamada, porque es la única que las ata. La fachada no valida, no guarda estado y no traduce errores. Las
clases de área y los ayudantes puros son internos y el barrel no los exporta.

Un campo estático en cualquiera de las cuatro clases de área sería estado global mutable y rompería el
aislamiento entre instancias; las dependencias viajan por parámetro, siempre.

## Puertos

`ports.ts` reúne los contratos pequeños de capacidades externas que usan los casos de uso reales, y sólo
contratos de comportamiento: los datos que un puerto persiste viven en `dto.ts`.

`UnitOfWork` es la única puerta: los repositorios salen de su alcance, así que ningún caso de uso abre una
conexión independiente. `LedgerRepository` es la única fuente de la relación libro-plan (Q07) y de la moneda
funcional del libro (Q08), y el libro es una entidad con estado y nombre desde el incremento 006e: un libro
inactivo se rechaza con `LEDGER_INACTIVE` antes que cualquier otra regla, así que el primer paso de los trece
casos de uso que escriben es el mismo. Los tres reportes no pasan por esa regla: leer no exige libro activo, y
un libro `INACTIVE` se reporta con normalidad. `PostedMovementsQuery` evita que el registro de cuentas dependa
del dominio de asientos; `PostedEntriesQuery` es la lectura paginada de asientos contabilizados que usan los
reportes, y devuelve asientos con sus líneas, nunca totales: el cuadre y la moneda única se verifican en el
core, no en el anfitrión.

El mayor por cuenta del incremento 008b pagina por **fila** mientras `PostedEntriesQuery` pagina por
**asiento**, y por eso ordena y corta el core. El cursor que produce es la posición
`(accountingDate, entryId, lineId)` de la última fila devuelta —no un desplazamiento del puerto ni un saldo— y
el llamador no lo interpreta. La procedencia del cursor se comprueba contra las filas drenadas: si su posición
no es una de las filas de esa cuenta y ese rango, es `INVALID_APPLICATION_INPUT`, porque aceptarlo saltearía
filas en silencio. Un cursor tampoco se cree para un importe: cada página vuelve a drenar **el rango completo**
desde `from` y a ordenarlo para derivar el saldo corriente, así que recorrer todo el reporte cuesta cuadrático
en las filas del rango —lecturas al puerto y comparaciones—. Es deliberado: un saldo materializado, una caché o
un cierre de saldos abrirían justamente la divergencia entre asiento y saldo que D1 existe para cerrar, y un
acumulado que viajara en el cursor sería un importe que el llamador puede falsificar.

El core vuelve a aplicar la regla 1 en el borde del puerto: descarta lo que no sea `POSTED` o que pertenezca a
otro libro, en vez de fallar. Un puerto que devuelve de más no puede ensuciar el reporte, y el exceso es un
error del anfitrión que se corrige ignorándolo, no un error del llamador.

`AccountRepository.findByChart` enumera las cuentas de un plan, y vive en ese repositorio y no en un puerto
aparte: el criterio es la forma de la lectura —un puerto se separa cuando la lectura es por rango, paginada o
de salida en volumen—, y dos puertos sobre cuentas obligarían al anfitrión a mantener dos implementaciones
coherentes.

La moneda funcional es una regla cruzada y por eso vive acá: el asiento conoce `ledgerId`, no el libro. Desde
009d la conversión la decide el agregado, que recibe la moneda funcional y las tasas en `post`; `reverse` todavía
llama a `requireLedgerCurrency` para el asiento que se espeja, porque una reversión no convierte: reusa lo que el
original ya tenía y falla con `LEDGER_CURRENCY_MISMATCH` si el original no trae importe funcional y está en otra
moneda. Los borradores no se validan, igual que no validan el balance ni el período abierto.

Dos contratos del puerto que se leen mal si no están dichos: `EntryRepository.findReversalsOf` devuelve
**todas** las reversiones de un original, para que ninguna tape a otra por el orden de la persistencia, y
`IdempotencyRegistry` copia el resultado al guardarlo y al entregarlo, porque `readonly` no congela nada en
ejecución.
