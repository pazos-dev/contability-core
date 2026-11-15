# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incremento 006a implementado — casos de uso de registro de cuentas, diarios y períodos.
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
conexión independiente. `LedgerDirectory` es la única fuente de la relación libro-plan (Q07) y
`PostedMovementsQuery` evita que el registro de cuentas dependa del dominio de asientos.

Dos contratos del puerto que se leen mal si no están dichos: `EntryRepository.findReversalsOf` devuelve
**todas** las reversiones de un original, para que ninguna tape a otra por el orden de la persistencia, y
`IdempotencyRegistry` copia el resultado al guardarlo y al entregarlo, porque `readonly` no congela nada en
ejecución.
