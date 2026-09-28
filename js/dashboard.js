/**
 * Smart Aula — Dashboard (público: todos pueden explorar)
 */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';



(async function initDashboard() {
  await SmartDB.whenReady;
  await SmartUI.loadFavoriteIds();

  const user = await SmartAuth.getUser();
  const welcomeEl = document.getElementById('dash-welcome');
  if (user) {
    await SmartAuth.hydrateSidebar();
    if (welcomeEl) {
      const profile = await SmartDB.getProfile(user.id);
      const name = profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || '';
      welcomeEl.textContent = name
        ? `¡Bienvenido, ${name}! Disfruta de los PDFs.`
        : '¡Bienvenido! Disfruta de los PDFs.';
    }
  } else {
    document.querySelectorAll('.sidebar__user-name').forEach((el) => (el.textContent = 'Invitado'));
    document.querySelectorAll('.sidebar__user-email').forEach((el) => (el.textContent = 'Explora gratis'));
    document.querySelectorAll('.sidebar__avatar').forEach((el) => (el.textContent = '?'));
  }

  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') || '';
  const showAll = params.get('all') === '1';
  const category = params.get('category') || 'all';
  const searchInput = document.getElementById('dash-search');
  const recentHeading = document.getElementById('dash-recent-heading');
  if (searchInput && query) searchInput.value = query;
  if (recentHeading) {
    const categoryLabel = category && category !== 'all' ? ` de ${category}` : '';
    recentHeading.textContent = showAll ? `Todos los documentos${categoryLabel}` : `Recientes${categoryLabel}`;
  }

  /* ===== Paginación (solo modo "todos" / categoría) ===== */
  // 21 en desktop (3 columnas x 7 filas) · 20 en móvil (2 columnas x 10 filas).
  const PER_PAGE_DESKTOP = 21;
  const PER_PAGE_MOBILE = 20;
  const MOBILE_MQ = window.matchMedia('(max-width: 719px)');
  const isMobile = () => MOBILE_MQ.matches;
  const perPage = () => (isMobile() ? PER_PAGE_MOBILE : PER_PAGE_DESKTOP);
  const paginationEnabled = () => showAll;

  let allDocs = [];
  let currentPage = 1;
  let lastPageRenderedSize = perPage();

  const gridEl = document.getElementById('dash-recent');
  const paginationEl = document.getElementById('dash-pagination');

  // Crea el contenedor de paginación si la página no lo trae (por si acaso)
  if (paginationEnabled() && gridEl && !paginationEl) {
    const created = document.createElement('nav');
    created.id = 'dash-pagination';
    created.className = 'pagination';
    created.setAttribute('aria-label', 'Paginación de documentos');
    gridEl.parentElement?.appendChild(created);
  }
  const pagEl = paginationEl || document.getElementById('dash-pagination');

  function buildPaginationButton(label, { page = 0, disabled = false, active = false, ariaLabel = '', ellipsis = false, arrow = false } = {}) {
    if (ellipsis) return `<span class="pagination__ellipsis" aria-hidden="true">…</span>`;
    const cls = ['pagination__page'];
    if (active) cls.push('is-active');
    if (disabled) cls.push('is-disabled');
    if (arrow) cls.push(page === currentPage - 1 ? 'pagination__page--prev' : 'pagination__page--next');
    return `
      <button
        type="button"
        class="${cls.join(' ')}"
        data-page="${page}"
        ${active ? 'aria-current="page"' : ''}
        ${ariaLabel ? `aria-label="${ariaLabel}"` : ''}
        ${disabled ? 'disabled' : ''}
      >${label}</button>
    `;
  }

  // Ventana de páginas: primera · previas · actual · siguientes · última
  function pageNumbersFor(total, current) {
    const pages = [];
    const windowSize = 1;
    for (let p = 1; p <= total; p += 1) {
      const isFirst = p === 1;
      const isLast = p === total;
      const inWindow = Math.abs(p - current) <= windowSize;
      if (isFirst || isLast || inWindow) {
        pages.push(p);
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…');
      }
    }
    return pages;
  }

  function renderPagination(totalPages) {
    if (!pagEl) return;
    if (totalPages <= 1) {
      pagEl.innerHTML = '';
      pagEl.hidden = true;
      return;
    }
    pagEl.hidden = false;
    const items = [
      buildPaginationButton('‹', { page: currentPage - 1, disabled: currentPage === 1, ariaLabel: 'Página anterior', arrow: true }),
      ...pageNumbersFor(totalPages, currentPage).map((p) =>
        p === '…'
          ? buildPaginationButton('', { ellipsis: true })
          : buildPaginationButton(String(p), { page: p, active: p === currentPage, ariaLabel: `Página ${p}` })
      ),
      buildPaginationButton('›', { page: currentPage + 1, disabled: currentPage === totalPages, ariaLabel: 'Página siguiente', arrow: true }),
    ];
    pagEl.innerHTML = items.join('');

    pagEl.querySelectorAll('.pagination__page').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Number(btn.dataset.page);
        if (!Number.isFinite(target) || target < 1 || target === currentPage) return;
        currentPage = target;
        renderCurrentPage();
        gridEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderCurrentPage() {
    const size = perPage();
    const totalPages = Math.max(Math.ceil(allDocs.length / size), 1);
    // Si cambia el tamaño por página (rotación desktop/móvil), conserva la primera tarjeta visible
    if (size !== lastPageRenderedSize) {
      const firstVisibleDoc = (currentPage - 1) * lastPageRenderedSize;
      currentPage = Math.min(Math.floor(firstVisibleDoc / size) + 1, totalPages);
      lastPageRenderedSize = size;
    }
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * size;
    const pageDocs = allDocs.slice(start, start + size);

    SmartUI.pdfGrid(pageDocs, 'dash-recent', { gridClass: 'pdf-grid--paged' });
    renderPagination(totalPages);
  }
  /* ===== fin paginación ===== */

  async function render() {
    const q = searchInput?.value?.trim() || '';
    try {
      const recent = await SmartDB.getDocuments({
        limit: showAll ? 1000 : 8,
        category: category === 'all' ? undefined : category,
        search: q || undefined,
      });
      const stats = await SmartDB.getStats(user?.id);

      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-favorites').textContent = user ? stats.favorites : '—';
      document.getElementById('stat-uploaded').textContent = user ? stats.uploaded : '—';

      if (paginationEnabled()) {
        // Modo "todos"/categoría: paginar los documentos en el cliente
        allDocs = recent;
        currentPage = 1;
        lastPageRenderedSize = perPage();
        renderCurrentPage();
      } else {
        SmartUI.pdfGrid(recent, 'dash-recent');
        if (pagEl) {
          pagEl.hidden = true;
          pagEl.innerHTML = '';
        }
      }

      if (user) {
        const readingMap = await SmartDB.getReadingProgress(user.id);
        const continueItems = Object.entries(readingMap).map(([docId, info]) => ({
          pdf: { id: docId, title: info.doc?.title || 'Documento', author: '', category: info.doc?.category },
          progress: info.progress || 0,
        }));
        SmartUI.continueReading(continueItems, 'continue-reading');
      } else {
        const el = document.getElementById('continue-reading');
        if (el) el.innerHTML = '<p class="text-muted text-sm"><a href="login.html">Inicia sesión</a> para ver tu progreso de lectura.</p>';
      }
    } catch (e) {
      SmartUI.Toast.show(e.message || 'Error al cargar');
    }
  }

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 350);
  });

  // Al cruzar el breakpoint desktop/móvil cambia el tamaño de página (21 <-> 20)
  const handleBreakpointChange = () => {
    if (!paginationEnabled() || !allDocs.length) return;
    if (lastPageRenderedSize !== perPage()) renderCurrentPage();
  };
  if (typeof MOBILE_MQ.addEventListener === 'function') {
    MOBILE_MQ.addEventListener('change', handleBreakpointChange);
  } else if (typeof MOBILE_MQ.addListener === 'function') {
    MOBILE_MQ.addListener(handleBreakpointChange); // Safari antiguos
  }

  await render();

  if (window.location.hash === '#guardados') window.location.href = 'saved.html';
})();
