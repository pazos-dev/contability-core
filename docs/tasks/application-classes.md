# Capa de aplicación con clases y fachada

Migrar los 11 casos de uso de fábrica de función (`makeX(deps)`) a clase con `execute(input)`, agregar la
fachada `Accounting` con un método por caso de uso y eliminar las fábricas. Rama `refactor/application-classes`;
`main` queda en `b9b5c11` hasta el merge.

## Specs

S1. Pedido original, textual: «la capa de aplicacion esta heca con funciones quiero migrarla a clases y
objeta para que sea mas comodo».

S2. Forma elegida, textual del preview aprobado:

```ts
// DI / test unitario
const postEntry = new PostEntry({ unitOfWork });
await postEntry.execute({ ledgerId, entryId, idempotencyKey });

// anfitrión que usa todo
const app = new Accounting({ unitOfWork });
await app.registerAccount(input);
await app.postEntry(input);

// 11 clases con `execute` + 1 fachada con nombres de caso de uso
```

S3. Compatibilidad, textual: «Corte limpio: se eliminan; paquete `private` 0.0.0 sin consumidores
registrados», con este antes/después:

```ts
// se borra
export { makeRegisterAccount } from './use-cases/accounts/index.js';

// queda
export { RegisterAccount } from './use-cases/accounts/index.js';
```

S4. Entrega, textual: «Igual que la anterior pero en `feat/007-application-api`, con `main` estable hasta el
final», con `git switch -c ...` y «`main` queda en `74cc09c` hasta el merge». La rama se llama
`refactor/application-classes` y sale de `b9b5c11`, que es `74cc09c` más el commit `fix(application)` de la
revisión R4: `main` sigue estable y el nombre no ocupa el número 007, reservado al contrato del adaptador del
anfitrión en `docs/STATUS.md`.

S5. Invariante de la migración: no cambia nada del comportamiento. `ApplicationDeps` sigue siendo
`{ readonly unitOfWork: UnitOfWork }`; los contratos de entrada y salida, los códigos de error, la unidad de
trabajo, el dominio y los adaptadores quedan igual. Los criterios de aceptación de las seis specs se siguen
verificando con las mismas 214 pruebas.

S6. Lo que **no** se convierte en clase: los ayudantes internos (`fingerprintOf`, `replay`, `remember` en
`use-cases/shared/`, `serializeLine`, `draftResultOf`, `sumSide` en `entries/entry-result.ts`) siguen siendo
funciones. Una clase alrededor de un cálculo puro no aporta y el proyecto no agrega patrones sin necesidad.

## Tasks

| ID | Spec | Tarea | Commit |
| --- | --- | --- | --- |
| T1 | S2, S5 | Once clases con `execute(input)` y los cuatro barrels por área; fachada `Accounting` y barrel de aplicación | `refactor(application)!: turn use cases into classes and add the Accounting facade` |
| T2 | S3, S5 | Migrar los siete archivos de test que componían casos de uso, `public-api` a la nueva superficie, y `tests/application-facade.test.mjs` | el mismo commit de T1 |
| T3 | S1, S5 | Specs y documentos: contrato de casos de uso, `ARCHITECTURE.md`, `STATUS.md`, READMEs de la capa y este documento | `docs(application): document the class contract and the facade` |

## Log

L1. «la capa de aplicacion esta heca con funciones quiero migrarla a clases y objeta para que sea mas comodo»

L2. Exploración previa a la decisión: 11 fábricas exportadas en `src/core/application/index.ts`, ~60 llamadas
en 9 archivos de test, y el contrato documentado como decisión explícita en `docs/specs/registration.md`
(«un caso de uso es una fábrica de funciones asíncronas, sin clases ni decoradores»). Por eso la migración se
trata como cambio de contrato público, con spec primero y sin alias.

L3. Decisiones del usuario: clases por caso de uso **más** fachada; corte limpio sin `makeX`; una sola entrega
en rama.

L4. Decisiones internas (rutinarias, no consultadas): la fachada se llama `Accounting` porque así está escrito
en el preview aprobado de S2, aunque el adaptador se llame `InMemoryAccounting`; la fachada compone las 11
clases en el constructor y no tiene estado propio; cada clase guarda `ApplicationDeps` en un campo privado
`#deps` y expone sólo `execute`.

L5. Cambio de plan sobre la cadena de commits: el plan inicial era «agregar clases junto a las fábricas,
migrar tests, borrar fábricas» para que cada commit quedara verde. Se descartó porque el puente dejaba 11
fábricas de una línea como código muerto por un commit. Resultado: dos commits, los dos verdes. El primero
(1f653f3) trae las once clases, la fachada, los barrels, la migración de los siete archivos de test,
`public-api` y el test nuevo de la fachada; el segundo trae los documentos. Además, las menciones reales a
`makeX` en la documentación eran cuatro, no quince: `docs/specs/registration.md`, tres en `docs/STATUS.md` y
una en `src/core/application/use-cases/README.md`.

L6. Resultado verificado: `pnpm check` en verde en la rama, 217 pruebas (214 previas + 3 de la fachada), 0
fallos, con `typecheck` y `build` limpios. La suite migrada no cambió ni una expectativa: sólo la forma de
invocar (`makeX(deps)(input)` → `new X(deps).execute(input)`).
