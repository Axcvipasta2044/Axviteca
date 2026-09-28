-- Smart Aula — Privacidad de documentos
-- Agrega columna is_public y actualiza RLS para que los documentos privados
-- solo sean visibles por su dueño.
-- Ejecutar en Supabase Dashboard → SQL Editor → New query → Run

-- 1. Agregar columna is_public si no existe (con DO block para evitar errores de metadata)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- 2. Índice para búsquedas por visibilidad
CREATE INDEX IF NOT EXISTS idx_documents_public ON public.documents(is_public);

-- 3. Actualizar RLS: documentos privados solo visibles por su dueño
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

-- 4. Verificar que la columna existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
  AND column_name = 'is_public';
