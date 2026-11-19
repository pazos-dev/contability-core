-- Creación del esquema, no un paso de un historial: este archivo se aplica una sola vez y no se edita una vez
-- que un anfitrión lo aplicó. Ahí empieza a existir una migración.
-- Auditoría del anfitrión: el motor nunca ve estas columnas; los valores de auditoría del propio motor
-- viajan en los DTO. Cada tabla mutable declara `created_at`/`updated_at timestamptz` y adjunta un trigger
-- `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION set_updated_at()`.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
