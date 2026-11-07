# Validación de la preparación 2.0

Fecha: 2026-11-06.

| Comprobación ejecutada | Resultado |
| --- | --- |
| Comparar las seis skills y sus tres referencias con el ZIP original | Los nueve archivos son idénticos byte por byte. |
| `pnpm check:project` | Correcto: rutas, enlaces locales simples, configuración JSON y seis skills. |
| `pnpm typecheck` | Correcto sobre el scaffold actual. |
| `pnpm build` | Correcto; produce el módulo vacío y su declaración. |
| `node scripts/run-tests.mjs` | Código 1 esperado: todavía no hay pruebas de negocio. |

**Límite de la evidencia:** src/index.ts contiene solo `export {}`. La comprobación de tipos y compilación
verifica que la configuración inicial funciona; no prueba Money, cuentas, diarios, asientos ni períodos.
No se ha ejecutado ninguna prueba contable y no existe implementación de esas reglas.
No hay lint ni verificador semántico de arquitectura configurados.

Se incluye pnpm-lock.yaml real. El ZIP excluye node_modules, dist y archivos temporales.
MANIFEST.json enumera tamaños y SHA-256 de todos los archivos entregados salvo el propio manifiesto.
La integridad del ZIP y las huellas del manifiesto se verifican al empaquetar.

**Actualización posterior (001-money, 002-account y 003-journal):** el core ya exporta `Currency`,
`Money` y `MoneyError`; `Account`, `AccountCode` y `AccountError`; y `Journal` y `JournalError`.
Hay pruebas de negocio en `tests/money.test.mjs`, `tests/account.test.mjs` y `tests/journal.test.mjs`.
Ver `docs/STATUS.md` para la evidencia vigente.
