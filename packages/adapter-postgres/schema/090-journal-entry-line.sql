-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Línea de asiento: existe sólo dentro de su asiento.
CREATE TABLE journal_entry_line (
  ledger_id                 uuid           NOT NULL,
  entry_id                  uuid           NOT NULL,
  id                        uuid           NOT NULL,
  position                  smallint       NOT NULL,
  account_id                uuid           NOT NULL,
  side                      posting_side   NOT NULL,
  amount_minor_units        bigint         NOT NULL,
  amount_currency_code      currency_code  NOT NULL,
  amount_currency_scale     currency_scale NOT NULL,
  functional_minor_units    bigint,
  functional_currency_code  currency_code,
  functional_currency_scale currency_scale,
  rate_from_code            currency_code,
  rate_from_scale           currency_scale,
  rate_to_code              currency_code,
  rate_to_scale             currency_scale,
  rate_factor               text,
  description               text,
  -- El identificador de la línea es único dentro de su asiento: la línea no existe fuera del agregado.
  CONSTRAINT journal_entry_line_pkey PRIMARY KEY (ledger_id, entry_id, id),
  -- Es la única clave foránea del esquema: una línea no existe fuera de su asiento.
  CONSTRAINT journal_entry_line_entry_fkey FOREIGN KEY (ledger_id, entry_id)
    REFERENCES journal_entry (ledger_id, id) ON DELETE CASCADE,
  -- El importe funcional es un importe completo: o están sus tres columnas o no está ninguna.
  CONSTRAINT journal_entry_line_functional_complete CHECK (
    (functional_minor_units IS NULL) = (functional_currency_code IS NULL)
    AND (functional_currency_code IS NULL) = (functional_currency_scale IS NULL)
  ),
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
