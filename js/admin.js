/**
 * Smart Aula — Admin Panel Module
 * Maneja autenticación, autorización, y funciones comunes del panel admin
 */

const SmartAdmin = (() => {
  let currentUser = null;
  let userRole = null;
  let currentProfile = null;

  const THEME_KEY = 'smart-aula-theme';

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#111827' : '#2563eb');
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const icon = button.querySelector('.theme-toggle__icon');
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
      button.title = isDark ? 'Modo claro' : 'Modo oscuro';
      if (icon) {
        icon.innerHTML = isDark
          ? '<span aria-hidden="true">☀</span>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>';
      }
    });
  }

  function applySavedTheme() {
    let theme = 'light';
    try {
      theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
      console.warn('No se pudo leer la preferencia de tema.', error);
    }
    applyTheme(theme);
  }

  applySavedTheme();

  /** Añade el botón de tema al panel (se agrega al final para no alterar
   *  el primer botón de acciones, que es el de "Actualizar"). */
  function initThemeToggle() {
    const host = document.querySelector('.admin-topbar__actions');
    if (!host || host.querySelector('[data-theme-toggle]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle theme-toggle--compact';
    button.dataset.themeToggle = '';
    button.innerHTML = '<span class="theme-toggle__icon" aria-hidden="true"></span>';
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        console.warn('No se pudo guardar la preferencia de tema.', error);
      }
      applyTheme(next);
    });
    host.appendChild(button);
    applyTheme(document.documentElement.dataset.theme);
  }

  initThemeToggle();

  /** Menú lateral deslizante para celulares y tablets. */
  function initMobileNav() {
    const sidebar = document.querySelector('.admin-sidebar');
    const toggle = document.getElementById('admin-menu-toggle');
    const overlay = document.getElementById('admin-overlay');
    if (!sidebar || !toggle) return;

    const setOpen = (open) => {
      sidebar.classList.toggle('is-open', open);
      overlay?.classList.toggle('is-visible', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      document.body.classList.toggle('admin-menu-open', open);
    };

    toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
    overlay?.addEventListener('click', () => setOpen(false));
    sidebar.querySelectorAll('.admin-sidebar__link').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) setOpen(false);
    });
  }

  initMobileNav();

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    return String(name || 'AD')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function avatarMarkup(profileLike, fallbackName) {
    const avatar = profileLike?.avatar || profileLike?.avatar_url;
    const displayName = profileLike?.username || profileLike?.email || fallbackName || 'Admin';
    if (avatar) {
      return `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName)}">`;
    }
    return escapeHtml(initials(displayName));
  }

  function hydrateChrome(profile = currentProfile, options = {}) {
    const roleLabel = options.roleLabel || (userRole === 'superadmin' ? 'Superadmin' : userRole === 'admin' ? 'Admin' : '-');
    const displayName = profile?.username || currentUser?.email || 'Admin';

    document.querySelectorAll('#admin-username').forEach((el) => {
      el.textContent = displayName;
    });
    document.querySelectorAll('#admin-role-display').forEach((el) => {
      el.textContent = roleLabel;
    });
    document.querySelectorAll('#admin-avatar').forEach((el) => {
      el.innerHTML = avatarMarkup(profile, displayName);
    });
  }

  /**
   * Inicializar módulo admin
   * Valida que el usuario sea admin y carga datos necesarios
   */
  async function init() {
    try {
      // Esperar a que Supabase esté listo
      await SmartDB.whenReady;

      // Obtener usuario actual
      const user = await SmartAuth.getUser();
      if (!user) {
        redirectToLogin();
        return false;
      }

      currentUser = user;

      // Obtener rol del usuario
      const profile = await SmartDB.getProfile(user.id);
      currentProfile = profile;
      userRole = profile?.role || 'user';

      // Validar que sea admin o superadmin
      if (!isAdmin()) {
        showUnauthorized();
        return false;
      }

      hydrateChrome(profile);
      return true;
    } catch (err) {
      console.error('Admin init error:', err);
      showError('No se pudo inicializar el panel admin');
      return false;
    }
  }

  /**
   * Verificar si usuario es admin
   */
  function isAdmin() {
    return userRole === 'admin' || userRole === 'superadmin';
  }

  /**
   * Verificar rol del usuario actual (función asíncrona)
   * Consulta el perfil del usuario y retorna su rol
   */
  async function checkUserRole() {
    const user = await SmartAuth.getUser();
    if (!user) return null;
    const profile = await SmartDB.getProfile(user.id);
    return profile?.role || 'user';
  }

  /**
   * Redirigir al panel admin si el usuario es admin/superadmin
   * Si no está autenticado, redirige a login
   * Si no es admin, redirige al dashboard
   */
  async function redirectToAdminIfAuthorized() {
    const user = await SmartAuth.getUser();
    if (!user) {
      window.location.href = 'login.html?redirect=admin.html';
      return false;
    }
    const profile = await SmartDB.getProfile(user.id);
    const role = profile?.role || 'user';
    if (role === 'admin' || role === 'superadmin') {
      window.location.href = 'admin.html';
      return true;
    }
    return false;
  }

  /**
   * Verificar si usuario es superadmin
   */
  function isSuperAdmin() {
    return userRole === 'superadmin';
  }

  /**
   * Obtener rol actual
   */
  function getRole() {
    return userRole;
  }

  /**
   * Obtener usuario actual
   */
  function getCurrentUser() {
    return currentUser;
  }

  /**
   * Redirigir a login si no está autenticado
   */
  function redirectToLogin() {
    window.location.href = 'login.html';
  }

  /**
   * Mostrar mensaje de no autorizado
   */
  function showUnauthorized() {
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px; background: #f8f9fa;">
        <div style="font-size: 64px;"></div>
        <h1 style="font-size: 24px; margin: 0; color: #1f2937;">Acceso Denegado</h1>
        <p style="color: #6b7280; margin: 0; text-align: center;">No tienes permisos para acceder al panel admin</p>
        <a href="/" style="padding: 10px 20px; background: #3b82f6; color: white; border-radius: 6px; text-decoration: none; font-weight: 500;">Volver al inicio</a>
      </div>
    `;
  }

  /**
   * Mostrar error
   */
  function showError(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fee2e2;
      color: #7f1d1d;
      padding: 16px 20px;
      border-radius: 8px;
      border: 1px solid #fecaca;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 9999;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /**
   * Mostrar éxito
   */
  function showSuccess(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #ecfdf5;
      color: #065f46;
      padding: 16px 20px;
      border-radius: 8px;
      border: 1px solid #d1fae5;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 9999;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * Cargar estadísticas del admin
   */
  async function loadStats() {
    try {
      const stats = await SmartDB.getClient()
        .from('admin_stats')
        .select('*')
        .single();

      if (stats.error) throw stats.error;
      return stats.data;
    } catch (err) {
      console.error('Error loading stats:', err);
      return null;
    }
  }

  /**
   * Obtener lista de usuarios con rol especificado
   */
  async function getUsers(role = null) {
    try {
      let query = SmartDB.getClient().from('users').select('*');

      if (role) {
        query = query.eq('role', role);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching users:', err);
      throw err;
    }
  }

  /**
   * Cambiar rol de usuario (solo superadmin)
   */
  async function changeUserRole(userId, newRole) {
    try {
      if (!isSuperAdmin()) {
        throw new Error('Solo el superadmin puede cambiar roles');
      }

      const { error } = await SmartDB.getClient().rpc('grant_admin_role', {
        target_user_id: userId,
        new_role: newRole,
      });

      if (error) throw error;
      showSuccess('Rol actualizado correctamente');
      return true;
    } catch (err) {
      console.error('Error changing role:', err);
      showError(err.message || 'Error al cambiar el rol');
      throw err;
    }
  }

  /**
   * Banear usuario
   */
  async function banUser(userId, reason) {
    try {
      const { error } = await SmartDB.getClient().rpc('ban_user', {
        target_user_id: userId,
        reason: reason,
      });

      if (error) throw error;
      showSuccess('Usuario baneado correctamente');
      return true;
    } catch (err) {
      console.error('Error banning user:', err);
      showError(err.message || 'Error al banear usuario');
      throw err;
    }
  }

  /**
   * Desbanear usuario (solo superadmin)
   */
  async function unbanUser(userId) {
    try {
      if (!isSuperAdmin()) {
        throw new Error('Solo el superadmin puede desbanear usuarios');
      }

      const { error } = await SmartDB.getClient().rpc('unban_user', {
        target_user_id: userId,
      });

      if (error) throw error;
      showSuccess('Usuario desbaneado correctamente');
      return true;
    } catch (err) {
      console.error('Error unbanning user:', err);
      showError(err.message || 'Error al desbanear usuario');
      throw err;
    }
  }

  /**
   * Obtener documentos para moderación
   */
  async function getDocuments(status = null) {
    try {
      let query = SmartDB.getClient().from('documents').select('*, user_id(*), flagged_by(*)');

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching documents:', err);
      throw err;
    }
  }

  /**
   * Moderar documento
   */
  async function moderateDocument(docId, reason, newStatus) {
    try {
      const { error } = await SmartDB.getClient().rpc('moderate_document', {
        doc_id: docId,
        flag_reason: reason,
        new_status: newStatus,
      });

      if (error) throw error;
      showSuccess('Documento moderado correctamente');
      return true;
    } catch (err) {
      console.error('Error moderating document:', err);
      showError(err.message || 'Error al moderar documento');
      throw err;
    }
  }

  /**
   * Eliminar documento
   */
  async function deleteDocument(docId) {
    try {
      if (!confirm('¿Estás seguro de que deseas eliminar este documento?')) {
        return false;
      }

      // Obtener información del documento primero
      const doc = await SmartDB.getDocument(docId);
      if (!doc) throw new Error('Documento no encontrado');

      // Eliminar del Storage
      if (doc.filePath) {
        await SmartDB.getClient().storage.from('pdfs').remove([doc.filePath]);
      }

      // Eliminar del DB
      const { error } = await SmartDB.getClient()
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      showSuccess('Documento eliminado correctamente');
      return true;
    } catch (err) {
      console.error('Error deleting document:', err);
      showError(err.message || 'Error al eliminar documento');
      throw err;
    }
  }

  /**
   * Obtener comentarios para moderación
   */
  async function getComments(onlyModerated = false) {
    try {
      let query = SmartDB.getClient()
        .from('comments')
        .select('*, user_id(*), document_id(*), moderated_by(*)');

      if (onlyModerated) {
        query = query.eq('is_moderated', true);
      } else {
        query = query.eq('is_moderated', false);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching comments:', err);
      throw err;
    }
  }

  /**
   * Moderar comentario
   */
  async function moderateComment(commentId, reason) {
    try {
      const { error } = await SmartDB.getClient().rpc('moderate_comment', {
        comment_id: commentId,
        reason: reason,
      });

      if (error) throw error;
      showSuccess('Comentario moderado correctamente');
      return true;
    } catch (err) {
      console.error('Error moderating comment:', err);
      showError(err.message || 'Error al moderar comentario');
      throw err;
    }
  }

  /**
   * Obtener reportes
   */
  async function getReports(status = null) {
    try {
      let query = SmartDB.getClient().from('reports').select('*');

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching reports:', err);
      throw err;
    }
  }

  /**
   * Obtener logs de auditoría
   */
  async function getAuditLogs(limit = 50) {
    try {
      const { data, error } = await SmartDB.getClient()
        .from('audit_logs')
        .select('*, admin_id(*), target_user_id(*)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      throw err;
    }
  }

  /**
   * Obtener categorías
   */
  async function getCategories() {
    try {
      return await SmartDB.getCategories();
    } catch (err) {
      console.error('Error fetching categories:', err);
      throw err;
    }
  }

  /**
   * Crear categoría
   */
  async function createCategory(name, icon) {
    try {
      const { data, error } = await SmartDB.getClient()
        .from('categories')
        .insert({ name, icon })
        .select()
        .single();

      if (error) throw error;
      showSuccess('Categoría creada correctamente');
      return data;
    } catch (err) {
      console.error('Error creating category:', err);
      showError(err.message || 'Error al crear categoría');
      throw err;
    }
  }

  /**
   * Actualizar categoría
   */
  async function updateCategory(catId, name, icon) {
    try {
      const { data, error } = await SmartDB.getClient()
        .from('categories')
        .update({ name, icon })
        .eq('id', catId)
        .select()
        .single();

      if (error) throw error;
      showSuccess('Categoría actualizada correctamente');
      return data;
    } catch (err) {
      console.error('Error updating category:', err);
      showError(err.message || 'Error al actualizar categoría');
      throw err;
    }
  }

  /**
   * Eliminar categoría
   */
  async function deleteCategory(catId) {
    try {
      if (!confirm('¿Estás seguro de que deseas eliminar esta categoría?')) {
        return false;
      }

      const { error } = await SmartDB.getClient()
        .from('categories')
        .delete()
        .eq('id', catId);

      if (error) throw error;
      showSuccess('Categoría eliminada correctamente');
      return true;
    } catch (err) {
      console.error('Error deleting category:', err);
      showError(err.message || 'Error al eliminar categoría');
      throw err;
    }
  }

  /**
   * Cerrar sesión del admin
   * Si está en el panel admin, redirige al dashboard principal
   */
  async function logout() {
    try {
      await SmartAuth.signOut();
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Error logging out:', err);
      showError('Error al cerrar sesión');
    }
  }

  /**
   * Formatear fecha
   */
  function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Obtener color de badge según estado
   */
  function getBadgeClass(status) {
    const badgeMap = {
      published: 'admin-badge--success',
      flagged: 'admin-badge--warning',
      moderated: 'admin-badge--danger',
      deleted: 'admin-badge--secondary',
      pending: 'admin-badge--warning',
      resolved: 'admin-badge--success',
      rejected: 'admin-badge--secondary',
      admin: 'admin-badge--primary',
      superadmin: 'admin-badge--danger',
      user: 'admin-badge--secondary',
    };
    return badgeMap[status] || 'admin-badge--secondary';
  }

  return {
    init,
    isAdmin,
    isSuperAdmin,
    getRole,
    getCurrentUser,
    redirectToLogin,
    showUnauthorized,
    showError,
    showSuccess,
    loadStats,
    getUsers,
    changeUserRole,
    banUser,
    unbanUser,
    getDocuments,
    moderateDocument,
    deleteDocument,
    getComments,
    moderateComment,
    getReports,
    getAuditLogs,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    logout,
    formatDate,
    getBadgeClass,
    checkUserRole,
    redirectToAdminIfAuthorized,
    hydrateChrome,
    avatarMarkup,
    initials,
  };
})();
