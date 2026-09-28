/**
 * Smart Aula — Vista de colección compartida
 */
(async function initCollectionView() {
  await SmartDB.whenReady;
  await SmartUI.loadFavoriteIds();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const titleEl = document.getElementById('collection-title');
  const descriptionEl = document.getElementById('collection-description');
  const metaEl = document.getElementById('collection-meta');
  const docsEl = document.getElementById('collection-documents');
  const shareBtn = document.getElementById('collection-share');
  const user = await SmartAuth.getUser();

  if (!id) {
    if (docsEl) docsEl.innerHTML = '<div class="empty-state"><p>Colección no encontrada</p></div>';
    return;
  }

  function shareUrl() {
    return window.location.href;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      SmartUI.Toast.show('Enlace copiado');
    } catch {
      window.prompt('Copia el enlace de la colección:', shareUrl());
    }
  }

  shareBtn?.addEventListener('click', copyLink);

  try {
    const collection = await SmartDB.getCollection(id);
    if (!collection) {
      docsEl.innerHTML = '<div class="empty-state"><p>Esta colección es privada o no existe</p></div>';
      return;
    }

    const isOwner = !!user && user.id === collection.user_id;
    titleEl.textContent = collection.name;
    document.title = `${collection.name} — Smart Aula`;
    descriptionEl.textContent = collection.description || '';
    metaEl.textContent = collection.is_public ? 'Colección compartida' : (isOwner ? 'Colección privada' : '');

    async function renderDocuments() {
      const docs = await SmartDB.getCollectionDocuments(id);
      // Si el visitante no es el dueño, ocultar documentos privados
      const visibleDocs = isOwner ? docs : docs.filter(doc => doc.isPublic !== false);
      SmartUI.pdfGrid(visibleDocs, 'collection-documents', {
        collectionActions: isOwner,
        async onRemoveFromCollection(documentId) {
        if (!window.confirm('Quitar este PDF de la colección?')) return;
        try {
          await SmartDB.removeDocumentFromCollection(id, documentId);
          SmartUI.Toast.show('PDF quitado de la colección');
          await renderDocuments();
        } catch (err) {
          SmartUI.Toast.show(err.message || 'No se pudo quitar');
        }
        },
      });
    }

    await renderDocuments();
  } catch (err) {
    docsEl.innerHTML = '<div class="empty-state"><p>No se pudo cargar la colección</p></div>';
    SmartUI.Toast.show(err.message || 'Error al cargar colección');
  }
})();
