-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- HA10 y HA11: el identificador es global, el código es único dentro de su plan de cuentas.
CREATE TABLE account (
  id                   uuid           NOT NULL,
  chart_of_accounts_id uuid           NOT NULL,
  code                 text           NOT NULL,
  name                 text           NOT NULL,
  type                 account_type   NOT NULL,
  parent_id            uuid,
  posting_allowed      boolean        NOT NULL,
  status               account_status NOT NULL,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT account_pkey PRIMARY KEY (id),
  CONSTRAINT account_chart_code_unique UNIQUE (chart_of_accounts_id, code),
  CONSTRAINT account_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

-- HA12: findByChart enumera el plan completo y sin paginar.
CREATE INDEX account_chart_index ON account (chart_of_accounts_id);

CREATE TRIGGER account_set_updated_at
  BEFORE UPDATE ON account
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
