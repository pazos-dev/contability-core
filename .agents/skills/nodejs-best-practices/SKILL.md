---
name: nodejs-best-practices
description: Implementar Node.js con asincronía, gestión de recursos y límites externos explícitos. Usar en servidores, adaptadores, procesos, archivos, red y persistencia; excluir dominio puro sin API de Node.js, contenido y estilos.
---

# Node.js y límites externos

## Preparación

Leer arquitectura, contratos de integración y especificación. Verificar versiones reales y las dependencias instaladas. Identificar dónde se componen recursos y quién los cierra.

Leer [criterios de ejecución](references/nodejs.md) al trabajar con red, lotes, transacciones, reintentos o cierre de procesos.

## Procedimiento

1. Mantener Node.js, el framework y el ORM dentro de adaptadores o composición según la arquitectura.
2. Validar entradas y configuración al cruzar el límite externo. No leer variables de entorno desde reglas puras.
3. Gestionar todas las promesas con espera o un tratamiento explícito y observable. No esconder fallos con capturas vacías.
4. Establecer tiempos de espera y propagación de cancelación cuando la API y el contrato lo permitan.
5. Limitar concurrencia y memoria en lotes. Usar streams y respetar backpressure para transferencias grandes cuando corresponda.
6. Evitar trabajo síncrono costoso en rutas que atienden peticiones. No confundir declarar `async` con descargar cálculo intensivo a otro hilo.
7. Liberar recursos en éxito y error. Cerrar conexiones y detener la admisión de trabajo en un cierre ordenado con plazo máximo.
8. Aplicar reintentos solo a fallos transitorios y operaciones seguras para repetición; respetar la política de idempotencia. No mantener una transacción abierta mientras se espera un servicio externo sin diseño explícito.
9. Traducir errores técnicos en el límite adecuado sin perder contexto interno. Evitar filtrar credenciales, tokens o datos sensibles en logs o respuestas.
10. Verificar escenarios de fallo, no solo el camino correcto. Usar pruebas de integración para garantías de persistencia y red relevantes.

## Dependencias

Comprobar primero las capacidades del proyecto y de Node.js en la versión seleccionada. Añadir paquetes solo cuando aporten una capacidad necesaria. No introducir un framework de servidor para ejecutar una entrega de dominio.

## Entregar

Explicar recursos, plazos o garantías relevantes introducidos, y las comprobaciones reales. No prometer entrega exactamente una vez ni aislamiento por añadir un reintento o un mock.
