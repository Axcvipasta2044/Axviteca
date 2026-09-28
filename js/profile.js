/**
 * Smart Aula - Perfil
 */
(async function initProfile() {
  await SmartDB.whenReady;
  const ok = await SmartAuth.requireAuth();
  if (!ok) return;

  const user = await SmartAuth.getUser();
  if (!user) return;
  await SmartDB.ensureUserProfile(user);
  await SmartAuth.hydrateSidebar();

  let profile = await SmartDB.getProfile(user.id);
  let avatarDraft = profile?.avatar || '';
  let avatarUploadFile = null;
  let avatarObjectUrl = '';
  let avatarMarkedForRemoval = false;

  const avatarInput = document.getElementById('edit-avatar');
  const pickAvatarBtn = document.getElementById('pick-avatar');
  const removeAvatarBtn = document.getElementById('remove-avatar');

  function isStorageAvatar(url) {
    return /^https?:\/\/.+\/storage\/v1\/object\/public\/avatars\//i.test(String(url || ''));
  }

  function cleanupAvatarObjectUrl() {
    if (avatarObjectUrl) {
      URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = '';
    }
  }

  function renderAvatar(el, name, avatarUrl) {
    if (!el) return;
    if (avatarUrl) {
      el.innerHTML = `<img src="${avatarUrl}" alt="">`;
    } else {
      el.textContent = SmartUI.initials(name);
    }
  }

  function syncAvatarTargets(name) {
    renderAvatar(document.getElementById('profile-avatar'), name, avatarDraft);
    renderAvatar(document.getElementById('profile-avatar-lg'), name, avatarDraft);
    renderAvatar(document.getElementById('profile-avatar-edit'), name, avatarDraft);
    removeAvatarBtn?.classList.toggle('hidden', !avatarDraft);
  }

  function fillProfile(p) {
    const name = p?.username || user.email?.split('@')[0] || 'Usuario';
    if (!avatarUploadFile && !avatarMarkedForRemoval) {
      avatarDraft = p?.avatar || '';
    }
    syncAvatarTargets(name);

    const nameEl = document.getElementById('profile-name-display');
    if (nameEl) nameEl.textContent = name;
    const sidebarName = document.getElementById('profile-name');
    if (sidebarName) sidebarName.textContent = name;
    document.getElementById('profile-email').textContent = p?.email || user.email || '';
    document.getElementById('profile-bio').textContent = p?.bio || '';
    document.getElementById('profile-joined').textContent = p?.created_at
      ? new Date(p.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
      : '-';

    const editName = document.getElementById('edit-name');
    const editBio = document.getElementById('edit-bio');
    if (editName) editName.value = name;
    if (editBio) editBio.value = p?.bio || '';
  }

  async function fileToOptimizedAvatar(file) {
    if (!file) throw new Error('Selecciona una imagen');
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      throw new Error('Usa una imagen JPG, PNG o WebP');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('La imagen es muy pesada. Usa una menor de 8 MB');
    }

    const image = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen'));
      };
      img.src = url;
    });

    const cropSize = Math.min(image.width, image.height);
    const sx = Math.max(0, Math.floor((image.width - cropSize) / 2));
    const sy = Math.max(0, Math.floor((image.height - cropSize) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 320, 320);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('No se pudo preparar la imagen'));
          return;
        }
        resolve(result);
      }, 'image/jpeg', 0.86);
    });

    if (blob.size > 700 * 1024) {
      throw new Error('La imagen sigue siendo muy grande. Prueba otra foto');
    }

    return new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  fillProfile(profile);

  let categories = [];
  try {
    categories = SmartDB.isReady() ? await SmartDB.getCategories() : [];
  } catch (err) {
    console.warn('No se pudieron cargar las categorias del perfil', err);
  }

  let favIds = [];
  try {
    favIds = await SmartDB.getFavoriteIds(user.id);
  } catch (err) {
    console.warn('No se pudieron cargar los favoritos', err);
  }
  document.getElementById('profile-fav-count').textContent = favIds.length;

  let uploaded = [];
  try {
    uploaded = await SmartDB.getUserDocuments(user.id);
  } catch (err) {
    console.error('No se pudieron cargar las subidas del usuario', err);
    SmartUI.Toast.show('No se pudieron cargar tus libros');
  }
  document.getElementById('profile-upload-count').textContent = uploaded.length;

  const tabs = document.querySelectorAll('.tab');
  const panelUploaded = document.getElementById('profile-uploaded');
  const panelFavorites = document.getElementById('profile-favorites');

  function updateUploadCount() {
    document.getElementById('profile-upload-count').textContent = uploaded.length;
  }

  async function refreshUploaded() {
    uploaded = await SmartDB.getUserDocuments(user.id);
    updateUploadCount();
    await showTab('uploaded');
  }

  async function editUploaded(docId) {
    const doc = uploaded.find((item) => item.id === docId);
    if (!doc) return;
    SmartUI.openDocumentEditor(doc, categories, {
      async onSave(id, payload) {
        await SmartDB.updateDocument(id, user.id, payload);
        SmartUI.Toast.show('PDF actualizado');
        await refreshUploaded();
      },
    });
  }

  async function deleteUploaded(docId) {
    const doc = uploaded.find((item) => item.id === docId);
    if (!doc) return;
    const okDelete = window.confirm(`Eliminar "${doc.title}"? Esta accion no se puede deshacer.`);
    if (!okDelete) return;
    try {
      await SmartDB.deleteDocument(docId, user.id);
      SmartUI.Toast.show('PDF eliminado');
      await refreshUploaded();
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudo eliminar');
    }
  }

  async function showTab(name) {
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    const isUploaded = name === 'uploaded';
    panelUploaded?.classList.toggle('hidden', !isUploaded);
    panelFavorites?.classList.toggle('hidden', isUploaded);

    if (isUploaded) {
      SmartUI.pdfGrid(uploaded, 'profile-uploaded', {
        ownerActions: true,
        onEdit: editUploaded,
        onDelete: deleteUploaded,
      });
      return;
    }

    try {
      const favoriteDocs = await SmartDB.getFavoriteDocuments(user.id);
      SmartUI.pdfGrid(favoriteDocs, 'profile-favorites');
    } catch (err) {
      console.error('No se pudieron cargar los favoritos del perfil', err);
      SmartUI.pdfGrid([], 'profile-favorites');
    }
  }

  pickAvatarBtn?.addEventListener('click', () => avatarInput?.click());

  avatarInput?.addEventListener('change', async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const currentName = document.getElementById('edit-name')?.value?.trim() || profile?.username || user.email?.split('@')[0] || 'Usuario';
    const originalText = pickAvatarBtn.textContent;
    pickAvatarBtn.disabled = true;
    pickAvatarBtn.textContent = 'Preparando...';
    try {
      const optimizedFile = await fileToOptimizedAvatar(file);
      cleanupAvatarObjectUrl();
      avatarUploadFile = optimizedFile;
      avatarObjectUrl = URL.createObjectURL(optimizedFile);
      avatarDraft = avatarObjectUrl;
      avatarMarkedForRemoval = false;
      syncAvatarTargets(currentName);
      SmartUI.Toast.show('Foto lista para guardar');
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudo procesar la imagen');
    } finally {
      pickAvatarBtn.disabled = false;
      pickAvatarBtn.textContent = originalText;
      avatarInput.value = '';
    }
  });

  removeAvatarBtn?.addEventListener('click', () => {
    cleanupAvatarObjectUrl();
    avatarUploadFile = null;
    avatarMarkedForRemoval = true;
    avatarDraft = '';
    const currentName = document.getElementById('edit-name')?.value?.trim() || profile?.username || user.email?.split('@')[0] || 'Usuario';
    syncAvatarTargets(currentName);
  });

  document.getElementById('edit-name')?.addEventListener('input', (event) => {
    const currentName = event.target?.value?.trim() || user.email?.split('@')[0] || 'Usuario';
    if (!avatarDraft) syncAvatarTargets(currentName);
  });

  tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

  try {
    await SmartUI.loadFavoriteIds();
  } catch (err) {
    console.warn('No se pudieron cargar los estados de favoritos/likes', err);
  }

  await showTab('uploaded');

  document.getElementById('save-profile')?.addEventListener('click', async () => {
    const username = document.getElementById('edit-name')?.value?.trim();
    const bio = document.getElementById('edit-bio')?.value?.trim();
    if (!username) return;

    const saveBtn = document.getElementById('save-profile');
    const originalText = saveBtn?.textContent || 'Guardar';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    try {
      let nextAvatar = profile?.avatar || null;

      if (avatarUploadFile) {
        if (isStorageAvatar(profile?.avatar)) {
          await SmartDB.deleteAvatar(profile.avatar);
        }
        const uploadedAvatar = await SmartDB.uploadAvatar(avatarUploadFile, user.id);
        nextAvatar = uploadedAvatar.publicUrl;
      } else if (avatarMarkedForRemoval) {
        if (isStorageAvatar(profile?.avatar)) {
          await SmartDB.deleteAvatar(profile.avatar);
        }
        nextAvatar = null;
      }

      profile = await SmartDB.updateProfile(user.id, { username, bio, avatar: nextAvatar });
      cleanupAvatarObjectUrl();
      avatarUploadFile = null;
      avatarMarkedForRemoval = false;
      avatarDraft = profile?.avatar || '';
      fillProfile(profile);
      await SmartAuth.hydrateSidebar();
      SmartAuth.updateNavbar(await SmartAuth.getSession());
      SmartUI.Toast.show('Perfil actualizado');
    } catch (e) {
      SmartUI.Toast.show(e.message || 'Error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  });
})();
