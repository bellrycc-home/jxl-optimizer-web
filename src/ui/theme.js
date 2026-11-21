// Light/dark theme. The initial value is applied by an inline script in
// index.html before first paint; this module only wires the toggle button.
const KEY = 'jxl-theme';

export function initTheme(button) {
  const root = document.documentElement;
  const apply = (theme) => {
    root.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#090d16');
  };
  apply(root.dataset.theme === 'light' ? 'light' : 'dark');
  button?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies.
    }
  });
}
