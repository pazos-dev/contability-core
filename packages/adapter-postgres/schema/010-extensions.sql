-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- HA16 necesita las clases de operador GiST de btree_gist para comparar `uuid` dentro del índice de
-- exclusión que impide dos períodos solapados en un mismo libro.
CREATE EXTENSION IF NOT EXISTS btree_gist;
