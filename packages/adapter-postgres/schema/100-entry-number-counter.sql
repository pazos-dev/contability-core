-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- HA43: el contador del libro. Huecos aceptables, repetidos no (lo cierra el UNIQUE del asiento).
CREATE TABLE entry_number_counter (
  ledger_id   uuid    NOT NULL,
  last_issued integer NOT NULL DEFAULT 0,
  CONSTRAINT entry_number_counter_pkey PRIMARY KEY (ledger_id),
  CONSTRAINT entry_number_counter_last_issued_range CHECK (last_issued >= 0)
);
