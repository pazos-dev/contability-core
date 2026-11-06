# Calidad y definición de terminado

## Comprobaciones

`pnpm check:project` valida la preparación documental y configuración. No es un analizador semántico
de dependencias ni una prueba contable. Los límites entre capas se revisan en el diff; incorporar una
herramienta basada en AST cuando el código real justifique esa automatización.

Tras instalar dependencias, ejecutar `pnpm typecheck`, `pnpm build` y `pnpm test`.
No hay lint configurado. El runner falla si no encuentra pruebas: nunca convertir esa ausencia en un aprobado.
Conservar el lockfile incluido y actualizarlo con pnpm cuando cambien dependencias; CI debe instalar con lockfile congelado.

## Evidencia según riesgo

| Cambio | Evidencia necesaria |
| --- | --- |
| Money | Exactitud, parser, escala, signo, JSON y ausencia de mutación. |
| Entidades | Invariantes, estados, fallos y protección del agregado. |
| Caso de uso | Efectos observables, pertenencia, fallos y reintentos. |
| Persistencia | Atomicidad y concurrencia con la BD real. |
| Documentación | Coherencia, rutas y vínculos; sin pruebas de negocio artificiales. |

## Terminado

Cada criterio comprometido tiene comportamiento implementado y prueba pertinente.
Los pendientes de aplicación no se dan por resueltos al probar una entidad.
No hay ORM/HTTP/Node en dominio ni pérdidas de precisión monetaria.
Revisar diff, contratos públicos, dependencias y estado; reportar comandos realmente ejecutados.
Un adaptador en memoria no prueba durabilidad ni transacciones de producción.
