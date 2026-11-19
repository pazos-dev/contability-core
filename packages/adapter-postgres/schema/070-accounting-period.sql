-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Período contable de un libro.
CREATE TABLE accounting_period (
  ledger_id  uuid                     NOT NULL,
  id         uuid                     NOT NULL,
  name       text                     NOT NULL,
  start_date date                     NOT NULL,
  end_date   date                     NOT NULL,
  status     accounting_period_status NOT NULL,
  created_at timestamptz              NOT NULL DEFAULT now(),
  updated_at timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_pkey PRIMARY KEY (ledger_id, id),
  CONSTRAINT accounting_period_date_order CHECK (start_date <= end_date),
  -- HA16: el solapamiento es una pregunta sobre rangos y un UNIQUE no la puede expresar. Ambos extremos
  -- son inclusivos, así que dos períodos que sólo se tocan (2026-01-01/2026-01-31 y 2026-01-31/2026-02-28)
  -- se solapan el 31 de enero y se rechazan.
  CONSTRAINT accounting_period_no_overlap EXCLUDE USING gist (
    ledger_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE TRIGGER accounting_period_set_updated_at
  BEFORE UPDATE ON accounting_period
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
