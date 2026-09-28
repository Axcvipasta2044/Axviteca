-- Smart Aula — Ejecutar en Supabase SQL Editor si falla la subida (violates row-level security)

-- Asegurar perfil al registrarse (por si el trigger falló)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username, email, avatar)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    username = COALESCE(public.users.username, EXCLUDED.username);
  RETURN NEW;
END;
$$;

-- Permitir que el usuario autenticado cree su propio perfil (upsert desde la app)
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_upsert_own" ON public.users;
CREATE POLICY "users_upsert_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Documentos: insertar solo si eres el dueño
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lectura pública de documentos (web gratis para todos)
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (true);
