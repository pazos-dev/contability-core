# Incremento 009a — Numeración de asientos

Cierra Q11 en lo que el core puede decidir. Comportamiento autoritativo en `docs/specs/entry-numbering.md`:
12 reglas y criterios N01-N12. El formato del número y la unicidad durable quedan del anfitrión.

## Specs

S1. «1 por libro pero tengo entendido que el codigo es algo asi como 1.2.5.13 y cada cifra significa libro
cuanta linea algo asi. por libro seria solo uno de esos codigos.» — con la aclaración de que `1.2.5.13` es un
**código de cuenta** del plan (ya implementado como texto opaco en `AccountCode`, A01/A02) y no un número de
asiento: el número de asiento es un entero sin puntos ni jerarquía, y el contador es **por libro**.

S2. «2 entero» — el número es un entero pelado. Sin prefijos, sin año, sin ceros a la izquierda. Presentarlo es
del anfitrión.

S3. «3 no entiendo te refieres cuando hay un error hacer 1.4.3.12 pasar a 1.4.3.11 no, se queda en 1.4.3.12
registrado y se hace una de reversion para indicar con una en contra.» — nunca se renumera. La corrección de un
asiento contabilizado es un asiento de reversión; el original conserva su número.

S4. Huecos permitidos (confirmado con «sk» sobre la pregunta del número quemado): un número pedido y no guardado
porque la operación falló puede faltar. Lo que no se permite es repetir un número ni reutilizar el de un
asiento revertido. El core no rellena huecos.

S5. El número se asigna **al contabilizar**, no al crear el borrador: un borrador no es un hecho contable y no
consume la secuencia. Un `DRAFT` no tiene número y un `POSTED` lo tiene; el par se valida en el constructor
privado del agregado.

S6. La reversión recibe su **propio** número del mismo contador del libro: son dos hechos contables y los dos
tienen que poder citarse. No hereda el del original.

S7. La asignación va después de todas las guardas de la aplicación y justo antes del guardado, en las dos vías
que dejan un asiento en `POSTED` (`post` y `reverse`). Un período cerrado se reporta sin pedir número; un
contador que falla no escribe ni asiento ni registro de idempotencia.

S8. Un replay de idempotencia devuelve el número guardado sin consumir otro. La huella no cambió, así que un
resultado guardado antes de numerar vuelve sin `number`: la migración es del anfitrión (HA44).

S9. El core **no verifica** que un número esté libre: pide el siguiente y confía en la restricción única sobre
`(ledgerId, number)` del anfitrión (HA43). Misma división que la reversión única y el id de asiento.

S10. Los reportes no cambian: el número no entra en ninguna fila de `accountBalances`, `trialBalance` ni
`accountMovements`.

## Tasks

| ID | Specs | Qué | Commit |
| --- | --- | --- | --- |
| T1 | S2, S5, S6 | `JournalEntry` gana `number` y `post(number)`; el constructor valida el par estado/número; código nuevo `ENTRY_NUMBER_INVALID` | `651feed` |
| T2 | S1, S7, S8, S9 | Puerto `EntryNumberSequence` en el alcance de la unidad de trabajo, contador en el adaptador en memoria y asignación en `post` y `reverse` | `4ba7c16` |
| T3 | S1-S10 | Documentación del incremento: spec cerrada, `HA43`/`HA44`, `STATUS`, `ROADMAP`, Q11 | `6f52308` |
| T4 | S9, S10 | Hallazgos de la verificación independiente: publicar el puerto en el barrel, corregir el comentario de la asignación y cinco pruebas nuevas | `8bd437e`, `45ae1d1` |

## Log

L1. «lo que le qu3da al core es 009 solamente ? y que es exactamente ?»

L2. «si pasamos a la nuemracionde asiento me dices que vas hacer como porque brevemente y te doy el visto luego
no lo moteas hasta que no revise»

L3. Respuestas a las cinco decisiones: «1 por libro pero tengo entendido que el codigo es algo asi como 1.2.5.13
y cada cifra significa libro cuanta linea algo asi. por libro seria solo uno de esos codigos.», «2 entero», «3
no entiendo te refieres cuando hay un error hacer 1.4.3.12 pasar a 1.4.3.11 no, se queda en 1.4.3.12 registrado
y se hace una de reversion para indicar con una en contra. si no es esomlonque te refieres me dicesb».

L4. «sk» — confirmación de huecos permitidos, número al contabilizar y el resto como estaba propuesto.

L5. «esta bien» — aprobación del spec.

L6. «si» — autorización para implementar.

L7. «bien tienes permiso» — autorización de la verificación independiente.

L8. «si mergea» — autorización de merge (PR #14 y #16; #15 cerrada como reemplazada).

L9. «las 2 hazlas y que faltaria» — limpieza de ramas mergeadas y de los temporales del verificador.
