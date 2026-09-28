/**
 * Smart Aula — Cliente Supabase
 */
const SmartDB = (() => {
  let client = null;
  let ready = false;
  let readyPromise = null;

  function isConfigured() {
    const c = window.SMART_CONFIG || window.LIBRA_CONFIG || {};
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && !String(c.SUPABASE_URL).includes('Project'));
  }

  function waitForSupabaseLib(ms = 8000) {
    return new Promise((resolve) => {
      if (window.supabase?.createClient) return resolve(true);
      const start = Date.now();
      const t = setInterval(() => {
        if (window.supabase?.createClient) {
          clearInterval(t);
          resolve(true);
        } else if (Date.now() - start > ms) {
          clearInterval(t);
          resolve(false);
        }
      }, 40);
    });
  }

  async function init() {
    if (!isConfigured()) {
      ready = false;
      return null;
    }
    const ok = await waitForSupabaseLib();
    if (!ok) {
      ready = false;
      return null;
    }
    const cfg = window.SMART_CONFIG || window.LIBRA_CONFIG;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });
    ready = true;
    return client;
  }

  readyPromise = init();

  function getClient() {
    return client;
  }

  function normalizeDocumentCategories(row) {
    const source = Array.isArray(row?.categories) && row.categories.length
      ? row.categories
      : row?.category
        ? [row.category]
        : ['General'];
    const seen = new Set();
    const categories = source
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return categories.length ? categories : ['General'];
  }

  function documentMatchesCategory(row, selectedCategory) {
    if (!selectedCategory || selectedCategory === 'all') return true;
    return normalizeDocumentCategories(row).some((value) => value === selectedCategory);
  }

  function documentMatchesSearch(row, search) {
    if (!search) return true;
    const term = search.replace(/[%_]/g, '').trim().toLowerCase();
    if (!term) return true;
    const searchable = [
      row?.title || '',
      row?.description || '',
      row?.category || '',
      ...normalizeDocumentCategories(row),
    ].join(' ').toLowerCase();
    return searchable.includes(term);
  }

  function mapDocument(row, authorName) {
    if (!row) return null;
    const categories = normalizeDocumentCategories(row);
    return {
      id: row.id,
      title: row.title,
      file_url: row.file_url,
      filePath: row.file_path || '',
      description: row.description || '',
      author: authorName || 'Anónimo',
      category: row.category || categories[0] || 'General',
      categories,
      url: row.file_url,
      userId: row.user_id,
      views: row.views || 0,
      downloads: row.downloads || 0,
      likes_count: row.likes_count || 0,
      isPublic: row.is_public !== false,
      createdAt: row.created_at ? String(row.created_at).slice(0, 10) : '',
      updatedAt: row.updated_at ? String(row.updated_at).slice(0, 10) : '',
      popular: (row.views || 0) >= 10,
      recent: true,
    };
  }

  function canAccessDocument(doc, userId) {
    if (!doc) return false;
    if (doc.isPublic !== false) return true;
    return !!userId && doc.userId === userId;
  }

  async function getAuthorName(userId) {
    if (!userId || !ready) return 'Anónimo';
    const { data } = await getClient().from('users').select('username').eq('id', userId).maybeSingle();
    return data?.username || 'Anónimo';
  }

  async function enrichDocuments(rows) {
    const cache = {};
    const out = [];
    for (const row of rows || []) {
      let name = cache[row.user_id];
      if (!name && row.user_id) {
        name = await getAuthorName(row.user_id);
        cache[row.user_id] = name;
      }
      out.push(mapDocument(row, name));
    }
    return out;
  }

  function storagePathFromUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const marker = '/storage/v1/object/public/pdfs/';
      const index = parsed.pathname.indexOf(marker);
      if (index === -1) return '';
      return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    } catch {
      return '';
    }
  }

  function avatarStoragePathFromUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const marker = '/storage/v1/object/public/avatars/';
      const index = parsed.pathname.indexOf(marker);
      if (index === -1) return '';
      return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    } catch {
      return '';
    }
  }

  /** Crea perfil en public.users si no existe (evita error RLS al subir PDF) */
  async function ensureUserProfile(user) {
    if (!ready || !user?.id) return null;
    const existing = await API.getProfile(user.id);
    if (existing) return existing;

    const row = {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
      avatar: user.user_metadata?.avatar_url || null,
      bio: '',
    };

    const { data, error } = await getClient().from('users').upsert(row, { onConflict: 'id' }).select().single();
    if (error) {
      const { data: d2, error: e2 } = await getClient().from('users').insert(row).select().single();
      if (e2) throw new Error(e2.message || 'No se pudo crear el perfil. Ejecuta sql/fix-rls.sql en Supabase.');
      return d2;
    }
    return data;
  }

  const API = {
    isReady: () => ready,
    whenReady: readyPromise,
    getClient,
    ensureUserProfile,

    async getProfile(userId) {
      if (!ready || !userId) return null;
      const { data, error } = await getClient().from('users').select('*').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateProfile(userId, { username, bio, avatar } = {}) {
      if (!ready) throw new Error('Supabase no configurado');
      const payload = {};
      if (typeof username !== 'undefined') payload.username = username;
      if (typeof bio !== 'undefined') payload.bio = bio;
      if (typeof avatar !== 'undefined') payload.avatar = avatar;
      const { data, error } = await getClient().from('users').update(payload).eq('id', userId).select().single();
      if (error) throw error;
      return data;
    },

    async getCategories() {
      if (!ready) return [];
      const { data, error } = await getClient().from('categories').select('*').order('name');
      if (error) throw error;
      return data || [];
    },

    async getDocuments({ limit = 50, category, search } = {}) {
      if (!ready) return [];
      const fetchLimit = category && category !== 'all'
        ? Math.max(limit * 6, 120)
        : search
          ? Math.max(limit * 4, 120)
          : limit;
      const { data, error } = await getClient()
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(fetchLimit);
      if (error) throw error;
      const filtered = (data || [])
        .filter((row) => documentMatchesCategory(row, category))
        .filter((row) => documentMatchesSearch(row, search))
        .slice(0, limit);
      return enrichDocuments(filtered);
    },

    async getRecent(limit = 8) {
      return API.getDocuments({ limit });
    },

    async getPopular(limit = 8) {
      if (!ready) return [];
      const { data, error } = await getClient().from('documents').select('*').order('views', { ascending: false }).limit(limit);
      if (error) throw error;
      return enrichDocuments(data);
    },

    async getDocument(id) {
      if (!ready || !id) return null;
      const { data, error } = await getClient().from('documents').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDocument(data, await getAuthorName(data.user_id));
    },

    canAccessDocument,

    async getDocumentAccessUrl(doc, userId, { expiresIn = 60, download = false } = {}) {
      if (!ready || !doc) throw new Error('Documento no disponible');
      if (!canAccessDocument(doc, userId)) {
        throw new Error('No tienes permiso para abrir este archivo');
      }

      if (!doc.filePath) {
        if (doc.isPublic !== false && doc.file_url) return doc.file_url;
        throw new Error('Ruta del archivo no disponible');
      }

      if (doc.isPublic !== false) {
        const { data } = getClient().storage.from('pdfs').getPublicUrl(doc.filePath);
        return data?.publicUrl || doc.file_url || '';
      }

      const { data, error } = await getClient()
        .storage
        .from('pdfs')
        .createSignedUrl(doc.filePath, expiresIn, download ? { download: `${doc.title || 'documento'}.pdf` } : undefined);
      if (error) throw new Error(error.message || 'No se pudo generar acceso temporal al PDF');
      return data?.signedUrl || '';
    },

    async getUserDocuments(userId) {
      if (!ready || !userId) return [];
      const { data, error } = await getClient().from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return enrichDocuments(data);
    },

    async insertDocument(meta) {
      if (!ready) throw new Error('Supabase no configurado');
      const categories = normalizeDocumentCategories(meta);
      const payload = {
        ...meta,
        category: meta.category || categories[0] || 'General',
        categories,
      };
      const { data, error } = await getClient().from('documents').insert(payload).select().single();
      if (error) {
        if (error.message?.includes('row-level security') || error.code === '42501') {
          throw new Error('Error de permisos al guardar. Ejecuta sql/fix-rls.sql en Supabase e inicia sesión de nuevo.');
        }
        throw error;
      }
      return data;
    },

    async incrementViews(id, userId) {
      if (!ready || !id || !userId) return false;
      try {
        const { data, error } = await getClient().rpc('track_document_view', { doc_id: id });
        if (error) throw error;
        return !!data;
      } catch (err) {
        console.warn('No se pudo registrar la vista unica. Ejecuta sql/document-views.sql en Supabase.', err);
        try {
          const doc = await API.getDocument(id);
          if (!doc || doc.userId !== userId) return false;
          await getClient().from('documents').update({ views: (doc.views || 0) + 1 }).eq('id', id).eq('user_id', userId);
          return true;
        } catch {
          return false;
        }
      }
    },

    async incrementDownloads(id) {
      if (!ready || !id) return;
      const doc = await API.getDocument(id);
      if (!doc) return;
      await getClient().from('documents').update({ downloads: (doc.downloads || 0) + 1 }).eq('id', id);
    },

    async uploadPdf(file, userId) {
      if (!ready) throw new Error('Supabase no configurado');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${userId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await getClient().storage.from('pdfs').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf',
      });
      if (upErr) throw new Error(upErr.message || 'Error al subir archivo. Revisa el bucket "pdfs" en Storage.');
      const { data: urlData } = getClient().storage.from('pdfs').getPublicUrl(path);
      return { path, publicUrl: urlData.publicUrl };
    },

    async uploadAvatar(file, userId) {
      if (!ready) throw new Error('Supabase no configurado');
      if (!file || !userId) throw new Error('Avatar no valido');
      const ext = (file.type || 'image/jpeg').split('/')[1] || 'jpg';
      const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const path = `${userId}/avatar_${Date.now()}.${safeExt}`;
      const { error: upErr } = await getClient().storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/jpeg',
      });
      if (upErr) throw new Error(upErr.message || 'Error al subir avatar. Crea el bucket "avatars" en Supabase.');
      const { data: urlData } = getClient().storage.from('avatars').getPublicUrl(path);
      return { path, publicUrl: urlData.publicUrl };
    },

    async deleteAvatar(avatarUrl) {
      if (!ready || !avatarUrl) return;
      const storagePath = avatarStoragePathFromUrl(avatarUrl);
      if (!storagePath) return;
      const { error } = await getClient().storage.from('avatars').remove([storagePath]);
      if (error) {
        console.warn('No se pudo eliminar el avatar anterior:', error.message);
      }
    },

    async updateDocument(documentId, userId, { title, description, category, categories, is_public }) {
      if (!ready) throw new Error('Supabase no configurado');
      if (!documentId || !userId) throw new Error('Documento no válido');
      const normalizedCategories = normalizeDocumentCategories({ categories, category });
      const payload = {
        title,
        description,
        category: category || normalizedCategories[0] || 'General',
        categories: normalizedCategories,
        updated_at: new Date().toISOString(),
      };
      if (typeof is_public !== 'undefined') payload.is_public = !!is_public;
      const { data, error } = await getClient()
        .from('documents')
        .update(payload)
        .eq('id', documentId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new Error(error.message || 'No se pudo actualizar el PDF');
      return mapDocument(data, await getAuthorName(data.user_id));
    },

    async deleteDocument(documentId, userId) {
      if (!ready) throw new Error('Supabase no configurado');
      if (!documentId || !userId) throw new Error('Documento no válido');

      const doc = await API.getDocument(documentId);
      if (!doc) throw new Error('Documento no encontrado');
      if (doc.userId !== userId) throw new Error('Solo puedes eliminar tus propios PDFs');

      const { error } = await getClient()
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('user_id', userId);
      if (error) throw new Error(error.message || 'No se pudo eliminar el PDF');

      const storagePath = doc.filePath || storagePathFromUrl(doc.file_url);
      if (storagePath) {
        const { error: storageError } = await getClient().storage.from('pdfs').remove([storagePath]);
        if (storageError) {
          console.warn('No se pudo eliminar el archivo del Storage:', storageError.message);
        }
      }
      return true;
    },

    async getFavoriteIds(userId) {
      if (!ready || !userId) return [];
      const { data, error } = await getClient().from('favorites').select('document_id').eq('user_id', userId);
      if (error) throw error;
      return (data || []).map((f) => f.document_id);
    },

    async getLikeIds(userId) {
      if (!ready || !userId) return [];
      const { data, error } = await getClient().from('likes').select('document_id').eq('user_id', userId);
      if (error) throw error;
      return (data || []).map((row) => row.document_id);
    },

    async getFavoriteDocuments(userId) {
      const ids = await API.getFavoriteIds(userId);
      if (!ids.length) return [];
      const { data, error } = await getClient().from('documents').select('*').in('id', ids);
      if (error) throw error;
      return enrichDocuments(data);
    },

    async getCollections(userId) {
      if (!ready || !userId) return [];
      const { data, error } = await getClient()
        .from('collections')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getCollection(collectionId) {
      if (!ready || !collectionId) return null;
      const { data, error } = await getClient()
        .from('collections')
        .select('*')
        .eq('id', collectionId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async createCollection(userId, { name, description = '' }) {
      if (!ready || !userId) throw new Error('Inicia sesión para crear colecciones');
      const payload = {
        user_id: userId,
        name: String(name || '').trim(),
        description: String(description || '').trim(),
      };
      if (!payload.name) throw new Error('Ponle un nombre a la colección');
      const { data, error } = await getClient()
        .from('collections')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateCollection(collectionId, userId, updates = {}) {
      if (!ready || !collectionId || !userId) throw new Error('Colección no válida');
      const payload = {
        updated_at: new Date().toISOString(),
      };
      if ('name' in updates) payload.name = String(updates.name || '').trim();
      if ('description' in updates) payload.description = String(updates.description || '').trim();
      if ('is_public' in updates) payload.is_public = !!updates.is_public;
      if ('name' in payload && !payload.name) throw new Error('Ponle un nombre a la colección');

      const { data, error } = await getClient()
        .from('collections')
        .update(payload)
        .eq('id', collectionId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteCollection(collectionId, userId) {
      if (!ready || !collectionId || !userId) throw new Error('Colección no válida');
      const { error } = await getClient()
        .from('collections')
        .delete()
        .eq('id', collectionId)
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    },

    async addDocumentToCollection(collectionId, documentId) {
      if (!ready || !collectionId || !documentId) throw new Error('Colección o documento no válido');
      const { error } = await getClient()
        .from('collection_items')
        .upsert(
          { collection_id: collectionId, document_id: documentId },
          { onConflict: 'collection_id,document_id' }
        );
      if (error) throw error;
      await getClient().from('collections').update({ updated_at: new Date().toISOString() }).eq('id', collectionId);
      return true;
    },

    async removeDocumentFromCollection(collectionId, documentId) {
      if (!ready || !collectionId || !documentId) throw new Error('Colección o documento no válido');
      const { error } = await getClient()
        .from('collection_items')
        .delete()
        .eq('collection_id', collectionId)
        .eq('document_id', documentId);
      if (error) throw error;
      await getClient().from('collections').update({ updated_at: new Date().toISOString() }).eq('id', collectionId);
      return true;
    },

    async getCollectionDocuments(collectionId) {
      if (!ready || !collectionId) return [];
      const { data: items, error } = await getClient()
        .from('collection_items')
        .select('document_id, created_at')
        .eq('collection_id', collectionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (items || []).map((item) => item.document_id);
      if (!ids.length) return [];
      const { data: docs, error: docsError } = await getClient().from('documents').select('*').in('id', ids);
      if (docsError) throw docsError;
      const order = new Map(ids.map((id, index) => [id, index]));
      const sorted = (docs || []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return enrichDocuments(sorted);
    },

    /* Likes API */
    async isLiked(userId, documentId) {
      if (!ready || !userId) return false;
      const { data } = await getClient().from('likes').select('id').eq('user_id', userId).eq('document_id', documentId).maybeSingle();
      return !!data;
    },

    async toggleLike(userId, documentId) {
      if (!ready || !userId) throw new Error('Inicia sesión para dar like');
      const liked = await API.isLiked(userId, documentId);
      if (liked) {
        const { error } = await getClient().from('likes').delete().eq('user_id', userId).eq('document_id', documentId);
        if (error) throw error;
        return false;
      }
      const { error } = await getClient().from('likes').insert({ user_id: userId, document_id: documentId });
      if (error) throw error;
      return true;
    },

    async getLikesCount(documentId) {
      if (!ready || !documentId) return 0;
      const { count, error } = await getClient().from('likes').select('id', { count: 'exact', head: true }).eq('document_id', documentId);
      if (error) throw error;
      return count || 0;
    },

    async isFavorite(userId, documentId) {
      if (!ready || !userId) return false;
      const { data } = await getClient().from('favorites').select('id').eq('user_id', userId).eq('document_id', documentId).maybeSingle();
      return !!data;
    },

    async toggleFavorite(userId, documentId) {
      if (!ready || !userId) throw new Error('Inicia sesión para guardar favoritos');
      if (await API.isFavorite(userId, documentId)) {
        await getClient().from('favorites').delete().eq('user_id', userId).eq('document_id', documentId);
        return false;
      }
      const { error } = await getClient().from('favorites').insert({ user_id: userId, document_id: documentId });
      if (error) throw error;
      return true;
    },

    async getComments(documentId) {
      if (!ready) return [];
      const { data: comments, error } = await getClient().from('comments').select('*').eq('document_id', documentId).order('created_at', { ascending: true });
      if (error) throw error;
      const ids = [...new Set((comments || []).map((c) => c.user_id))];
      let names = {};
      if (ids.length) {
        const { data: users } = await getClient().from('users').select('id, username').in('id', ids);
        names = Object.fromEntries((users || []).map((u) => [u.id, u.username]));
      }
      return (comments || []).map((c) => ({
        id: c.id,
        author: names[c.user_id] || 'Usuario',
        text: c.content,
        date: c.created_at ? String(c.created_at).slice(0, 10) : '',
      }));
    },

    async addComment(userId, documentId, content) {
      if (!ready) throw new Error('Inicia sesión para comentar');
      const { error } = await getClient().from('comments').insert({ user_id: userId, document_id: documentId, content });
      if (error) throw error;
    },

    async getReadingProgress(userId) {
      if (!ready || !userId) return {};
      const { data: rows, error } = await getClient().from('reading_progress').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(10);
      if (error) throw error;
      const map = {};
      for (const row of rows || []) {
        const { data: doc } = await getClient().from('documents').select('id, title, category, categories').eq('id', row.document_id).maybeSingle();
        map[row.document_id] = { progress: row.progress || 0, lastPage: row.current_page || 1, doc };
      }
      return map;
    },

    async upsertReadingProgress(userId, documentId, { currentPage, totalPages, progress }) {
      if (!ready || !userId) return;
      await getClient().from('reading_progress').upsert(
        {
          user_id: userId,
          document_id: documentId,
          current_page: currentPage,
          total_pages: totalPages,
          progress,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,document_id' }
      );
    },

    async getStats(userId) {
      if (!ready) return { total: 0, favorites: 0, uploaded: 0 };
      const { count: total } = await getClient().from('documents').select('*', { count: 'exact', head: true });
      const favs = userId ? await API.getFavoriteIds(userId) : [];
      const { count: uploaded } = userId
        ? await getClient().from('documents').select('*', { count: 'exact', head: true }).eq('user_id', userId)
        : { count: 0 };
      return { total: total || 0, favorites: favs.length, uploaded: uploaded || 0 };
    },
  };

  return API;
})();

// Alias compatibilidad
SmartDB;
