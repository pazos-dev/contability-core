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
| T1 | Dominio `Ledger` + `LedgerError`; inmutable, plan inmutable, nace `ACTIVE` | S1, spec R1-R5, L01, L03, L14 | dominio `src/core/domain/ledger/` | e76860d |
| T2 | `LedgerRepository` reemplaza `LedgerDirectory`; `MemoryMaps.ledgers`; se elimina `chartOfAccountsByLedger` | S3, L13 | puertos + adaptador | pendiente |
| T3 | `registerLedger`: idempotencia → id libre → validación → escritura única; `LEDGER_ALREADY_EXISTS` | L01-L05, L12, L15, L16 | `use-cases/ledgers/` | pendiente |
| T4 | `setLedgerStatus`: valor admitido → libro → transición no-op → escritura; `LEDGER_INACTIVE` | L06-L10 | `use-cases/ledgers/` | pendiente |
| T5 | `LEDGER_INACTIVE` en los once casos de uso, sin mover la posición del libro en cada flujo | L11 | `use-cases/*/rules.ts` | pendiente |
| T6 | Fachada a trece métodos, superficie pública, `STATUS`/`ARCHITECTURE`/`INTEGRATION` | S2, todos | fachada + docs | pendiente |

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
