-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Asiento de un libro. La identidad es el par (ledger_id, id).
CREATE TABLE journal_entry (
  ledger_id            uuid                 NOT NULL,
  id                   uuid                 NOT NULL,
  journal_id           uuid                 NOT NULL,
  period_id            uuid                 NOT NULL,
  accounting_date      date                 NOT NULL,
  description          text                 NOT NULL,
  status               journal_entry_status NOT NULL,
  number               integer,
  reversal_of_entry_id uuid,
  created_at           timestamptz          NOT NULL DEFAULT now(),
  updated_at           timestamptz          NOT NULL DEFAULT now(),
  -- HA20: la clave primaria sobre el par es la garantía durable de que un id de asiento no se reutiliza.
  CONSTRAINT journal_entry_pkey PRIMARY KEY (ledger_id, id),
  -- HA43: el número es único por libro. En PostgreSQL dos NULL no colisionan, así que todos los borradores
  -- conviven sin número y ningún asiento contabilizado comparte el suyo.
  CONSTRAINT journal_entry_ledger_number_unique UNIQUE (ledger_id, number),
  CONSTRAINT journal_entry_number_positive CHECK (number IS NULL OR number > 0)
);

-- HA37: los reportes entran por (libro, fecha contable).
CREATE INDEX journal_entry_ledger_date_index ON journal_entry (ledger_id, accounting_date);

-- HA18: todas las reversiones de un asiento original, en cualquier estado.
CREATE INDEX journal_entry_reversal_index ON journal_entry (ledger_id, reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

CREATE TRIGGER journal_entry_set_updated_at
  BEFORE UPDATE ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
