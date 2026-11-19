-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Libro: la raíz del agregado y el dueño de la moneda funcional.
CREATE TABLE ledger (
  id                   uuid            NOT NULL,
  name                 text            NOT NULL,
  chart_of_accounts_id uuid            NOT NULL,
  currency_code        currency_code   NOT NULL,
  currency_scale       currency_scale  NOT NULL,
  status               ledger_status   NOT NULL,
  created_at           timestamptz     NOT NULL DEFAULT now(),
  updated_at           timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT ledger_pkey PRIMARY KEY (id)
);

CREATE TRIGGER ledger_set_updated_at
  BEFORE UPDATE ON ledger
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
