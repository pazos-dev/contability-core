# Responsabilidad

Coordinar dominio y puertos; validaciones entre entidades y atomicidad.

Estado: incremento 006a implementado — casos de uso de registro de cuentas, diarios y períodos.
Todos corren dentro de `UnitOfWork`, no aceptan un plan de cuentas del llamador y no leen reloj ni
generan identificadores. Especificación: `docs/specs/registration.md`. Consultar docs/ARCHITECTURE.md
desde la raíz.

El anfitrión habla con un solo objeto: `Accounting` (`accounting.ts`) expone un método por caso de uso y
es la única pieza pública de esta capa. Por dentro, cada caso de uso es una clase con `execute(input)` que
recibe `ApplicationDeps`; la fachada las compone y sólo delega: no valida, no guarda estado y no traduce
errores. Las clases y los ayudantes puros (`fingerprintOf`, `replay`, `remember`, `serializeLine`, `sumSide`)
son internos y el barrel no los exporta.
