# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incremento 006a implementado — casos de uso de registro de cuentas, diarios y períodos.
Todos corren dentro de `UnitOfWork`, no aceptan un plan de cuentas del llamador y no leen reloj ni
generan identificadores. Especificación: `docs/specs/registration.md`. Consultar docs/ARCHITECTURE.md
desde la raíz.

El anfitrión habla con un solo objeto: `Accounting` (`facade/accounting.ts`) expone un método por caso de uso y
es la única pieza pública de esta capa. Por dentro, cada área es una carpeta con un archivo por caso de uso
(`use-cases/`), cada uno con `execute(input)` y `ApplicationDeps`; la fachada las compone y sólo delega: no
valida, no guarda estado y no traduce errores. Las clases y los ayudantes puros son internos y el barrel no los
exporta.

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
