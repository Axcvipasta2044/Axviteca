/**
 * Smart Aula — Autenticación
 */
const SmartAuth = (() => {
  const LOGIN_PAGE = 'login.html';
  const AUTH_REQUIRED = ['upload.html', 'profile.html', 'collections.html'];

  function getClient() {
    return SmartDB.getClient();
  }

  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  function basePath() {
    const path = window.location.pathname;
    const last = path.split('/').pop();
    if (!last || !last.includes('.')) return path.endsWith('/') ? path : path + '/';
    return path.slice(0, path.lastIndexOf('/') + 1);
  }

  async function getSession() {
    await SmartDB.whenReady;
    if (!SmartDB.isReady()) return null;
    const { data } = await getClient().auth.getSession();
    return data?.session ?? null;
  }

  async function getUser() {
    await SmartDB.whenReady;
    if (!SmartDB.isReady()) return null;
    const { data: { user }, error } = await getClient().auth.getUser();
    if (error || !user) return null;
    return user;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(normalizeEmail(email));
  }

  /**
   * Comprueba si un correo ya está registrado (tabla public.users de lectura pública).
   * Devuelve true/false, o null si no se pudo comprobar.
   */
  async function emailExists(email) {
    if (!SmartDB.isReady()) return null;
    try {
      const { data, error } = await getClient()
        .from('users')
        .select('id')
        .ilike('email', normalizeEmail(email))
        .limit(1);
      if (error) return null;
      return Array.isArray(data) ? data.length > 0 : !!data;
    } catch {
      return null;
    }
  }

  function translateAuthError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
      return 'Debes confirmar tu correo antes de entrar. Revisa tu bandeja o desactiva "Confirm email" en Supabase → Authentication → Providers → Email.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid')) {
      return 'Correo o contraseña incorrectos. Si acabas de registrarte, confirma tu email primero. Usa el mismo correo que al registrarte.';
    }
    if (msg.includes('user already registered')) {
      return 'Este correo ya está registrado. Inicia sesión en lugar de crear otra cuenta.';
    }
    return err?.message || 'Error de autenticación';
  }

  async function requireAuth() {
    const page = window.location.pathname.split('/').pop() || '';
    if (!AUTH_REQUIRED.includes(page)) return true;

    await SmartDB.whenReady;
    if (!SmartDB.isReady()) {
      SmartUI?.Toast?.show('Configura Supabase en js/config.js');
      return false;
    }

    const session = await getSession();
    if (!session) {
      window.location.href = `${LOGIN_PAGE}?redirect=${encodeURIComponent(page)}`;
      return false;
    }
    const user = await getUser();
    if (user) await SmartDB.ensureUserProfile(user);
    return true;
  }

  async function signIn(email, password) {
    if (!SmartDB.isReady()) throw new Error('Supabase no configurado');
    const clean = normalizeEmail(email);

    if (!clean) throw new Error('Escribe tu correo para entrar.');
    if (!isValidEmail(clean)) {
      throw new Error('Ese correo no es válido. Escribe uno como nombre@dominio.com');
    }

    const { data, error } = await getClient().auth.signInWithPassword({
      email: clean,
      password,
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const isBadCredentials = msg.includes('invalid login credentials') || msg.includes('invalid') || msg.includes('user not found');
      if (isBadCredentials) {
        const exists = await emailExists(clean);
        if (exists === false) {
          throw new Error(
            'Este correo no existe. Verifica que esté bien escrito, confirma tu correo si acabas de registrarte, o crea una cuenta gratis.'
          );
        }
        if (exists === true) {
          throw new Error('El correo existe, pero la contraseña es incorrecta. Inténtalo de nuevo o restablécela.');
        }
      }
      if (msg.includes('user not found')) {
        throw new Error('Este correo no existe. Verifica que esté bien escrito o crea una cuenta gratis.');
      }
      throw new Error(translateAuthError(error));
    }
    if (data?.user) await SmartDB.ensureUserProfile(data.user);
    return data;
  }

  async function signUp(email, password, username) {
    if (!SmartDB.isReady()) throw new Error('Supabase no configurado');
    const clean = normalizeEmail(email);
    if (!clean) throw new Error('Escribe tu correo para crear la cuenta.');
    if (!isValidEmail(clean)) {
      throw new Error('Ese correo no es válido. Escribe uno como nombre@dominio.com');
    }
    const alreadyExists = await emailExists(clean);
    if (alreadyExists === true) {
      throw new Error('Este correo ya está registrado. Inicia sesión en lugar de crear otra cuenta.');
    }
    const { data, error } = await getClient().auth.signUp({
      email: clean,
      password,
      options: {
        data: { username: username || clean.split('@')[0] },
        emailRedirectTo: window.location.origin + basePath() + 'login.html',
      },
    });
    if (error) throw new Error(translateAuthError(error));
    if (data?.user) await SmartDB.ensureUserProfile(data.user);
    return data;
  }

  async function signInWithGoogle() {
    if (!SmartDB.isReady()) throw new Error('Supabase no configurado');
    const redirectTo = window.location.origin + basePath() + 'dashboard.html';
    const { data, error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
    return data;
  }

  async function resetPassword(email) {
    if (!SmartDB.isReady()) throw new Error('Supabase no configurado');
    const { error } = await getClient().auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: window.location.origin + basePath() + 'login.html',
    });
    if (error) throw error;
  }

  async function signOut() {
    if (SmartDB.isReady()) await getClient().auth.signOut();
    updateNavbar(null);
    window.location.href = 'index.html';
  }

  async function hydrateSidebar() {
    const user = await getUser();
    if (!user) return;
    const profile = await SmartDB.getProfile(user.id);
    const name = profile?.username || user.email?.split('@')[0] || 'Usuario';
    const email = profile?.email || user.email || '';
    document.querySelectorAll('.sidebar__avatar').forEach((el) => {
      if (profile?.avatar) {
        el.innerHTML = `<img src="${profile.avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
      } else {
        el.textContent = SmartUI.initials(name);
      }
    });
    document.querySelectorAll('.sidebar__user-name').forEach((el) => (el.textContent = name));
    document.querySelectorAll('.sidebar__user-email').forEach((el) => (el.textContent = email));
  }

  function updateNavbar(session) {
    const name = session?.user
      ? session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'Mi cuenta'
      : null;

    ['nav-login', 'nav-login-mobile'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (name) {
        btn.textContent = 'Perfil';
        btn.href = 'profile.html';
      } else {
        btn.textContent = 'Ingresar';
        btn.href = 'login.html';
      }
    });

    // Actualiza el botón del hero (Ingresar / Subir) para que lleve a upload si hay sesión
    const heroBtn = document.getElementById('hero-auth');
    if (heroBtn) {
      if (name) heroBtn.href = 'upload.html';
      else heroBtn.href = 'login.html';
    }
  }

  function initAuthListener() {
    if (!SmartDB.isReady()) return;
    getClient().auth.onAuthStateChange((event, session) => {
      updateNavbar(session);
      if (event === 'SIGNED_IN' && session?.user) {
        SmartDB.ensureUserProfile(session.user).catch(() => {});
      }
    });
    getSession().then((s) => updateNavbar(s));
  }

  function initLoginPage() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || 'dashboard.html';
    const isRegister = params.get('mode') === 'register';

    const form = document.getElementById('auth-form');
    const titleEl = document.getElementById('auth-title');
    const subtitleEl = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit');
    const toggleMode = document.getElementById('toggle-mode');
    const usernameGroup = document.getElementById('username-group');
    const googleBtn = document.getElementById('google-login');
    const alertEl = document.getElementById('auth-alert');

    let registerMode = isRegister;

    function setMode(register) {
      registerMode = register;
      if (titleEl) titleEl.textContent = register ? 'Crear cuenta' : 'Bienvenido de nuevo';
      if (subtitleEl) subtitleEl.textContent = register ? 'Únete a Smart Aula — es gratis' : 'Inicia sesión para subir y guardar PDFs';
      if (submitBtn) submitBtn.textContent = register ? 'Registrarse' : 'Entrar';
      if (toggleMode) {
        toggleMode.innerHTML = register
          ? '¿Ya tienes cuenta? <a href="login.html">Iniciar sesión</a>'
          : '¿No tienes cuenta? <a href="login.html?mode=register">Crear cuenta</a>';
      }
      usernameGroup?.classList.toggle('hidden', !register);
      const pwd = form?.querySelector('[name="password"]');
      if (pwd) pwd.autocomplete = register ? 'new-password' : 'current-password';
      alertEl?.classList.remove('is-visible');
    }

    setMode(registerMode);

    function showAlert(msg, type = 'error', opts = {}) {
      if (!alertEl) return;
      alertEl.textContent = msg;
      alertEl.className = `auth-alert auth-alert--${type} is-visible`;
      if (opts.registerLink && !registerMode) {
        const link = document.createElement('a');
        link.href = 'login.html?mode=register';
        link.className = 'link';
        link.textContent = 'Crear cuenta';
        alertEl.append(' ', link);
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          setMode(true);
          markField('');
        });
      }
      if (opts.loginLink) {
        const link = document.createElement('a');
        link.href = 'login.html';
        link.className = 'link';
        link.textContent = 'Iniciar sesión';
        alertEl.append(' ', link);
      }
    }

    const emailInput = form?.querySelector('[name="email"]');
    const passwordInput = form?.querySelector('[name="password"]');

    function clearFieldError(input) {
      if (!input) return;
      input.classList.remove('input--error');
      input.removeAttribute('aria-invalid');
    }

    [emailInput, passwordInput].forEach((input) => {
      input?.addEventListener('input', () => clearFieldError(input));
    });

    // Resalta el campo que originó el error (según el mensaje)
    function markField(msg) {
      const m = (msg || '').toLowerCase();
      let target = null;
      if (m.includes('correo o contraseña')) {
        target = null;
      } else if (m.includes('contraseña')) {
        target = passwordInput;
      } else if (m.includes('correo')) {
        target = emailInput;
      }
      [emailInput, passwordInput].forEach(clearFieldError);
      if (target) {
        target.classList.add('input--error');
        target.setAttribute('aria-invalid', 'true');
        target.focus();
      }
      return target;
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('[name="email"]')?.value;
      const password = form.querySelector('[name="password"]')?.value;
      const username = form.querySelector('[name="username"]')?.value?.trim();

      if (!email || !email.trim()) {
        showAlert('Escribe tu correo para continuar.');
        markField('correo');
        return;
      }
      if (!SmartAuth.isValidEmail(email)) {
        showAlert('Ese correo no es válido. Escribe uno como nombre@dominio.com');
        markField('correo');
        return;
      }
      if (!password) {
        showAlert('Escribe tu contraseña para continuar.');
        markField('contraseña');
        return;
      }

      submitBtn.disabled = true;
      try {
        if (registerMode) {
          const data = await signUp(email, password, username);
          if (data?.session) {
            SmartUI.Toast.show('¡Cuenta creada! Entrando…');
            await getSession();
            updateNavbar(data.session);
            window.location.href = redirect;
          } else {
            showAlert(
              'Cuenta creada. Si no entras con tu contraseña, confirma tu correo o desactiva "Confirm email" en Supabase (Authentication → Email).',
              'success'
            );
          }
        } else {
          const data = await signIn(email, password);
          if (!data?.session) throw new Error('No se pudo iniciar sesión');
          SmartUI.Toast.show('¡Bienvenido!');
          updateNavbar(data.session);
          window.location.href = redirect;
        }
      } catch (err) {
        const message = translateAuthError(err);
        if (/ya está registrado/i.test(message) && registerMode) {
          setMode(false);
          showAlert(message, 'error', { loginLink: true });
          markField('correo');
        } else {
          showAlert(message, 'error', { registerLink: /no existe/i.test(message) });
          markField(message);
        }
      } finally {
        submitBtn.disabled = false;
      }
    });

    googleBtn?.addEventListener('click', async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        showAlert(translateAuthError(err));
      }
    });

    document.getElementById('forgot-password')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = form.querySelector('[name="email"]')?.value;
      if (!email || !email.trim()) return showAlert('Escribe tu correo primero');
      if (!SmartAuth.isValidEmail(email)) {
        showAlert('Ese correo no es válido. Escribe uno como nombre@dominio.com');
        return markField('correo');
      }
      try {
        const exists = await SmartAuth.emailExists(email);
        if (exists === false) {
          showAlert('Este correo no existe. Verifica que esté bien escrito o crea una cuenta gratis.', 'error', { registerLink: true });
          return markField('correo');
        }
        await resetPassword(email);
        showAlert('Te enviamos un enlace para restablecer la contraseña.', 'success');
      } catch (err) {
        showAlert(translateAuthError(err));
      }
    });

    SmartDB.whenReady.then(async () => {
      initAuthListener();
      const s = await getSession();
      if (s) {
        updateNavbar(s);
        window.location.href = redirect;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await SmartDB.whenReady;
    const page = document.body.dataset.page;
    if (page === 'login') initLoginPage();
    else initAuthListener();

    const currentPage = window.location.pathname.split('/').pop() || '';
    if (AUTH_REQUIRED.includes(currentPage)) {
      const ok = await requireAuth();
      if (ok) await hydrateSidebar();
    } else if (await getSession()) {
      await hydrateSidebar();
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => signOut());
  });

  return {
    getSession,
    getUser,
    requireAuth,
    signIn,
    signUp,
    signInWithGoogle,
    resetPassword,
    signOut,
    hydrateSidebar,
    updateNavbar,
    normalizeEmail,
    isValidEmail,
    emailExists,
  };
})();

SmartAuth;
