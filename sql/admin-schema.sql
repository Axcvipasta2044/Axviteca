-- Smart Aula — Sistema ADMIN Profesional
-- Extensión de schema.sql
-- IMPORTANTE: Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql
-- NO reemplaza tablas existentes, SOLO agrega lo necesario

-- ─────────────────────────────────────────────────────────────────────────
-- 1. TIPOS Y ENUMERACIONES
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('user', 'admin', 'superadmin');
CREATE TYPE action_type AS ENUM ('created', 'updated', 'deleted', 'banned', 'role_changed', 'moderated');
CREATE TYPE document_status AS ENUM ('published', 'flagged', 'moderated', 'deleted');


-- ─────────────────────────────────────────────────────────────────────────
-- 2. AGREGAR COLUMNAS A TABLAS EXISTENTES
-- ─────────────────────────────────────────────────────────────────────────

-- Agregar columna role a users (user, admin, superadmin)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user'::user_role,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ban_reason TEXT,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Agregar columna status a documents (para moderation)
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS status document_status DEFAULT 'published'::document_status,
ADD COLUMN IF NOT EXISTS flagged_reason TEXT,
ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS flagged_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Agregar columna is_deleted para soft delete en comments
ALTER TABLE public.comments
ADD COLUMN IF NOT EXISTS is_moderated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS moderation_reason TEXT;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. NUEVA TABLA: LIKES
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_document ON public.likes(document_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. NUEVA TABLA: AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action action_type NOT NULL,
  target_type TEXT NOT NULL, -- 'user', 'document', 'comment'
  target_id UUID NOT NULL,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);


-- ─────────────────────────────────────────────────────────────────────────
-- 5. NUEVA TABLA: REPORT / FLAG SYSTEM
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- 'document', 'comment', 'user'
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, reviewing, resolved, rejected
  handled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports(created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────
-- 6. FUNCIÓN: VALIDAR ROLE
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role IN ('admin'::user_role, 'superadmin'::user_role)
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'superadmin'::user_role
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'user'::user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 7. FUNCIÓN: CAMBIAR ROLE (solo superadmin)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_admin_role(target_user_id UUID, new_role user_role)
RETURNS BOOLEAN AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Obtener rol del que intenta cambiar
  admin_role := (SELECT role FROM public.users WHERE id = auth.uid());
  
  -- Solo superadmin puede cambiar roles
  IF admin_role != 'superadmin'::user_role THEN
    RAISE EXCEPTION 'Only superadmin can change roles';
  END IF;
  
  -- Evitar que alguien se asigne a sí mismo como superadmin
  IF target_user_id = auth.uid() AND new_role = 'superadmin'::user_role THEN
    RAISE EXCEPTION 'Cannot assign yourself as superadmin';
  END IF;
  
  -- Actualizar rol
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
  
  -- Log en audit
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, details)
  VALUES (auth.uid(), 'role_changed'::action_type, 'user', target_user_id, target_user_id, 
    jsonb_build_object('new_role', new_role::TEXT));
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 8. FUNCIÓN: BAN USER
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ban_user(target_user_id UUID, reason TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verificar que es admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can ban users';
  END IF;
  
  -- Evitar que admin se banee a sí mismo
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;
  
  -- Evitar bannear superadmin si no eres superadmin
  IF NOT public.is_superadmin() THEN
    IF (SELECT role FROM public.users WHERE id = target_user_id) = 'superadmin'::user_role THEN
      RAISE EXCEPTION 'Only superadmin can ban other superadmins';
    END IF;
  END IF;
  
  -- Ban user
  UPDATE public.users
  SET is_banned = TRUE, ban_reason = reason, banned_at = NOW()
  WHERE id = target_user_id;
  
  -- Log
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, details)
  VALUES (auth.uid(), 'banned'::action_type, 'user', target_user_id, target_user_id,
    jsonb_build_object('reason', reason));
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 9. FUNCIÓN: UNBAN USER (solo superadmin)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unban_user(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can unban users';
  END IF;
  
  UPDATE public.users
  SET is_banned = FALSE, ban_reason = NULL, banned_at = NULL
  WHERE id = target_user_id;
  
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, target_user_id, details)
  VALUES (auth.uid(), 'updated'::action_type, 'user', target_user_id, target_user_id,
    jsonb_build_object('action', 'unban'));
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 10. FUNCIÓN: FLAG / MODERATE DOCUMENT
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.moderate_document(doc_id UUID, flag_reason TEXT, new_status document_status)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can moderate documents';
  END IF;
  
  UPDATE public.documents
  SET status = new_status, flagged_reason = flag_reason, flagged_at = NOW(), flagged_by = auth.uid()
  WHERE id = doc_id;
  
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'moderated'::action_type, 'document', doc_id,
    jsonb_build_object('reason', flag_reason, 'new_status', new_status::TEXT));
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 11. FUNCIÓN: MODERATE COMMENT
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.moderate_comment(comment_id UUID, reason TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can moderate comments';
  END IF;
  
  UPDATE public.comments
  SET is_moderated = TRUE, moderated_by = auth.uid(), moderated_at = NOW(), moderation_reason = reason
  WHERE id = comment_id;
  
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'moderated'::action_type, 'comment', comment_id,
    jsonb_build_object('reason', reason));
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────
-- 12. HABILITAR ROW LEVEL SECURITY EN NUEVAS TABLAS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────
-- 13. RLS POLICIES: LIKES
-- ─────────────────────────────────────────────────────────────────────────

CREATE POLICY "likes_select_public" ON public.likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_own" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own" ON public.likes FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 14. RLS POLICIES: AUDIT LOGS (solo admin)
-- ─────────────────────────────────────────────────────────────────────────

CREATE POLICY "audit_select_admin" ON public.audit_logs
FOR SELECT USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 15. RLS POLICIES: REPORTS (cualquiera puede crear, admin puede ver/actualizar)
-- ─────────────────────────────────────────────────────────────────────────

CREATE POLICY "reports_select_admin" ON public.reports
FOR SELECT USING (public.is_admin() OR auth.uid() = user_id);

CREATE POLICY "reports_insert_auth" ON public.reports
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reports_update_admin" ON public.reports
FOR UPDATE USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 16. ACTUALIZAR RLS POLICIES: USERS (admin puede ver/modificar)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
FOR UPDATE USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users
FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 17. ACTUALIZAR RLS POLICIES: DOCUMENTS (admin puede moderar/eliminar)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_delete_own" ON public.documents;
CREATE POLICY "documents_delete_own" ON public.documents
FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own" ON public.documents
FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 18. ACTUALIZAR RLS POLICIES: COMMENTS (admin puede moderar)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "comments_update_admin" ON public.comments;
CREATE POLICY "comments_update_admin" ON public.comments
FOR UPDATE USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 19. TRIGGER: ACTUALIZAR LIKES_COUNT AL AGREGAR/ELIMINAR LIKE
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.documents
    SET likes_count = (SELECT COUNT(*) FROM public.likes WHERE document_id = NEW.document_id)
    WHERE id = NEW.document_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.documents
    SET likes_count = (SELECT COUNT(*) FROM public.likes WHERE document_id = OLD.document_id)
    WHERE id = OLD.document_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_likes_change ON public.likes;
CREATE TRIGGER on_likes_change
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.update_likes_count();


-- ─────────────────────────────────────────────────────────────────────────
-- 20. VER (VIEWS) PARA ESTADÍSTICAS DE ADMIN
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.admin_stats AS
SELECT
  (SELECT COUNT(*) FROM public.users) as total_users,
  (SELECT COUNT(*) FROM public.users WHERE is_banned = TRUE) as banned_users,
  (SELECT COUNT(*) FROM public.documents) as total_documents,
  (SELECT COUNT(*) FROM public.documents WHERE status = 'flagged'::document_status) as flagged_documents,
  (SELECT COUNT(*) FROM public.comments) as total_comments,
  (SELECT COUNT(*) FROM public.comments WHERE is_moderated = TRUE) as moderated_comments,
  (SELECT COUNT(*) FROM public.reports WHERE status = 'pending') as pending_reports,
  (SELECT COUNT(*) FROM public.users WHERE role != 'user'::user_role) as admin_count;

-- Nota: Las vistas heredan RLS de las tablas base. La validación de admin ocurre en el código JS.


-- ─────────────────────────────────────────────────────────────────────────
-- 21. ÍNDICES PARA PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_banned ON public.users(is_banned);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_comments_moderated ON public.comments(is_moderated);
CREATE INDEX IF NOT EXISTS idx_reports_target ON public.reports(target_type, target_id);


-- ─────────────────────────────────────────────────────────────────────────
-- IMPORTANTE: EJECUTAR DESPUÉS EN SUPABASE STORAGE POLICIES
-- ─────────────────────────────────────────────────────────────────────────
-- 
-- Storage → pdfs bucket → Policies:
--
-- SELECT (público):
-- CREATE POLICY "Public read pdfs"
-- ON storage.objects FOR SELECT USING (bucket_id = 'pdfs');
--
-- INSERT (autenticados):
-- CREATE POLICY "Auth upload pdfs"
-- ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'pdfs' AND 
--   auth.role() = 'authenticated'
-- );
--
-- DELETE (propietario y admin):
-- CREATE POLICY "Owner and admin delete pdfs"
-- ON storage.objects FOR DELETE USING (
--   bucket_id = 'pdfs' AND (
--     auth.uid()::text = (storage.foldername(name))[1] OR
--     (SELECT public.is_admin() FROM public.users WHERE id = auth.uid())
--   )
-- );
--
-- UPDATE (propietario y admin):
-- CREATE POLICY "Owner and admin manage pdfs"
-- ON storage.objects FOR UPDATE USING (
--   bucket_id = 'pdfs' AND (
--     auth.uid()::text = (storage.foldername(name))[1] OR
--     (SELECT public.is_admin() FROM public.users WHERE id = auth.uid())
--   )
-- );

-- ─────────────────────────────────────────────────────────────────────────
-- FIN DEL SCHEMA DE ADMIN
-- ─────────────────────────────────────────────────────────────────────────
