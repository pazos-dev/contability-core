# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incremento 006a implementado — casos de uso de registro de cuentas, diarios y períodos.
Todos corren dentro de `UnitOfWork`, no aceptan un plan de cuentas del llamador y no leen reloj ni
generan identificadores. Especificación: `docs/specs/registration.md`. Consultar docs/ARCHITECTURE.md
desde la raíz.
