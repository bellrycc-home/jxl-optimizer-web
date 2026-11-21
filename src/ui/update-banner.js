// Service worker registration + "new version available" banner.
// An update is never applied on its own: the banner offers it, and the button
// stays disabled while a conversion is running (isBusy), so a batch is never
// interrupted by a reload.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker({ isBusy = () => false, onInfo = () => {}, onWarn = () => {} } = {}) {
  if (!('serviceWorker' in navigator)) return;

  let banner = null;
  let userRequested = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install also fires this (clients.claim); only reload when the user
    // explicitly accepted an update.
    if (userRequested) window.location.reload();
  });

  function showBanner(registration) {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.className = 'update-text';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'button button-small button-primary';
    apply.textContent = 'Actualizar ahora';
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'button button-small button-ghost';
    later.textContent = 'Más tarde';
    const actions = document.createElement('span');
    actions.className = 'update-banner-actions';
    actions.append(apply, later);
    banner.append(text, actions);

    const sync = () => {
      const busy = isBusy();
      apply.disabled = busy || userRequested;
      text.textContent = busy
        ? 'Hay una versión nueva. Podrás actualizar cuando termine la conversión en curso.'
        : 'Hay una versión nueva de la aplicación disponible.';
    };
    sync();
    const timer = setInterval(sync, 1000);

    apply.addEventListener('click', () => {
      if (isBusy()) return;
      const worker = registration.waiting;
      if (!worker) return;
      userRequested = true;
      apply.disabled = true;
      text.textContent = 'Actualizando…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    later.addEventListener('click', () => {
      clearInterval(timer);
      banner.remove();
      banner = null;
    });
    document.body.append(banner);
    onInfo('Hay una versión nueva disponible; podrás aplicarla desde el aviso inferior.');
  }

  async function start() {
    try {
      const registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
      const offer = () => {
        if (registration.waiting && navigator.serviceWorker.controller) showBanner(registration);
      };
      offer();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') offer();
        });
      });
      const check = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, CHECK_INTERVAL_MS);
    } catch (error) {
      onWarn(`No se pudo registrar el service worker: ${error.message}`);
    }
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
