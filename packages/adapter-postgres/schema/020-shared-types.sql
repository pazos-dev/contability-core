-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Vocabulario compartido: las reglas de moneda y las uniones cerradas del dominio.

-- Un enum por agregado y no un ACTIVE/INACTIVE compartido: el core declara esas uniones cerradas por
-- separado y pueden divergir, así que el almacenamiento refleja exactamente esa separación.
CREATE DOMAIN currency_code AS text CHECK (VALUE ~ '^[A-Z]{3}$');
CREATE DOMAIN currency_scale AS smallint CHECK (VALUE BETWEEN 0 AND 6);

CREATE TYPE ledger_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE account_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE journal_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE accounting_period_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE journal_entry_status AS ENUM ('DRAFT', 'POSTED');
CREATE TYPE posting_side AS ENUM ('DEBIT', 'CREDIT');

-- Costo operativo: agregar un valor necesita `ALTER TYPE ... ADD VALUE`, que fuera de PostgreSQL 12 no
-- puede correr dentro de una transacción y que en ninguna versión debe usarse en la misma transacción
-- que lo agrega.
