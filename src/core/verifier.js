// Verification helpers. They are deliberately explicit about what was and was
// not verified: lossy output is never described as pixel-identical.

export function comparePixelBuffers(expected, actual, expectedChannels, actualChannels, width, height) {
  if (!expected || !actual) {
    return { ok: false, reason: 'No hay datos de píxeles para comparar.' };
  }
  if (expectedChannels !== actualChannels) {
    return {
      ok: false,
      reason: `Canales distintos: entrada ${expectedChannels}, salida ${actualChannels}.`,
    };
  }
  const pixelCount = width * height;
  const expectedLength = pixelCount * expectedChannels;
  if (expected.length < expectedLength || actual.length < expectedLength) {
    return { ok: false, reason: 'Longitud de búfer de píxeles inesperada.' };
  }

  let mismatches = 0;
  let firstMismatch = -1;
  const maxReported = 10;
  const examples = [];
  for (let i = 0; i < expectedLength; i += 1) {
    if (expected[i] !== actual[i]) {
      mismatches += 1;
      if (firstMismatch === -1) firstMismatch = i;
      if (examples.length < maxReported) {
        const pixel = Math.floor(i / expectedChannels);
        const channel = i % expectedChannels;
        examples.push({ pixel, channel, expected: expected[i], actual: actual[i] });
      }
    }
  }

  return {
    ok: mismatches === 0,
    mismatches,
    totalBytes: expectedLength,
    firstMismatch,
    examples,
    reason: mismatches === 0 ? null : `${mismatches} bytes de píxel distintos.`,
  };
}

export function compareByteStreams(expected, actual) {
  if (!expected || !actual) {
    return { ok: false, reason: 'No hay datos para comparar.' };
  }
  if (expected.length !== actual.length) {
    return {
      ok: false,
      reason: `Longitud distinta: original ${expected.length} bytes, reconstruido ${actual.length} bytes.`,
    };
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== actual[i]) {
      return { ok: false, reason: `Diferencia en el byte ${i}.`, firstMismatch: i };
    }
  }
  return { ok: true };
}

export function lossyVerification({ width, height, channels, expectedWidth, expectedHeight }) {
  if (width !== expectedWidth || height !== expectedHeight) {
    return {
      kind: 'lossy',
      ok: false,
      message: `Dimensiones distintas tras decodificar: ${width}×${height} (esperado ${expectedWidth}×${expectedHeight}).`,
    };
  }
  return {
    kind: 'lossy',
    ok: true,
    message: `JXL decodificado correctamente (${width}×${height}, ${channels} canales). No se comparan píxeles: el modo tiene pérdida por diseño.`,
  };
}

export function losslessVerification(comparison) {
  if (comparison.ok) {
    return {
      kind: 'lossless',
      ok: true,
      message: `Píxeles idénticos tras decodificar (${comparison.totalBytes.toLocaleString('es-ES')} bytes comparados).`,
    };
  }
  return {
    kind: 'lossless',
    ok: false,
    message: `La comparación de píxeles falló: ${comparison.reason}`,
  };
}

export function jpegVerification(comparison) {
  if (comparison.ok) {
    return {
      kind: 'jpeg-reversible',
      ok: true,
      message: 'Reconstrucción JPEG idéntica byte a byte al archivo original.',
    };
  }
  return {
    kind: 'jpeg-reversible',
    ok: false,
    message: `La reconstrucción JPEG no coincide: ${comparison.reason}`,
  };
}
