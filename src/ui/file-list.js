import { STATUS, STATUS_LABEL } from '../core/queue.js';
import { formatDuration, formatSize } from './settings.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusText(item) {
  if (item.status === STATUS.PROCESSING && item.stage) return item.stage;
  return STATUS_LABEL[item.status] ?? item.status;
}

function analysisText(item) {
  const a = item.analysis;
  if (item.analysisError) return `<span class="verification error">Análisis no disponible: ${escapeHtml(item.analysisError)}</span>`;
  if (!a) return '<span class="hint">Análisis pendiente…</span>';
  if (!a.width || !a.height) {
    return `<span class="verification warning">${escapeHtml(a.recommendationReason ?? 'Sin dimensiones.')}</span>`;
  }

  const parts = [
    `${escapeHtml(a.format)} · ${a.width}×${a.height} · ${(a.megapixels ?? 0).toFixed(2)} MP`,
  ];
  if (a.kind) {
    parts.push(`tipo probable: ${escapeHtml(a.kind)} (${escapeHtml(a.kindConfidence)})`);
  }
  if (a.hasTransparency !== null && a.hasTransparency !== undefined) {
    parts.push(a.hasTransparency ? 'con transparencia' : 'sin transparencia');
  }
  let html = parts.join(' · ');

  if (a.recommendedProfile) {
    html += `<br /><span class="chip" title="${escapeHtml(a.recommendationReason)}">Recomendado: ${escapeHtml(profileLabel(a.recommendedProfile))}</span>`;
    html += ` <span class="hint">${escapeHtml(a.recommendationReason)}</span>`;
  } else if (a.recommendationReason) {
    html += `<br /><span class="verification warning">${escapeHtml(a.recommendationReason)}</span>`;
  }
  if (a.warning) {
    html += `<br /><span class="verification warning">${escapeHtml(a.warning)}</span>`;
  }
  return html;
}

function profileLabel(id) {
  const labels = {
    lossless: 'Lossless',
    'low-compression': 'Baja compresión',
    balanced: 'Equilibrado',
    low: 'Bajo',
    ultra: 'Ultraahorro',
    custom: 'Personalizado',
  };
  return labels[id] ?? id;
}

function resultText(item) {
  const r = item.result;
  if (!r) return '';
  const savings = (1 - r.size / item.file.size) * 100;
  const savingClass = savings >= 0 ? 'saving' : 'growth';
  const signed = savings >= 0 ? `-${savings.toFixed(2)} %` : `+${Math.abs(savings).toFixed(2)} %`;
  const mode = r.jpegMode === 'reversible'
    ? 'JPEG reversible'
    : r.jpegMode === 'lossy'
      ? 'JPEG con pérdida'
      : 'píxeles';
  return [
    `<div class="file-result">`,
    `${formatSize(item.file.size)} → <strong>${formatSize(r.size)}</strong> `,
    `<span class="${savingClass}">${signed}</span>`,
    ` · ${escapeHtml(r.profileLabel ?? '')}`,
    r.distance === null || r.distance === undefined ? ' · Distance n/a' : ` · Distance ${r.distance}`,
    ` · Effort ${r.effort}`,
    ` · ${escapeHtml(mode)}`,
    ` · ${formatDuration(r.timings ? r.timings.decodeMs + r.timings.encodeMs + r.timings.verifyMs : r.durationMs)}`,
    `</div>`,
  ].join('');
}

function verificationText(item) {
  const v = item.result?.verification;
  if (!v) {
    if (item.status === STATUS.ERROR) {
      return `<div class="verification error">${escapeHtml(item.error ?? 'Error desconocido.')}</div>`;
    }
    if (item.status === STATUS.SKIPPED) {
      return `<div class="verification warning">${escapeHtml(item.skipReason ?? 'Omitido.')}</div>`;
    }
    return '';
  }
  const cls = v.ok ? 'verification' : 'verification warning';
  return `<div class="${cls}">Verificación: ${escapeHtml(v.message)}</div>`;
}

export function renderFileList(container, items, callbacks) {
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = `file-row is-${item.status}`;
    row.dataset.id = String(item.id);

    const main = document.createElement('div');
    main.className = 'file-main';
    const path = item.path && item.path !== item.file.name
      ? `<div class="file-path">${escapeHtml(item.path)}</div>`
      : '';
    main.innerHTML = [
      `<div class="file-name">${escapeHtml(item.file.name)}</div>`,
      path,
      `<div class="file-meta">${escapeHtml(item.analysis?.format ?? '')} · ${formatSize(item.file.size)}${item.analysis?.width ? ` · ${item.analysis.width}×${item.analysis.height}` : ''}</div>`,
      `<div class="file-analysis">${analysisText(item)}</div>`,
      resultText(item),
      verificationText(item),
    ].join('');

    const side = document.createElement('div');
    side.className = 'file-side';
    const badge = document.createElement('span');
    badge.className = `status status-${item.status}`;
    badge.textContent = statusText(item);
    side.appendChild(badge);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (item.status === STATUS.DONE) {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'button button-small button-primary';
      download.textContent = 'Descargar';
      download.addEventListener('click', () => callbacks.onDownload(item));
      actions.appendChild(download);
    }

    if (item.status === STATUS.ERROR || item.status === STATUS.SKIPPED) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-small button-ghost';
      retry.textContent = 'Reintentar';
      retry.addEventListener('click', () => callbacks.onRetry(item));
      actions.appendChild(retry);
    }

    if (item.status !== STATUS.PROCESSING) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-small button-ghost';
      remove.textContent = 'Quitar';
      remove.title = 'Quitar de la cola (no borra el archivo original)';
      remove.addEventListener('click', () => callbacks.onRemove(item));
      actions.appendChild(remove);
    }

    side.appendChild(actions);
    row.append(main, side);
    container.appendChild(row);
  }
}
