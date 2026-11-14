# SPEC — Libro contable

Estado: **lista para implementar, sin código**. Este documento fija el comportamiento del incremento 006e;
nada de lo que describe existe todavía y ningún criterio de acá puede reportarse como verificado.
Ruta prevista: dominio en `src/core/domain/ledger/`, casos de uso en
`src/core/application/use-cases/ledgers/`.
Depende de: `registration.md` (convenciones de casos de uso, puertos, errores e idempotencia),
`journal.md` y `account.md` (convenciones de entidad y estado).

## Objetivo

Que el anfitrión pueda dar de alta y gobernar sus libros **a través del motor**, sin configuración previa:
registrar un libro con su plan de cuentas, desactivarlo y reactivarlo, y que todo caso de uso existente
rechace operar sobre un libro inactivo.

Hoy el libro no es una entidad del core: es un identificador que el adaptador en memoria recibe al
construirse (`chartOfAccountsByLedger`) y que el puerto `LedgerDirectory.chartOfAccountsIdOf` resuelve a un
plan. Consecuencia: el libro no se puede crear en runtime, no tiene nombre ni estado, y es el único concepto
del módulo sin caso de uso.

## Alcance y exclusiones

Incluye:

- `Ledger` en el dominio: `id`, `name`, `chartOfAccountsId` y estado `ACTIVE`/`INACTIVE`.
- Puerto `LedgerRepository` en el alcance de la unidad de trabajo, en reemplazo de `LedgerDirectory`.
- Casos de uso `registerLedger` y `setLedgerStatus`, expuestos por la fachada `Accounting`
  (que pasa de once a trece métodos).
- `LEDGER_INACTIVE` en los once casos de uso existentes.
- Adaptador en memoria: mapa de libros; `options.chartOfAccountsByLedger` desaparece y los libros se siembran
  registrándolos.

Excluye, declarado para no prometerlo:

- **Empresa, sociedad, tenant, usuario y autorización.** Siguen siendo identidad del anfitrión. El core no
  genera identificadores: el `ledgerId` lo elige el llamador, como todos los ids de este módulo.
- **El plan de cuentas como entidad.** Sigue siendo el identificador que el anfitrión aporta (Q07). El core
  no verifica que exista ni lo administra; sólo lo guarda en el libro y lo usa para el aislamiento de cuentas.
- **Borrado de libros.** Se desactivan; el historial queda.
- **Cambio de plan de un libro.** No hay operación; ver «Decisiones».
- **Jerarquía entre libros, consolidación y reportes por libro.** Corresponde a 008.
- **Moneda funcional del libro.** Depende de Q08, todavía abierta.
- **Concurrencia y unicidad durable.** Del anfitrión (Q09): dos altas simultáneas del mismo id las separa su
  clave primaria, no este repositorio.

## Entradas y salidas

```ts
interface RegisterLedgerInput {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly idempotencyKey?: string;
}

interface RegisterLedgerResult {
  readonly ledgerId: string;
  readonly name: string;
  readonly chartOfAccountsId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

interface SetLedgerStatusInput {
  readonly ledgerId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

interface SetLedgerStatusResult {
  readonly ledgerId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}
```

La huella de idempotencia de `registerLedger` es `ledgerId` + `name` + `chartOfAccountsId`: todo el campo de
la petición salvo la clave, como exige la regla 6 de `registration.md`. `setLedgerStatus` no lleva clave por
la misma razón que `setAccountStatus`: repetir el mismo estado es un no-op.

Las salidas son serializables y sin instancias de dominio, igual que el resto de la capa.

## Flujo y orden de validación

`registerLedger`, todo dentro de una sola llamada a `unitOfWork.run`, lecturas incluidas:

1. **Idempotencia.** `find(ledgerId, 'registerLedger', key)`: huella igual devuelve el resultado guardado sin
   segundo efecto; huella distinta es `IDEMPOTENCY_CONFLICT`.
2. **Id libre.** `ledgers.findById(ledgerId)` presente es `LEDGER_ALREADY_EXISTS`. Nunca se sobrescribe.
3. **Validación local.** `Ledger.create({ id, name, chartOfAccountsId })`; sus errores burbujean
   (`INVALID_LEDGER`).
4. **Escritura única.** `ledgers.save(ledger)` e `idempotency.record(...)` en la misma unidad de trabajo: si
   una falla, no queda la otra.
5. **Resultado.** Se arma desde el libro creado.

`setLedgerStatus`:

1. **Valor admitido.** Un `status` distinto de `ACTIVE` o `INACTIVE` es `INVALID_APPLICATION_INPUT`; sin esa
   guarda caería en la rama de activación y parecería un éxito.
2. **Libro.** `ledgers.findById(ledgerId)` ausente es `LEDGER_NOT_FOUND`.
3. **Transición.** `deactivate()` o `activate()` devuelven una copia; repetir el estado actual es no-op.
4. **Escritura.** `ledgers.save(next)` en la unidad de trabajo.

Orden en los once casos de uso existentes: donde hoy se resuelve el plan con `chartOfAccountsIdOf(ledgerId)`,
se resuelve el libro con `ledgers.findById(ledgerId)`. Ausente sigue siendo `LEDGER_NOT_FOUND`, y el nuevo
`status` distinto de `ACTIVE` es `LEDGER_INACTIVE`. La posición dentro de cada flujo no cambia: el libro se
sigue resolviendo antes que cualquier otra entidad, porque es el ámbito que da sentido a las demás.

## Reglas e invariantes

1. `Ledger` es inmutable: `rename`, `deactivate` y `activate` devuelven copias y conservan id, plan y
   estado no afectado. No hay setters.
2. `chartOfAccountsId` **no cambia**. Un libro con otro plan es otro libro; el plan es su identidad contable.
3. `id`, `name` y `chartOfAccountsId` no vacíos y sin espacios exteriores: se rechazan, no se recortan,
   alineado con `Account` y `Journal`.
4. El libro nace `ACTIVE`.
5. No existe operación de borrado: desactivar conserva identidad, nombre y plan, y deja el historial legible.
6. Un libro `INACTIVE` rechaza **todas** las operaciones de escritura del módulo con `LEDGER_INACTIVE`: los
   once casos de uso actuales más `setLedgerStatus` sobre otro libro. Desactivar no es una forma de seguir
   contabilizando por atrás.
7. Un libro `INACTIVE` se puede reactivar con `setLedgerStatus`; ahí vuelve a admitir operaciones.
8. Varios libros pueden compartir el mismo plan. Varios planes en un libro, no.
9. Ningún caso de uso acepta `chartOfAccountsId` del llamador: lo resuelve el libro, y con eso se mantiene
   Q07 en su parte ya decidida.
10. El libro no guarda cuentas, diarios, períodos, asientos ni saldos: sólo los identifica.
11. `registerAccount` y el resto derivan el plan del libro, así que dos libros con planes distintos siguen
    sin poder compartir cuentas.

## Errores

Propios de esta entrega: `LEDGER_ALREADY_EXISTS`, `LEDGER_INACTIVE`.
Ya existente y reutilizado, ahora originado en el repositorio: `LEDGER_NOT_FOUND`.
Compartidos: `INVALID_APPLICATION_INPUT`, `IDEMPOTENCY_CONFLICT`.
De dominio, burbujea sin envolver: `INVALID_LEDGER`.

Todo error deja el estado como estaba: ni libro, ni registro de idempotencia parcial.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| L01 | 4 | Un id libre, nombre y plan válidos | `registerLedger` | Devuelve `status: ACTIVE` y el libro queda guardado con su plan |
| L02 | 2 | Un `ledgerId` ya registrado | `registerLedger` con otro nombre | `LEDGER_ALREADY_EXISTS`; el libro original queda intacto |
| L03 | 3 | Un `ledgerId`, un `name` o un `chartOfAccountsId` vacío o con espacios exteriores | `registerLedger` | `INVALID_LEDGER`; nada guardado |
| L04 | — | La misma clave y la misma petición | Repetir `registerLedger` | Mismo resultado, sin segunda escritura |
| L05 | — | La misma clave y otro `name` o otro plan | `registerLedger` | `IDEMPOTENCY_CONFLICT`; el registro guardado queda intacto |
| L06 | 1, 5 | Un libro `ACTIVE` con cuentas y asientos | `setLedgerStatus` a `INACTIVE` | Queda `INACTIVE` con id, nombre y plan intactos; ninguna operación de escritura lo acepta después |
| L07 | 7 | Un libro `INACTIVE` | `setLedgerStatus` a `ACTIVE` | Vuelve a `ACTIVE` y admite operaciones de nuevo |
| L08 | — | Un libro en el estado pedido | `setLedgerStatus` con ese mismo estado | No es error y no hay segundo efecto |
| L09 | — | Un `status` distinto de `ACTIVE` o `INACTIVE` | `setLedgerStatus` | `INVALID_APPLICATION_INPUT`; el estado anterior no cambia |
| L10 | 2 | Un `ledgerId` inexistente | `setLedgerStatus` | `LEDGER_NOT_FOUND`; nada escrito |
| L11 | 6 | Un libro `INACTIVE` | Cualquiera de los once casos de uso, uno por área | `LEDGER_INACTIVE`; nada escrito |
| L12 | — | Un repositorio de libros que falla al guardar | `registerLedger` | El error sube; no queda libro ni registro de idempotencia |
| L13 | 9 | Dos libros con planes distintos y una cuenta registrada en uno | `registerAccount` en el otro con el mismo código | Se registra: la unicidad de código es por plan, como ya especifica `registration.md` |
| L14 | 2 | Un `ledgerId` con espacios exteriores | `registerLedger` | `INVALID_LEDGER`, aunque después los casos de uso busquen el id tal cual |
| L15 | 2 | Un libro guardado | `registerAccount` sin `chartOfAccountsId` en la entrada | Toma el plan del libro; el contrato de `registration.md` no cambia |
| L16 | 10 | Un libro | Cualquier operación | El resultado no expone cuentas, asientos, períodos ni saldos del libro |

## Decisiones

Resueltas en esta spec, con el motivo:

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Plan inmutable | No hay operación para cambiar `chartOfAccountsId` | Mismo criterio que `Account`, que no cambia código, padre ni tipo: el plan es la identidad contable del libro. Cambiarlo dejaría cuentas y asientos apuntando a un plan que ya no es el suyo sin ninguna operación que lo migre |
| Bloqueo total del libro inactivo | `LEDGER_INACTIVE` en los once casos de uso | Un estado que permite escribir no significa nada. El cierre de ejercicio es otra cosa y tiene sus propios estados |
| Un solo puerto | `LedgerRepository` reemplaza a `LedgerDirectory` | `chartOfAccountsIdOf` ya era la lectura del libro; el repositorio lleva la misma información más nombre y estado. Dos puertos para el mismo dato obligarían al anfitrión a mantener dos implementaciones coherentes |
| `setLedgerStatus` sin clave de idempotencia | Igual que `setAccountStatus` | Repetir el estado es no-op por construcción, así que no hay segundo efecto que evitar |
| El core no valida que el plan exista | Sin comprobación | No hay entidad de plan de cuentas: es un identificador del anfitrión. Inventar una tabla de planes acá sería decidir por el anfitrión |

Pendientes, con lo que bloquean:

| ID | Tema | Impacto |
| --- | --- | --- |
| Q08 | Moneda funcional del libro | Hoy el libro no declara moneda. Si se agrega, entra como dato del `Ledger` y como regla de compatibilidad de asientos; bloquea contabilidad multimoneda, no este incremento |
| Q11 | Numeración de asientos y su ámbito | La numeración podría ser por libro; no cambia el alta de libro |
| — | Ejercicio contable por libro | Agrupar períodos en ejercicios necesita su propia spec; no bloquea el libro |
| — | Consolidación entre libros | Fuera de fase; exigiría una relación entre libros que hoy no existe |

## Integración y consistencia

- **Lo que cambia para el anfitrión:** implementa `LedgerRepository` (`findById`, `save`) sobre su tabla de
  libros en lugar de `LedgerDirectory`. En base durable eso es una tabla con `id`, `name`, `chart_id` y
  `status`, con clave primaria sobre `id`; la restricción es lo que cierra la ventana entre la consulta de
  unicidad y la escritura.
- **Adaptador en memoria:** `MemoryMaps` gana `ledgers` y la copia de respaldo de la unidad de trabajo lo
  incluye automáticamente. `options.chartOfAccountsByLedger` se elimina; los arneses de prueba siembran los
  libros que necesitan con `registerLedger`, que es lo que hace un anfitrión real. Un libro inexistente deja de
  poder aparecer por configuración: aparece sólo si se registró.
- **Idempotencia:** el ámbito sigue siendo libro + operación + clave. Con el libro como entidad, el ámbito se
  vuelve explícito: no se puede registrar con una clave en un libro que no existe, porque `ledgerId` es el
  sujeto del alta.
- **Concurrencia:** dos `registerLedger` simultáneos del mismo id pueden pasar la comprobación y chocar en la
  escritura; el aislamiento y la clave primaria son del anfitrión (Q09). Este repositorio no serializa.
- **Atomicidad:** el adaptador en memoria restaura todos los mapas si la unidad de trabajo falla, ahora
  incluido el de libros.

## Verificación

- Pruebas previstas: `tests/ledger.test.mjs` (L01-L10, L12-L16), los ocho archivos de casos de uso para L11
  —una prueba por área, no once—, y `tests/public-api.test.mjs` para la superficie de trece métodos, que
  también falla si `Ledger` o `LedgerRepository` se filtran al paquete fuera del barrel.
- L13 se cubre reutilizando la prueba de unicidad por plan que ya existe en `tests/registration.test.mjs`,
  alimentada ahora por dos libros registrados en lugar de por configuración.
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- Estado hoy: **nada de esto está implementado**. No hay `Ledger`, ni `LedgerRepository`, ni
  `registerLedger`, ni `setLedgerStatus`, y el adaptador en memoria todavía exige `chartOfAccountsByLedger`.
