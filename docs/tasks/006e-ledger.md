# 006e — Libro contable como agregado

Incremento autorizado el 2026-11-15. Comportamiento fijado en `docs/specs/ledger.md` (L01-L16).
Seis tareas secuenciales; **T2 es la bisagra**: hasta que el puerto nuevo no compila no se escribe nada más.

## Specs

S1. Alcance pedido: «exacto el libro contable y despues el plan de cuentas vamos a planear el libro contable».
Este documento cubre **sólo el libro**; el plan de cuentas no entra acá.

S2. «1 si cambia» — el mensaje de `LEDGER_NOT_FOUND` cambia. Hoy dice `is not known to the directory` porque
el libro era configuración del adaptador; al pasar a repositorio dirá `is not registered`. Es contrato: los
mensajes son superficie y las pruebas que los asertan se actualizan en el mismo corte.

S3. «2 eliminalo» — `options.chartOfAccountsByLedger` del adaptador en memoria se elimina de una, sin período
de gracia. Los libros se siembran registrándolos, como lo haría un anfitrión real. Dos fuentes de verdad para
el libro es exactamente lo que este incremento viene a matar (reglas 8 y 9 de la spec).

S4. «3 si» — leído como sí a la recomendación: el libro **no** declara moneda funcional en este incremento
(Q08 sigue abierta). `Ledger.create` recibe un objeto, así que agregar el campo más adelante no cambia la firma.

S5. «4 tu recomendacion» — el documento de tareas vive en `docs/tasks/006e-ledger.md`, junto a los demás, para
no partir el índice en dos.

S6. «el plan de cuentas para luego no es prioridad ahora» — convertir el plan en entidad reabre Q07 y no es
parte de este incremento. El libro guarda `chartOfAccountsId` como identificador opaco, de forma que validarlo
después sea un incremento encima y no una reescritura.

## Tasks

| ID | Tarea | Spec | Ruta | Commit |
| --- | --- | --- | --- | --- |
| T1 | Dominio `Ledger` + `LedgerError`; inmutable, plan inmutable, nace `ACTIVE` | S1, spec R1-R5, L01, L03, L14 | dominio `src/core/domain/ledger/` | b6e915b |
| T2 | `LedgerRepository` reemplaza `LedgerDirectory`, `registerLedger` con idempotencia e id libre, `chartOfAccountsByLedger` eliminado | S2, S3, L01-L05, L12, L13, L15, L16 | puertos, adaptador, `use-cases/ledgers/`, arneses de prueba | 32b3bcc |
| T3 | `setLedgerStatus`: valor admitido → libro → transición no-op → escritura | L06-L10 | `use-cases/ledgers/` | 7543d85 |
| T4 | `LEDGER_INACTIVE` en los once casos de uso, sin mover la posición del libro en cada flujo | L11 | `use-cases/shared/rules.ts` | f34c7bd |
| T5 | Fachada a trece métodos, superficie pública, `STATUS`/`ARCHITECTURE`/`INTEGRATION` | S2, todos | fachada + docs | fae2c7c |

## Log

L1. «exacto el libro contable y despues el plan de cuentas vamos a planear el libro contable»

L2. «bien que es lo siguente ? yo tengo algo en mente pero quiero queme digas primero»

L3. Decisiones sobre el plan presentado: «1 si cambia
2 eliminalo
3 si
4 tu recomendacion
dale tienes permiso.
 el plan de cuentas para luego no es prioridad ahora»

L4. Interpretación registrada y avisada al humano: el punto 3 se leyó como sí a la recomendación, es decir
sin moneda funcional ahora y con `Ledger.create` recibiendo un objeto. Queda pendiente de corrección explícita
si el humano quería la moneda en este incremento.

L5. El corte original de seis tareas se reordenó a cinco: quitar `chartOfAccountsByLedger` sin `registerLedger`
deja las suites sin forma de crear un libro, así que el antiguo T2 y T3 se fusionaron en un solo corte. El T1
también tenía mal registrado su sha (apuntaba al commit previo al `amend`); queda corregido a `b6e915b`.

L6. `INVALID_LEDGER` burbujea **sin envolver**: es error de dominio, no de aplicación. La primera versión de la
prueba L03 lo esperaba como `ApplicationError` y falló; la prueba se corrigió, el código no.

L7. Cierre del incremento. `pnpm check` en verde con **243 pruebas** (eran 217 antes de 006e): 26 nuevas entre
dominio, casos de uso y superficie. La documentación de T5 se delegó a un worker por presupuesto de contexto;
reportó 243 y ninguna prueba roja, y el padre verificó lo que quedó fuera de su alcance — `docs/tasks`,
`src/core/domain/ledger/README.md`, el estado de `src/core/application/README.md` y la frase «eleven symbols»
que sobrevivía en la fachada y en el índice de la capa.

L8. Pendientes que este incremento **no** cierra, dichos para no prometerlos: moneda funcional del libro
(Q08 abierta), operación para cambiar el plan de cuentas, borrado de libros, verificación de que el plan exista
(Q07) y concurrencia o unicidad durable (Q09, del anfitrión). El plan de cuentas como entidad sigue sin ser
prioridad y reabre Q07 cuando toque.
