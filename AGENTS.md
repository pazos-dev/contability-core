# Instrucciones para trabajar en este proyecto

## Objetivo y lectura

Construir un módulo contable reutilizable; comenzar por el dominio y los casos de uso, sin interfaz visual inicial. Usar TypeScript y pnpm; verificar las versiones reales antes de utilizar APIs o configurar herramientas.

Al iniciar una tarea leer `docs/STATUS.md`, `docs/SCOPE.md`, `docs/ARCHITECTURE.md` y la especificación afectada. Consultar `docs/DOMAIN.md` para conceptos y `docs/OPEN-QUESTIONS.md` para decisiones bloqueantes. Seguir `docs/WORKFLOW.md` y `docs/QUALITY.md`.

## Arquitectura

- Mantener el dominio independiente de Node.js, HTTP, ORM, base de datos y frameworks.
- Hacer que aplicación dependa del dominio y de contratos propios, nunca de adaptadores concretos.
- Conectar implementaciones en la composición de la aplicación anfitriona.
- Tratar `domain/money/` como carpeta temática; distinguir moneda, importe monetario y políticas.
- No crear capas, repositorios genéricos, eventos ni patrones sin una necesidad concreta.
- Mantener los detalles de estructura propuestos mientras no exista una decisión aceptada que los cambie.

## Procedimiento

- Especificar el comportamiento antes de programar reglas del negocio.
- Leer el código existente y localizar responsabilidades equivalentes antes de añadir otra implementación.
- Consultar el índice de skills y cargar solo las pertinentes.
- Resolver detalles internos rutinarios de forma autónoma.
- Preguntar solo por decisiones bloqueantes de negocio, políticas monetarias, fiscales o contratos públicos; continuar con las partes independientes.
- No confundir una propuesta del kit con una decisión aprobada. Registrar cambios de alcance o arquitectura en el documento correspondiente.
- Respetar cambios ajenos y revisar el diff antes de editar o terminar.

## Skills del proyecto

| Skill | Activación |
| --- | --- |
| `accounting-spec` | Definir o modificar una funcionalidad contable. |
| `accounting-implement` | Implementar una especificación lista. |
| `accounting-review` | Revisar un cambio o comportamiento contable. |
| `typescript-best-practices` | Escribir o refactorizar código TypeScript. |
| `nodejs-best-practices` | Escribir código que utilice Node.js, procesos o integraciones externas. |
| `clean-code-architecture` | Diseñar o refactorizar responsabilidades, contratos, reutilización o patrones. |

Las rutas son `.agents/skills/<nombre>/SKILL.md`. No cargar la skill de Node para lógica pura que no utiliza ese entorno. Si existe otra skill homónima, usar explícitamente la del proyecto para esta tarea; no modificar skills personales por resolver una colisión.

## Calidad y entrega

- Ejecutar las comprobaciones existentes pertinentes; no inventar comandos ni resultados.
- Añadir pruebas significativas para cálculos, invariantes, errores y comportamiento de integraciones modificadas.
- Cubrir los criterios de aceptación y revisar los límites entre capas.
- No usar importes decimales de coma flotante binaria como representación canónica del dinero.
- No convertir cadenas en números monetarios mediante conversiones que pierdan precisión.
- No ocultar errores con casts, capturas vacías o valores monetarios por defecto.
- No introducir dependencias sin revisar su necesidad y compatibilidad.
- No publicar, desplegar ni enviar mensajes a terceros salvo que la tarea lo autorice.
- Entregar cambios, comprobaciones y limitaciones; actualizar `docs/STATUS.md` con el siguiente paso.

## Estructura y preparación actual

Usar las carpetas canónicas `domain/money`, `domain/account`, `domain/journal`, `domain/entries` y `domain/period`.
Journal es el diario y JournalEntry vive en entries; no duplicar conceptos con nombres en plural.
Leer ADR 0002 para elecciones técnicas de este scaffold. Los requisitos de país, fiscalidad y multimoneda siguen pendientes.

Comandos reales en README.md: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test` y `pnpm check`.
El runner falla si aún no hay pruebas; no interpretar eso como fallo de una regla contable implementada.
Primera tarea: docs/tasks/001-money.md. No iniciar UI, ORM o servidor para completar el dominio.
La revisión del dominio debe comprobar imports, sin confiar en un verificador de arquitectura inexistente.
