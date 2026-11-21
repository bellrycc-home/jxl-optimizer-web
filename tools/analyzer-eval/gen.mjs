// Synthetic image generators with known ground truth, for heuristic evaluation.
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
export function canvas(w, h, bg = [255, 255, 255, 255]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = bg[0]; d[i + 1] = bg[1]; d[i + 2] = bg[2]; d[i + 3] = bg[3]; }
  return { w, h, d };
}
function over(img, x, y, c, cov) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || cov <= 0) return;
  const i = (y * img.w + x) * 4, d = img.d, a = (c[3] ?? 255) / 255 * Math.min(1, cov), ba = d[i + 3] / 255;
  const oa = a + ba * (1 - a);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * ba * (1 - a)) / oa;
  d[i + 3] = oa * 255;
}
export function rect(img, x0, y0, x1, y1, c) { for (let y = Math.max(0, y0 | 0); y < Math.min(img.h, y1 | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(img.w, x1 | 0); x++) over(img, x, y, c, 1); }
export function rrect(img, x0, y0, x1, y1, r, c) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  for (let y = Math.floor(y0) - 1; y <= y1 + 1; y++) for (let x = Math.floor(x0) - 1; x <= x1 + 1; x++) {
    const qx = Math.abs(x + .5 - cx) - hx, qy = Math.abs(y + .5 - cy) - hy;
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    over(img, x, y, typeof c === 'function' ? c(x, y) : c, 0.5 - sd);
  }
}
export function circle(img, cx, cy, rad, c, soft = 0) {
  for (let y = Math.floor(cy - rad - soft) - 1; y <= cy + rad + soft + 1; y++) for (let x = Math.floor(cx - rad - soft) - 1; x <= cx + rad + soft + 1; x++) {
    const sd = Math.hypot(x + .5 - cx, y + .5 - cy) - rad;
    const cov = soft ? 1 - Math.min(1, Math.max(0, sd / soft)) * (sd > 0) : 0.5 - sd;
    over(img, x, y, typeof c === 'function' ? c(x, y) : c, soft ? (sd <= 0 ? 1 : cov) : cov);
  }
}
function textLine(img, x, y, wpx, h, c, r) {
  let cx = x;
  while (cx < x + wpx) {
    const wordLen = 2 + (r() * 8 | 0);
    for (let k = 0; k < wordLen && cx < x + wpx; k++, cx += 7) {
      const strokes = 2 + (r() * 3 | 0);
      for (let s = 0; s < strokes; s++) {
        if (r() < .5) { const sx = cx + (r() * 5 | 0), sh = (h * (.5 + r() * .5)) | 0; for (let yy = 0; yy < sh; yy++) { over(img, sx, y + h - yy, c, .85); over(img, sx + 1, y + h - yy, c, .25); } }
        else { const sy = y + (r() * h | 0), sw = 3 + (r() * 3 | 0); for (let xx = 0; xx < sw; xx++) over(img, cx + xx, sy, c, .9); }
      }
    }
    cx += 8;
  }
}
function vnoise(w, h, cell, r) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
export function photo(w, h, seed, { cells = [256, 128, 64, 32, 16, 8, 4], decay = .62, grain = 4 } = {}) {
  const r = rng(seed), img = canvas(w, h), chans = [0, 1, 2].map(() => cells.map((c) => vnoise(w, h, c, r)));
  const base = [r() * 120 + 40, r() * 120 + 40, r() * 120 + 40];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; let lum = 0, amp = 1, norm = 0;
    const l = []; for (let k = 0; k < cells.length; k++) { l.push(chans[0][k](x, y)); }
    for (let k = 0; k < cells.length; k++) { lum += (l[k] - .5) * amp; norm += amp; amp *= decay; }
    lum = lum / norm * 2.2;
    for (let ch = 0; ch < 3; ch++) {
      const chroma = (chans[ch][1](x, y) - .5) * 70 + (chans[ch][3](x, y) - .5) * 25;
      img.d[i + ch] = base[ch] + lum * 150 + chroma + gauss(r) * grain;
    }
    img.d[i + 3] = 255;
  }
  return img;
}
export function screenshot(w, h, seed, dark = false) {
  const r = rng(seed), bg = dark ? [30, 30, 34, 255] : [255, 255, 255, 255], fg = dark ? [212, 212, 212, 255] : [40, 40, 45, 255];
  const img = canvas(w, h, bg), acc = [[37, 99, 235, 255], [220, 38, 38, 255], [22, 163, 74, 255], [234, 179, 8, 255]];
  rect(img, 0, 0, w, 46, dark ? [45, 45, 52, 255] : [243, 244, 246, 255]);
  rect(img, 0, 46, w, 47, dark ? [70, 70, 80, 255] : [209, 213, 219, 255]);
  rect(img, 0, 47, 220, h, dark ? [37, 37, 42, 255] : [249, 250, 251, 255]);
  for (let y = 70; y < h - 20; y += 26) textLine(img, 16, y, 100 + r() * 90, 12, fg, r);
  for (let y = 70; y < h - 20; y += 22) { if (r() < .2) y += 22; textLine(img, 250 + ((r() * 3 | 0) * 28), y, 200 + r() * (w - 520), 12, r() < .15 ? acc[r() * 4 | 0] : fg, r); }
  for (let i = 0; i < 3; i++) rrect(img, w - 260, 70 + i * 60, w - 40, 110 + i * 60, 6, acc[i], 0);
  return img;
}
export function illustration(w, h, seed, { gradients = true, shapes = 28 } = {}) {
  const r = rng(seed), img = canvas(w, h), c0 = [r() * 255, r() * 255, r() * 255], c1 = [r() * 255, r() * 255, r() * 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = gradients ? (y / h) : 0, i = (y * w + x) * 4; for (let k = 0; k < 3; k++) img.d[i + k] = c0[k] + (c1[k] - c0[k]) * t; img.d[i + 3] = 255; }
  for (let s = 0; s < shapes; s++) {
    const cx = r() * w, cy = r() * h, rad = 30 + r() * Math.min(w, h) * .18, a = [r() * 255, r() * 255, r() * 255, 255], b = [r() * 255, r() * 255, r() * 255, 255];
    if (gradients) circle(img, cx + 8, cy + 10, rad, [0, 0, 0, 60], 14);
    const fill = gradients ? (x, y) => { const t = Math.min(1, Math.max(0, (y - (cy - rad)) / (2 * rad))); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255]; } : a;
    if (r() < .6) circle(img, cx, cy, rad, fill); else rrect(img, cx - rad, cy - rad * .7, cx + rad, cy + rad * .7, rad * .25, fill);
  }
  return img;
}
export function logo(w, h, seed) {
  const r = rng(seed), img = canvas(w, h, [0, 0, 0, 0]), pal = [[37, 99, 235, 255], [255, 255, 255, 255], [17, 24, 39, 255]];
  circle(img, w / 2, h / 2, Math.min(w, h) * .38, pal[0]); circle(img, w / 2, h / 2, Math.min(w, h) * .26, pal[1]);
  rrect(img, w * .38, h * .42, w * .62, h * .58, 12, pal[2]);
  return img;
}
export function wallpaper(w, h, seed) {
  const r = rng(seed), img = canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - w * .3, y - h * .4) / Math.hypot(w, h), i = (y * w + x) * 4; img.d[i] = 30 + d * 200 + gauss(r); img.d[i + 1] = 20 + d * 120 + gauss(r); img.d[i + 2] = 120 + d * 90 + gauss(r); img.d[i + 3] = 255; }
  return img;
}
export function pixelart(w, h, seed) {
  const r = rng(seed), img = canvas(w, h), pal = Array.from({ length: 12 }, () => [r() * 255, r() * 255, r() * 255, 255]), s = 8;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) rect(img, x, y, x + s, y + s, pal[(Math.floor(vnoise(w, h, 64, r)(x, y) * 11.99))]);
  return img;
}
export function chart(w, h, seed) {
  const r = rng(seed), img = canvas(w, h), cols = [[59, 130, 246, 255], [239, 68, 68, 255], [34, 197, 94, 255], [245, 158, 11, 255]];
  for (let g = 0; g < 8; g++) rect(img, 60, 60 + g * ((h - 120) / 8), w - 40, 61 + g * ((h - 120) / 8), [229, 231, 235, 255]);
  const bw = (w - 160) / 24;
  for (let i = 0; i < 24; i++) { const bh = r() * (h - 160); rect(img, 80 + i * bw, h - 60 - bh, 80 + i * bw + bw * .7, h - 60, cols[i % 4]); }
  for (let y = 40; y < 60; y += 18) textLine(img, 80, y, 300, 12, [17, 24, 39, 255], r);
  return img;
}
