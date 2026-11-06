# Empieza aquí

Este ZIP sustituye la preparación inicial con el análisis de money, account, journal, entries y period.
Es una base lista para comenzar el desarrollo, con especificaciones y configuración; no un sistema ya implementado.

## Uso

1. Descomprimir `contabilidad/` y abrirla como proyecto. Conservar `.agents/` con sus seis skills completas.
2. Leer README.md y AGENTS.md. No copiar encima de un repositorio existente sin comparar sus instrucciones.
3. Ejecutar `pnpm check:project` y después `pnpm install --frozen-lockfile`.
4. Dar al agente el primer prompt de PROMPTS.md. El primer resultado debe ser Money/Currency probado.
5. Seguir docs/tasks/ en orden; actualizar docs/STATUS.md al terminar cada incremento.

Las skills son archivos del proyecto. El ZIP no las instala en ChatGPT ni modifica tus skills personales.
Si el agente no las descubre, indicarle la ruta `.agents/skills/<nombre>/SKILL.md` y pedirle que la lea.
El uso de comandos particulares de Pi/Gentle depende de su versión; este kit funciona también con lectura explícita.

## Nombres normalizados

Se usa `account`, `journal`, `entries` y `period` para conservar el vocabulario de las explicaciones recientes.
No crear carpetas paralelas `accounts`, `journals` o `periods` para los mismos conceptos.
Journal es el diario. JournalEntry es el asiento y vive exclusivamente en `entries`.

## Qué empezar a programar

Leer docs/specs/money.md y docs/tasks/001-money.md. Las decisiones técnicas propuestas están marcadas
como tales en docs/decisions/0002-base-tecnica.md; resolver detalles de implementación rutinarios sin
reabrir el análisis. Mantener pendientes explícitos para país, fiscalidad, multimoneda y persistencia real.
