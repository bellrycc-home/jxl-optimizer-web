import { DEFAULT_MAX_MB, loadZipLimits, saveZipLimits } from '../core/zip-safe.js';
import { formatSize } from './settings.js';

/** Resolves to 'zip' | 'individual' | 'cancel'. */
export function askZipStrategy(plan) {
  return new Promise((resolve) => {
    const block = plan.level === 'block';
    if (typeof HTMLDialogElement === 'undefined') {
      const ok = window.confirm(
        `Los resultados suman ${formatSize(plan.totalBytes)}. ¿Descargarlos uno a uno?`,
      );
      resolve(ok ? 'individual' : 'cancel');
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'zip-dialog';
    dialog.setAttribute('aria-labelledby', 'zipDialogTitle');

    const title = document.createElement('h2');
    title.id = 'zipDialogTitle';
    title.textContent = plan.failed
      ? 'No se pudo crear el ZIP'
      : block
        ? 'El lote es demasiado grande para un ZIP seguro'
        : 'Lote grande: ¿crear el ZIP?';

    const p1 = document.createElement('p');
    p1.textContent = `Hay ${plan.count} resultados que suman ${formatSize(plan.totalBytes)}. Crear el ZIP necesita unos ${formatSize(plan.estimatedPeakBytes)} de memoria adicional; en equipos con poca RAM o en móviles la pestaña podría cerrarse.`;
    const p2 = document.createElement('p');
    p2.textContent = block
      ? `Supera el límite de seguridad (${plan.limits.maxMB} MB). Puedes descargar los archivos .jxl uno a uno (el navegador puede pedir permiso para descargas múltiples) o subir el límite en «Resumen del lote».`
      : 'También puedes descargar los archivos .jxl uno a uno, sin ZIP.';
    dialog.append(title, p1, p2);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const add = (label, value, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `button button-small ${cls}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        dialog.dataset.choice = value;
        dialog.close();
      });
      actions.appendChild(b);
    };
    add('Cancelar', 'cancel', 'button-ghost');
    if (!block) add('Crear ZIP igualmente', 'zip', 'button-ghost');
    add('Descargar uno a uno', 'individual', 'button-primary');
    dialog.append(actions);

    dialog.addEventListener('close', () => {
      resolve(dialog.dataset.choice ?? 'cancel');
      dialog.remove();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

/** Adds the configurable ZIP safety limit under the ZIP status line. */
export function mountZipLimitControl(anchor) {
  const wrap = document.createElement('label');
  wrap.className = 'zip-limit';
  const text = document.createElement('span');
  text.textContent = 'Límite de seguridad del ZIP (MB)';
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'input input-number';
  input.min = '50';
  input.max = '4000';
  input.step = '50';
  input.value = String(loadZipLimits().maxMB);
  input.title = `Por encima de este tamaño total se ofrece la descarga individual. Por defecto ${DEFAULT_MAX_MB} MB.`;
  input.addEventListener('change', () => {
    input.value = String(saveZipLimits(Number(input.value)).maxMB);
  });
  wrap.append(text, input);
  anchor.after(wrap);
}
