/**
 * Smart Aula - Guardados
 */
(async function initSavedPage() {
  await SmartDB.whenReady;
  const ok = await SmartAuth.requireAuth();
  if (!ok) return;

  await SmartUI.loadFavoriteIds();
  const user = await SmartAuth.getUser();
  if (!user) return;

  await SmartAuth.hydrateSidebar();

  const searchInput = document.getElementById('saved-search');
  const countEl = document.getElementById('saved-count');
  const gridId = 'saved-grid';
  let savedDocs = [];

  async function loadSaved() {
    try {
      savedDocs = await SmartDB.getFavoriteDocuments(user.id);
      renderSaved();
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudieron cargar tus guardados');
      SmartUI.pdfGrid([], gridId);
    }
  }

  function renderSaved() {
    const query = searchInput?.value?.trim().toLowerCase() || '';
    const filtered = query
      ? savedDocs.filter((doc) => {
          const text = `${doc.title || ''} ${doc.author || ''} ${doc.category || ''}`.toLowerCase();
          return text.includes(query);
        })
      : savedDocs;

    if (countEl) {
      countEl.textContent = `${filtered.length} libro${filtered.length !== 1 ? 's' : ''} guardado${filtered.length !== 1 ? 's' : ''}`;
    }

    SmartUI.pdfGrid(filtered, gridId);
  }

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderSaved, 180);
  });

  await loadSaved();
})();
