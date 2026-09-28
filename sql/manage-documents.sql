-- Smart Aula - editar y eliminar PDFs propios
-- Ejecutar en Supabase Dashboard -> SQL Editor -> New query -> Run
-- Requisito: ejecutar primero sql/schema.sql si estas instalando la base desde cero.

DO $$
BEGIN
  IF to_regclass('public.documents') IS NULL THEN
    RAISE EXCEPTION 'Falta public.documents. Ejecuta primero el archivo sql/schema.sql en este mismo proyecto de Supabase y luego vuelve a ejecutar sql/manage-documents.sql.';
  END IF;
END $$;

-- Metadata necesaria para limpiar Storage al eliminar y auditar ediciones.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_documents_file_path ON public.documents(file_path);

-- Backfill para PDFs ya existentes con URL publica de Supabase.
UPDATE public.documents
SET file_path = regexp_replace(file_url, '^.*/storage/v1/object/public/pdfs/', '')
WHERE (file_path IS NULL OR file_path = '')
  AND file_url LIKE '%/storage/v1/object/public/pdfs/%';

-- RLS de documentos: lectura publica; solo el owner inserta, edita y elimina.
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own" ON public.documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_delete_own" ON public.documents;
CREATE POLICY "documents_delete_own" ON public.documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Asegura que las relaciones dependientes se limpien con el documento.
ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS favorites_document_id_fkey,
  ADD CONSTRAINT favorites_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_document_id_fkey,
  ADD CONSTRAINT comments_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.reading_progress
  DROP CONSTRAINT IF EXISTS reading_progress_document_id_fkey,
  ADD CONSTRAINT reading_progress_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

-- Bucket publico de PDFs, si aun no existe.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage: lectura publica; los usuarios gestionan archivos dentro de su carpeta auth.uid()/archivo.pdf.
DROP POLICY IF EXISTS "Public read pdfs" ON storage.objects;
CREATE POLICY "Public read pdfs" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pdfs');

DROP POLICY IF EXISTS "Auth upload pdfs" ON storage.objects;
CREATE POLICY "Auth upload pdfs" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owner update pdfs" ON storage.objects;
CREATE POLICY "Owner update pdfs" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'pdfs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR owner = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owner delete pdfs" ON storage.objects;
CREATE POLICY "Owner delete pdfs" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'pdfs'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR owner = auth.uid())
  );
