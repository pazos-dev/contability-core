# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incremento 006a implementado — casos de uso de registro de cuentas, diarios y períodos.
Todos corren dentro de `UnitOfWork`, no aceptan un plan de cuentas del llamador y no leen reloj ni
generan identificadores. Especificación: `docs/specs/registration.md`. Consultar docs/ARCHITECTURE.md
desde la raíz.

Cada caso de uso es una clase con `execute(input)` (`new PostEntry(deps)`). `Accounting`, en
`accounting.ts`, compone los once detrás de un objeto con un método por caso de uso y sólo delega: no
valida, no guarda estado y no traduce errores.
