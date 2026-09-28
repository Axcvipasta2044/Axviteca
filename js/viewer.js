/**
 * Smart Aula — Visor PDF (público, gratis para todos)
 */
(async function initViewer() {
  await SmartDB.whenReady;
  window.lucide?.createIcons?.();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const canvas = document.getElementById('pdf-canvas');
  const titleEl = document.getElementById('viewer-title');
  const pageNumEl = document.getElementById('page-num');
  const pageCountEl = document.getElementById('page-count');

  if (!id) {
    document.querySelector('.viewer-canvas').innerHTML = '<div class="empty-state"><p>Documento no encontrado</p></div>';
    return;
  }

  let pdfDoc = null;
  let pageNum = 1;
  let scale = window.innerWidth < 350 ? 0.9 : 1.4;
  let pdfUrl = '';
  let docMeta = null;
  let currentUser = null;
  let categories = [];
  const mobileQuery = window.matchMedia('(max-width: 719px)');
  let mobileZoom = 1;
  if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  async function loadPdfSource(url) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch');
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return url;
    }
  }

  async function loadDocument() {
    if (!SmartDB.isReady()) {
      SmartUI.Toast.show('Configura Supabase en js/config.js');
      return;
    }
    docMeta = await SmartDB.getDocument(id);
    if (!docMeta) {
      document.querySelector('.viewer-canvas').innerHTML = '<div class="empty-state"><p>Documento no encontrado</p></div>';
      return;
    }
    const displayTitle = SmartUI.filterTitle(docMeta.title);
    titleEl.textContent = displayTitle;
    document.title = `${displayTitle} — Smart Aula`;
    pdfUrl = docMeta.file_url;
    currentUser = await SmartAuth.getUser();
    if (currentUser) await SmartDB.ensureUserProfile(currentUser);
    categories = SmartDB.isReady() ? await SmartDB.getCategories() : [];
    updateOwnerControls();
    await SmartDB.incrementViews(id, currentUser?.id);
    await renderComments();
    await updateFavoriteBtn();
    await updateLikeBtn();
    const src = await loadPdfSource(pdfUrl);
    pdfDoc = await pdfjsLib.getDocument(src).promise;
    pageCountEl.textContent = pdfDoc.numPages;
    if (currentUser) {
      const map = await SmartDB.getReadingProgress(currentUser.id);
      const saved = map[id]?.lastPage;
      if (saved && saved <= pdfDoc.numPages) pageNum = saved;
    }
    renderPage();
  }

  async function renderPage() {
    if (!pdfDoc || !canvas) return;
    const page = await pdfDoc.getPage(pageNum);
    let viewport = page.getViewport({ scale });
    if (mobileQuery.matches) {
      const canvasWrap = document.querySelector('.viewer-canvas');
      const availableWidth = canvasWrap?.clientWidth || window.innerWidth;
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = availableWidth / baseViewport.width;
      scale = fitScale * mobileZoom;
      viewport = page.getViewport({ scale });
    }
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pageNumEl.textContent = pageNum;

    if (currentUser) {
      await SmartDB.upsertReadingProgress(currentUser.id, id, {
        currentPage: pageNum,
        totalPages: pdfDoc.numPages,
        progress: Math.round((pageNum / pdfDoc.numPages) * 100),
      });
    }
  }

  function goPrevPage() {
    if (pageNum > 1) {
      pageNum -= 1;
      renderPage();
    }
  }

  function goNextPage() {
    if (pdfDoc && pageNum < pdfDoc.numPages) {
      pageNum += 1;
      renderPage();
    }
  }
  document.getElementById('prev-page')?.addEventListener('click', goPrevPage);
  document.getElementById('next-page')?.addEventListener('click', goNextPage);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest('input, textarea, select, button') || target.isContentEditable)
    ) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevPage();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNextPage();
    }
  });

  document.getElementById('zoom-in')?.addEventListener('click', () => {
    if (mobileQuery.matches) mobileZoom = Math.min(mobileZoom + 0.15, 2.5);
    else scale += 0.15;
    renderPage();
  });
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    if (mobileQuery.matches) mobileZoom = Math.max(mobileZoom - 0.15, 0.6);
    else if (scale > 0.5) scale -= 0.15;
    renderPage();
  });
  window.addEventListener('resize', () => renderPage());

  let touchStartX = null;
  let touchStartY = null;
  const swipeThreshold = 90;
  const viewerCanvasWrap = document.querySelector('.viewer-canvas');

  viewerCanvasWrap?.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  viewerCanvasWrap?.addEventListener('touchend', (event) => {
    if (touchStartX === null || touchStartY === null) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;

    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0) {
      goNextPage();
    } else {
      goPrevPage();
    }
  }, { passive: true });

  async function updateFavoriteBtn() {
    const favBtn = document.getElementById('viewer-favorite');
    if (!favBtn) return;
    const user = currentUser || await SmartAuth.getUser();
    const isFav = user ? await SmartDB.isFavorite(user.id, id) : false;
    favBtn.classList.toggle('is-active', isFav);
  }

  async function updateLikeBtn() {
    const likeBtn = document.getElementById('viewer-like');
    const likeCountEl = document.getElementById('viewer-like-count');
    if (!likeBtn || !likeCountEl) return;
    const user = currentUser || await SmartAuth.getUser();
    const liked = user ? await SmartDB.isLiked(user.id, id) : false;
    const count = await SmartDB.getLikesCount(id);
    likeBtn.classList.toggle('is-active', liked);
    likeCountEl.textContent = count || 0;
  }

  function updateOwnerControls() {
    const isOwner = !!currentUser && currentUser.id === docMeta?.userId;
    document.getElementById('viewer-edit')?.classList.toggle('hidden', !isOwner);
    document.getElementById('viewer-delete')?.classList.toggle('hidden', !isOwner);
  }

  document.getElementById('viewer-favorite')?.addEventListener('click', async () => {
    const user = await SmartAuth.getUser();
    if (!user) {
      SmartUI.Toast.show('Inicia sesión para guardar');
      setTimeout(() => (window.location.href = 'login.html'), 700);
      return;
    }
    await SmartDB.toggleFavorite(user.id, id);
    await updateFavoriteBtn();
    SmartUI.Toast.show('Actualizado');
  });

  document.getElementById('viewer-like')?.addEventListener('click', async () => {
    const user = await SmartAuth.getUser();
    if (!user) {
      SmartUI.Toast.show('Inicia sesión para dar me gusta');
      setTimeout(() => (window.location.href = 'login.html'), 700);
      return;
    }
    try {
      const liked = await SmartDB.toggleLike(user.id, id);
      await SmartDB.incrementDownloads && SmartDB.incrementDownloads(id).catch(() => {});
      await updateLikeBtn();
      SmartUI.Toast.show(liked ? 'Te gusta' : 'Ya no te gusta');
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudo procesar like');
    }
  });

  document.getElementById('viewer-edit')?.addEventListener('click', () => {
    if (!currentUser || currentUser.id !== docMeta?.userId) return;
    SmartUI.openDocumentEditor(docMeta, categories, {
      async onSave(documentId, payload) {
        docMeta = await SmartDB.updateDocument(documentId, currentUser.id, payload);
        const displayTitle = SmartUI.filterTitle(docMeta.title);
        titleEl.textContent = displayTitle;
        document.title = `${displayTitle} - Smart Aula`;
        SmartUI.Toast.show('PDF actualizado');
      },
    });
  });

  document.getElementById('viewer-delete')?.addEventListener('click', async () => {
    if (!currentUser || currentUser.id !== docMeta?.userId) return;
    const ok = window.confirm(`Eliminar "${docMeta.title}"? Esta accion no se puede deshacer.`);
    if (!ok) return;
    try {
      await SmartDB.deleteDocument(id, currentUser.id);
      SmartUI.Toast.show('PDF eliminado');
      window.location.href = 'profile.html';
    } catch (err) {
      SmartUI.Toast.show(err.message || 'No se pudo eliminar');
    }
  });

  document.getElementById('viewer-download')?.addEventListener('click', () => {
    if (!pdfUrl) return;
    SmartUI.downloadPdf(pdfUrl, docMeta?.title || 'doc');
    SmartDB.incrementDownloads(id).catch(() => {});
  });

  document.getElementById('viewer-collection')?.addEventListener('click', () => {
    if (!docMeta) return;
    SmartUI.openCollectionPicker(docMeta);
  });

  document.getElementById('viewer-fullscreen')?.addEventListener('click', () => {
    const wrap = document.querySelector('.viewer-canvas');
    if (!document.fullscreenElement) wrap?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.getElementById('viewer-sidebar-toggle')?.addEventListener('click', () => {
    document.querySelector('.viewer-sidebar')?.classList.toggle('is-open');
  });

  const viewerActions = document.querySelector('.viewer-actions');
  const viewerMoreToggle = document.getElementById('viewer-more-toggle');
  function closeViewerActions() {
    viewerActions?.classList.remove('is-open');
    viewerMoreToggle?.setAttribute('aria-expanded', 'false');
  }
  viewerMoreToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !viewerActions?.classList.contains('is-open');
    viewerActions?.classList.toggle('is-open', open);
    viewerMoreToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!viewerActions?.contains(e.target)) closeViewerActions();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeViewerActions();
  });
  document.getElementById('viewer-actions-menu')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeViewerActions();
  });

  async function renderComments() {
    const list = document.getElementById('comments-list');
    if (!list) return;
    const comments = await SmartDB.getComments(id);
    list.innerHTML = comments.length
      ? comments.map((c) => `<div class="comment"><div class="comment__author">${SmartUI.escapeHtml(c.author)} · ${c.date}</div><p>${SmartUI.escapeHtml(c.text)}</p></div>`).join('')
      : '<p class="text-muted text-sm">Sin comentarios</p>';
  }

  document.getElementById('comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = await SmartAuth.getUser();
    if (!user) {
      SmartUI.Toast.show('Inicia sesión para comentar');
      return;
    }
    const text = document.getElementById('comment-input')?.value?.trim();
    if (!text) return;
    await SmartDB.addComment(user.id, id, text);
    document.getElementById('comment-input').value = '';
    await renderComments();
  });

  try {
    await loadDocument();
  } catch (e) {
    SmartUI.Toast.show('No se pudo cargar el PDF');
  }
})();
//---------
