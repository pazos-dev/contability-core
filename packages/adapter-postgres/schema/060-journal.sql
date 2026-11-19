-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Diario de un libro: su código es único dentro del libro.
CREATE TABLE journal (
  ledger_id  uuid           NOT NULL,
  id         uuid           NOT NULL,
  code       text           NOT NULL,
  name       text           NOT NULL,
  status     journal_status NOT NULL,
  created_at timestamptz    NOT NULL DEFAULT now(),
  updated_at timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT journal_pkey PRIMARY KEY (ledger_id, id),
  CONSTRAINT journal_ledger_code_unique UNIQUE (ledger_id, code)
);

CREATE TRIGGER journal_set_updated_at
  BEFORE UPDATE ON journal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
