# Heurística de análisis de imágenes

`src/core/analyzer.js` clasifica cada imagen (tipo **probable**: fotografía, captura, ilustración, gráfico) y recomienda un perfil. No cambia los perfiles ni los parámetros del encoder.

## Qué estaba mal (medido)
La versión anterior y la de Gemini medían sobre una miniatura de 192×192 tomada por muestreo de puntos. Eso destruye la señal que separa fotos de capturas (ruido de sensor/JPEG frente a píxeles exactamente repetidos). Con 35 imágenes reales (fotos de skimage/sklearn/matplotlib; capturas y gráficos renderizados con Chromium):

| Versión | Fotos acertadas | Tipo total | Perfil aceptable |
|---|---|---|---|
| Anterior | 0/11 | 20/35 | 29/35 |
| Gemini | 1/11 | 20/35 | 28/35 |
| Nueva (teselas nativas) | 11/11 | 35/35 | 35/35 |

Los cambios de Gemini (colores a 5 bits, `flatRatio`, `sharpEdgeRatio`) no mejoraban nada medible porque seguían calculándose sobre la miniatura. Se aprovechó su corrección de `probeHeader` (WebP VP8X ya no se marca «lossy») y la detección de alfa en la muestra.

## Qué hace ahora
- `sampleTiles()` toma hasta 4×4 teselas de 96×96 px **a resolución nativa** (~147 k px). Imágenes ≤256 px se analizan enteras.
- Métricas dentro de cada tesela (sin cruzar bordes): diversidad de colores exactos, cobertura de los 16 colores más frecuentes, vecinos idénticos o casi iguales, bordes duros y teselas de color único.
- Muchos colores exactos y poca cobertura de paleta → fotografía (salvo degradados sintéticos muy suaves → ilustración). Paleta pequeña: bordes duros → captura; si no, gráfico.

## Validación honesta
Los umbrales se calibraron con esas 35 imágenes, así que esa cifra está **sobreajustada**. Datos no usados para calibrar:

| Conjunto | Tipo (nuevo vs anterior) | Perfil (nuevo vs anterior) |
|---|---|---|
| 88 variantes: JPEG q30/75/95, escalado ½ y 2×, capturas recomprimidas | 74/88 vs 33/88 | 81/88 vs 69/88 |
| 44 sintéticas (11 generadores × 2 tamaños × 2 semillas) | 42/44 vs 22/44 | 42/44 vs 33/44 |

Fallos conocidos: fotos muy suaves o recomprimidas a calidad baja, fotos ampliadas 2× y capturas guardadas como JPEG o reescaladas caen en la zona intermedia («ilustración», confianza *baja*) y reciben *Baja compresión*, una elección conservadora. No hay fotos de 12–50 MP en el conjunto (las reales llegan a 1411 px).

Reproducción: `tools/analyzer-eval/` (Python con Pillow, numpy y playwright, más las imágenes de ejemplo de skimage/sklearn; las rutas están escritas para el entorno donde se midió).
