-- Smart Aula — Esquema PostgreSQL para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Perfiles de usuario (vinculado a auth.users) ───
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  email TEXT,
  avatar TEXT,
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS avatar TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ─── Categorías ───
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT 'assets/icons/cat-general.svg'
);

-- ─── Documentos PDF ───
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  file_url TEXT NOT NULL,
  thumbnail TEXT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  views INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created ON public.documents(created_at DESC);

-- ─── Favoritos ───
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

-- ─── Comentarios ───
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_document ON public.comments(document_id);

-- ─── Progreso de lectura ───
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  current_page INTEGER DEFAULT 1,
  total_pages INTEGER DEFAULT 1,
  progress INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

-- ─── Trigger: crear perfil al registrarse ───
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Datos iniciales: categorías ───
INSERT INTO public.categories (name, icon) VALUES
  ('Todas', 'assets/icons/cat-todas.svg'),
  ('Educación', 'assets/icons/cat-educacion.svg'),
  ('Programación', 'assets/icons/cat-programacion.svg'),
  ('Tecnología', 'assets/icons/cat-tecnologia.svg'),
  ('Inteligencia Artificial', 'assets/icons/cat-ia.svg'),
  ('Ciencia', 'assets/icons/cat-ciencia.svg'),
  ('Matemáticas', 'assets/icons/cat-matematicas.svg'),
  ('Ingeniería', 'assets/icons/cat-ingenieria.svg'),
  ('Diseño', 'assets/icons/cat-diseno.svg'),
  ('Literatura', 'assets/icons/cat-literatura.svg'),
  ('Historia', 'assets/icons/cat-historia.svg'),
  ('Ciencias Sociales', 'assets/icons/cat-sociales.svg'),
  ('Derecho', 'assets/icons/cat-derecho.svg'),
  ('Salud', 'assets/icons/cat-salud.svg'),
  ('Negocios', 'assets/icons/cat-negocios.svg'),
  ('Idiomas', 'assets/icons/cat-idiomas.svg'),
  ('Tesis', 'assets/icons/cat-tesis.svg'),
  ('General', 'assets/icons/cat-general.svg')
ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon;

-- ─── Row Level Security ───
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

-- Users
DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories (públicas)
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);

-- Documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT USING (true);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update_own" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents_delete_own" ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- Favorites
CREATE POLICY "favorites_select_own" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "favorites_insert_own" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_delete_own" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- Comments
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- Reading progress
CREATE POLICY "reading_select_own" ON public.reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "reading_upsert_own" ON public.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reading_update_own" ON public.reading_progress FOR UPDATE USING (auth.uid() = user_id);

-- ─── Storage bucket (ejecutar también en Dashboard → Storage) ───
-- Crear bucket: pdfs (público para lectura)
-- Políticas en Storage → Policies:

-- SELECT (público):
-- CREATE POLICY "Public read pdfs" ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');

-- INSERT (autenticados):
-- CREATE POLICY "Auth upload pdfs" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'pdfs' AND auth.role() = 'authenticated');

-- UPDATE/DELETE (propietario):
-- CREATE POLICY "Owner manage pdfs" ON storage.objects FOR ALL
--   USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
