# Responsabilidad

Adaptador en memoria para desarrollo y pruebas.

Estado: implementado para 006a, 006b, 006e y 008a.

| Archivo | Responsabilidad |
| --- | --- |
| `store.ts` | Los mapas, las claves compuestas, la copia de respaldo y el snapshot. |
| `repositories.ts` | Implementación de cada puerto sobre los mapas. |
| `in-memory-accounting.ts` | Constructor público y unidad de trabajo que restaura. Una sola forma de escribir: el objeto expuesto sólo ofrece `unitOfWork` y `snapshot`. |

Límites explícitos:

- Sin durabilidad: el estado desaparece al terminar el proceso.
- Sin aislamiento: dos `run` concurrentes pueden intercalarse, porque Node ejecuta un solo hilo y aquí no
  hay bloqueo.
- Un rollback en memoria no prueba una transacción de base real. Las garantías de 007 se verifican con BD.
- **Una sola puerta de escritura.** El adaptador no expone ningún repositorio suelto: se escribe dentro de
  `unitOfWork.run`, igual que en un anfitrión real. Un repositorio sostenido desde afuera escribiría sin
  respaldo, y un `run` posterior que fallara restauraría una copia anterior y descartaría esa escritura en
  silencio. Esa costura existió y se cerró; `packages/core/tests/public-api.test.mjs` fija que el objeto expuesto tenga
  sólo `unitOfWork` y `snapshot`.

Decisiones de copia, que son parte del contrato y no un detalle:

- La copia de respaldo de la unidad de trabajo y la del snapshot son **superficiales**: todo valor guardado
  en los mapas es un objeto de dominio congelado.
- El resultado de una operación no lo es: es un grafo de objetos planos que se entrega al llamador. El
  registro de idempotencia lo copia al guardarlo y al recuperarlo (`copyResult`), así que mutar un
  resultado devuelto no reescribe lo que responderá un replay, y el único grafo mutable del mapa entró
  copiado y nunca sale entero.
- `findReversalsOf` recorre el mapa y devuelve **todas** las coincidencias: el adaptador no elige una
  "primera" reversión, porque ese orden no significa nada fuera del mapa.
- `findByChart` y `findPostedMovements` recorren los mapas con filtros, no con claves: el primero enumera las
  cuentas de un plan y el segundo pagina los asientos `POSTED` de un libro por rango inclusivo de fecha
  contable y, opcionalmente, por cuenta. El cursor de esa paginación es un desplazamiento sobre un orden
  total —fecha contable y luego id de asiento, que es único dentro del libro— y es opaco para el llamador:
  sólo tiene que ser estable mientras se drena la misma lectura.

`snapshot()` es una vista de lectura para composición y pruebas; nunca es un camino de escritura.
`options.overrides` existe para reemplazar un puerto puntual en una prueba, por ejemplo para forzar un
fallo de guardado y comprobar que no queda ninguna escritura a medias.
