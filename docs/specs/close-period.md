# SPEC — Cerrar un período

Estado: implementada (incremento 006b). C05 y P08 son contrato del anfitrión (ver `../INTEGRATION.md`).
Ruta: `src/core/application/use-cases/`.
Depende de: `period.md` (P06, P08). Contrato general de casos de uso y puertos: `registration.md`.

## Objetivo

Pasar un período de OPEN a CLOSED desde la aplicación, sin tocar asientos ni borradores, y con reintentos
idempotentes para que un anfitrión pueda repetir la operación sin ambigüedad.

## Alcance y exclusiones

Incluye:

- `closePeriod`.

Excluye, declarado para no prometerlo:

- **P08 — cierre y contabilización simultáneos.** Requiere serialización o detección de conflicto sobre el
  período: lo garantiza el anfitrión.
- **C05 — fallo de base real durante el cierre.** Lo garantiza la transacción del anfitrión, igual que U03b.
- Reabrir un período cerrado. Necesita especificación propia.
- Cierre fiscal, cierre de resultados, asientos de cierre y bloqueo por borradores pendientes.
- Convertir borradores en POSTED al cerrar: el cierre no contabiliza nada.
- Permisos de cierre: la autorización vive en el anfitrión.

## Entrada y salida

```ts
interface ClosePeriodInput {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly idempotencyKey: string;
}

interface ClosePeriodResult {
  readonly ledgerId: string;
  readonly periodId: string;
  readonly status: 'CLOSED';
}
```

`idempotencyKey` es obligatoria: cerrar es una operación terminal sobre el período y el anfitrión puede
reintentarla. La clave se aísla por libro y por operación (`'closePeriod'`). La huella es `ledgerId` +
`periodId`.

## Flujo y orden de validación

Todo dentro de una sola llamada a `unitOfWork.run`.

1. **Idempotencia.** `find(ledgerId, 'closePeriod', key)`: huella igual devuelve el resultado guardado sin
   segundo efecto; huella distinta es `IDEMPOTENCY_CONFLICT`.
2. **Libro.** `chartOfAccountsIdOf(ledgerId)`; ausente es `LEDGER_NOT_FOUND`.
3. **Período.** `findById(ledgerId, periodId)`; ausente, o de otro libro, es `PERIOD_NOT_FOUND`.
4. **Estado.** Si el período ya está `CLOSED` y no hubo coincidencia de idempotencia, `AccountingPeriod.close()`
   produce `PERIOD_ALREADY_CLOSED` y burbujea: cerrar dos veces con claves distintas es un error de estado,
   no un éxito silencioso.
5. **Escritura única.** `periods.save(closed)` y `idempotency.record(...)` en la misma unidad de trabajo.
6. **Resultado.** `{ ledgerId, periodId, status: 'CLOSED' }`.

## Reglas e invariantes

1. El cierre cambia sólo el estado del período: no escribe asientos, no borra borradores y no altera
   fechas, nombre ni libro.
2. El período devuelto por `close()` es una copia; el receptor no se muta (regla ya verificada en el dominio).
3. Cerrar un período de otro libro es indistinguible de cerrar uno inexistente: no se filtra su existencia.
4. `closePeriod` no comprueba si quedan borradores en el período. Esa política queda fuera de esta base.
5. El caso de uso no lee reloj, no genera ids y no lee variables de entorno.

## Errores

Códigos propios: `LEDGER_NOT_FOUND`, `PERIOD_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`.
Burbujea `PERIOD_ALREADY_CLOSED` del dominio.

## Criterios de aceptación

| ID | Regla | Dado | Cuando | Entonces |
| --- | --- | --- | --- | --- |
| C01 | P06 | Un período `OPEN` con asientos `POSTED` y borradores | `closePeriod` | Devuelve `status: CLOSED`; el período queda cerrado y asientos y borradores quedan intactos |
| C02 | — | Un período ya `CLOSED` y una clave nueva | `closePeriod` | `PERIOD_ALREADY_CLOSED`; nada escrito |
| C03 | — | Un período cerrado con una clave ya registrada para él | Repetir `closePeriod` con la misma clave | Mismo resultado, sin segundo efecto |
| C04 | — | Un `periodId` que existe en otro libro | `closePeriod` en este libro | `PERIOD_NOT_FOUND`; el período del otro libro no se lee ni se modifica |
| C05 | P08 | Cierre y contabilización simultáneos | — | **Anfitrión.** Requiere serialización en su persistencia |
| C06 | — | Un repositorio que falla al guardar | `closePeriod` | El error sube y el período sigue `OPEN` |
| C07 | — | Un período inexistente en un libro conocido | `closePeriod` | `PERIOD_NOT_FOUND`; nada escrito |

## Decisiones pendientes

| ID | Tema | Impacto |
| --- | --- | --- |
| — | Reapertura de períodos | Sin operación y sin regla; necesita especificación propia con auditoría. |
| — | Cierre con borradores pendientes | Hoy se permite. Bloquearlo exige decidir qué pasa con esos borradores. |
| — | Cierre fiscal y de resultados | Fuera de fase; requiere cuentas de resultado y asientos de cierre. |

## Integración y consistencia

- La atomicidad entre estado del período y registro de idempotencia la aporta la `UnitOfWork` del anfitrión.
  En memoria se verifica la disciplina de las operaciones, no el aislamiento.
- Un `postEntry` que corre después del cierre encuentra el período `CLOSED` y falla con `PERIOD_CLOSED`,
  siempre que lea el estado ya guardado. La carrera entre ambos es P08, del anfitrión.
- Un adaptador durable del anfitrión debería apoyarse en la versión del período para detectar el conflicto de cierre concurrente.

## Verificación

- Pruebas: `tests/close-period.test.mjs`.
- Una prueba por criterio C01-C04, C06 y C07.
- C05 se registra como diferido en este documento y en `docs/STATUS.md`; no se escribe como prueba verde.
- Comandos: `pnpm check:project`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
