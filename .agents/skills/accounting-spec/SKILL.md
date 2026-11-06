---
name: accounting-spec
description: Especificar funcionalidades contables con reglas y criterios verificables. Usar al definir o modificar dinero, cuentas, asientos, periodos o integraciones del módulo; excluir tareas de implementación ya especificadas y revisiones de código.
---

# Especificar comportamiento contable

## Lectura y ubicación

Localizar la raíz por AGENTS.md y docs/. Leer `docs/SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/OPEN-QUESTIONS.md` y la especificación afectada. Usar rutas relativas a esa raíz para los documentos del proyecto.

## Procedimiento

1. Reformular el resultado observable y separar necesidades expresadas, propuestas y decisiones pendientes.
2. Identificar operaciones incluidas y exclusiones de la entrega.
3. Definir entradas, salidas, invariantes y errores. En dinero, precisar exactitud, compatibilidad, negativos, límites y serialización antes de cerrar el contrato.
4. Consultar contratos y reglas existentes. No inventar políticas fiscales o monetarias para completar la plantilla.
5. Escribir ejemplos Dado/Cuando/Entonces usando `docs/specs/TEMPLATE.md`. Asignar IDs a los criterios.
6. Marcar cada duda con su impacto y las operaciones que bloquea; preguntar solo lo necesario para la entrega actual. Continuar con las partes independientes.
7. Revisar persistencia, autorización, atomicidad, concurrencia e idempotencia cuando la función produzca efectos. Marcar lo que no aplique con motivo.
8. Actualizar la especificación y las preguntas pendientes; registrar decisiones estructurales en un ADR.

## Criterio de salida

Marcar la especificación como lista solo si los comportamientos a implementar tienen criterios verificables y no quedan decisiones bloqueantes para ellos. Una instrucción vigente del usuario puede proporcionar la autorización necesaria; no imponer aprobaciones ceremoniales.

Si se utiliza OpenSpec, mantener la especificación en su ubicación canónica y actualizar los enlaces. No mantener una copia activa en paralelo.

## Entregar

Indicar alcance listo, preguntas pendientes y siguiente incremento. No reportar código ni pruebas de aplicación como implementados durante una tarea de especificación.
