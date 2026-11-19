-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Operaciones idempotentes de un libro.
--
-- HA22: la clave es la tripleta, nunca la clave sola. HA26: la huella se guarda como texto, tal cual llega.
-- `operation`, `idempotency_key` y `fingerprint` son cadenas del core, no identificadores: quedan `text` a
-- propósito.
CREATE TABLE idempotency_record (
  ledger_id       uuid        NOT NULL,
  operation       text        NOT NULL,
  idempotency_key text        NOT NULL,
  fingerprint     text        NOT NULL,
  result          jsonb       NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_record_pkey PRIMARY KEY (ledger_id, operation, idempotency_key)
);
