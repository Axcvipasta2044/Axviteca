-- Smart Aula - vistas unicas por usuario y documento
-- Ejecutar en Supabase SQL Editor despues de schema.sql/admin-schema.sql.

CREATE TABLE IF NOT EXISTS public.document_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_document_views_user ON public.document_views(user_id);
CREATE INDEX IF NOT EXISTS idx_document_views_document ON public.document_views(document_id);

ALTER TABLE public.document_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_views_select_own" ON public.document_views;
CREATE POLICY "document_views_select_own" ON public.document_views
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "document_views_insert_own" ON public.document_views;
CREATE POLICY "document_views_insert_own" ON public.document_views
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.track_document_view(doc_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.document_views (user_id, document_id)
  VALUES (auth.uid(), doc_id)
  ON CONFLICT (user_id, document_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    UPDATE public.documents
    SET views = (
      SELECT COUNT(*)
      FROM public.document_views
      WHERE document_id = doc_id
    )
    WHERE id = doc_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.track_document_view(UUID) TO authenticated;
