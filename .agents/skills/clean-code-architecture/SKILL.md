---
name: clean-code-architecture
description: Diseñar o refactorizar responsabilidades, contratos y patrones con límites claros y reutilización justificada. Usar al distribuir lógica de aplicación, extraer abstracciones o evaluar patrones; excluir contenido, estilos y configuración sin lógica.
---

# Código claro y arquitectura con propósito

Esta es la variante de proyecto del kit contable. Consultar la arquitectura vigente del repositorio; no sustituirla por una plantilla universal ni modificar skills personales homónimas.

## Preparación

Leer AGENTS.md, docs/ARCHITECTURE.md, la especificación y el código relacionado. Antes de proponer un patrón, leer [el criterio de selección](references/patterns.md).

## Procedimiento

1. Identificar el comportamiento que cambia y la responsabilidad que lo gobierna.
2. Buscar código equivalente por significado, no solo por semejanza sintáctica. Reutilizar cuando el contrato y las razones de cambio coincidan.
3. Elegir la solución más sencilla que preserve invariantes y límites de dependencias.
4. Mantener funciones y objetos cohesionados; separar cálculo de efectos externos cuando permita razonar y probar mejor.
5. Aplicar responsabilidad única, sustitución y dependencia de contratos según el problema. No usar SOLID como una cuota de interfaces o clases.
6. Evitar herencia salvo que exista una relación sustituible estable. Preferir composición cuando represente mejor la variación.
7. Extraer una abstracción por una variación o responsabilidad comprobada; no hacerlo solo por anticipar futuros consumidores.
8. Si se introduce un patrón, explicar qué problema concreto resuelve y por qué una función u objeto directo no basta.
9. Mantener contratos públicos pequeños. Evitar que el framework, ORM o una librería externa definan el dominio.
10. Verificar comportamiento y dependencias después del refactor. Conservar compatibilidad o documentar el cambio autorizado.

## Reutilización

Evitar duplicación accidental. Permitir código parecido cuando representa conceptos con evolución distinta. No crear carpetas `utils`, `common` o `shared` como destino automático: nombrar la responsabilidad y ubicarla con su propietario.

## Límites

No exigir CQRS, eventos, microservicios, contenedores de DI, repositorios genéricos o monorepos para cualquier tarea. Registrar una decisión si una abstracción cambia la arquitectura pública o introduce costes significativos.

## Entregar

Explicar responsabilidad final, justificación de abstracciones nuevas y evidencia de que el cambio conserva o modifica intencionalmente el comportamiento.
