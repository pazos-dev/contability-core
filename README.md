# Contabilidad — base de proyecto

Proyecto preparado para desarrollar con IA un módulo contable reutilizable en TypeScript.
Versión del paquete de preparación: 2.0 · 6 de noviembre de 2026.

**Estado real:** estructura, documentación, especificaciones, seis skills de proyecto y configuración inicial.
Las entidades y los casos de uso todavía no están implementados. No hay API, interfaz, ORM ni persistencia.
`src/index.ts` es un módulo vacío intencional: no representa una API contable funcional.

## Empezar

1. Descomprimir y abrir esta carpeta completa con el agente. Incluir `.agents/` aunque el explorador la oculte.
2. Leer [LEEME-PRIMERO.md](LEEME-PRIMERO.md), [AGENTS.md](AGENTS.md) y [estado](docs/STATUS.md).
3. Ejecutar `pnpm check:project`: valida el contenido preparado, sin instalar dependencias.
4. Ejecutar `pnpm install --frozen-lockfile` para instalar el compilador con el lockfile incluido.
5. Ejecutar `pnpm typecheck` y `pnpm build`.
6. Usar el primer prompt de [PROMPTS.md](PROMPTS.md) para implementar Money y Currency con sus pruebas.

Entorno de esta base: Node.js >=24, pnpm >=10 y TypeScript 5.9.3 fijado como dependencia de desarrollo.
Son elecciones técnicas para este scaffold; no una afirmación sobre las últimas versiones disponibles.

## Comandos

| Comando | Resultado |
| --- | --- |
| `pnpm check:project` | Comprueba rutas, enlaces Markdown locales, configuración y las seis skills. No verifica reglas contables. |
| `pnpm typecheck` | Ejecuta TypeScript estricto sin emitir archivos. Requiere instalar dependencias. |
| `pnpm build` | Compila a `dist/` con declaraciones de tipos. Requiere instalar dependencias. |
| `pnpm test` | Ejecuta los archivos `*.test.mjs` de `tests/`. Falla explícitamente si todavía no existen pruebas. |
| `pnpm check` | Valida preparación, tipos, compilación y pruebas; solo estará verde después del primer incremento probado. |

Se incluye el lockfile generado y verificado. No se incluyen dependencias instaladas ni salida compilada. No hay lint de TypeScript configurado todavía;
incorporarlo en una tarea técnica propia y registrar su comando cuando exista.

## Mapa

| Ruta | Responsabilidad |
| --- | --- |
| `src/core/domain/money/` | Currency y Money; importes exactos. |
| `src/core/domain/account/` | Cuenta, código, tipo y estado. |
| `src/core/domain/journal/` | Diario que agrupa y clasifica asientos. |
| `src/core/domain/entries/` | Asiento y líneas; equilibrio, estados y reversión. |
| `src/core/domain/period/` | Fechas contables y período abierto/cerrado. |
| `src/core/application/` | Casos de uso, puertos y contratos de intercambio. |
| `src/adapters/` | Persistencia e interfaces externas futuras. |
| `src/composition/` | Conexión desde la aplicación anfitriona. |
| `docs/specs/` | Comportamientos y criterios de aceptación para cada incremento. |
| `docs/tasks/` | Tareas en orden de implementación. |
| `.agents/skills/` | Las seis skills completas del kit anterior, conservadas. |

Consultar [arquitectura](docs/ARCHITECTURE.md), [dominio](docs/DOMAIN.md), [roadmap](docs/ROADMAP.md),
[integración](docs/INTEGRATION.md), [decisiones](docs/OPEN-QUESTIONS.md) y [validación](VALIDACION.md).
