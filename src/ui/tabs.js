// Minimal accessible tabs: [{ button, panel }] with arrow-key navigation.
export function initTabs(pairs, { onChange } = {}) {
  const select = (index, focus = false) => {
    pairs.forEach(({ button, panel }, i) => {
      const active = i === index;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    });
    if (focus) pairs[index].button.focus();
    onChange?.(index);
  };
  pairs.forEach(({ button }, i) => {
    button.addEventListener('click', () => select(i));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      select((i + step + pairs.length) % pairs.length, true);
    });
  });
  select(0);
  return { select };
}
