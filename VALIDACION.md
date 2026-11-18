# Validación de la preparación 2.0

Fecha: 2026-11-06.

| Comprobación ejecutada | Resultado |
| --- | --- |
| Comparar las seis skills y sus tres referencias con el ZIP original | Los nueve archivos son idénticos byte por byte. |
| `pnpm check:project` | Correcto: rutas, enlaces locales simples, configuración JSON y seis skills. |
| `pnpm typecheck` | Correcto sobre el scaffold actual. |
| `pnpm build` | Correcto; produce el módulo vacío y su declaración. |
| `node scripts/run-tests.mjs` | Código 1 esperado: todavía no hay pruebas de negocio. |

**Límite de la evidencia:** packages/core/src/index.ts contiene solo `export {}`. La comprobación de tipos y compilación
verifica que la configuración inicial funciona; no prueba Money, cuentas, diarios, asientos ni períodos.
No se ha ejecutado ninguna prueba contable y no existe implementación de esas reglas.
No hay lint ni verificador semántico de arquitectura configurados.

Se incluye pnpm-lock.yaml real. El ZIP excluye node_modules, dist y archivos temporales.
El manifiesto de tamaños y SHA-256 de esta entrega original se retiró el 2026-11-18: git y los hashes del
paquete publicado son el registro de integridad vigente, y un archivo de hashes mantenido a mano sólo se
desactualiza. Ver `docs/STATUS.md`.

**Actualización posterior:** el core ya implementa incrementos reales (001-money a 004-period),
`packages/core/src/index.ts` exporta solo capacidades probadas y existen pruebas de negocio en `packages/core/tests/`.
Ver `docs/STATUS.md` para la evidencia vigente de cada incremento.
