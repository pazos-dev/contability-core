-- Esquema canónico del motor contable para PostgreSQL.
--
-- Este archivo es la única verdad del esquema: el adaptador Prisma se alinea a él, nunca al revés.
-- Las restricciones que el contrato de `docs/INTEGRATION.md` exige de forma durable viven acá y no en el
-- código, porque una comprobación en el adaptador pierde la ventana entre la lectura y la escritura.
--
-- Lo que este esquema NO duplica, a propósito: los dominios cerrados de los DTO (el core ya los valida) se
-- repiten sólo cuando son la garantía durable de la regla; no hay claves foráneas entre agregados, porque
-- el core verifica existencia y vida en el momento de la lectura y una clave foránea haría que el adaptador
-- durable rechazara escrituras que el contrato de los puertos acepta. La única excepción es la línea de
-- asiento, que no existe fuera de su asiento.

-- HA16 necesita clases de operador GiST para comparar texto dentro de un índice de exclusión.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE ledger (
  id                   text     NOT NULL,
  name                 text     NOT NULL,
  chart_of_accounts_id text     NOT NULL,
  currency_code        text     NOT NULL,
  currency_scale       smallint NOT NULL,
  status               text     NOT NULL,
  CONSTRAINT ledger_pkey PRIMARY KEY (id),
  CONSTRAINT ledger_currency_code_format CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ledger_currency_scale_range CHECK (currency_scale BETWEEN 0 AND 6),
  CONSTRAINT ledger_status_domain CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

-- HA10 y HA11: el identificador es global, el código es único dentro de su plan de cuentas.
CREATE TABLE account (
  id                   text    NOT NULL,
  chart_of_accounts_id text    NOT NULL,
  code                 text    NOT NULL,
  name                 text    NOT NULL,
  type                 text    NOT NULL,
  parent_id            text,
  posting_allowed      boolean NOT NULL,
  status               text    NOT NULL,
  CONSTRAINT account_pkey PRIMARY KEY (id),
  CONSTRAINT account_chart_code_unique UNIQUE (chart_of_accounts_id, code),
  CONSTRAINT account_type_domain CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  CONSTRAINT account_status_domain CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT account_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

-- HA12: findByChart enumera el plan completo y sin paginar.
CREATE INDEX account_chart_index ON account (chart_of_accounts_id);

CREATE TABLE journal (
  id        text NOT NULL,
  ledger_id text NOT NULL,
  code      text NOT NULL,
  name      text NOT NULL,
  status    text NOT NULL,
  CONSTRAINT journal_pkey PRIMARY KEY (ledger_id, id),
  CONSTRAINT journal_ledger_code_unique UNIQUE (ledger_id, code),
  CONSTRAINT journal_status_domain CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE accounting_period (
  id         text NOT NULL,
  ledger_id  text NOT NULL,
  name       text NOT NULL,
  start_date date NOT NULL,
  end_date   date NOT NULL,
  status     text NOT NULL,
  CONSTRAINT accounting_period_pkey PRIMARY KEY (ledger_id, id),
  CONSTRAINT accounting_period_date_order CHECK (start_date <= end_date),
  CONSTRAINT accounting_period_status_domain CHECK (status IN ('OPEN', 'CLOSED')),
  -- HA16: el solapamiento es una pregunta sobre rangos y un UNIQUE no la puede expresar. Ambos extremos
  -- son inclusivos, así que dos períodos que sólo se tocan (2026-01-01/2026-01-31 y 2026-01-31/2026-02-28)
  -- se solapan el 31 de enero y se rechazan.
  CONSTRAINT accounting_period_no_overlap EXCLUDE USING gist (
    ledger_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE TABLE journal_entry (
  id                   text    NOT NULL,
  ledger_id            text    NOT NULL,
  journal_id           text    NOT NULL,
  period_id            text    NOT NULL,
  accounting_date      date    NOT NULL,
  description          text    NOT NULL,
  status               text    NOT NULL,
  number               integer,
  reversal_of_entry_id text,
  CONSTRAINT journal_entry_pkey PRIMARY KEY (ledger_id, id),
  -- HA43: el número es único por libro. En PostgreSQL dos NULL no colisionan, así que todos los borradores
  -- conviven sin número y ningún asiento contabilizado comparte el suyo.
  CONSTRAINT journal_entry_ledger_number_unique UNIQUE (ledger_id, number),
  CONSTRAINT journal_entry_status_domain CHECK (status IN ('DRAFT', 'POSTED')),
  CONSTRAINT journal_entry_number_positive CHECK (number IS NULL OR number > 0)
);

-- HA37: los reportes entran por (libro, fecha contable).
CREATE INDEX journal_entry_ledger_date_index ON journal_entry (ledger_id, accounting_date);

-- HA18: todas las reversiones de un asiento original, en cualquier estado.
CREATE INDEX journal_entry_reversal_index ON journal_entry (ledger_id, reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

CREATE TABLE journal_entry_line (
  ledger_id                 text     NOT NULL,
  entry_id                  text     NOT NULL,
  id                        text     NOT NULL,
  position                  smallint NOT NULL,
  account_id                text     NOT NULL,
  side                      text     NOT NULL,
  amount_minor_units        bigint   NOT NULL,
  amount_currency_code      text     NOT NULL,
  amount_currency_scale     smallint NOT NULL,
  functional_minor_units    bigint,
  functional_currency_code  text,
  functional_currency_scale smallint,
  rate_from_code            text,
  rate_from_scale           smallint,
  rate_to_code              text,
  rate_to_scale             smallint,
  rate_factor               text,
  description               text,
  -- El identificador de la línea es único dentro de su asiento: la línea no existe fuera del agregado.
  CONSTRAINT journal_entry_line_pkey PRIMARY KEY (ledger_id, entry_id, id),
  CONSTRAINT journal_entry_line_entry_fkey FOREIGN KEY (ledger_id, entry_id)
    REFERENCES journal_entry (ledger_id, id) ON DELETE CASCADE,
  CONSTRAINT journal_entry_line_side_domain CHECK (side IN ('DEBIT', 'CREDIT')),
  CONSTRAINT journal_entry_line_amount_currency_format CHECK (amount_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT journal_entry_line_amount_currency_scale_range
    CHECK (amount_currency_scale BETWEEN 0 AND 6),
  -- El importe funcional es un importe completo: o están sus tres columnas o no está ninguna.
  CONSTRAINT journal_entry_line_functional_complete CHECK (
    (functional_minor_units IS NULL) = (functional_currency_code IS NULL)
    AND (functional_currency_code IS NULL) = (functional_currency_scale IS NULL)
  ),
  CONSTRAINT journal_entry_line_functional_currency_format
    CHECK (functional_currency_code IS NULL OR functional_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT journal_entry_line_functional_currency_scale_range
    CHECK (functional_currency_scale IS NULL OR functional_currency_scale BETWEEN 0 AND 6),
  -- La tasa usada es una conversión completa o no es nada.
  CONSTRAINT journal_entry_line_rate_complete CHECK (
    (rate_from_code IS NULL) = (rate_to_code IS NULL)
    AND (rate_from_code IS NULL) = (rate_factor IS NULL)
    AND (rate_from_code IS NULL) = (rate_from_scale IS NULL)
    AND (rate_from_code IS NULL) = (rate_to_scale IS NULL)
  )
);

-- HA21: hasPostedLines pregunta por cuenta en todos los libros. HA33: la lectura por cuenta entra por acá.
CREATE INDEX journal_entry_line_account_index ON journal_entry_line (account_id);

-- HA37: los reportes usan dos accesos. El primero, (ledger_id, accounting_date), es el índice de
-- journal_entry. El segundo, (ledger_id, account_id, accounting_date), se arma con este índice para las
-- líneas y la baja por la clave primaria del asiento para la fecha, que vive en el asiento y no en la línea:
-- duplicarla en la línea sería un dato derivado que el upsert tendría que mantener en sincronía.
CREATE INDEX journal_entry_line_ledger_account_index ON journal_entry_line (ledger_id, account_id);

-- HA43: el contador del libro. Huecos aceptables, repetidos no (lo cierra el UNIQUE del asiento).
CREATE TABLE entry_number_counter (
  ledger_id   text    NOT NULL,
  last_issued integer NOT NULL DEFAULT 0,
  CONSTRAINT entry_number_counter_pkey PRIMARY KEY (ledger_id),
  CONSTRAINT entry_number_counter_last_issued_range CHECK (last_issued >= 0)
);

-- HA22: la clave es la tripleta, nunca la clave sola. HA26: la huella se guarda como texto, tal cual llega.
CREATE TABLE idempotency_record (
  ledger_id       text  NOT NULL,
  operation       text  NOT NULL,
  idempotency_key text  NOT NULL,
  fingerprint     text  NOT NULL,
  result          jsonb NOT NULL,
  CONSTRAINT idempotency_record_pkey PRIMARY KEY (ledger_id, operation, idempotency_key)
);
