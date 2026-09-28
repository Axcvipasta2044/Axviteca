/**
 * Smart Aula - Subida de PDFs
 */
(async function initUpload() {
  await SmartDB.whenReady;
  const ok = await SmartAuth.requireAuth();
  if (!ok) return;

  const user = await SmartAuth.getUser();
  if (!user) return;
  await SmartDB.ensureUserProfile(user);
  await SmartAuth.hydrateSidebar();

  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('upload-preview');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const previewCanvas = document.getElementById('preview-canvas');
  const form = document.getElementById('upload-form');
  const submitBtn = document.getElementById('upload-submit');
  const MAX_SIZE = 25 * 1024 * 1024;
  let selectedFile = null;

  async function loadCategories() {
    function localIsImageIcon(icon) {
      const value = String(icon || '');
      return /^(https?:|data:image\/|assets\/|\.\/|\/)/i.test(value) || /\.(svg|png|jpe?g|webp|gif)$/i.test(value);
    }

    const select = form?.querySelector('[name="categories"]');
    const pillsContainer = document.getElementById('upload-categories-pills');
    if (!select || !pillsContainer) return;

    let cats = [];
    try {
      cats = SmartDB.isReady() ? await SmartDB.getCategories() : [];
    } catch (err) {
      console.warn('No se pudieron cargar categorias desde SmartDB:', err);
      cats = [];
    }

    const fallbackCats = [{ name: 'General' }, { name: 'Educacion' }];
    const seen = new Set();
    const allCats = (Array.isArray(cats) && cats.length ? cats : fallbackCats)
      .map((cat) => ({ name: String(cat?.name || cat || '').trim(), icon: cat?.icon }))
      .filter((cat) => cat.name && cat.name.toLowerCase() !== 'todas')
      .filter((cat) => {
        const key = cat.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const priority = ['Ciencia', 'Ciencias Sociales', 'Derecho', 'Educacion', 'General', 'Literatura', 'Programacion'];
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const priorityIndex = new Map(priority.map((name, index) => [normalize(name), index]));
    const orderedCats = [...allCats].sort((a, b) => {
      const ai = priorityIndex.has(normalize(a.name)) ? priorityIndex.get(normalize(a.name)) : 999;
      const bi = priorityIndex.has(normalize(b.name)) ? priorityIndex.get(normalize(b.name)) : 999;
      return ai === bi ? a.name.localeCompare(b.name, 'es') : ai - bi;
    });
    const inlineCats = orderedCats.slice(0, Math.min(8, orderedCats.length));

    select.innerHTML = orderedCats
      .map((cat) => {
        const name = SmartUI.escapeHtml(cat.name);
        return `<option value="${name}">${name}</option>`;
      })
      .join('');

    function syncPills() {
      const selected = new Set(Array.from(select.selectedOptions).map((option) => option.value));
      pillsContainer.querySelectorAll('.category-pill[data-value]').forEach((btn) => {
        const isActive = selected.has(btn.getAttribute('data-value'));
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
    }

    function toggleCategory(value) {
      const option = Array.from(select.options).find((opt) => opt.value === value);
      if (!option) return;
      option.selected = !option.selected;
      syncPills();
    }

    pillsContainer.innerHTML = '';
    pillsContainer.style.display = 'flex';

    inlineCats.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-pill';
      btn.setAttribute('data-value', cat.name);
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = cat.name;
      btn.addEventListener('click', () => toggleCategory(cat.name));
      pillsContainer.appendChild(btn);
    });

    if (orderedCats.length > inlineCats.length) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'category-pill';
      moreBtn.textContent = '+ Ver todas';
      moreBtn.addEventListener('click', () => openCategoriesModal(orderedCats));
      pillsContainer.appendChild(moreBtn);
    }

    syncPills();

    function openCategoriesModal(allCatsList) {
      document.querySelector('.modal-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const optionsHtml = allCatsList.map((cat) => `
        <button type="button" class="category-pill" data-value="${SmartUI.escapeHtml(cat.name)}" aria-pressed="false">
          ${localIsImageIcon(cat.icon) ? `<img src="${SmartUI.escapeHtml(cat.icon)}" alt="" class="category-pill__img">` : ''}
          <span>${SmartUI.escapeHtml(cat.name)}</span>
        </button>
      `).join('');

      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal__header">
            <h2 class="h3">Categorias</h2>
            <button type="button" class="btn btn--ghost btn--icon" data-modal-close aria-label="Cerrar">x</button>
          </div>
          <div class="modal__body">
            <div class="category-modal-grid">${optionsHtml}</div>
          </div>
          <div class="modal__actions">
            <button type="button" class="btn btn--secondary" data-modal-close>Cancelar</button>
            <button type="button" class="btn btn--primary" id="categories-modal-save">Guardar</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const selected = new Set(Array.from(select.selectedOptions).map((option) => option.value));
      overlay.querySelectorAll('.category-pill[data-value]').forEach((btn) => {
        const isActive = selected.has(btn.getAttribute('data-value'));
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
        btn.addEventListener('click', () => {
          const active = btn.classList.toggle('is-active');
          btn.setAttribute('aria-pressed', String(active));
        });
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay || event.target.closest('[data-modal-close]')) overlay.remove();
      });

      overlay.querySelector('#categories-modal-save')?.addEventListener('click', () => {
        const chosen = Array.from(overlay.querySelectorAll('.category-pill.is-active'))
          .map((btn) => btn.getAttribute('data-value'))
          .filter(Boolean);
        Array.from(select.options).forEach((option) => {
          option.selected = chosen.includes(option.value);
        });
        syncPills();
        overlay.remove();
      });
    }
  }
  await loadCategories();

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async function renderPdfPreview(file) {
    if (!previewCanvas || typeof pdfjsLib === 'undefined') return;
    if (file.type !== 'application/pdf') {
      previewCanvas.style.display = 'none';
      return;
    }
    previewCanvas.style.display = 'block';
    const url = URL.createObjectURL(file);
    try {
      const pdf = await pdfjsLib.getDocument(url).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.45 });
      previewCanvas.width = viewport.width;
      previewCanvas.height = viewport.height;
      await page.render({ canvasContext: previewCanvas.getContext('2d'), viewport }).promise;
    } catch {
      previewCanvas.style.display = 'none';
    }
    URL.revokeObjectURL(url);
  }

  function handleFile(file) {
    if (!file) return;
    const accepted = new Set(['application/pdf', 'application/rtf', 'text/plain']);
    const allowedExt = ['.pdf', '.rtf', '.txt'];
    const name = (file.name || '').toLowerCase();
    const byExt = allowedExt.some((ext) => name.endsWith(ext));
    if (!accepted.has(file.type) && !byExt) {
      SmartUI.Toast.show('Tipo de archivo no soportado. Usa PDF, RTF o TXT.');
      return;
    }
    if (file.size > MAX_SIZE) {
      SmartUI.Toast.show('Maximo 25 MB');
      return;
    }
    selectedFile = file;
    preview?.classList.add('is-visible');
    if (previewName) previewName.textContent = file.name;
    if (previewSize) previewSize.textContent = formatBytes(file.size);
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      renderPdfPreview(file);
    } else {
      previewCanvas.style.display = 'none';
      SmartUI.Toast.show('Este archivo sera convertido a PDF antes de publicarlo');
    }
  }

  zone?.addEventListener('click', () => fileInput?.click());
  zone?.addEventListener('keydown', (e) => e.key === 'Enter' && fileInput?.click());
  zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-dragover'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener('change', () => handleFile(fileInput.files[0]));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return SmartUI.Toast.show('Selecciona un PDF');
    if (!SmartDB.isReady()) return SmartUI.Toast.show('Configura js/config.js');

    const freshUser = await SmartAuth.getUser();
    if (!freshUser) return (window.location.href = 'login.html?redirect=upload.html');

    await SmartDB.ensureUserProfile(freshUser);

    const title = form.querySelector('[name="title"]')?.value?.trim() || selectedFile.name.replace(/\.pdf$/i, '');
    const description = form.querySelector('[name="description"]')?.value?.trim() || '';
    const categoriesSelect = form.querySelector('[name="categories"]');
    let categories = [];
    if (categoriesSelect) {
      categories = Array.from(categoriesSelect.selectedOptions).map((option) => option.value).filter(Boolean);
    }
    if (!categories.length) categories = [(form.querySelector('[name="category"]')?.value) || 'General'];
    const category = categories[0] || 'General';
    const isPublic = form.querySelector('[name="is_public"]')?.checked ?? true;

    if (SmartUI.containsForbiddenTitle(title)) {
      SmartUI.Toast.show('Esas palabras estan prohibidas en el titulo');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Subiendo...';

    try {
      let fileToUpload = selectedFile;
      if (selectedFile.type !== 'application/pdf') {
        submitBtn.textContent = 'Convirtiendo a PDF...';
        try {
          fileToUpload = await maybeConvertToPdf(selectedFile);
          if (!fileToUpload) throw new Error('No se obtuvo PDF convertido');
        } catch (convErr) {
          throw new Error(convErr.message || 'No se pudo convertir a PDF');
        }
      }

      submitBtn.textContent = 'Subiendo...';
      const { path, publicUrl } = await SmartDB.uploadPdf(fileToUpload, freshUser.id);
      const doc = await SmartDB.insertDocument({
        title,
        description,
        category,
        categories,
        file_url: publicUrl,
        file_path: path,
        user_id: freshUser.id,
        is_public: isPublic,
        views: 0,
        downloads: 0,
      });
      SmartUI.Toast.show('PDF publicado');
      window.location.href = 'dashboard.html?all=1';
    } catch (err) {
      SmartUI.Toast.show(err.message || 'Error al subir');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publicar en Smart Aula';
    }
  });

  async function maybeConvertToPdf(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/.netlify/functions/convert', { method: 'POST', body: formData });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || 'Error en conversion');
      }
      const blob = await resp.blob();
      if (!blob || blob.type !== 'application/pdf') {
        if (!blob || blob.size === 0) throw new Error('Archivo convertido vacio');
      }
      const name = (file.name || 'document').replace(/\.[^.]+$/, '') + '.pdf';
      return new File([blob], name, { type: 'application/pdf' });
    } catch (err) {
      throw err;
    }
  }
})();
