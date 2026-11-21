// Compression profiles. Distances follow the JXL Optimizer desktop profiles.
// All profiles use effort 7 by default; the UI lets the user change effort
// between the real libjxl range (1..10) and the log always shows the value
// actually sent to the encoder.

export const EFFORT_MIN = 1;
export const EFFORT_MAX = 10;
export const DEFAULT_EFFORT = 7;

export const PROFILES = {
  lossless: {
    id: 'lossless',
    label: 'Lossless',
    distance: 0,
    effort: 7,
    lossless: true,
    description: 'Sin pérdida de píxeles. En JPEG usa el bitstream original (reversible).',
  },
  'low-compression': {
    id: 'low-compression',
    label: 'Baja compresión',
    distance: 0.5,
    effort: 7,
    lossless: false,
    description: 'Prioriza la calidad visual y reduce menos el tamaño.',
  },
  balanced: {
    id: 'balanced',
    label: 'Equilibrado',
    distance: 1.5,
    effort: 7,
    lossless: false,
    description: 'Equilibrio entre calidad visual y tamaño.',
  },
  low: {
    id: 'low',
    label: 'Bajo',
    distance: 2.0,
    effort: 7,
    lossless: false,
    description: 'Mayor reducción de tamaño con pérdida visible moderada.',
  },
  ultra: {
    id: 'ultra',
    label: 'Ultraahorro',
    distance: 3.0,
    effort: 7,
    lossless: false,
    description: 'Compresión agresiva para ahorrar espacio.',
  },
  custom: {
    id: 'custom',
    label: 'Personalizado',
    distance: 1.5,
    effort: 7,
    lossless: false,
    description: 'Distance y Effort configurables manualmente.',
  },
};

export const PROFILE_ORDER = [
  'lossless',
  'low-compression',
  'balanced',
  'low',
  'ultra',
  'custom',
];

export function getProfile(id) {
  return PROFILES[id] ?? PROFILES.balanced;
}

/**
 * Resolves the real encoder parameters for a profile and optional overrides.
 * Never silently clamps or converts incompatible values: invalid values throw
 * so the UI can show a real error.
 */
export function resolveProfileSettings({
  profileId,
  effort,
  distance,
  lossless,
}) {
  const profile = getProfile(profileId);
  const realEffort = Number(effort ?? profile.effort);
  if (!Number.isInteger(realEffort) || realEffort < EFFORT_MIN || realEffort > EFFORT_MAX) {
    throw new Error(`Effort no válido: ${effort}. Rango real de libjxl: ${EFFORT_MIN}..${EFFORT_MAX}.`);
  }

  const realLossless = profileId === 'lossless' ? true : Boolean(lossless ?? profile.lossless);
  const realDistance = profileId === 'custom' ? Number(distance) : profile.distance;

  if (!realLossless) {
    if (!Number.isFinite(realDistance) || realDistance < 0 || realDistance > 25) {
      throw new Error(`Distance no válida: ${distance}. Rango real de libjxl: 0..25.`);
    }
  }

  return {
    profile,
    effort: realEffort,
    distance: realLossless ? 0 : realDistance,
    lossless: realLossless,
  };
}
