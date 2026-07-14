-- War Room accede a PostgreSQL exclusivamente desde el servidor mediante
-- Prisma. Los roles de la Data API no necesitan leer ni escribir datos.

DO $$
DECLARE
  table_record RECORD;
  sequence_record RECORD;
  api_roles TEXT;
BEGIN
  -- El PostgreSQL temporal de CI no incluye roles propios de Supabase. En
  -- producción los tres existen; en cualquier otro entorno revocamos solo los
  -- que estén disponibles, sin crear roles globales artificiales.
  SELECT string_agg(quote_ident(rolname), ', ' ORDER BY rolname)
  INTO api_roles
  FROM pg_roles
  WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role']);

  FOR table_record IN
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.relname);
    IF api_roles IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',
        table_record.relname,
        api_roles
      );
    END IF;
  END LOOP;

  IF api_roles IS NOT NULL THEN
    FOR sequence_record IN
      SELECT relname
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'S'
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %s',
        sequence_record.relname,
        api_roles
      );
    END LOOP;

    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %s', api_roles);

    -- Las migraciones Prisma se ejecutan como postgres. Evitamos que las
    -- tablas, secuencias o funciones futuras hereden permisos públicos.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %s',
      api_roles
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %s',
      api_roles
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %s',
      api_roles
    );
  END IF;
END $$;
