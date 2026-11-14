# Topología de imports de la capa de aplicación

Reducir el ruido de imports de la capa de aplicación sin tocar comportamiento: namespace de errores,
casos de uso agrupados por área y contratos junto a la clase que los usa.

## Specs

S1. Pedido original, textual: «bien problema uqe veo es el siguiuoente los archivos esta. llenos de imports
por tofos lado vuando ije para pasalro a clases era papra solucionar ese problema pero el refactor que hiciste
solo fuee un parche analiza el codigony explicame uqenformas hay de refactorizar yu qur no hayan tantos
imports por tadas partes o es mejor dejarlo asi».

S2. Opción elegida, textual de la etiqueta aprobada: «A + C + B (126 → ~55 sentencias)», con este preview:

```ts
// antes: post-entry.ts
import { accountInactive, entryAlreadyReversed, accountNotFound,
  accountNotPostable, entryNotFound, journalInactive, journalNotFound,
  ledgerNotFound, periodClosed, periodDateOutside, periodNotFound } from '../../errors.js';
import type { PostEntryInput, PostEntryResult } from '../../contracts/entries.js';
import type { ApplicationDeps } from '../../ports/index.js';
import { fingerprintOf, remember, replay } from '../shared/idempotency.js';
import { serializeLine, sumSide } from './entry-result.js';

// después: entries.ts (5 casos de uso en un archivo)
import * as errors from '../../errors.js';
import { fingerprintOf, remember, replay } from '../shared/idempotency.js';
```

S3. Invariante: cero cambios de comportamiento y cero cambios de superficie pública. Es un refactor
estructural; las 217 pruebas y `tests/public-api.test.mjs` son la red.

S4. Descartado y por qué:
- **Barrel interno de la capa** (`internal.ts` que re-exporta dominio, contratos, errores y puertos): esconde
  el grafo de dependencias y vuelve invisibles los ciclos. Cambia ruido visible por acoplamiento invisible.
- **Aliases `#domain/*`**: con `tsc` puro, `paths` no se reescribe en el build; exigiría `tsc-alias` o un
  bundler, o sea una dependencia nueva para un problema estético.

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2 | Un archivo por área en `use-cases/` (`accounts.ts`, `journals.ts`, `periods.ts`, `entries.ts`) con sus clases y contratos; borrar los 11 archivos por caso de uso, sus 4 barrels y el directorio `contracts/` | `refactor(application): group use cases by area and namespace the errors` |
| T2 | S2 | `import * as errors` en los archivos de área | idem |
| T3 | S3 | Actualizar `scripts/check-project.mjs`, `ARCHITECTURE.md`, `STATUS.md`, `tasks/006` y los READMEs de la capa | idem |

## Log

L1. «bien problema uqe veo es el siguiuoente los archivos esta. llenos de imports por tofos lado vuando ije
para pasalro a clases era papra solucionar ese problema pero el refactor que hiciste solo fuee un parche
analiza el codigony explicame uqenformas hay de refactorizar yu qur no hayan tantos imports por tadas partes o
es mejor dejarlo asi»

L2. Medición previa al cambio, con un script sobre `src/`: 58 archivos, 126 sentencias `import`, 260 bindings,
2.2 sentencias por archivo. Los peores casos eran `accounting.ts` (9 sentencias / 32 bindings),
`create-entry-draft.ts` (8/17) y `post-entry.ts` y `reverse-entry.ts` (6/20 cada uno, con 11 constructores de
error por archivo).

L3. Diagnóstico honesto: las clases no reducen imports. La cantidad de sentencias depende de las fronteras de
módulo que cruza cada archivo (dominio, contratos, errores, puertos, shared), no de si adentro hay `function`
o `class`. El refactor a clases de la entrega anterior resolvía otra cosa.

L4. Decisiones del usuario: A (namespace de errores) + C (agrupar por área) + B (contratos junto al caso de
uso). Descartados el barrel interno y los aliases de path, con el motivo en S4.

L5. Decisiones internas: `entry-result.ts` desaparece y sus ayudantes (`serializeLine`, `sumSide`,
`draftResultOf`, `postedResultOf`) pasan a ser privados del archivo `entries.ts`, porque tras agrupar no
tienen otro consumidor; los nombres de operación de idempotencia se mantienen literales
(`'postEntry'`, `'reversePostedEntry'`, …) para no invalidar registros existentes ni las pruebas que los
consultan; los tipos se exportan desde el módulo del área y `application/index.ts` los re-exporta, así que la
superficie pública no cambia.

L6. Resultado: 21 archivos eliminados, 4 agregados (58 → 41). Medición posterior: 41 archivos, **75
sentencias** `import` (de 126) y **150 bindings** (de 260), 1.8 por archivo. El peor archivo de la capa es
ahora `entries.ts` con 6 sentencias y 12 bindings, donde antes `post-entry.ts` solo tenía 20 bindings y el
área entera repartía ~31 sentencias. `accounting.ts` sigue con 32 bindings: es la raíz de composición y tiene
que nombrar las once clases y los veintidós contratos, pero bajó de 9 a 5 sentencias.
`pnpm check` en verde con 217/217 sin tocar una sola expectativa.
