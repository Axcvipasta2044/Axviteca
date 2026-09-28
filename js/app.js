/**
 * Smart Aula — UI compartida
 */

//------
  async function renderPdfThumbnail(pdfUrl, canvas) {
  if (typeof pdfjsLib === 'undefined') return;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  try {
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;

    const page = await pdf.getPage(1);
    const defaultViewport = page.getViewport({ scale: 1 });
    const thumb = canvas.parentElement;
    const targetWidth = thumb?.clientWidth || defaultViewport.width;
    const scale = targetWidth / defaultViewport.width;
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;

  } catch (err) {
    console.error(err);
  }
}
const SmartUI = (() => {
  const Icons = {
    pdf: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    starFilled: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    // Small download icon used in viewer and pdf-card buttons
    download: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  };

  let favoriteCache = new Set();
  let likeCache = new Set();
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  let cardMenuGlobalBound = false;
  const categoryIconMap = {
    todas: 'assets/icons/cat-todas.svg',
    educacion: 'assets/icons/cat-educacion.svg',
    programacion: 'assets/icons/cat-programacion.svg',
    tecnologia: 'assets/icons/cat-tecnologia.svg',
    inteligencia_artificial: 'assets/icons/cat-ia.svg',
    ciencia: 'assets/icons/cat-ciencia.svg',
    matematicas: 'assets/icons/cat-matematicas.svg',
    ingenieria: 'assets/icons/cat-ingenieria.svg',
    diseno: 'assets/icons/cat-diseno.svg',
    literatura: 'assets/icons/cat-literatura.svg',
    historia: 'assets/icons/cat-historia.svg',
    ciencias_sociales: 'assets/icons/cat-sociales.svg',
    derecho: 'assets/icons/cat-derecho.svg',
    salud: 'assets/icons/cat-salud.svg',
    negocios: 'assets/icons/cat-negocios.svg',
    idiomas: 'assets/icons/cat-idiomas.svg',
    tesis: 'assets/icons/cat-tesis.svg',
    general: 'assets/icons/cat-general.svg',
  };
  const defaultCategories = [
    'Educación',
    'Programación',
    'Tecnología',
    'Inteligencia Artificial',
    'Ciencia',
    'Matemáticas',
    'Ingeniería',
    'Diseño',
    'Literatura',
    'Historia',
    'Ciencias Sociales',
    'Derecho',
    'Salud',
    'Negocios',
    'Idiomas',
    'Tesis',
    'General',
  ];

  function initTheme() {
    const storageKey = 'smart-aula-theme';
    let savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
    } catch (error) {
      console.warn('No se pudo leer la preferencia de tema.', error);
    }

    const applyTheme = (theme) => {
      const isDark = theme === 'dark';
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
        const icon = button.querySelector('.theme-toggle__icon');
        const label = button.querySelector('.theme-toggle__label');
        button.setAttribute('aria-pressed', String(isDark));
        button.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
        button.title = isDark ? 'Modo claro' : 'Modo oscuro';
        if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
        if (icon) {
          icon.innerHTML = isDark
            ? '<span aria-hidden="true">☀</span>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>';
        }
      });
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#111827' : '#2563eb');
    };

    // El botón se coloca en la barra de navegación, en la barra lateral o en la
    // barra del visor según la página. Si la página no tiene ninguna de esas
    // zonas (login, offline), queda como botón flotante.
    function resolveToggleHost() {
      const candidates = [
        [document.querySelector('.navbar__actions'), 'theme-toggle--navbar', 'prepend'],
        [document.querySelector('.sidebar__footer'), 'theme-toggle--sidebar', 'prepend'],
        [document.querySelector('.viewer-toolbar__right'), 'theme-toggle--compact', 'append'],
      ];
      for (const [element, modifier, position] of candidates) {
        if (element) return { element, modifier, position };
      }
      return { element: document.body, modifier: 'theme-toggle--floating', position: 'append' };
    }

    if (!document.querySelector('[data-theme-toggle]')) {
      const { element: host, modifier, position } = resolveToggleHost();
      if (host) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `theme-toggle ${modifier}`;
        button.dataset.themeToggle = '';
        button.innerHTML = '<span class="theme-toggle__icon" aria-hidden="true"></span><span class="theme-toggle__label"></span>';
        button.addEventListener('click', () => {
          const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
          try {
            localStorage.setItem(storageKey, nextTheme);
          } catch (error) {
            console.warn('No se pudo guardar la preferencia de tema.', error);
          }
          applyTheme(nextTheme);
        });
        if (position === 'prepend') host.prepend(button);
        else host.appendChild(button);
      }
    }

    applyTheme(savedTheme);
  }

  const Toast = {
    show(message, duration = 2800) {
      let c = document.querySelector('.toast-container');
      if (!c) {
        c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
      }
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = message;
      c.appendChild(el);
      setTimeout(() => el.remove(), duration);
    },
  };

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function normalizeCategoryKey(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function isImageIcon(icon) {
    const value = String(icon || '');
    return /^(https?:|data:image\/|assets\/|\.?\/|\/)/i.test(value) || /\.(svg|png|jpe?g|webp|gif)$/i.test(value);
  }

  function categoryIconFor(name, icon) {
    if (isImageIcon(icon)) return icon;
    return categoryIconMap[normalizeCategoryKey(name)] || categoryIconMap.general;
  }

  function buildCategoryList(cats) {
    const allCats = [{ name: 'Todas', icon: categoryIconMap.todas, key: 'all' }];
    const sourceCats = cats?.length ? cats : defaultCategories;

    sourceCats.forEach((c) => {
      const name = c?.name || c;
      if (!name || String(name).toLowerCase() === 'todas') return;
      const icon = categoryIconFor(name, c?.icon);
      allCats.push({ name, icon, key: name });
    });

    return allCats;
  }

  const forbiddenTitlePatterns = [
    /porno/i,
    /hentai/i,
    /contenido\s*\+?\s*18/i,
    /\+18/i,
    /18\+/i,
  ];

  function containsForbiddenTitle(title) {
    if (!title) return false;
    const normalized = title.toString().trim();
    return forbiddenTitlePatterns.some((pattern) => pattern.test(normalized));
  }

  function filterTitle(title) {
    if (containsForbiddenTitle(title)) {
      return 'Este título contiene palabras prohibidas';
    }
    return title;
  }

  function initials(name) {
    return (name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getDocumentCategories(pdf) {
    const source = Array.isArray(pdf?.categories) && pdf.categories.length
      ? pdf.categories
      : pdf?.category
        ? [pdf.category]
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

  function renderCategoryBadges(categories, options = {}) {
    const list = getDocumentCategories({ categories });
    const maxVisible = options.maxVisible ?? 2;
    const visible = list.slice(0, maxVisible);
    const hiddenCount = Math.max(list.length - visible.length, 0);
    const badges = visible.map((name) => `<a class="pdf-card__badge" href="${categoryUrl(name)}">${escapeHtml(name)}</a>`);
    if (hiddenCount > 0) {
      badges.push(`<span class="pdf-card__badge pdf-card__badge--more">+${hiddenCount}</span>`);
    }
    return badges.join('');
  }

  function navigateToViewer(id) {
    window.location.href = `viewer.html?id=${encodeURIComponent(id)}`;
  }

  function categoryUrl(key) {
    try {
      const k = String(key || '').trim();
      if (!k) return 'categories.html';
      const params = new URLSearchParams({ all: '1' });
      if (k && k !== 'all') params.set('category', k);
      return `dashboard.html?${params.toString()}`;
    } catch {
      return 'categories.html';
    }
  }

  function pdfFilename(filename) {
    const safeName = String(filename || 'documento')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ');
    return /\.pdf$/i.test(safeName) ? safeName : `${safeName || 'documento'}.pdf`;
  }

  function urlWithDownloadParam(url, filename) {
    try {
      const downloadUrl = new URL(url, window.location.href);
      if (!downloadUrl.searchParams.has('download')) {
        downloadUrl.searchParams.set('download', pdfFilename(filename));
      }
      return downloadUrl.href;
    } catch {
      return url;
    }
  }

  function triggerDownload(url, filename, target = '_blank') {
    const a = document.createElement('a');
    a.href = urlWithDownloadParam(url, filename);
    a.download = pdfFilename(filename);
    a.target = target;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadPdf(url, filename) {
    if (!url) {
      Toast.show('URL de descarga no disponible');
      return;
    }

    if (isAndroid) {
      triggerDownload(url, filename, url.includes('supabase.co') ? '_self' : '_blank');
      Toast.show('Descarga iniciada');
      return;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al descargar el archivo');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = pdfFilename(filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      Toast.show('Descarga iniciada');
    } catch (err) {
      console.error(err);
      // Fallback: abrir la URL en nueva pestaña (útil si el servidor bloquea CORS)
      try {
        triggerDownload(url, filename);
        Toast.show('Abriendo en nueva pestaña para descargar');
      } catch (err2) {
        Toast.show('No se pudo descargar el PDF');
      }
    }
  }

  async function loadFavoriteIds() {
    favoriteCache = new Set();
    likeCache = new Set();
    const user = await SmartAuth.getUser();
    if (!user || !SmartDB.isReady()) return;
    const [favIds, likeIds] = await Promise.all([
      SmartDB.getFavoriteIds(user.id),
      SmartDB.getLikeIds(user.id),
    ]);
    favoriteCache = new Set(favIds);
    likeCache = new Set(likeIds);
  }

  function closePdfCardMenus(root = document) {
    root.querySelectorAll('.pdf-card__menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      menu.querySelector('[data-card-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      menu.querySelector('.pdf-card__menu-panel')?.style.removeProperty('--menu-shift-x');
    });
  }

  function keepCardMenuInViewport(menu) {
    const panel = menu?.querySelector('.pdf-card__menu-panel');
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

  function bindPdfCardMenus(container) {
    container.querySelectorAll('[data-card-menu-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.closest('.pdf-card__menu');
        const willOpen = !menu?.classList.contains('is-open');
        closePdfCardMenus(container);
        menu?.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) keepCardMenuInViewport(menu);
      });
    });
    container.querySelectorAll('.pdf-card__menu-panel').forEach((panel) => {
      panel.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) closePdfCardMenus(container);
      });
    });
    if (!cardMenuGlobalBound) {
      document.addEventListener('click', () => closePdfCardMenus());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePdfCardMenus();
      });
      cardMenuGlobalBound = true;
    }
  }

function pdfCard(pdf, options = {}) {
  const isFav = favoriteCache.has(pdf.id);
  const isLiked = likeCache.has(pdf.id);
  const badgeMarkup = renderCategoryBadges(getDocumentCategories(pdf), { maxVisible: 2 });
  const ownerActions = options.ownerActions
    ? `
        <button type="button" class="pdf-card__menu-item" data-edit-doc="${pdf.id}">Editar</button>
        <button type="button" class="pdf-card__menu-item pdf-card__menu-item--danger" data-delete-doc="${pdf.id}">Eliminar</button>
      `
    : '';
  const collectionActions = options.collectionActions
    ? `
        <button type="button" class="pdf-card__menu-item pdf-card__menu-item--danger" data-remove-collection-doc="${pdf.id}">Quitar de colección</button>
      `
    : '';
  const downloadAction = isAndroid && pdf.file_url
    ? `<button type="button" class="pdf-card__menu-item pdf-card__download" data-download-url="${escapeHtml(pdf.file_url)}" data-download-name="${escapeHtml(pdf.title)}">Descargar</button>`
    : '';

  return `
    <article class="pdf-card" data-pdf-id="${pdf.id}" tabindex="0">
      <div class="pdf-card__thumb">
      <canvas class="pdf-thumbnail"></canvas>
        <div class="pdf-card__badges">
          ${badgeMarkup}
        </div>
      </div>
      <div class="pdf-card__body">
        <div class="pdf-card__header">
          <h3 class="pdf-card__title">
            ${escapeHtml(filterTitle(pdf.title))}
          </h3>
          <div class="pdf-card__menu">
            <button type="button" class="pdf-card__menu-trigger" data-card-menu-toggle aria-label="Acciones del documento" aria-expanded="false">⋮</button>
            <div class="pdf-card__menu-panel">
              <button type="button" class="pdf-card__menu-item" data-collection-doc="${pdf.id}">Agregar a colección</button>
              ${downloadAction}
              ${ownerActions}
              ${collectionActions}
            </div>
          </div>
        </div>
        <p class="text-muted text-sm">
          ${escapeHtml(pdf.author)} · ${pdf.views || 0} vistas
        </p>
        <div class="pdf-card__meta">
          <span>${pdf.createdAt || ''}</span>
          <div class="pdf-card__likes">
            <button type="button" class="pdf-card__like ${isLiked ? 'is-active' : ''}" data-like="${pdf.id}" aria-label="Me gusta">❤</button>
            <span class="pdf-card__likes-count">${pdf.likes_count || 0}</span>
          </div>
          <button
            type="button"
            class="pdf-card__favorite ${isFav ? 'is-active' : ''}"
            data-fav="${pdf.id}"
            aria-label="Favorito" >
            ${isFav ? Icons.starFilled : Icons.star}
          </button>
        </div>
      </div>
    </article>
  `;
}

  function bindPdfCards(container, options = {}) {
    container.querySelectorAll('.pdf-card').forEach((card) => {
      const open = () => navigateToViewer(card.dataset.pdfId);
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-fav], [data-edit-doc], [data-delete-doc], [data-remove-collection-doc], [data-collection-doc], .pdf-card__download, .pdf-card__menu, .pdf-card__badge')) return;
        open();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.closest('[data-fav], [data-edit-doc], [data-delete-doc], [data-remove-collection-doc], [data-collection-doc], .pdf-card__download, .pdf-card__menu, .pdf-card__badge')) open();
      });
    });
    bindPdfCardMenus(container);
    container.querySelectorAll('[data-edit-doc]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onEdit?.(btn.dataset.editDoc);
      });
    });
    container.querySelectorAll('[data-delete-doc]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onDelete?.(btn.dataset.deleteDoc);
      });
    });
    container.querySelectorAll('[data-remove-collection-doc]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onRemoveFromCollection?.(btn.dataset.removeCollectionDoc);
      });
    });
    container.querySelectorAll('[data-collection-doc]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pdf = options.pdfs?.find((item) => item.id === btn.dataset.collectionDoc)
          || { id: btn.dataset.collectionDoc, title: btn.closest('.pdf-card')?.querySelector('.pdf-card__title')?.textContent?.trim() || 'Documento' };
        openCollectionPicker(pdf);
      });
    });
    // download buttons
    container.querySelectorAll('.pdf-card__download').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.downloadUrl;
        const name = btn.dataset.downloadName;
        if (!url) return Toast.show('URL de descarga no disponible');
        downloadPdf(url, name);
      });
    });
    // like buttons
    container.querySelectorAll('.pdf-card__like').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const user = await SmartAuth.getUser();
        if (!user) {
          SmartUI.Toast.show('Inicia sesión para dar me gusta');
          setTimeout(() => (window.location.href = 'login.html'), 800);
          return;
        }
        const docId = btn.dataset.like;
        try {
          const liked = await SmartDB.toggleLike(user.id, docId);
          // refresh count
          const count = await SmartDB.getLikesCount(docId);
          const countEl = btn.parentElement?.querySelector('.pdf-card__likes-count');
          if (countEl) countEl.textContent = count;
          btn.classList.toggle('is-active', !!liked);
          if (liked) likeCache.add(docId); else likeCache.delete(docId);
          Toast.show(liked ? 'Te gusta' : 'Ya no te gusta');
        } catch (err) {
          Toast.show(err.message || 'Error al procesar like');
        }
      });
    });
    container.querySelectorAll('[data-fav]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const user = await SmartAuth.getUser();
        if (!user) {
          SmartUI.Toast.show('Inicia sesión para guardar favoritos');
          setTimeout(() => (window.location.href = 'login.html'), 800);
          return;
        }
        try {
          const active = await SmartDB.toggleFavorite(user.id, btn.dataset.fav);
          if (active) favoriteCache.add(btn.dataset.fav);
          else favoriteCache.delete(btn.dataset.fav);
          btn.classList.toggle('is-active', active);
          btn.innerHTML = active ? Icons.starFilled : Icons.star;
          Toast.show(active ? 'Guardado' : 'Eliminado');
        } catch (err) {
          Toast.show(err.message);
        }
      });
    });
    // initialize like buttons and counts from backend/cache
    container.querySelectorAll('.pdf-card').forEach(async (card) => {
      const docId = card.dataset.pdfId;
      const likeBtn = card.querySelector('.pdf-card__like');
      const countEl = card.querySelector('.pdf-card__likes-count');
      if (likeBtn) likeBtn.classList.toggle('is-active', likeCache.has(docId));
      if (countEl) {
        try {
          const c = await SmartDB.getLikesCount(docId);
          countEl.textContent = c;
        } catch (e) {
          console.warn('Error fetching likes count', e);
        }
      }
    });
  }

// Lazy thumbnail observer for improved performance
  const thumbnailObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const canvas = entry.target;
        const url = canvas.dataset.fileUrl;
        if (url && typeof renderPdfThumbnail === 'function') {
          try { renderPdfThumbnail(url, canvas); } catch (e) { console.warn('Thumbnail render error', e); }
        }
        obs.unobserve(canvas);
      }
    });
  }, { root: null, rootMargin: '300px', threshold: 0.01 }) : null;

  function pdfGrid(pdfs, containerId, options = {}) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!pdfs?.length) {
      el.innerHTML = `
        <div class="empty-state">
          ${Icons.pdf}
          <p>No hay documentos aún</p>
        </div>
      `;
      return;
    }
    // Render markup quickly (gridClass opcional para variantes, ej. paginación)
    el.innerHTML = `
      <div class="pdf-grid${options.gridClass ? ` ${options.gridClass}` : ''}">
        ${pdfs.map((pdf) => pdfCard(pdf, options)).join('')}
      </div>
    `;

    // Bind interactivity once DOM is in place
    bindPdfCards(el, { ...options, pdfs });

    // Lazy-render thumbnails to avoid blocking the main thread
    if (thumbnailObserver) {
      el.querySelectorAll('.pdf-card').forEach((card, index) => {
        const canvas = card.querySelector('.pdf-thumbnail');
        const pdf = pdfs[index];
        if (canvas && pdf?.file_url) {
          // store url on the canvas and observe it; rendering happens when visible
          canvas.dataset.fileUrl = pdf.file_url;
          try { thumbnailObserver.unobserve(canvas); } catch (e) {}
          thumbnailObserver.observe(canvas);
        }
      });
    } else {
      // Fallback: render thumbnails but yield to event loop to avoid blocking
      el.querySelectorAll('.pdf-card').forEach((card, index) => {
        const canvas = card.querySelector('.pdf-thumbnail');
        const pdf = pdfs[index];
        if (canvas && pdf?.file_url) {
          setTimeout(() => {
            try { renderPdfThumbnail(pdf.file_url, canvas); } catch (e) { console.warn('Thumbnail render error', e); }
          }, 0);
        }
      });
    }
  }
  function categories(containerId, cats, active = 'all') {
    const el = document.getElementById(containerId);
    if (!el) return;

    const allCats = buildCategoryList(cats);
    const priorities = ['Todas','Ciencia','Ciencias Sociales','Derecho','Educación','General','Literatura','Programación'];

    const renderCat = (cat) => {
      const iconHtml = `<img src="${escapeHtml(cat.icon)}" alt="${escapeHtml(cat.name)}" class="category-pill__img">`;
      return `
        <button type="button" class="category-pill ${cat.key === active ? 'is-active' : ''}" data-category="${escapeHtml(cat.key)}">
          ${iconHtml}<span>${escapeHtml(cat.name)}</span>
        </button>`;
    };

    // Build prioritized HTML
    const priorityCats = [];
    const remaining = [];
    allCats.forEach((c) => {
      if (priorities.includes(c.name)) priorityCats.push(c);
      else remaining.push(c);
    });

    // Ensure order matches priorities array
    priorityCats.sort((a,b) => priorities.indexOf(a.name) - priorities.indexOf(b.name));

    const priorityHtml = priorityCats.map(renderCat).join('');

    el.innerHTML = `
      <div class="category-pills-wrapper">
        ${priorityHtml}
        <button type="button" class="category-pill" id="category-more-btn">+ Ver todas</button>
      </div>
    `;

    // '+ Ver todas' navigates to the categories page (do not open a modal here)
    const moreBtn = el.querySelector('#category-more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        // navigate to the existing categories listing page
        window.location.href = categoryUrl('');
      });
    }

  }

  function categoryCards(containerId, cats, active = 'all') {
    const el = document.getElementById(containerId);
    if (!el) return;

    const renderCat = (cat) => {
      const iconHtml = `<img src="${escapeHtml(cat.icon)}" alt="" class="category-card__icon">`;
      return `
        <a class="category-card ${cat.key === active ? 'is-active' : ''}" href="${categoryUrl(cat.key)}" data-category="${escapeHtml(cat.key)}">
          <span class="category-card__media">${iconHtml}</span>
          <span class="category-card__title">${escapeHtml(cat.name)}</span>
        </a>`;
    };

    el.innerHTML = `
      <div class="category-cards-wrapper">
        ${buildCategoryList(cats).map(renderCat).join('')}
      </div>
    `;
  }

  function continueReading(items, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items?.length) {
      el.innerHTML = '<p class="text-muted text-sm">Sin lecturas en progreso</p>';
      return;
    }
    el.innerHTML = `
      <div class="continue-row">
        ${items
          .map(
            ({ pdf, progress }) => `
      <div class="continue-item" data-pdf-id="${pdf.id}" tabindex="0">
        <div class="continue-item__thumb">${Icons.pdf}</div>
        <div class="continue-item__info">
          <strong class="text-sm">${escapeHtml(filterTitle(pdf.title))}</strong>
          <span class="text-muted text-sm">${progress}%</span>
          <div class="continue-item__progress"><div class="continue-item__progress-bar" style="width:${progress}%"></div></div>
        </div>
      </div>`
          )
          .join('')}
      </div>
    `;
    el.querySelectorAll('.continue-item').forEach((item) => {
      const go = () => navigateToViewer(item.dataset.pdfId);
      item.addEventListener('click', go);
      item.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    });
  }

  function openDocumentEditor(pdf, categoriesList = [], handlers = {}) {
    if (!pdf) return;
    const existing = document.querySelector('.modal-overlay');
    existing?.remove();

    const selectedCategories = getDocumentCategories(pdf);
    const categoryNames = (categoriesList.length ? categoriesList : [{ name: pdf.category || 'General' }])
      .map((cat) => cat?.name || cat)
      .filter((name) => String(name || '').toLowerCase() !== 'todas');
    selectedCategories.forEach((name) => {
      if (!categoryNames.includes(name)) categoryNames.unshift(name);
    });
    const categoriesOptions = categoryNames
      .map((cat) => {
        const name = cat;
        const selected = selectedCategories.includes(name) ? 'selected' : '';
        return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
      })
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="document-editor-title">
        <form class="document-editor">
          <div class="modal__header">
            <h2 id="document-editor-title" class="h3">Editar PDF</h2>
            <button type="button" class="btn btn--ghost btn--icon" data-modal-close aria-label="Cerrar">x</button>
          </div>
          <div class="input-group">
            <label class="input-label" for="doc-edit-title">Titulo</label>
            <input id="doc-edit-title" name="title" class="input" required value="${escapeHtml(pdf.title)}">
          </div>
          <div class="input-group">
            <label class="input-label" for="doc-edit-category">Categorias</label>
            <div id="doc-edit-categories-pills" class="category-pills-wrapper" style="margin-bottom:0.5rem"></div>
            <select id="doc-edit-category" name="categories" class="input input--multi" multiple size="${Math.min(Math.max(categoryNames.length, 4), 8)}" style="display:none">${categoriesOptions}</select>
            <p class="text-muted text-sm">Puedes elegir una o varias categorias.</p>
          </div>
          <div class="input-group">
            <label class="input-label" for="doc-edit-description">Descripcion</label>
            <textarea id="doc-edit-description" name="description" class="input" rows="4">${escapeHtml(pdf.description || '')}</textarea>
          </div>
          <div class="input-group">
            <label class="input-label">Visibilidad</label>
            <label class="toggle">
              <input type="checkbox" name="is_public" ${pdf.isPublic !== false ? 'checked' : ''}>
              <span class="toggle__slider"></span>
              <span class="toggle__label">Público</span>
            </label>
          </div>
          <div class="modal__actions">
            <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
            <button type="submit" class="btn btn--primary">Guardar cambios</button>
          </div>
        </form>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-modal-close]')) close();
    });
    overlay.querySelector('form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const selectedCategoryValues = Array.from(form.elements.categories.selectedOptions || [])
        .map((option) => option.value)
        .filter(Boolean);
      const payload = {
        title: form.elements.title.value.trim(),
        category: selectedCategoryValues[0] || pdf.category || 'General',
        categories: selectedCategoryValues.length ? selectedCategoryValues : [pdf.category || 'General'],
        description: form.elements.description.value.trim(),
        is_public: form.elements.is_public?.checked ?? true,
      };
      if (!payload.title) return;
      if (containsForbiddenTitle(payload.title)) {
        Toast.show('Esas palabras están prohibidas en el título');
        return;
      }
      submit.disabled = true;
      try {
        await handlers.onSave?.(pdf.id, payload);
        close();
      } catch (err) {
        Toast.show(err.message || 'No se pudo guardar');
        submit.disabled = false;
      }
    });

    document.body.appendChild(overlay);

    // Render interactive pills for the editor form, syncing with the hidden select
    (function renderEditorPills() {
      const select = overlay.querySelector('#doc-edit-category');
      const pillsContainer = overlay.querySelector('#doc-edit-categories-pills');
      if (!select || !pillsContainer) return;
      pillsContainer.innerHTML = '';
      pillsContainer.style.display = 'flex';

      // prioritized categories shown inline
      const priority = ['Todas','Ciencia','Ciencias Sociales','Derecho','Educación','General','Literatura','Programación'];
      const allOptions = Array.from(select.options).map(o => ({ name: o.value }));
      const allNames = allOptions.map(o => o.name);

      // helper local detection for icons
      function localIsImageIcon(icon) {
        const value = String(icon || '');
        return /^(https?:|data:image\/|assets\/|\.?\/|\/)/i.test(value) || /\.(svg|png|jpe?g|webp|gif)$/i.test(value);
      }

      // Render priority pills
      priority.forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'category-pill';
        btn.setAttribute('data-value', p);
        btn.textContent = p;
        // if option exists, hookup to select option toggling
        const opt = Array.from(select.options).find(o => o.value === p);
        if (opt) {
          if (opt.selected) btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', String(!!opt.selected));
          btn.addEventListener('click', () => {
            opt.selected = !opt.selected;
            const active = !!opt.selected;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
          });
        } else {
          // no matching option in select: toggle visual only
          btn.addEventListener('click', () => {
            const active = btn.classList.toggle('is-active');
            btn.setAttribute('aria-pressed', String(active));
          });
        }
        pillsContainer.appendChild(btn);
      });

      // + Ver todas
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'category-pill';
      moreBtn.textContent = '+ Ver todas';
      moreBtn.addEventListener('click', () => {
        // open modal showing all options and sync back to select
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();
        const overlayModal = document.createElement('div');
        overlayModal.className = 'modal-overlay';
        const optionsHtml = Array.from(select.options).map(o => `<button type="button" class="category-pill" data-value="${escapeHtml(o.value)}">${escapeHtml(o.value)}</button>`).join('');
        overlayModal.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal__header"><h2 class="h3">Categorías</h2><button type="button" class="btn btn--ghost btn--icon" data-modal-close aria-label="Cerrar">x</button></div>
            <div class="modal__body" style="padding:1rem;display:flex;flex-direction:column;gap:0.6rem;">
              <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">${optionsHtml}</div>
            </div>
            <div class="modal__actions" style="display:flex;gap:0.5rem;justify-content:flex-end;padding:0.6rem;">
              <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
              <button type="button" class="btn btn--primary" id="categories-modal-save-editor">Guardar</button>
            </div>
          </div>`;
        document.body.appendChild(overlayModal);
        // init from select
        const selectedSet = new Set(Array.from(select.selectedOptions).map(o=>o.value));
        overlayModal.querySelectorAll('.category-pill[data-value]').forEach((btn) => {
          const val = btn.getAttribute('data-value');
          if (selectedSet.has(val)) btn.classList.add('is-active');
          btn.addEventListener('click', () => btn.classList.toggle('is-active'));
        });
        overlayModal.addEventListener('click', (e) => { if (e.target === overlayModal || e.target.closest('[data-modal-close]')) overlayModal.remove(); });
        overlayModal.querySelector('#categories-modal-save-editor').addEventListener('click', () => {
          const chosen = Array.from(overlayModal.querySelectorAll('.category-pill.is-active')).map(b => b.getAttribute('data-value'));
          Array.from(select.options).forEach(o => o.selected = false);
          chosen.forEach(value => { const o = Array.from(select.options).find(opt => opt.value === value); if (o) o.selected = true; });
          if (!Array.from(select.selectedOptions).length && select.options.length) select.options[0].selected = true;
          // sync main pills highlighting
          Array.from(pillsContainer.querySelectorAll('.category-pill[data-value]')).forEach((btn) => {
            const val = btn.getAttribute('data-value');
            const opt = Array.from(select.options).find(o => o.value === val);
            const isActive = !!(opt && opt.selected);
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
          });
          overlayModal.remove();
        });
      });
      pillsContainer.appendChild(moreBtn);

    })();

    overlay.querySelector('[name="title"]')?.focus();
  }

  async function openCollectionPicker(pdf) {
    const user = await SmartAuth.getUser();
    if (!user) {
      Toast.show('Inicia sesión para usar colecciones');
      setTimeout(() => (window.location.href = 'login.html'), 800);
      return;
    }
    if (!SmartDB.isReady()) {
      Toast.show('Configura Supabase en js/config.js');
      return;
    }

    const existing = document.querySelector('.modal-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="collection-picker-title">
        <div class="collection-picker">
          <div class="modal__header">
            <div>
              <h2 id="collection-picker-title" class="h3">Agregar a colección</h2>
              <p class="text-muted text-sm">${escapeHtml(filterTitle(pdf?.title || 'Documento'))}</p>
            </div>
            <button type="button" class="btn btn--ghost btn--icon" data-modal-close aria-label="Cerrar">x</button>
          </div>
          <div class="collection-picker__body">
            <div id="collection-picker-list" class="collection-picker__list">
              <p class="text-muted text-sm">Cargando colecciones...</p>
            </div>
            <form id="collection-create-form" class="collection-create-form">
              <div class="input-group">
                <label class="input-label" for="collection-name">Nueva colección</label>
                <input id="collection-name" name="name" class="input" placeholder="Nombre de la colección">
              </div>
              <button type="submit" class="btn btn--primary btn--sm">Crear y agregar</button>
            </form>
          </div>
        </div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-modal-close]')) close();
    });

    async function renderCollections() {
      const list = overlay.querySelector('#collection-picker-list');
      if (!list) return;
      try {
        const collections = await SmartDB.getCollections(user.id);
        if (!collections.length) {
          list.innerHTML = '<p class="text-muted text-sm">Aún no tienes colecciones. Crea una abajo.</p>';
          return;
        }
        list.innerHTML = collections.map((collection) => `
          <button type="button" class="collection-picker__item" data-add-to-collection="${collection.id}">
            <span>
              <strong>${escapeHtml(collection.name)}</strong>
              <small>${collection.is_public ? 'Compartida' : 'Privada'}</small>
            </span>
            <span>Agregar</span>
          </button>
        `).join('');
        list.querySelectorAll('[data-add-to-collection]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await SmartDB.addDocumentToCollection(btn.dataset.addToCollection, pdf.id);
              Toast.show('Agregado a la colección');
              close();
            } catch (err) {
              Toast.show(err.message || 'No se pudo agregar');
              btn.disabled = false;
            }
          });
        });
      } catch (err) {
        list.innerHTML = '<p class="text-muted text-sm">No se pudieron cargar tus colecciones.</p>';
      }
    }

    overlay.querySelector('#collection-create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const name = form.elements.name.value.trim();
      if (!name) return;
      submit.disabled = true;
      try {
        const collection = await SmartDB.createCollection(user.id, { name });
        await SmartDB.addDocumentToCollection(collection.id, pdf.id);
        Toast.show('Colección creada y documento agregado');
        close();
      } catch (err) {
        Toast.show(err.message || 'No se pudo crear la colección');
        submit.disabled = false;
      }
    });

    document.body.appendChild(overlay);
    await renderCollections();
    overlay.querySelector('[name="name"]')?.focus();
  }

  function initNavbar() {
    const toggle = document.querySelector('.navbar__toggle');
    const mobile = document.querySelector('.navbar__mobile');
    const body = document.body;
    toggle?.addEventListener('click', () => {
      const open = mobile?.classList.toggle('is-open');
      body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobile?.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        mobile.classList.remove('is-open');
        body.classList.remove('menu-open');
      })
    );

    // Highlight active navbar link based on current path
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar__nav a').forEach((a) => {
      const href = a.getAttribute('href')?.split('/').pop();
      if (href === path) a.classList.add('is-active');
      else a.classList.remove('is-active');
    });
  }

  function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const openBtn = document.querySelector('.topbar__menu-btn');
    if (!sidebar) return;
    const close = () => {
      sidebar.classList.remove('is-open');
      overlay?.classList.remove('is-visible');
      document.body.classList.remove('menu-open');
    };
    const open = () => {
      sidebar.classList.add('is-open');
      overlay?.classList.add('is-visible');
      document.body.classList.add('menu-open');
    };
    openBtn?.addEventListener('click', open);
    overlay?.addEventListener('click', close);
    const path = window.location.pathname.split('/').pop();
    sidebar.querySelectorAll('.sidebar__link').forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href')?.split('#')[0] === path);
    });
  }

  async function initHome() {
    await SmartDB.whenReady;
    await loadFavoriteIds();
    let activeCategory = 'all';
    const searchInput = document.getElementById('hero-search');
    const viewAllLink = document.getElementById('view-all-link');
    const cats = SmartDB.isReady() ? await SmartDB.getCategories() : [];
    // in-memory caches and tokens to avoid redundant queries and race conditions
    const documentsCache = {}; // key -> docs array
    let popularCache = null;
    let categorySectionsLoaded = false;
    let currentLoadToken = 0;
    categories('categories', cats, activeCategory);

    function updateViewAllLink() {
      if (!viewAllLink) return;
      const params = new URLSearchParams({ all: '1' });
      if (activeCategory && activeCategory !== 'all') {
        params.set('category', activeCategory);
      }
      viewAllLink.href = `dashboard.html?${params.toString()}`;
    }

    async function loadLists() {
      // token to prevent race conditions when user changes category rapidly
      const token = ++currentLoadToken;
      const search = searchInput?.value?.trim();
      const cat = activeCategory === 'all' ? null : activeCategory;
      const cacheKey = `${cat || 'all'}::${search || ''}`;

      // Try to reuse cached documents for this category+search
      let docs = documentsCache[cacheKey];
      if (!docs) {
        docs = SmartDB.isReady() ? await SmartDB.getDocuments({ limit: 36, category: cat, search: search || undefined }) : [];
        documentsCache[cacheKey] = docs;
      }
      // If user changed category in the meantime, discard this result
      if (token !== currentLoadToken) return;

      // Render recent documents (subset)
      if (docs.length > 0) {
        pdfGrid(docs.slice(0, Math.min(14, docs.length)), 'recent-pdfs');
      } else {
        pdfGrid([], 'recent-pdfs');
      }

      // Popular documents — cache once (rarely changes)
      if (!popularCache) popularCache = SmartDB.isReady() ? await SmartDB.getPopular(14) : (docs.length > 0 ? docs.slice(0, 14) : []);
      if (token !== currentLoadToken) return;
      pdfGrid(popularCache.length > 0 ? popularCache.slice(0, 14) : [], 'popular-pdfs');

      // Per-category sections: only populate once on initial load (for 'all' view) to avoid repeated queries
      const categorySection = document.getElementById('category-pdfs');
      if (cat === null && categorySection && !categorySectionsLoaded) {
        categorySectionsLoaded = true;
        const catsAll = SmartDB.isReady() ? await SmartDB.getCategories() : [];
        if (token !== currentLoadToken) return;
        if (catsAll.length > 0) {
          const catNames = catsAll.map(c => c.name || c).filter(n => String(n).toLowerCase() !== 'todas');
          let categoryHtml = '';
          for (const catName of catNames.slice(0, 6)) {
            const catDocs = await SmartDB.getDocuments({ limit: 3, category: catName });
            if (token !== currentLoadToken) return;
            if (catDocs.length > 0) {
              categoryHtml += `
                <div style="margin-bottom:2rem">
                  <div class="section-header"><h3 class="h3">${escapeHtml(catName)}</h3></div>
                  <div class="pdf-grid category-pdf-grid" data-category="${escapeHtml(catName)}">
                    ${catDocs.map(pdf => pdfCard(pdf)).join('')}
                  </div>
                </div>
              `;
            }
          }
          if (categoryHtml) {
            categorySection.innerHTML = categoryHtml;
            // Re-bind cards for each category grid but avoid eager thumbnail rendering
            categorySection.querySelectorAll('.category-pdf-grid').forEach((grid) => {
              bindPdfCards(grid, { pdfs: [] });
              grid.querySelectorAll('.pdf-card').forEach((card, idx) => {
                const canvas = card.querySelector('.pdf-thumbnail');
                const pdfId = card.dataset.pdfId;
                if (canvas && pdfId) {
                  // lazy render using existing observer
                  SmartDB.getDocument(pdfId).then(pdf => {
                    if (pdf?.file_url) {
                      try { canvas.dataset.fileUrl = pdf.file_url; thumbnailObserver?.observe(canvas); } catch (e) {}
                    }
                  });
                }
              });
            });
          }
        }
      }
    }

    updateViewAllLink();
    await loadLists();

    document.getElementById('categories')?.addEventListener('click', async (e) => {
      const pill = e.target.closest('.category-pill');
      if (!pill) return;
      // in-place filtering: set activeCategory and reload lists
      activeCategory = pill.dataset.category || 'all';
      document.querySelectorAll('#categories .category-pill').forEach((p) => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      updateViewAllLink();
      // reset any pagination state if present by navigating to first page param (if used elsewhere)
      // call loadLists to refresh displayed documents
      await loadLists();
    });

    const doSearch = () => {
      const q = searchInput?.value?.trim();
      if (q) window.location.href = `dashboard.html?q=${encodeURIComponent(q)}`;
      else loadLists();
    };
    document.getElementById('hero-search-btn')?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await SmartDB.whenReady;
    initNavbar();
    initSidebar();
    if (document.body.dataset.page === 'home') await initHome();
  });

  return { Toast, escapeHtml, initials, filterTitle, containsForbiddenTitle, pdfGrid, categories, categoryCards, continueReading, loadFavoriteIds, navigateToViewer, downloadPdf, openDocumentEditor, openCollectionPicker };
})();

SmartUI;
