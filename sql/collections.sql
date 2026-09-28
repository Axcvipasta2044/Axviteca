-- Smart Aula — Colecciones de usuarios
-- Ejecutar en Supabase Dashboard -> SQL Editor -> New query -> Run

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_public ON public.collections(is_public);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON public.collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_document ON public.collection_items(document_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_select_owner_or_public" ON public.collections;
DROP POLICY IF EXISTS "collections_insert_own" ON public.collections;
DROP POLICY IF EXISTS "collections_update_own" ON public.collections;
DROP POLICY IF EXISTS "collections_delete_own" ON public.collections;

CREATE POLICY "collections_select_owner_or_public"
  ON public.collections FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "collections_insert_own"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collections_update_own"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collections_delete_own"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_items_select_allowed" ON public.collection_items;
DROP POLICY IF EXISTS "collection_items_insert_owner" ON public.collection_items;
DROP POLICY IF EXISTS "collection_items_update_owner" ON public.collection_items;
DROP POLICY IF EXISTS "collection_items_delete_owner" ON public.collection_items;

CREATE POLICY "collection_items_select_allowed"
  ON public.collection_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_id
        AND (c.is_public = true OR c.user_id = auth.uid())
    )
  );

CREATE POLICY "collection_items_insert_owner"
  ON public.collection_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "collection_items_update_owner"
  ON public.collection_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "collection_items_delete_owner"
  ON public.collection_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.collections c
      WHERE c.id = collection_id
        AND c.user_id = auth.uid()
    )
  );
