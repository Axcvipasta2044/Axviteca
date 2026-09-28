(function () {
  'use strict';

  let deferredInstallPrompt = null;
  let installBanner = null;
  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  function isInstalled() {
    return standaloneMedia.matches || window.navigator.standalone === true;
  }

  function hideInstallBanner(saveDismissal = true) {
    if (!installBanner) return;
    installBanner.remove();
    installBanner = null;
    if (saveDismissal) {
      try { localStorage.setItem('pwa-install-dismissed', '1'); } catch {}
    }
  }

  async function installApplication() {
    if (!deferredInstallPrompt || isInstalled()) {
      hideInstallBanner();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    hideInstallBanner(false); // No guardar dismissal, el usuario aún no decidió

    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (error) {
      console.warn('No se pudo abrir el diálogo de instalación.', error);
    }
  }

  function showInstallBanner() {
    if (!deferredInstallPrompt || isInstalled() || installBanner) return;
    // Solo mostrar una vez por usuario (a menos que ya esté instalada)
    try {
      if (localStorage.getItem('pwa-install-dismissed')) return;
    } catch {}

    installBanner = document.createElement('div');
    installBanner.className = 'pwa-install-banner';
    installBanner.innerHTML = `
      <div class="pwa-install-banner__body">
        <div class="pwa-install-banner__message">
          <strong>Instala Smart Aula</strong>
          <span>Agrega esta app a tu pantalla de inicio para acceder rápido.</span>
        </div>
        <div class="pwa-install-banner__actions">
          <button type="button" class="pwa-install-banner__action pwa-install-banner__action--install">Instalar</button>
          <button type="button" class="pwa-install-banner__action pwa-install-banner__action--dismiss">Ahora no</button>
        </div>
      </div>
    `;

    document.body.appendChild(installBanner);
    installBanner.querySelector('.pwa-install-banner__action--install')?.addEventListener('click', installApplication);
    installBanner.querySelector('.pwa-install-banner__action--dismiss')?.addEventListener('click', hideInstallBanner);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showInstallBanner, { once: true });
    } else {
      showInstallBanner();
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
    try { localStorage.removeItem('pwa-install-dismissed'); } catch {}
  });

  const handleDisplayModeChange = () => {
    if (isInstalled()) {
      deferredInstallPrompt = null;
      hideInstallBanner();
    }
  };

  if (typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', handleDisplayModeChange);
  }

  async function registerServiceWorker() {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!('serviceWorker' in navigator) || (!window.isSecureContext && !isLocal)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      await registration.update();
    } catch (error) {
      console.warn('No se pudo registrar el Service Worker.', error);
    }
  }

  window.addEventListener('load', registerServiceWorker, { once: true });
})();
