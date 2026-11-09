# Responsabilidad

Adaptador en memoria para desarrollo y pruebas.

Estado: implementado para el incremento 006a. Guarda valores de dominio inmutables en mapas y restaura el
estado anterior completo cuando una unidad de trabajo falla.

Límites explícitos:

- Sin durabilidad: el estado desaparece al terminar el proceso.
- Sin aislamiento: dos `run` concurrentes pueden intercalarse, porque Node ejecuta un solo hilo y aquí no
  hay bloqueo.
- Un rollback en memoria no prueba una transacción de base real. Las garantías de 007 se verifican con BD.

`snapshot()` es una vista de lectura para composición y pruebas; nunca es un camino de escritura.
`options.overrides` existe para reemplazar un puerto puntual en una prueba, por ejemplo para forzar un
fallo de guardado y comprobar que no queda ninguna escritura a medias.
