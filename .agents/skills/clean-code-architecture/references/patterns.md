# Selección de patrones y técnicas

## Preguntas antes de elegir

1. ¿Qué variación, límite o invariante necesita representar este cambio?
2. ¿Puede resolverse con una función, un objeto o composición directa?
3. ¿Qué coste de lectura, configuración y mantenimiento añade la abstracción?
4. ¿Qué prueba demuestra que el comportamiento final es correcto?

No incorporar todos los patrones de esta tabla. Son criterios de selección, no requisitos de implementación.

| Patrón o técnica | Aplicación posible | Evidencia de necesidad | Evitar |
| --- | --- | --- | --- |
| Value Object | Dinero y moneda. | Reglas e igualdad por contenido. | Añadir IDs artificiales a cada valor. |
| Strategy | Políticas alternativas de cálculo. | Variantes reales y contrato estable. | Crear estrategias para una única suma directa. |
| Adapter | Persistencia, HTTP y proveedores. | Traducción entre un contrato propio y una tecnología externa. | Exponer tipos ORM dentro del core. |
| Repository | Recuperar y persistir agregados. | Casos de uso que necesitan esa capacidad. | CRUD genérico como abstracción universal. |
| Factory | Crear objetos válidos. | Construcción con pasos o variantes coordinados. | Añadir otra clase cuando una función o constructor basta. |
| Inyección de dependencias | Repositorios, reloj, IDs. | Sustituir capacidades externas o controlar efectos. | Añadir un contenedor complejo cuando basta composición explícita. |
| Domain Service | Operación del dominio sin propietario natural. | Regla que involucra varios conceptos y no encaja en uno. | Vaciar entidades y convertir todo en servicios genéricos. |
| Eventos de dominio | Comunicar un hecho del negocio. | Consumidores y semántica de publicación definidos. | Asumir atomicidad o entrega garantizada por emitir un evento. |

## Ejemplo de decisión

Si hay dos políticas de redondeo exigidas por contextos distintos, evaluar una estrategia. Si no se ha aprobado ninguna operación que redondee, no crear estrategias «por si acaso».

Un repositorio en memoria facilita pruebas de un caso de uso, pero no define cómo se resuelven carreras ni transacciones en PostgreSQL. Esas garantías pertenecen al contrato y a sus implementaciones verificadas.

## Ubicación de decisiones

Mantener los límites de este proyecto en docs/ARCHITECTURE.md y el motivo de cambios importantes en docs/decisions/. Usar esta referencia para elegir herramientas de diseño, sin reemplazar esas decisiones.
