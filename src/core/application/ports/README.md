# Responsabilidad

Contratos pequeños de capacidades externas usados por casos de uso reales.

Estado: implementado para el incremento 006a. `UnitOfWork` es la única puerta: los repositorios salen de
su alcance, así que ningún caso de uso abre una conexión independiente. `LedgerDirectory` es la única
fuente de la relación libro-plan (Q07) y `PostedMovementsQuery` evita que el registro de cuentas dependa
del dominio de asientos.
