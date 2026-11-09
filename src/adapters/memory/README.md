# Responsabilidad

Adaptador en memoria para desarrollo y pruebas.

Estado: implementado para 006a y 006b.

| Archivo | Responsabilidad |
| --- | --- |
| `store.ts` | Los mapas, las claves compuestas, la copia de respaldo y el snapshot. |
| `repositories.ts` | Implementación de cada puerto sobre los mapas. |
| `in-memory-accounting.ts` | Constructor público, costura de pruebas y unidad de trabajo que restaura. |

Límites explícitos:

- Sin durabilidad: el estado desaparece al terminar el proceso.
- Sin aislamiento: dos `run` concurrentes pueden intercalarse, porque Node ejecuta un solo hilo y aquí no
  hay bloqueo.
- Un rollback en memoria no prueba una transacción de base real. Las garantías de 007 se verifican con BD.

`snapshot()` es una vista de lectura para composición y pruebas; nunca es un camino de escritura.
`options.overrides` existe para reemplazar un puerto puntual en una prueba, por ejemplo para forzar un
fallo de guardado y comprobar que no queda ninguna escritura a medias.
