import {
  DEFAULT_EFFORT,
  EFFORT_MAX,
  EFFORT_MIN,
  PROFILES,
  PROFILE_ORDER,
  getProfile,
  resolveProfileSettings,
} from '../core/profiles.js';

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes} min ${seconds} s`;
}

export function initSettings({ onChange, onJpegRelevance }) {
  const profileSelect = document.querySelector('#profile');
  const description = document.querySelector('#profileDescription');
  const effortInput = document.querySelector('#effort');
  const effortValue = document.querySelector('#effortValue');
  const distanceRow = document.querySelector('#distanceRow');
  const distanceInput = document.querySelector('#distance');
  const distanceFixed = document.querySelector('#distanceFixed');
  const jpegModeRow = document.querySelector('#jpegModeRow');
  const jpegMode = document.querySelector('#jpegMode');
  const jpegModeHint = document.querySelector('#jpegModeHint');
  const autoAnalyze = document.querySelector('#autoAnalyze');
  const maxMegapixels = document.querySelector('#maxMegapixels');
  const maxFileSize = document.querySelector('#maxFileSize');

  profileSelect.replaceChildren();
  for (const id of PROFILE_ORDER) {
    const profile = PROFILES[id];
    const option = document.createElement('option');
    option.value = id;
    option.textContent = profile.label;
    option.selected = id === 'balanced';
    profileSelect.appendChild(option);
  }

  effortInput.min = String(EFFORT_MIN);
  effortInput.max = String(EFFORT_MAX);
  effortInput.value = String(DEFAULT_EFFORT);
  effortValue.textContent = String(DEFAULT_EFFORT);

  let hasJpeg = false;

  function syncJpegOptions() {
    const lossyOption = jpegMode.querySelector('option[value="lossy"]');
    if (profileSelect.value === 'lossless' && hasJpeg) {
      jpegMode.value = 'reversible';
      lossyOption.disabled = true;
      jpegModeHint.textContent =
        'El perfil Lossless fuerza JPEG reversible: se conserva el bitstream y Distance no se aplica.';
    } else {
      lossyOption.disabled = false;
      jpegModeHint.textContent =
        jpegMode.value === 'reversible'
          ? 'Reversible usa JxlEncoderAddJPEGFrame y permite reconstruir el JPEG original byte a byte.'
          : 'Con pérdida: el navegador decodifica el JPEG y se recodifica con el Distance del perfil.';
    }
  }

  function syncFields() {
    const profile = getProfile(profileSelect.value);
    const isCustom = profile.id === 'custom';
    description.textContent = profile.description;
    distanceRow.style.display = isCustom || !profile.lossless ? 'flex' : 'none';

    if (isCustom) {
      distanceInput.hidden = false;
      distanceInput.disabled = false;
      distanceFixed.style.display = 'none';
    } else {
      distanceInput.hidden = true;
      distanceInput.disabled = true;
      distanceFixed.style.display = 'inline';
      distanceFixed.textContent = profile.lossless ? '0 (lossless)' : profile.distance.toFixed(1);
    }

    jpegModeRow.style.display = hasJpeg ? 'block' : 'none';
    syncJpegOptions();
    onChange();
  }

  profileSelect.addEventListener('change', () => {
    const profile = getProfile(profileSelect.value);
    // Profiles document effort 7 as their default. The user can still change
    // effort afterwards; the real value is logged.
    effortInput.value = String(profile.effort);
    effortValue.textContent = String(profile.effort);
    if (profile.id === 'custom') {
      distanceInput.value = String(profile.distance);
    }
    syncFields();
  });

  effortInput.addEventListener('input', () => {
    effortValue.textContent = effortInput.value;
    onChange();
  });
  distanceInput.addEventListener('input', onChange);
  jpegMode.addEventListener('change', () => {
    syncJpegOptions();
    onChange();
  });
  autoAnalyze.addEventListener('change', onChange);
  maxMegapixels.addEventListener('input', onChange);
  maxFileSize.addEventListener('input', onChange);

  function getSettings() {
    const profileId = profileSelect.value;
    const effort = Number(effortInput.value);
    const distance = Number(distanceInput.value);
    const resolved = resolveProfileSettings({ profileId, effort, distance });
    const maxMp = Number(maxMegapixels.value);
    const maxMb = Number(maxFileSize.value);
    return {
      profileId,
      profileLabel: resolved.profile.label,
      effort: resolved.effort,
      distance: resolved.distance,
      lossless: resolved.lossless,
      jpegMode: jpegMode.value,
      autoAnalyze: autoAnalyze.checked,
      maxPixels: Number.isFinite(maxMp) && maxMp > 0 ? Math.round(maxMp * 1_000_000) : 100_000_000,
      maxFileBytes: Number.isFinite(maxMb) && maxMb > 0 ? Math.round(maxMb * 1_000_000) : 250_000_000,
    };
  }

  syncFields();

  return {
    getSettings,
    setHasJpeg(value) {
      hasJpeg = Boolean(value);
      syncFields();
      onJpegRelevance?.(hasJpeg);
    },
    hasJpeg: () => hasJpeg,
  };
}
