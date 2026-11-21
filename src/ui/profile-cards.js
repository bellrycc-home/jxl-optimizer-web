import { PROFILES, PROFILE_ORDER } from '../core/profiles.js';

// Card view over the real <select id="profile">. The select stays the single
// source of truth (settings.js listens to it); distances and descriptions come
// from PROFILES so the UI can never disagree with the encoder settings.
export function initProfileCards(container, select) {
  const cards = new Map();

  for (const id of PROFILE_ORDER) {
    const profile = PROFILES[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'profile-card';
    card.dataset.profile = id;
    card.setAttribute('role', 'radio');
    card.title = profile.description;

    const top = document.createElement('span');
    top.className = 'profile-card-top';
    const name = document.createElement('span');
    name.className = 'profile-card-name';
    name.textContent = profile.label;
    const badge = document.createElement('span');
    badge.className = 'profile-card-d';
    badge.textContent = id === 'custom' ? 'manual' : profile.lossless ? 'd=0' : `d=${profile.distance}`;
    top.append(name, badge);

    const desc = document.createElement('span');
    desc.className = 'profile-card-desc';
    desc.textContent = profile.description;

    card.append(top, desc);
    card.addEventListener('click', () => choose(id));
    card.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      const index = PROFILE_ORDER.indexOf(select.value);
      const next = PROFILE_ORDER[(index + keys[event.key] + PROFILE_ORDER.length) % PROFILE_ORDER.length];
      choose(next);
      cards.get(next)?.focus();
    });
    cards.set(id, card);
    container.appendChild(card);
  }

  function sync() {
    for (const [id, card] of cards) {
      const active = id === select.value;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-checked', String(active));
      card.tabIndex = active ? 0 : -1;
    }
  }

  function choose(id) {
    if (select.value === id) return;
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  }

  select.addEventListener('change', sync);
  sync();
  return { sync };
}
