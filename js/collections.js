/**
 * Smart Aula — Mis colecciones
 */
(async function initCollectionsPage() {
  await SmartDB.whenReady;
  const ok = await SmartAuth.requireAuth();
  if (!ok) return;

  const user = await SmartAuth.getUser();
  if (!user) return;
  await SmartDB.ensureUserProfile(user);
  await SmartAuth.hydrateSidebar();

  const list = document.getElementById('collections-list');
  const form = document.getElementById('collection-form');
  let collectionMenuBound = false;

  function collectionLink(collectionId) {
    const dir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    return `${window.location.origin}${dir}collection.html?id=${encodeURIComponent(collectionId)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      SmartUI.Toast.show('Enlace copiado');
    } catch {
      window.prompt('Copia el enlace de la colección:', text);
    }
  }

  function closeCollectionMenus(root = document) {
    root.querySelectorAll('.collection-card__menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      menu.querySelector('[data-collection-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      menu.querySelector('.collection-card__menu-panel')?.style.removeProperty('--menu-shift-x');
    });
  }

  function keepCollectionMenuInViewport(menu) {
    const panel = menu?.querySelector('.collection-card__menu-panel');
    if (!panel) return;
    panel.style.setProperty('--menu-shift-x', '0px');
    requestAnimationFrame(() => {
      const rect = panel.getBoundingClientRect();
      const gutter = 8;
      let shift = 0;
      if (rect.left < gutter) shift = gutter - rect.left;
      if (rect.right > window.innerWidth - gutter) {
        shift = window.innerWidth - gutter - rect.right;
      }
      panel.style.setProperty('--menu-shift-x', `${Math.round(shift)}px`);
    });
  }

  function bindCollectionMenus() {
    list.querySelectorAll('[data-collection-menu-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.collection-card__menu');
        const willOpen = !menu?.classList.contains('is-open');
        closeCollectionMenus(list);
        menu?.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) keepCollectionMenuInViewport(menu);
      });
    });
    list.querySelectorAll('.collection-card__menu-panel').forEach((panel) => {
      panel.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) closeCollectionMenus(list);
      });
    });
    if (!collectionMenuBound) {
      document.addEventListener('click', () => closeCollectionMenus());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCollectionMenus();
      });
      collectionMenuBound = true;
    }
  }

  async function renderCollections() {
    if (!list) return;
    list.innerHTML = '<p class="text-muted text-sm">Cargando colecciones...</p>';
    try {
      const collections = await SmartDB.getCollections(user.id);
      if (!collections.length) {
        list.innerHTML = `
          <div class="empty-state">
            <p>Aún no tienes colecciones</p>
            <p class="text-muted text-sm">Crea una y agrega PDFs desde la biblioteca.</p>
          </div>
        `;
        return;
      }

      const cards = await Promise.all(collections.map(async (collection) => {
        const docs = await SmartDB.getCollectionDocuments(collection.id);
        return `
          <article class="collection-card" data-collection-id="${collection.id}">
            <div class="collection-card__head">
              <div>
                <h3 class="collection-card__title">${SmartUI.escapeHtml(collection.name)}</h3>
                <p class="collection-card__meta">${docs.length} documento${docs.length !== 1 ? 's' : ''}</p>
              </div>
              <div class="collection-card__side">
                <button type="button" class="collection-badge ${collection.is_public ? '' : 'collection-badge--private'}" data-visibility-toggle aria-label="Cambiar visibilidad">
                  ${collection.is_public ? 'Compartida' : 'Privada'}
                </button>
                <div class="collection-card__menu">
                  <button type="button" class="collection-card__menu-trigger" data-collection-menu-toggle aria-label="Acciones de la colección" aria-expanded="false">⋮</button>
                  <div class="collection-card__menu-panel">
                    <a href="collection.html?id=${collection.id}" class="collection-card__menu-item">Abrir</a>
                    <button type="button" class="collection-card__menu-item" data-rename>Renombrar</button>
                    <button type="button" class="collection-card__menu-item" data-share>Copiar enlace</button>
                    <button type="button" class="collection-card__menu-item collection-card__menu-item--danger" data-delete>Eliminar</button>
                  </div>
                </div>
              </div>
            </div>
            ${collection.description ? `<p class="text-sm text-secondary">${SmartUI.escapeHtml(collection.description)}</p>` : ''}
          </article>
        `;
      }));

      list.innerHTML = cards.join('');
      bindCollectionMenus();

      list.querySelectorAll('[data-collection-id]').forEach((card) => {
        const collectionId = card.dataset.collectionId;
        const collection = collections.find((item) => item.id === collectionId);

        card.querySelector('[data-visibility-toggle]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const previousPublic = collection.is_public;
          const newPublic = !previousPublic;
          const badge = e.currentTarget;

          // Optimistic UI update
          badge.classList.toggle('collection-badge--private', !newPublic);
          badge.textContent = newPublic ? 'Compartida' : 'Privada';
          collection.is_public = newPublic;

          try {
            await SmartDB.updateCollection(collectionId, user.id, { is_public: newPublic });
          } catch (err) {
            // Rollback on error
            collection.is_public = previousPublic;
            badge.classList.toggle('collection-badge--private', !previousPublic);
            badge.textContent = previousPublic ? 'Compartida' : 'Privada';
            SmartUI.Toast.show(err.message || 'No se pudo cambiar la visibilidad');
          }
        });

        card.querySelector('[data-share]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await copyText(collectionLink(collectionId));
        });

        card.querySelector('[data-rename]')?.addEventListener('click', async () => {
          const name = window.prompt('Nuevo nombre de la colección:', collection.name);
          if (!name || !name.trim()) return;
          const description = window.prompt('Descripción:', collection.description || '') ?? (collection.description || '');
          try {
            await SmartDB.updateCollection(collectionId, user.id, { name, description });
            SmartUI.Toast.show('Colección actualizada');
            await renderCollections();
          } catch (err) {
            SmartUI.Toast.show(err.message || 'No se pudo actualizar');
          }
        });

        card.querySelector('[data-delete]')?.addEventListener('click', async () => {
          if (!window.confirm(`Eliminar "${collection.name}"?`)) return;
          try {
            await SmartDB.deleteCollection(collectionId, user.id);
            SmartUI.Toast.show('Colección eliminada');
            await renderCollections();
          } catch (err) {
            SmartUI.Toast.show(err.message || 'No se pudo eliminar');
          }
        });
      });
    } catch (err) {
      list.innerHTML = '<div class="empty-state"><p>No se pudieron cargar las colecciones</p></div>';
      SmartUI.Toast.show(err.message || 'Error al cargar colecciones');
    }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const payload = {
      name: form.elements.name.value.trim(),
      description: form.elements.description.value.trim(),
    };
    if (!payload.name) return;
    submit.disabled = true;
    try {
      await SmartDB.createCollection(user.id, payload);
      form.reset();
      SmartUI.Toast.show('Colección creada');
      await renderCollections();
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudo crear');
    } finally {
      submit.disabled = false;
    }
  });

  await renderCollections();
})();
