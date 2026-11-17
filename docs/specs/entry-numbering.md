# SPEC — Numeración de asientos

Estado: **implementada y verificada** (incremento 009a, rama `feat/009a-entry-numbering`).
Decisión de origen: Q11, respondida por el humano el 2026-11-16 (ver `## Decisiones pendientes`).
Ruta prevista: dominio en `src/core/domain/entries/`, regla en
`src/core/application/use-cases/entries/`, puerto en `src/core/application/ports.ts`.
Depende de: `entries.md` (E01-E12), `post-entry.md` (flujo de contabilización), `reverse-entry.md` (la
reversión es un asiento más del mismo agregado), `ledger.md` (el libro es el ámbito) y `INTEGRATION.md`
(qué garantiza el anfitrión).

## Objetivo

Que todo asiento contabilizado tenga un número entero, secuencial y propio del libro, asignado por el motor y
no por quien llama, de modo que dos asientos del mismo libro se puedan citar sin ambigüedad y sin depender de
un identificador técnico.

## Alcance y exclusiones

Incluye:

- Un campo nuevo en el agregado `JournalEntry`: el número, presente sólo en `POSTED`.
- Un puerto nuevo en el alcance de la unidad de trabajo: el contador por libro.
- La asignación del número en las **dos** vías que dejan un asiento en `POSTED`: `postEntry` y
  `reversePostedEntry`.
- El número en los resultados de los casos de uso que devuelven un asiento contabilizado.

Excluye, declarado para no prometerlo:

- **Formato.** Ni prefijos, ni año, ni ceros a la izquierda, ni separador. El número es un entero y quien lo
  presenta lo formatea. Un formato dentro del core es una decisión de presentación que después no se puede
  deshacer sin migrar datos.
- **Garantía durable de unicidad.** Igual que la reversión única: el anfitrión la da con su restricción. El
  core sólo pide el número y lo escribe (ver `## Integración y consistencia`).
- **Numeración retroactiva.** Los asientos ya persistidos sin número no se renumeran ni se completan: el core
  no inventa números. La migración es del anfitrión.
- **Contadores por diario, por período o por tipo de asiento.** Se elige un contador por libro.
- **Numeración de los borradores.** Un borrador no consume número.
- **Reportes con número.** `accountBalances`, `trialBalance` y `accountMovements` no cambian; el mayor sigue
  identificando filas por asiento y línea.

## Entradas y salidas

Dominio — `JournalEntry` gana un número opcional:

```ts
readonly number?: number;
```

Y `post` deja de ser sin argumentos. Desde 009d el contexto lleva también la moneda funcional del libro y las
tasas de cada línea extranjera (`foreign-currency.md`); la firma vigente es:

```ts
post(context: JournalEntryPostContext): JournalEntry;
// { number, functionalCurrency, rates }
```

Puerto nuevo, en `UnitOfWorkScope`:

```ts
/** Secuencia de números de asiento, por libro. */
export interface EntryNumberSequence {
  nextNumber(ledgerId: string): Promise<number>;
}
```

Resultado de `postEntry` y de `reversePostedEntry`, con un campo más:

```ts
readonly number: number;
```

`EntryDraftResult` (borradores) expone `number: number | null`, y siempre `null` en esta entrega, porque un
borrador no tiene número. Se declara para que el contrato de las cuatro operaciones de asiento sea uno solo.

## Reglas e invariantes

1. **Un `POSTED` tiene número; un `DRAFT` no.** Un asiento en `DRAFT` con número y un `POSTED` sin número son
   estados imposibles: el constructor privado y `post` los rechazan.
2. **El número lo da el core, no el llamador.** Ninguna entrada de caso de uso lleva número. `postEntry`
   recibe `ledgerId`, `entryId` y la clave de idempotencia, y nada más.
3. **Ámbito por libro.** El contador es de un libro: dos libros pueden tener cada uno su asiento número 1. Un
   asiento nunca recibe un número de otro libro.
4. **Entero positivo.** El número es un entero mayor que cero. No hay cero, no hay negativos, no hay
   decimales, no hay `bigint` ni cadena: se compara, se ordena y se serializa como número.
5. **Se fija al contabilizar y no cambia.** No existe operación para renumerar. Corregir un asiento es
   revertirlo con otro asiento, nunca reescribirlo (E10 y la regla de reversión única).
6. **La reversión recibe su propio número.** Sale del mismo contador del libro y no hereda el del original:
   son dos hechos contables distintos y los dos tienen que poder citarse.
7. **Los huecos se permiten.** Un número pedido al contador y no guardado porque la operación falló puede
   faltar en la secuencia. Lo que no se permite es repetir un número o reutilizar el de un asiento revertido.
   El core no rellena huecos.
8. **La asignación va lo más tarde posible.** Después de todas las lecturas y validaciones, en el mismo paso
   que la escritura. Así un rechazo de una validación previa no consume números, y un contador dentro de la
   transacción del anfitrión no deja huecos sin que el core lo exija. Un rechazo **del agregado** después de
   pedir el número —un asiento ya contabilizado que llega otra vez— sí puede dejarlo sin usar: es un hueco,
   permitido por la regla 7.
9. **Un replay no asigna número.** La idempotencia se resuelve antes: misma clave y misma petición devuelven
   el resultado guardado, con su número, sin segunda escritura ni segundo incremento del contador.
10. **El core no verifica unicidad.** No consulta el contador para saber si un número existe ni lleva registro
    de números usados: pide el siguiente y confía en que el anfitrión no entregue dos veces el mismo. Es la
    misma división que la reversión única y el id de asiento.
11. **El número es dato del asiento, no del resultado.** Se guarda con el asiento; el resultado lo repite para
    que el llamador no tenga que volver a leerlo.
12. **Nada de reloj ni de entorno.** El caso de uso no genera el número: lo pide al puerto, igual que no lee
    el reloj ni variables de entorno.

## Errores

Código nuevo de dominio: **`ENTRY_NUMBER_INVALID`**, en `EntryError`.
Se reporta cuando `post` recibe algo que no es un entero positivo, o cuando un asiento llega a `POSTED` sin
número. Un rechazo no escribe nada: no hay estado que deshacer, igual que el resto de las invariantes del
agregado.

No hay código de error nuevo en la aplicación. La duplicación de un número es un fallo del anfitrión y se
manifiesta como error de su almacenamiento, no como una regla del core: el core no puede detectarla sin una
lectura que no existe.

## Criterios de aceptación

| ID | Dado | Cuando | Entonces |
| --- | --- | --- | --- |
| N01 | Un libro y un borrador equilibrado | `postEntry` | El asiento queda `POSTED` con número 1 y el resultado lo repite |
| N02 | Un libro con un asiento ya contabilizado con número 1 | Se contabiliza otro | Recibe el 2 |
| N03 | Dos libros distintos | Cada uno contabiliza su primer asiento | Los dos tienen el número 1 |
| N04 | Un borrador recién creado o editado | Se consulta su resultado | `number` es `null` y el agregado no tiene número |
| N05 | Un asiento contabilizado | Se intenta `post` otra vez | `ENTRY_STATE`; el número no cambia |
| N06 | Un asiento contabilizado con número 1 | Se revierte | La reversión queda `POSTED` con un número propio, mayor que el del original, y el original conserva el suyo |
| N07 | Un contador que falla al pedir el número | `postEntry` | El puerto propaga el error, no se escribe el asiento ni el registro de idempotencia, y el borrador sigue `DRAFT` |
| N08 | Misma clave de idempotencia y misma petición | Se repite `postEntry` | Devuelve el resultado guardado con el mismo número, sin segundo incremento del contador |
| N09 | Un asiento en `DRAFT` | Se construye con un número | `ENTRY_NUMBER_INVALID` |
| N10 | `post` con 0, con −1 o con 1.5 | Se contabiliza | `ENTRY_NUMBER_INVALID` y el borrador queda intacto |
| N11 | Un período cerrado y un contador disponible | `postEntry` | `PERIOD_CLOSED` y **no** se pide número: el contador no se consulta antes de la última validación |
| N12 | Los tres reportes | Se leen después de numerar | Sus filas no cambian: el número no entra en la lectura |

## Decisiones pendientes

Resueltas con el humano el 2026-11-16:

- **D1 — Ámbito: por libro.** Por diario multiplica los contadores sin aportar; por período obliga a decidir
  qué pasa al cerrar.
- **D2 — Formato: entero pelado.** Sin prefijos, sin año, sin ceros a la izquierda.
- **D3 — Sin renumeración; corrección por reversión.** Es la regla que ya tiene el core desde 006b.
- **D4 — Huecos permitidos.** Exigir una secuencia sin huecos obligaría a numerar al confirmar y a que el core
  dependa del mecanismo de confirmación del anfitrión.

Siguen abiertas y no bloquean esta entrega:

- **P1 — Nombre y tipo.** Se elige `number: number` y no un objeto de valor: el número no tiene partes,
  invariantes de formato ni operaciones, así que un objeto sólo agregaría una caja. Si algún día hay formato o
  series por tipo de asiento, se revisa.
- **P2 — Asientos ya persistidos sin número.** Migración del anfitrión. El core no completa huecos ni adivina
  el orden histórico.
- **P3 — Qué hace el anfitrión si su restricción única rechaza el número.** Reintentar pidiendo otro o
  propagar. Es su decisión y no cambia el contrato del core, pero conviene que esté escrita en su adaptador.

## Integración y consistencia

- **Cambio de contrato de dominio.** `JournalEntry` gana un campo y `post` cambia de firma. Es un cambio de
  contrato público (ítem 3): el paquete es `private` en 0.0.0 y no hay consumidores registrados, pero el
  compilador de un anfitrión va a reclamar `post()` sin argumentos. `tests/public-api.test.mjs` fija la
  superficie de los barrels y se actualiza con este incremento.
- **Cambio de contrato de aplicación.** `EntryDraftResult` y los dos resultados de contabilización suman un
  campo. Un anfitrión que ya guarde resultados de idempotencia va a releer objetos **sin** número: la huella
  no cambia (`PostEntryInput` no cambia), así que un replay devuelve el resultado viejo, sin número. El
  anfitrión decide si los invalida al migrar. Es el mismo caso que el campo `currency` de 006f.
- **Lo que debe dar el anfitrión (nueva obligación del contrato).** `nextNumber(ledgerId)` que devuelva el
  siguiente entero libre del libro, dentro de la misma transacción, sin repetir, y una restricción única sobre
  `(ledgerId, number)` que cierre la ventana entre pedir y guardar. Los huecos son aceptables; los repetidos,
  no. Esto entra en `docs/INTEGRATION.md` con su identificador `HA` cuando la implementación se apruebe.
- **Concurrencia.** Dos `postEntry` simultáneos del mismo libro pueden pedir el mismo número si el anfitrión no
  serializa. El core no lo evita: la restricción única convierte la carrera en un error visible, que es mejor
  que un duplicado silencioso.
- **Atomicidad.** Pedir el número, guardar el asiento y registrar la idempotencia ocurren en la misma unidad de
  trabajo. Con un contador dentro de la transacción, el fallo devuelve el número; con una secuencia del motor,
  no lo devuelve y queda un hueco. En cualquier caso, el asiento y el registro de idempotencia se escriben
  juntos o no se escribe ninguno.
- **Nada que autorizar.** La numeración no abre permisos ni accesos nuevos.
- **Entrega.** Una sola rebanada revisable, en tres commits sobre `feat/009a-entry-numbering`: el contrato del
  agregado, el contador más las dos vías de contabilización, y la documentación. Aproximadamente 450 líneas
  entre código y pruebas.

## Verificación

Prevista, con test-first por criterio:

- `tests/domain/entries/entries.test.mjs`: N04, N05, N09, N10 y las invariantes del agregado (un `POSTED` sin
  número no se construye, la reversión nace sin número).
- `tests/application/entry-numbering.test.mjs`: N01, N02, N03, N06, N07, N08 y N11, contra el adaptador en
  memoria con un contador real por libro, y N07 con un contador que lanza.
- `tests/application/reports-*.test.mjs`: N12, extendiendo una prueba existente por reporte en lugar de
  duplicarlas.
- `tests/public-api.test.mjs`: el campo nuevo en los resultados y el barrel.

Comandos reales del repositorio: `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm check:project`.

Evidencia de la implementación:

- `tests/domain/entries/entry-numbering.test.mjs` (6 pruebas): N01, N05, N06 y N10 en el agregado. N09 queda
  cubierto **por construcción**, no por una prueba: el constructor rechaza el par estado/número y ninguna
  factoría puede producir un borrador con número, así que la rama DRAFT del chequeo es inalcanzable desde la
  interfaz pública.
- `tests/application/entry-numbering.test.mjs` (12 pruebas): N01, N02, N03, N04, N06, N07, N08, N11 y N12
  contra el adaptador en memoria, con un contador real por libro, más las reglas 7 y 10. N07 y N11 usan una
  unidad de trabajo cuyo contador lanza: N07 comprueba que no se escribe nada, y N11 que el período cerrado se
  reporta **antes** de pedir el número.
- Rojo observado antes de implementar: 10 de las 13 pruebas fallaban (N09, N11 y N12 pasaban por ausencia).
- `pnpm typecheck`, `pnpm build`, `pnpm test` (311 pruebas, 311 correctas) y `pnpm check:project` en verde.
