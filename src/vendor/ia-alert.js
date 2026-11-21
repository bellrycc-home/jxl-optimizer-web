/*!
 * IA_Alert 2.0 — aviso de contenido generado por IA sin revisión humana.
 * Un solo archivo, sin dependencias: inyecta su propio CSS.
 * Docs: README.md
 */
(function (global) {
  'use strict';

  const doc = global.document;
  if (!doc) return;

  // Capturar ahora: document.currentScript solo existe mientras corre el script.
  const scriptEl = doc.currentScript || null;

  const VERSION = '2.0.0';
  const POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
  const COLLAPSED = 44; // lado del cuadrado colapsado (px)

  const I18N = {
    es: {
      message: 'Esta web ha sido generada con IA y no ha sido revisada por un humano.',
      title: 'Advertencia',
      ok: 'Entendido',
      close: 'Cerrar aviso',
      show: 'Mostrar advertencia de IA',
    },
    en: {
      message: 'This website was generated with AI and has not been reviewed by a human.',
      title: 'Warning',
      ok: 'Got it',
      close: 'Close notice',
      show: 'Show AI warning',
    },
  };

  const CSS = `
.ia-alert-root{--ia-bg:rgba(42,36,25,.96);--ia-border:rgba(251,191,36,.5);--ia-fg:#fde68a;--ia-icon:#fbbf24;--ia-glow:rgba(251,191,36,.35);--ia-fab-bg:rgba(15,23,42,.94);--ia-pop-bg:#0f172a;--ia-pop-border:#334155;--ia-pop-fg:#cbd5e1;--ia-pop-title:#fde68a;--ia-btn-bg:#1e293b;--ia-btn-bg-hover:#334155;--ia-btn-fg:#e2e8f0;--ia-backdrop:rgba(2,6,23,.7);--ia-hit:18px}
.ia-alert-root[data-ia-theme="light"]{--ia-bg:#fef3c7;--ia-border:#d97706;--ia-fg:#78350f;--ia-icon:#b45309;--ia-glow:rgba(180,83,9,.28);--ia-fab-bg:#fffbeb;--ia-pop-bg:#fff;--ia-pop-border:#e5e7eb;--ia-pop-fg:#374151;--ia-pop-title:#92400e;--ia-btn-bg:#f3f4f6;--ia-btn-bg-hover:#e5e7eb;--ia-btn-fg:#111827;--ia-backdrop:rgba(15,23,42,.45)}
.ia-alert-root,.ia-alert-root *{box-sizing:border-box}
.ia-alert-root[hidden]{display:none!important}

.ia-alert-pos-bottom-left{left:max(.75rem,env(safe-area-inset-left));bottom:max(.75rem,env(safe-area-inset-bottom))}
.ia-alert-pos-bottom-right{right:max(.75rem,env(safe-area-inset-right));bottom:max(.75rem,env(safe-area-inset-bottom))}
.ia-alert-pos-top-left{left:max(.75rem,env(safe-area-inset-left));top:max(.75rem,env(safe-area-inset-top))}
.ia-alert-pos-top-right{right:max(.75rem,env(safe-area-inset-right));top:max(.75rem,env(safe-area-inset-top))}

/* ===== Escritorio ===== */
.ia-alert-host{font-family:inherit}
.ia-alert-fixed{position:fixed;z-index:9990}
.ia-alert-inline{position:relative;display:inline-flex;flex:0 1 auto;min-width:0;margin:0 .75rem;z-index:30}
/* "Colider" invisible alrededor del cuadrado: forma parte del host para el hover */
.ia-alert-host::before{content:"";position:absolute;inset:calc(var(--ia-hit) * -1)}
.ia-alert-widget{position:relative;z-index:1;display:flex;align-items:center;gap:.5rem;width:44px;height:44px;max-width:min(460px,calc(100vw - 1.5rem));margin:0;padding:0 11px;overflow:hidden;-webkit-appearance:none;appearance:none;cursor:pointer;text-align:left;font:inherit;color:var(--ia-fg);background:var(--ia-bg);border:1px solid var(--ia-border);border-radius:.75rem;box-shadow:0 8px 20px -8px var(--ia-glow);transition:width .28s ease,height .28s ease,transform .2s ease}
.ia-alert-widget:hover{transform:scale(1.03)}
.ia-alert-widget:focus-visible{outline:2px solid var(--ia-icon);outline-offset:2px}
.ia-alert-icon{flex:none;color:var(--ia-icon)}
.ia-alert-text{font-size:.82rem;line-height:1.3;padding:10px 6px 10px 0;opacity:0;transition:opacity .2s ease .08s}
.ia-alert-expanded .ia-alert-text{opacity:1}

/* ===== Móvil / táctil ===== */
.ia-alert-banner{position:fixed;z-index:9990;top:max(.6rem,env(safe-area-inset-top));left:max(.6rem,env(safe-area-inset-left));right:max(.6rem,env(safe-area-inset-right));display:flex;align-items:flex-start;gap:.6rem;padding:.7rem .75rem;border-radius:.85rem;background:var(--ia-bg);border:1px solid var(--ia-border);color:var(--ia-fg);font-size:.85rem;line-height:1.4;box-shadow:0 16px 32px -14px var(--ia-glow);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:ia-alert-in .32s cubic-bezier(.22,1,.36,1)}
.ia-alert-banner.ia-alert-hiding{animation:ia-alert-out .28s ease forwards}
.ia-alert-banner .ia-alert-icon{margin-top:.1rem}
.ia-alert-banner-text{flex:1;min-width:0}
.ia-alert-banner-close{flex:none;width:36px;height:36px;margin:-.2rem -.2rem -.2rem 0;display:flex;align-items:center;justify-content:center;padding:0;border-radius:.6rem;background:transparent;border:1px solid var(--ia-border);color:var(--ia-fg);font:inherit;font-size:1.3rem;line-height:1;cursor:pointer}
.ia-alert-banner-close:active{background:var(--ia-glow)}
.ia-alert-fab{position:fixed;z-index:9990;width:44px;height:44px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:.75rem;background:var(--ia-fab-bg);border:1px solid var(--ia-border);color:var(--ia-icon);cursor:pointer;box-shadow:0 10px 24px -10px rgba(0,0,0,.6);animation:ia-alert-fab-in .28s cubic-bezier(.34,1.56,.64,1)}
.ia-alert-fab:active{transform:scale(.92)}
.ia-alert-banner-close:focus-visible,.ia-alert-fab:focus-visible,.ia-alert-popup-close:focus-visible{outline:2px solid var(--ia-icon);outline-offset:2px}

/* ===== Popup ===== */
.ia-alert-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;background:var(--ia-backdrop);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);font-family:inherit}
.ia-alert-popup{width:100%;max-width:440px;padding:1.25rem 1.35rem;background:var(--ia-pop-bg);border:1px solid var(--ia-pop-border);border-radius:1rem;color:var(--ia-pop-fg);box-shadow:0 25px 50px -12px rgba(0,0,0,.5);animation:ia-alert-pop .18s ease-out}
.ia-alert-popup-header{display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem}
.ia-alert-popup-title{font-weight:700;font-size:.95rem;color:var(--ia-pop-title)}
.ia-alert-popup-body{font-size:.9rem;line-height:1.5}
.ia-alert-popup-close{margin:1rem 0 0;width:100%;padding:.65rem .75rem;border-radius:.6rem;background:var(--ia-btn-bg);border:1px solid var(--ia-pop-border);color:var(--ia-btn-fg);font:inherit;font-size:.9rem;cursor:pointer;transition:background-color .15s ease}
.ia-alert-popup-close:hover{background:var(--ia-btn-bg-hover)}

@keyframes ia-alert-in{from{transform:translateY(-120%);opacity:0}to{transform:none;opacity:1}}
@keyframes ia-alert-out{from{transform:none;opacity:1}to{transform:translateY(-120%);opacity:0}}
@keyframes ia-alert-fab-in{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
@keyframes ia-alert-pop{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.ia-alert-root,.ia-alert-root *{transition:none!important;animation:none!important}}
`;

  let current = null; // solo una alerta por página
  let uid = 0;

  // ---------- utilidades ----------
  function el(tag, cls) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function toNum(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : def;
  }

  function resolveEl(v) {
    if (!v) return null;
    if (typeof v === 'string') {
      try { return doc.querySelector(v); } catch (e) { return null; }
    }
    return v.nodeType === 1 ? v : null;
  }

  function onReady(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function injectStyle() {
    if (doc.getElementById('ia-alert-style')) return;
    const s = doc.createElement('style');
    s.id = 'ia-alert-style';
    const nonce = scriptEl && scriptEl.nonce;
    if (nonce) s.setAttribute('nonce', nonce); // webs con CSP estricta
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function createIcon(size) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'ia-alert-icon');
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3 L21.5 19.5 H2.5 Z"></path><line x1="12" y1="9" x2="12" y2="13.5" stroke-linecap="round"></line><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none"></circle>';
    return svg;
  }

  function pickLang(l) {
    const code = String(l || doc.documentElement.lang || '').toLowerCase().slice(0, 2);
    return I18N[code] ? code : 'es';
  }

  function parseColor(str) {
    const m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  // Detecta si el fondo real de la página es oscuro o claro.
  function detectTheme(start) {
    for (let n = start; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(global.getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) {
        return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 < 0.5 ? 'dark' : 'light';
      }
    }
    try {
      if (global.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) { /* ignore */ }
    return 'light';
  }

  function mobileQuery(breakpoint) {
    return '(hover: none) and (pointer: coarse), (max-width: ' + Math.max(breakpoint - 1, 0) + 'px)';
  }

  // Dispositivo cuyo método de entrada principal es táctil (no es lo mismo que "tiene pantalla táctil").
  function isTouchDevice() {
    try { return global.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { /* ignore */ }
    return 'ontouchstart' in global;
  }

  // ---------- API pública ----------
  function mount(options) {
    options = options || {};
    if (current) current.destroy();

    let state = null;
    let destroyed = false;

    const config = {
      collapseAfter: toNum(options.collapseAfter, 30000),
      hoverCloseDelay: toNum(options.hoverCloseDelay, 5000),
      position: POSITIONS.indexOf(options.position) >= 0 ? options.position : 'bottom-left',
      touch: null,
      mode: null,
      theme: null,
    };

    const api = {
      config: config,
      expand: function () { if (state) state.expand(); },
      collapse: function () { if (state) state.collapse(); },
      openPopup: function () { if (state) state.openPopup(true); },
      refreshTheme: function () { if (state) state.refreshTheme(); },
      destroy: function () {
        destroyed = true;
        if (state) state.destroy();
        state = null;
        if (current === api) current = null;
      },
    };
    current = api;

    // Si el script se carga en <head>, espera a que exista <body>.
    onReady(function () { if (!destroyed) state = build(options, config); });
    return api;
  }

  function build(options, config) {
    // options.css === false: the host page ships the CSS (CSP-friendly).
    if (options.css !== false) injectStyle();

    const t = I18N[pickLang(options.lang)];
    const message = options.message || t.message;
    const details = options.details || message;

    const before = resolveEl(options.before);
    let container = resolveEl(options.container);
    if (options.container && !container && global.console) {
      console.warn('[IA_Alert] container no encontrado:', options.container, '— se usa posición flotante.');
    }
    if (!container && before && before.parentNode) container = before.parentNode;

    const breakpoint = toNum(options.mobileBreakpoint, 640);
    const mq = global.matchMedia ? global.matchMedia(mobileQuery(breakpoint)) : null;

    function wantMobile() {
      if (typeof options.touch === 'boolean') return options.touch;
      return mq ? mq.matches : 'ontouchstart' in global;
    }

    function currentTheme() {
      if (options.theme === 'light' || options.theme === 'dark') return options.theme;
      return detectTheme(container || doc.body);
    }

    // ----- Popup compartido (accesible) -----
    const titleId = 'ia-alert-title-' + (++uid);
    const backdrop = el('div', 'ia-alert-root ia-alert-backdrop');
    backdrop.hidden = true;
    const popup = el('div', 'ia-alert-popup');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', titleId);
    const popupHeader = el('div', 'ia-alert-popup-header');
    popupHeader.appendChild(createIcon(20));
    const popupTitle = el('div', 'ia-alert-popup-title');
    popupTitle.id = titleId;
    popupTitle.textContent = t.title;
    popupHeader.appendChild(popupTitle);
    const popupBody = el('div', 'ia-alert-popup-body');
    popupBody.textContent = details;
    const okBtn = el('button', 'ia-alert-popup-close');
    okBtn.type = 'button';
    okBtn.textContent = t.ok;
    popup.appendChild(popupHeader);
    popup.appendChild(popupBody);
    popup.appendChild(okBtn);
    backdrop.appendChild(popup);
    doc.body.appendChild(backdrop);

    let opener = null;
    let restoreFocus = false;

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
      else if (e.key === 'Tab') { e.preventDefault(); okBtn.focus(); } // único elemento enfocable
    }
    function openPopup(restore) {
      if (!backdrop.hidden) return;
      opener = doc.activeElement;
      restoreFocus = !!restore;
      backdrop.hidden = false;
      doc.addEventListener('keydown', onKey, true);
      okBtn.focus();
    }
    function closePopup() {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      doc.removeEventListener('keydown', onKey, true);
      if (restoreFocus && opener && opener !== doc.body && doc.contains(opener) && opener.focus) opener.focus();
      opener = null;
    }
    okBtn.addEventListener('click', closePopup);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closePopup(); });

    // ----- UI de escritorio -----
    function buildDesktop() {
      const inline = !!container;
      const host = el('div', 'ia-alert-root ia-alert-host ' + (inline ? 'ia-alert-inline' : 'ia-alert-fixed ia-alert-pos-' + config.position));
      host.setAttribute('data-ia-theme', currentTheme());

      const widget = el('button', 'ia-alert-widget');
      widget.type = 'button';
      widget.appendChild(createIcon(20));
      const text = el('span', 'ia-alert-text');
      text.textContent = message;
      widget.appendChild(text);
      host.appendChild(widget);

      if (inline) {
        if (before && container.contains(before) && before.parentNode) before.parentNode.insertBefore(host, before);
        else container.appendChild(host);
      } else {
        doc.body.appendChild(host);
      }

      let open = false;
      let hovering = false;
      let collapseTimer = 0;
      let hoverTimer = 0;
      let rafId = 0;

      // Mide el tamaño que necesita el mensaje (crece en ancho y, si no cabe, en alto).
      function measure() {
        const pw = widget.style.width, ph = widget.style.height, pt = widget.style.transition;
        widget.style.transition = 'none';
        text.style.width = '';
        text.style.flex = '';
        widget.style.width = 'auto';
        widget.style.height = 'auto';
        const s = {
          w: widget.offsetWidth + 1,
          h: Math.max(COLLAPSED, widget.offsetHeight),
          tw: text.offsetWidth + 1,
        };
        widget.style.width = pw;
        widget.style.height = ph;
        void widget.offsetWidth;
        widget.style.transition = pt;
        return s;
      }

      function layout(animate) {
        if (!animate) widget.style.transition = 'none';
        if (open) {
          const s = measure();
          text.style.width = s.tw + 'px';
          text.style.flex = 'none';
          widget.style.width = s.w + 'px';
          widget.style.height = s.h + 'px';
        } else {
          widget.style.width = COLLAPSED + 'px';
          widget.style.height = COLLAPSED + 'px';
        }
        if (!animate) { void widget.offsetWidth; widget.style.transition = ''; }
      }

      function setOpen(v, animate) {
        open = v;
        widget.classList.toggle('ia-alert-expanded', v);
        layout(animate !== false);
      }

      function scheduleCollapse(ms) {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(function () { setOpen(false); }, ms);
      }
      function scheduleHoverClose() {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () { setOpen(false); }, config.hoverCloseDelay);
      }
      function keepOpen() {
        clearTimeout(collapseTimer);
        clearTimeout(hoverTimer);
        if (!open) setOpen(true);
      }

      function onEnter() { hovering = true; keepOpen(); }
      function onLeave() { hovering = false; scheduleHoverClose(); }
      function onFocus() {
        let visible = true;
        try { visible = widget.matches(':focus-visible'); } catch (e) { /* ignore */ }
        if (visible) keepOpen();
      }
      function onBlur() { if (!hovering) scheduleHoverClose(); }
      function onClick(e) { openPopup(e.detail === 0); } // detail 0 = activado con teclado
      function onResize() {
        if (!open) return;
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function () { layout(false); });
      }

      host.addEventListener('mouseenter', onEnter);
      host.addEventListener('mouseleave', onLeave);
      widget.addEventListener('focus', onFocus);
      widget.addEventListener('blur', onBlur);
      widget.addEventListener('click', onClick);
      global.addEventListener('resize', onResize);
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(onResize);

      // Inicio: expandido y se colapsa tras collapseAfter
      setOpen(true, false);
      scheduleCollapse(config.collapseAfter);

      return {
        expand: function () { clearTimeout(hoverTimer); setOpen(true); scheduleCollapse(config.collapseAfter); },
        collapse: function () { clearTimeout(collapseTimer); clearTimeout(hoverTimer); setOpen(false); },
        refreshTheme: function () { host.setAttribute('data-ia-theme', currentTheme()); },
        destroy: function () {
          clearTimeout(collapseTimer);
          clearTimeout(hoverTimer);
          cancelAnimationFrame(rafId);
          global.removeEventListener('resize', onResize);
          host.remove();
        },
      };
    }

    // ----- UI móvil / táctil -----
    function buildMobile() {
      const theme = currentTheme();

      const banner = el('div', 'ia-alert-root ia-alert-banner');
      banner.setAttribute('role', 'status');
      banner.setAttribute('data-ia-theme', theme);
      banner.appendChild(createIcon(18));
      const bannerText = el('span', 'ia-alert-banner-text');
      bannerText.textContent = message;
      banner.appendChild(bannerText);
      const closeBtn = el('button', 'ia-alert-banner-close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', t.close);
      closeBtn.innerHTML = '&times;';
      banner.appendChild(closeBtn);

      const fab = el('button', 'ia-alert-root ia-alert-fab ia-alert-pos-' + config.position);
      fab.type = 'button';
      fab.setAttribute('data-ia-theme', theme);
      fab.setAttribute('aria-label', t.show);
      fab.appendChild(createIcon(20));
      fab.hidden = true;

      doc.body.appendChild(banner);
      doc.body.appendChild(fab);

      let collapseTimer = 0;
      let hideTimer = 0;

      function expand() {
        clearTimeout(hideTimer); // evita la carrera collapse() -> expand()
        clearTimeout(collapseTimer);
        banner.classList.remove('ia-alert-hiding');
        banner.hidden = false;
        fab.hidden = true;
        collapseTimer = setTimeout(collapse, config.collapseAfter);
      }
      function collapse() {
        clearTimeout(collapseTimer);
        clearTimeout(hideTimer);
        banner.classList.add('ia-alert-hiding');
        hideTimer = setTimeout(function () {
          banner.hidden = true;
          banner.classList.remove('ia-alert-hiding');
          fab.hidden = false;
        }, 280);
      }

      closeBtn.addEventListener('click', collapse);
      fab.addEventListener('click', expand);
      expand();

      return {
        expand: expand,
        collapse: collapse,
        refreshTheme: function () {
          const th = currentTheme();
          banner.setAttribute('data-ia-theme', th);
          fab.setAttribute('data-ia-theme', th);
        },
        destroy: function () {
          clearTimeout(collapseTimer);
          clearTimeout(hideTimer);
          banner.remove();
          fab.remove();
        },
      };
    }

    // ----- Render según modo (se reevalúa al girar / redimensionar) -----
    let ui = null;
    function render() {
      if (ui) ui.destroy();
      const mobile = wantMobile();
      ui = mobile ? buildMobile() : buildDesktop();
      config.touch = mobile;
      config.mode = mobile ? 'mobile' : 'desktop';
      config.theme = currentTheme();
      backdrop.setAttribute('data-ia-theme', config.theme);
    }
    function onModeChange() { if (typeof options.touch !== 'boolean') render(); }

    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onModeChange);
      else if (mq.addListener) mq.addListener(onModeChange);
    }
    render();

    return {
      expand: function () { ui.expand(); },
      collapse: function () { ui.collapse(); },
      openPopup: openPopup,
      refreshTheme: function () {
        config.theme = currentTheme();
        backdrop.setAttribute('data-ia-theme', config.theme);
        ui.refreshTheme();
      },
      destroy: function () {
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener('change', onModeChange);
          else if (mq.removeListener) mq.removeListener(onModeChange);
        }
        closePopup();
        ui.destroy();
        backdrop.remove();
      },
    };
  }

  global.IAAlert = { mount: mount, isTouchDevice: isTouchDevice, version: VERSION };

  // ---------- Auto-inicio: <script src="ia-alert.js" data-ia-alert></script> ----------
  if (scriptEl && scriptEl.hasAttribute('data-ia-alert')) {
    const d = scriptEl.dataset;
    mount({
      message: d.message,
      details: d.details,
      lang: d.lang,
      container: d.container,
      before: d.before,
      position: d.position,
      theme: d.theme,
      collapseAfter: d.collapseAfter,
      hoverCloseDelay: d.hoverCloseDelay,
      mobileBreakpoint: d.mobileBreakpoint,
      touch: d.touch === 'true' ? true : d.touch === 'false' ? false : undefined,
      css: d.css === 'false' ? false : undefined,
    });
  }
})(window);
