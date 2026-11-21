export function showCompatError(result) {
  const panel = document.createElement('section');
  panel.className = 'compat-banner';
  panel.setAttribute('role', 'alert');

  const title = document.createElement('h2');
  title.textContent = 'Este navegador no es compatible con JXL Optimizer';
  const intro = document.createElement('p');
  intro.textContent =
    'Faltan funciones necesarias para procesar las imágenes en tu dispositivo. No se ha subido nada a ningún servidor.';
  const list = document.createElement('ul');
  for (const item of result.missing) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = item.label;
    li.append(strong, ` — ${item.hint}`);
    list.appendChild(li);
  }
  const foot = document.createElement('p');
  foot.textContent = `Navegador detectado: ${result.browser}. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.`;
  panel.append(title, intro, list, foot);

  const anchor = document.querySelector('.toolbar') ?? document.querySelector('main');
  anchor?.before(panel);

  for (const selector of ['#fileInput', '#folderInput', '#addFolderBtn', '#startBtn']) {
    const el = document.querySelector(selector);
    if (el) el.disabled = true;
  }
  document.querySelector('#dropzone')?.setAttribute('aria-disabled', 'true');
  const badge = document.querySelector('#engineBadge');
  if (badge) {
    badge.textContent = 'Motor: no disponible';
    badge.classList.add('badge-error');
  }
}

export function showCompatWarnings(result, log) {
  for (const warning of result.warnings) log.warn(warning);
}
