// "THE WIRE" — Wednesday 25 November 2026 in one picture.
// A dense newspaper front page drawn entirely in code: no image assets,
// no network, no fonts on disk. Everything below (framebuffer, 5x7 bitmap
// font, flat-vector illustrations, world map, PNG encoder) is written here
// from scratch in this session. Deterministic: two runs write identical bytes.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---- palette: "ink & flame" — midnight navy, vivid flame orange, warm paper.
const PAPER: RGB = [251, 246, 234];
const PANEL: RGB = [255, 255, 255];
const CREAM2: RGB = [243, 236, 220];
const INK: RGB = [20, 33, 61];
const NAVY: RGB = [27, 42, 94];
const NAVY2: RGB = [38, 58, 122];
const FLAME: RGB = [228, 87, 46];
const FLAME_DK: RGB = [190, 62, 28];
const GOLD: RGB = [201, 162, 39];
const SLATE: RGB = [90, 100, 114];
const LINE: RGB = [216, 207, 192];
const WHITE: RGB = [255, 255, 255];
const SKY: RGB = [214, 232, 240];
const SEA: RGB = [38, 84, 124];
const SEA_DK: RGB = [24, 60, 94];
const LEAF: RGB = [46, 110, 72];
const SAND: RGB = [232, 214, 170];

type RGB = [number, number, number];

// ---- framebuffer -----------------------------------------------------------
const fb = new Uint8Array(W * H * 3);
function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    fb[i * 3] = c[0];
    fb[i * 3 + 1] = c[1];
    fb[i * 3 + 2] = c[2];
  }
}
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    }
  }
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  rect(x, y, t, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(ax, ay, c);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
    for (let xx = cx - dx; xx <= cx + dx; xx++) px(xx, cy + dy, c);
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}
// Scanline polygon fill. pts: [x, y][] in order.
function poly(pts: [number, number][], c: RGB): void {
  if (pts.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(H - 1, Math.floor(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        px(x, y, c);
      }
    }
  }
}
function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t);
  hline(x, y + h - t, w, c, t);
  vline(x, y, h, c, t);
  vline(x + w - t, y, h, c, t);
}

// ---- 5x7 bitmap font -------------------------------------------------------
// Each glyph: 7 rows, each a 5-bit number (bit 4 = leftmost column).
// Lowercase letters sit on rows 2..6 (x-height); ascenders reach row 0.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 17, 16, 17, 14], d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14], f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 0, 15, 17, 17, 15, 1], h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14], j: [2, 0, 6, 2, 2, 2, 18],
  k: [16, 16, 18, 20, 24, 20, 18], l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21], n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14], p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1], r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30], t: [8, 8, 30, 8, 8, 8, 6],
  u: [0, 0, 17, 17, 17, 19, 13], v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 11, 6, 4], z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 0, 12, 6], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 10], "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0], "-": [0, 0, 0, 14, 0, 0, 0],
  "/": [1, 1, 2, 2, 4, 8, 16], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "$": [4, 15, 20, 14, 5, 30, 4],
  "%": [25, 25, 2, 4, 8, 19, 19], "&": [12, 18, 20, 8, 21, 18, 13],
  "@": [14, 17, 23, 21, 23, 16, 14], "#": [10, 10, 31, 10, 10, 31, 10],
  "*": [0, 4, 21, 14, 21, 4, 0], "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0], "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8], _: [0, 0, 0, 0, 0, 0, 31],
  "[": [14, 8, 8, 8, 8, 8, 14], "]": [14, 2, 2, 2, 2, 2, 14],
  "·": [0, 0, 0, 12, 12, 0, 0],
};

function charWidth(scale: number): number {
  return 5 * scale + scale; // 5px glyph + 1px gap, scaled
}
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * charWidth(scale) - scale;
}
function drawChar(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let r = 0; r < 7; r++) {
    const bits = g[r];
    for (let col = 0; col < 5; col++) {
      if (bits & (16 >> col)) {
        rect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}
// bold: draw twice, second pass shifted right for a heavier stroke.
function drawText(s: string, x: number, y: number, scale: number, c: RGB, bold = false): void {
  let cx = Math.round(x);
  const cy = Math.round(y);
  const off = bold ? Math.max(1, Math.round(scale / 2)) : 0;
  for (const ch of s) {
    drawChar(ch, cx, cy, scale, c);
    if (bold) drawChar(ch, cx + off, cy, scale, c);
    cx += charWidth(scale);
  }
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB, bold = false): void {
  drawText(s, cx - textWidth(s, scale) / 2, y, scale, c, bold);
}
function drawTextRight(s: string, xRight: number, y: number, scale: number, c: RGB, bold = false): void {
  drawText(s, xRight - textWidth(s, scale), y, scale, c, bold);
}
// Greedy word wrap to a pixel width; returns lines (no trailing spaces).
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      // a single word wider than maxW: hard-split it
      let rest = w;
      while (textWidth(rest, scale) > maxW) {
        let cut = 0;
        while (cut < rest.length && textWidth(rest.slice(0, cut + 1), scale) <= maxW) cut++;
        lines.push(rest.slice(0, Math.max(1, cut)));
        rest = rest.slice(Math.max(1, cut));
      }
      cur = rest;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawPara(s: string, x: number, y: number, maxW: number, scale: number, c: RGB, lh: number, bold = false, maxLines = 99): number {
  const lines = wrapText(s, maxW, scale).slice(0, maxLines);
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * lh, scale, c, bold);
  }
  return lines.length;
}

// ---- PNG encoder (stdlib zlib; deterministic) ------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- flat-vector illustrations ---------------------------------------------
// Every picture is drawn from rectangles, polygons, discs and lines.
// Scenes are small on purpose: they read at full size and stay clean at 300px.

// Sky band helper: horizontal bands of sky + a sun/moon disc.
function skyBand(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
  const half = Math.floor(h / 2);
  rect(x, y, w, half, top);
  rect(x, y + half, w, h - half, bot);
}

// HERO: a cargo ship at sea under a grey sky, a small drone above it.
function drawShip(x: number, y: number, w: number, h: number): void {
  skyBand(x, y, w, h, [203, 216, 224], SKY);
  disc(x + w - 26, y + 18, 11, [245, 240, 220]); // pale sun
  // sea
  const seaY = y + Math.floor(h * 0.62);
  rect(x, seaY, w, h - (seaY - y), SEA);
  rect(x, seaY, w, 3, SEA_DK);
  // waves
  for (let i = 0; i < 5; i++) {
    const wx = x + 12 + i * 58;
    line(wx, seaY + 14 + (i % 2) * 8, wx + 26, seaY + 14 + (i % 2) * 8, WHITE);
    line(wx + 8, seaY + 30 + ((i + 1) % 2) * 10, wx + 30, seaY + 30 + ((i + 1) % 2) * 10, [180, 205, 220]);
  }
  // hull
  const hx = x + Math.floor(w * 0.12);
  const hw = Math.floor(w * 0.62);
  const hy = seaY - 26;
  poly(
    [
      [hx, hy],
      [hx + hw, hy],
      [hx + hw - 18, hy + 26],
      [hx + 8, hy + 26],
    ],
    INK
  );
  // containers
  const cw = 26;
  for (let i = 0; i < 4; i++) {
    const cxp = hx + 14 + i * (cw + 4);
    rect(cxp, hy - 22, cw, 22, i % 2 === 0 ? FLAME : GOLD);
    hline(cxp, hy - 22, cw, WHITE, 2);
  }
  // bridge tower
  rect(hx + hw - 44, hy - 46, 30, 46, WHITE);
  rect(hx + hw - 44, hy - 46, 30, 5, FLAME);
  for (let r = 0; r < 3; r++) rect(hx + hw - 40, hy - 38 + r * 12, 22, 6, NAVY);
  // funnel + smoke
  rect(hx + 6, hy - 34, 12, 34, FLAME_DK);
  disc(hx + 12, hy - 42, 6, [220, 220, 214]);
  disc(hx + 22, hy - 50, 8, [228, 228, 222]);
  disc(hx + 34, hy - 56, 6, [235, 235, 230]);
  // drone
  const dx = x + Math.floor(w * 0.78);
  const dy = y + 26;
  rect(dx - 12, dy - 3, 24, 7, INK);
  disc(dx - 14, dy, 5, SLATE);
  disc(dx + 14, dy, 5, SLATE);
  hline(dx - 20, dy - 5, 12, SLATE, 2);
  hline(dx + 8, dy - 5, 12, SLATE, 2);
  disc(dx, dy + 8, 3, FLAME);
}

// Rocket launch: night sky, stars, Long March 2F lifting off Jiuquan.
function drawRocket(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  // stars
  const stars: [number, number][] = [
    [0.08, 0.12], [0.2, 0.06], [0.32, 0.18], [0.45, 0.08], [0.58, 0.14],
    [0.7, 0.06], [0.82, 0.16], [0.92, 0.08], [0.12, 0.3], [0.88, 0.32],
    [0.5, 0.26], [0.66, 0.3], [0.26, 0.4], [0.76, 0.44],
  ];
  for (const [fx, fy] of stars) disc(x + Math.floor(fx * w), y + Math.floor(fy * h), 2, WHITE);
  // ground
  const gy = y + h - 14;
  rect(x, gy, w, 14, [60, 52, 40]);
  // slim lattice mast to the right of the rocket (thin, no long arms)
  const mx0 = x + w - 24;
  rect(mx0, gy - 50, 4, 50, [70, 76, 88]);
  for (let i = 0; i < 4; i++) line(mx0, gy - 12 - i * 11, mx0 + 8, gy - 20 - i * 11, [70, 76, 88]);
  hline(mx0 - 2, gy - 50, 10, [70, 76, 88], 2);
  // rocket body
  const rx = x + Math.floor(w * 0.5) - 9;
  const ry = gy - 62;
  rect(rx, ry, 18, 56, WHITE);
  poly([[rx, ry], [rx + 9, ry - 16], [rx + 18, ry]], FLAME);
  rect(rx, ry + 20, 18, 4, FLAME);
  rect(rx - 6, ry + 38, 6, 18, FLAME);
  rect(rx + 18, ry + 38, 6, 18, FLAME);
  disc(rx + 9, ry + 12, 4, NAVY);
  // flame + smoke
  poly(
    [
      [rx + 2, gy - 6],
      [rx + 9, gy + 12],
      [rx + 16, gy - 6],
    ],
    GOLD
  );
  disc(x + Math.floor(w * 0.3), gy - 2, 10, [220, 220, 214]);
  disc(x + Math.floor(w * 0.68), gy + 2, 12, [228, 228, 222]);
  disc(x + Math.floor(w * 0.55), gy - 6, 8, [235, 235, 230]);
}

// Riyadh: skyline with a tall tapered tower and a burst above it.
function drawTower(x: number, y: number, w: number, h: number): void {
  skyBand(x, y, w, h, [232, 214, 170], [240, 226, 196]);
  disc(x + w - 20, y + 14, 9, GOLD);
  const gy = y + h - 8;
  // background blocks
  rect(x + 6, gy - 26, 22, 26, [150, 140, 120]);
  rect(x + 34, gy - 34, 18, 34, [120, 112, 96]);
  rect(x + w - 58, gy - 30, 24, 30, [150, 140, 120]);
  rect(x + w - 30, gy - 20, 22, 20, [120, 112, 96]);
  // the tower: tapered, twisted look via offset bands
  const tx = x + Math.floor(w * 0.55);
  poly(
    [
      [tx - 16, gy],
      [tx - 10, gy - 66],
      [tx + 10, gy - 66],
      [tx + 16, gy],
    ],
    NAVY2
  );
  for (let i = 0; i < 5; i++) {
    const yy = gy - 12 - i * 12;
    line(tx - 14 + i, yy, tx + 14 - i, yy, [120, 150, 200]);
  }
  rect(tx - 3, gy - 76, 6, 10, NAVY2);
  // burst above the tower
  const bx = tx;
  const by = gy - 88;
  for (let a = 0; a < 12; a++) {
    const rad = (a * Math.PI) / 6;
    line(bx, by, bx + Math.round(16 * Math.cos(rad)), by + Math.round(16 * Math.sin(rad)), FLAME);
  }
  disc(bx, by, 7, GOLD);
  disc(bx, by, 3, FLAME);
  // smoke
  disc(tx - 20, gy - 60, 7, [200, 196, 188]);
  disc(tx + 22, gy - 48, 6, [210, 206, 198]);
}

// Courthouse with columns (Sarkozy) — compact, fits a 36px box.
function drawCourt(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, CREAM2);
  // pediment
  poly(
    [
      [x + 8, y + 10],
      [x + w / 2, y + 2],
      [x + w - 8, y + 10],
    ],
    NAVY
  );
  rect(x + 8, y + 10, w - 16, 3, NAVY);
  // columns
  for (let i = 0; i < 4; i++) {
    const cxp = x + 14 + i * Math.floor((w - 28) / 3);
    rect(cxp, y + 15, 6, h - 21, WHITE);
    rect(cxp - 1, y + 13, 8, 2, NAVY);
  }
  rect(x + 6, y + h - 5, w - 12, 3, NAVY);
}

// Medal on a ribbon (pardon story).
function drawMedal(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  const cx = x + Math.floor(w / 2);
  poly([[cx - 12, y + 6], [cx, y + 26], [cx + 12, y + 6]], [190, 62, 28]);
  poly([[cx - 12, y + 6], [cx, y + 26], [cx - 4, y + 6]], [120, 30, 20]);
  disc(cx, y + Math.floor(h * 0.58), 12, GOLD);
  ring(cx, y + Math.floor(h * 0.58), 12, [150, 110, 20], 2);
  disc(cx, y + Math.floor(h * 0.58), 7, [240, 200, 90]);
  drawChar("*", cx - 5, y + Math.floor(h * 0.58) - 7, 2, [150, 110, 20]);
}

// Prison bars + gavel (Fort Hood).
function drawBars(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [70, 76, 88]);
  for (let i = 0; i < 5; i++) {
    const bx = x + 10 + i * Math.floor((w - 20) / 4);
    rect(bx, y, 5, h, INK);
  }
  rect(x, y + 6, w, 4, INK);
  rect(x, y + h - 10, w, 4, INK);
  // small gavel head peeking between bars
  rect(x + Math.floor(w * 0.55), y + Math.floor(h * 0.55), 18, 9, [120, 82, 40]);
}

// Exam paper with a red X (Seoul).
function drawExam(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, CREAM2);
  const px0 = x + Math.floor(w * 0.28);
  const py0 = y + 6;
  const pw = Math.floor(w * 0.44);
  const ph = h - 12;
  rect(px0, py0, pw, ph, WHITE);
  frame(px0, py0, pw, ph, SLATE, 1);
  for (let i = 0; i < 4; i++) hline(px0 + 5, py0 + 8 + i * 8, pw - 10, LINE, 1);
  // red X over the paper
  line(px0 + 4, py0 + 4, px0 + pw - 4, py0 + ph - 4, FLAME);
  line(px0 + pw - 4, py0 + 4, px0 + 4, py0 + ph - 4, FLAME);
  // pencil
  line(x + 8, y + h - 10, x + 22, y + 14, GOLD);
}

// Earthquake: mountains, a cracked building, shaking lines.
function drawQuake(x: number, y: number, w: number, h: number): void {
  skyBand(x, y, w, h, SKY, [240, 236, 220]);
  const gy = y + h - 6;
  poly([[x, gy], [x + w * 0.35, y + 12], [x + w * 0.6, gy]], [120, 140, 160]);
  poly([[x + w * 0.45, gy], [x + w * 0.75, y + 20], [x + w, gy]], [90, 115, 135]);
  disc(x + w - 14, y + 10, 7, GOLD);
  // shaking building
  const bx = x + Math.floor(w * 0.3);
  rect(bx, gy - 30, 26, 30, WHITE);
  frame(bx, gy - 30, 26, 30, INK, 1);
  line(bx + 6, gy - 30, bx + 2, gy - 18, INK);
  line(bx + 20, gy - 18, bx + 14, gy - 6, INK);
  line(bx + 4, gy - 12, bx + 12, gy - 4, INK);
  // motion lines
  for (let i = 0; i < 3; i++) {
    hline(bx - 12, gy - 26 + i * 9, 8, FLAME, 2);
    hline(bx + 30, gy - 22 + i * 9, 8, FLAME, 2);
  }
  // crack in the ground
  line(x + 6, gy, x + Math.floor(w * 0.4), gy - 4, INK);
  line(x + Math.floor(w * 0.4), gy - 4, x + Math.floor(w * 0.7), gy + 1, INK);
}

// Airport radar screen (O'Hare).
function drawRadar(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [16, 40, 30]);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  ring(cx, cy, 14, [60, 160, 110], 1);
  ring(cx, cy, 9, [60, 160, 110], 1);
  ring(cx, cy, 4, [60, 160, 110], 1);
  line(cx - 14, cy, cx + 14, cy, [60, 160, 110]);
  line(cx, cy - 14, cx, cy + 14, [60, 160, 110]);
  line(cx, cy, cx + 10, cy - 10, [120, 255, 170]);
  disc(cx - 8, cy + 6, 3, GOLD);
  disc(cx + 9, cy - 3, 3, FLAME);
  disc(cx + 4, cy + 11, 2, WHITE);
  // warning triangle
  poly([[x + w - 20, y + 6], [x + w - 10, y + 20], [x + w - 30, y + 20]], GOLD);
  drawText("!", x + w - 22, y + 10, 1, INK, true);
}

// Gas flame over a pipeline (Iran energy).
function drawFlameGas(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [24, 42, 60]);
  const cx = x + Math.floor(w / 2);
  const by = y + h - 10;
  // pipeline
  rect(x, by - 4, w, 8, SLATE);
  rect(x, by - 4, w, 2, [140, 150, 160]);
  // flame (kept short so its tip stays inside the box)
  poly(
    [
      [cx - 12, by - 4],
      [cx - 8, by - 18],
      [cx - 2, by - 10],
      [cx + 2, by - 24],
      [cx + 8, by - 12],
      [cx + 12, by - 4],
    ],
    FLAME
  );
  poly(
    [
      [cx - 6, by - 4],
      [cx - 3, by - 14],
      [cx + 1, by - 8],
      [cx + 4, by - 17],
      [cx + 6, by - 4],
    ],
    GOLD
  );
  // snowflakes (winter)
  disc(x + 8, y + 10, 2, WHITE);
  disc(x + w - 10, y + 16, 2, WHITE);
  disc(x + w - 22, y + 6, 2, WHITE);
}

// Oil tanker with a spiky mine (Hormuz) — compact, fits a 36px box.
function drawTanker(x: number, y: number, w: number, h: number): void {
  skyBand(x, y, w, h, [220, 228, 232], SKY);
  const seaY = y + h - 10;
  rect(x, seaY, w, h - (seaY - y), SEA);
  // tanker hull + containers + bridge
  const hx = x + 8;
  const hw = w - 16;
  poly([[hx, seaY - 8], [hx + hw, seaY - 8], [hx + hw - 6, seaY + 6], [hx + 4, seaY + 6]], INK);
  rect(hx + 4, seaY - 16, hw - 22, 8, FLAME);
  rect(hx + hw - 18, seaY - 22, 10, 14, WHITE);
  rect(hx + hw - 18, seaY - 22, 10, 3, FLAME);
  // mine, low in the sky
  const mx = x + Math.floor(w * 0.7);
  const my = y + 9;
  disc(mx, my, 4, INK);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    line(mx, my, mx + Math.round(8 * Math.cos(rad)), my + Math.round(8 * Math.sin(rad)), INK);
  }
  ring(mx, my, 10, GOLD, 1);
  line(x + 10, seaY + 4, x + 30, seaY + 4, WHITE);
}

// Satellite over Earth (NATO space) — compact, nothing bleeds out of the box.
function drawSatellite(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  const stars: [number, number][] = [
    [0.1, 0.15], [0.25, 0.08], [0.4, 0.2], [0.6, 0.1], [0.75, 0.18],
    [0.9, 0.1], [0.15, 0.4], [0.85, 0.42], [0.5, 0.32],
  ];
  for (const [fx, fy] of stars) disc(x + Math.floor(fx * w), y + Math.floor(fy * h), 1, WHITE);
  // horizon: sea + land bands at the bottom
  rect(x, y + h - 8, w, 4, SEA);
  rect(x, y + h - 4, w, 4, LEAF);
  // flat orbit ellipse
  const ocx = x + Math.floor(w * 0.5);
  const ocy = y + Math.floor(h * 0.45);
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    px(ocx + Math.round(30 * Math.cos(rad)), ocy + Math.round(9 * Math.sin(rad)), [150, 170, 220]);
  }
  // satellite body + panels
  const sx = x + Math.floor(w * 0.6);
  const sy = y + Math.floor(h * 0.32);
  rect(sx - 14, sy - 3, 10, 6, NAVY2);
  rect(sx + 4, sy - 3, 10, 6, NAVY2);
  rect(sx - 4, sy - 5, 8, 10, GOLD);
  line(sx, sy - 5, sx + 12, sy - 13, WHITE);
  disc(sx + 13, sy - 14, 2, FLAME);
}

// Diplomatic office building with a closing X (Pyongyang) — compact.
function drawOffice(x: number, y: number, w: number, h: number): void {
  skyBand(x, y, w, h, SKY, [240, 236, 220]);
  const gy = y + h - 4;
  rect(x + 14, y + 6, w - 28, gy - y - 6, WHITE);
  frame(x + 14, y + 6, w - 28, gy - y - 6, INK, 1);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      rect(x + 20 + c * 12, y + 11 + r * 9, 7, 6, NAVY2);
    }
  }
  // small flag patch on the wall
  rect(x + 18, y + 8, 10, 6, FLAME);
  // door with a closing X
  rect(x + Math.floor(w / 2) - 7, gy - 10, 14, 10, FLAME_DK);
  line(x + Math.floor(w / 2) - 7, gy - 10, x + Math.floor(w / 2) + 7, gy, FLAME);
  line(x + Math.floor(w / 2) + 7, gy - 10, x + Math.floor(w / 2) - 7, gy, FLAME);
}

// House on fire (settler arson) — compact, flames stay inside the box.
function drawArson(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [40, 34, 30]);
  const gy = y + h - 4;
  const hx = x + Math.floor(w * 0.3);
  rect(hx, gy - 14, 30, 14, [150, 130, 110]);
  poly([[hx - 4, gy - 14], [hx + 15, gy - 22], [hx + 34, gy - 14]], [110, 80, 50]);
  // short flames from the roof
  poly([[hx + 6, gy - 20], [hx + 10, gy - 28], [hx + 14, gy - 20], [hx + 18, gy - 26], [hx + 22, gy - 20]], FLAME);
  poly([[hx + 11, gy - 20], [hx + 14, gy - 26], [hx + 17, gy - 20]], GOLD);
  // one small smoke puff
  disc(hx + 8, gy - 30, 3, [120, 116, 110]);
}

// Crowd with placards (Karachi protest).
function drawCrowd(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, CREAM2);
  const gy = y + h - 4;
  // placards
  rect(x + 8, y + 6, 20, 12, WHITE);
  frame(x + 8, y + 6, 20, 12, INK, 1);
  line(x + 18, y + 18, x + 18, y + 30, INK);
  rect(x + w - 32, y + 4, 22, 12, FLAME);
  line(x + w - 21, y + 16, x + w - 21, y + 30, INK);
  // heads + shoulders
  const heads: [number, number, RGB][] = [
    [0.2, 0.62, NAVY], [0.38, 0.58, FLAME], [0.55, 0.64, LEAF],
    [0.72, 0.58, NAVY2], [0.88, 0.64, GOLD],
  ];
  for (const [fx, fy, c] of heads) {
    const hx = x + Math.floor(fx * w);
    const hy = y + Math.floor(fy * h);
    disc(hx, hy, 6, [232, 196, 160]);
    poly([[hx - 9, gy], [hx - 7, hy + 4], [hx + 7, hy + 4], [hx + 9, gy]], c);
  }
}

// ---- world map -------------------------------------------------------------
// Simplified continent outlines, equirectangular lon/lat.
const CONTINENTS: [number, number][][] = [
  // North America
  [[-168, 66], [-140, 70], [-120, 72], [-100, 73], [-85, 70], [-75, 72], [-60, 60], [-55, 47], [-70, 42], [-75, 35], [-80, 26], [-85, 20], [-90, 15], [-95, 18], [-105, 20], [-115, 28], [-125, 40], [-125, 50], [-140, 60], [-155, 58], [-165, 60], [-168, 66]],
  // Greenland
  [[-55, 60], [-45, 60], [-40, 65], [-30, 68], [-20, 70], [-25, 76], [-45, 76], [-58, 74], [-60, 70], [-55, 60]],
  // South America
  [[-80, 10], [-75, 5], [-60, 0], [-50, -5], [-35, -10], [-40, -20], [-50, -30], [-58, -35], [-65, -40], [-70, -50], [-70, -55], [-75, -45], [-75, -30], [-80, -15], [-80, 10]],
  // Africa
  [[-10, 35], [0, 35], [10, 37], [20, 32], [30, 31], [35, 28], [40, 20], [48, 11], [51, 10], [48, 0], [40, -10], [35, -20], [30, -30], [20, -35], [15, -30], [12, -18], [10, -5], [8, 4], [0, 5], [-10, 10], [-15, 15], [-10, 25], [-10, 35]],
  // Eurasia
  [[-10, 35], [-5, 43], [-2, 48], [0, 50], [5, 53], [8, 57], [18, 56], [21, 55], [25, 60], [30, 65], [40, 68], [60, 70], [80, 73], [100, 76], [120, 73], [140, 72], [160, 70], [178, 66], [170, 60], [160, 55], [150, 60], [140, 50], [140, 40], [130, 35], [127, 40], [122, 32], [115, 25], [110, 20], [105, 10], [100, 8], [95, 15], [90, 22], [85, 20], [80, 10], [77, 8], [73, 15], [70, 22], [65, 25], [60, 25], [55, 27], [50, 29], [48, 30], [44, 29], [40, 35], [35, 36], [30, 36], [25, 35], [20, 40], [15, 44], [10, 45], [5, 43], [0, 40], [-5, 35], [-10, 35]],
  // UK
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-2, 50], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 36], [140, 38], [141, 40], [142, 42], [143, 44], [141, 45], [140, 42], [139, 38], [137, 36], [135, 34], [132, 33], [130, 31]],
  // Indonesia
  [[95, 5], [100, 0], [105, -5], [110, -7], [115, -8], [120, -10], [125, -9], [130, -5], [135, -4], [140, -8], [138, -8], [130, -5], [120, -2], [110, 0], [100, 2], [95, 5]],
  // Australia
  [[113, -22], [114, -30], [115, -33], [118, -35], [124, -33], [130, -32], [135, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -22], [146, -19], [142, -15], [142, -11], [136, -12], [132, -12], [126, -14], [122, -17], [118, -20], [113, -22]],
  // New Zealand
  [[167, -45], [170, -42], [173, -40], [175, -38], [177, -38], [175, -40], [172, -43], [168, -46], [167, -45]],
];
function drawMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [222, 234, 240]); // ocean
  const proj = (lon: number, lat: number): [number, number] => [
    x + Math.round(((lon + 180) / 360) * w),
    y + Math.round(((90 - lat) / 150) * h),
  ];
  for (const cont of CONTINENTS) {
    poly(cont.map(([lo, la]) => proj(lo, la)), [214, 196, 158]);
  }
  // graticule
  for (let lo = -120; lo <= 120; lo += 60) {
    const [gx] = proj(lo, 0);
    vline(gx, y, h, [190, 205, 215], 1);
  }
  for (let la = 60; la >= -30; la -= 30) {
    const [, gy] = proj(0, la);
    hline(x, gy, w, [190, 205, 215], 1);
  }
}
function mapPin(x: number, y: number, w: number, h: number, lon: number, lat: number, n: number): void {
  const px0 = x + Math.round(((lon + 180) / 360) * w);
  const py0 = y + Math.round(((90 - lat) / 150) * h);
  disc(px0, py0, 8, FLAME);
  ring(px0, py0, 8, WHITE, 1);
  drawTextCentered(String(n), px0, py0 - 3, 1, WHITE, true);
}

// Extra glyphs used by the copy below.
FONT["—"] = [0, 0, 0, 31, 0, 0, 0];
FONT["–"] = [0, 0, 0, 31, 0, 0, 0];

// ---- content: 52 distinct stories, all first reported Wed 25 Nov 2026 ------
// Tags: CONFIRMED = on the record · OFFICIALS = officials say ·
// REPORTED = news report · FORECAST = scheduled / due today.

const STORY_COUNT = 50;

const HERO = {
  kicker: "THE WAR WIDENS",
  tag: "KYIV · GULF OF FINLAND — CONFIRMED · REUTERS",
  headline: "Zelenskiy confirms Ukraine hit Russian ships in two seas",
  deck: "Kyiv says it struck a cargo ship in the Gulf of Finland and sank a warship off Benghazi — the war's reach now spans two seas. Norway urges caution.",
  foot: "SATURDAY'S DRONE STRIKE · SUNDAY'S SINKING OFF LIBYA",
};

const LEADS = [
  {
    tag: "JIUQUAN · 00:18 UTC — CONFIRMED · REUTERS / XINHUA",
    headline: "Shenzhou-24 lifts off with first Pakistani in orbit",
    deck: "Tang Hongbo, Wu Yi and Muhammad Zeeshan Ali ride a Long March 2F to Tiangong — the station's first foreign visitor.",
    draw: "rocket",
  },
  {
    tag: "RIYADH — CONFIRMED · SAUDI CIVIL DEFENSE",
    headline: "Houthis hit Riyadh's tallest tower, 11 wounded",
    deck: "The PIF Tower is struck for the second time in under a week as the war in Yemen pushes toward Aden.",
    draw: "tower",
  },
];

type PicStory = {
  n: number;
  region: string;
  source: string;
  tag: "CONFIRMED" | "OFFICIALS" | "REPORTED" | "FORECAST";
  headline: string;
  deck: string;
  draw: string;
};
const PICTURES: PicStory[] = [
  { n: 1, region: "PARIS", source: "REUTERS", tag: "CONFIRMED", headline: "Sarkozy case sent to trial", deck: "Ex-president, wife face trial in April.", draw: "court" },
  { n: 2, region: "WASHINGTON", source: "AP", tag: "REPORTED", headline: "Trump 'open' to pardoning Huang", deck: "Urges Huang not to plead the Fifth.", draw: "medal" },
  { n: 3, region: "FORT HOOD", source: "COURT REC", tag: "CONFIRMED", headline: "Fort Hood gunman seeks stay", deck: "Killer of 13 in 2009 fights execution.", draw: "bars" },
  { n: 4, region: "SEOUL", source: "YONHAP", tag: "CONFIRMED", headline: "Minister quits over exam cheating", deck: "Education chief quits in exam scandal.", draw: "exam" },
  { n: 5, region: "KATHMANDU", source: "PRESS", tag: "REPORTED", headline: "5.4 quake jolts Nepal, felt in India", deck: "Tremors shake Kathmandu and India.", draw: "quake" },
  { n: 6, region: "CHICAGO", source: "FAA", tag: "CONFIRMED", headline: "Radar fault snarls O'Hare flights", deck: "Radar fault delays flights at a top hub.", draw: "radar" },
  { n: 7, region: "TEHRAN", source: "RFE/RL", tag: "REPORTED", headline: "Iran braces for winter gas shortages", deck: "War damage deepens energy crisis.", draw: "flameGas" },
  { n: 8, region: "HORMUZ", source: "IRGC", tag: "OFFICIALS", headline: "Three tankers hit by mines, Iran says", deck: "Navy blames mines; shipping on edge.", draw: "tanker" },
  { n: 9, region: "LONDON", source: "NATO", tag: "CONFIRMED", headline: "NATO vows space defence", deck: "Alliance answers a nuclear report.", draw: "satellite" },
  { n: 10, region: "PYONGYANG", source: "KCNA", tag: "REPORTED", headline: "N. Korea threatens to shut Swiss office", deck: "Kim Yo-jong cites youth-camp sanctions.", draw: "office" },
  { n: 11, region: "JERUSALEM", source: "PRESS", tag: "REPORTED", headline: "Settler arson is 'Jewish terrorism'", deck: "Eisenkot condemns West Bank arson.", draw: "arson" },
  { n: 12, region: "KARACHI", source: "PRESS", tag: "REPORTED", headline: "Thousands protest plan to split Sindh", deck: "Crowds rally against a plan tied to Munir.", draw: "crowd" },
];

// THE WIRE — the vertical news-wire rail down the left edge. 12 flashes.
const WIRE: [string, string][] = [
  ["JIUQUAN", "Shenzhou-24 lifts off, first Pakistani in orbit"],
  ["KYIV", "Ship strikes in two seas confirmed"],
  ["RIYADH", "Tower hit, 11 hurt; second time in a week"],
  ["PARIS", "Sarkozy case sent to trial"],
  ["ADEN", "Houthis 60 km out; army says city will hold"],
  ["CHICAGO", "Radar fault delays O'Hare flights"],
  ["SEOUL", "Education minister quits in exam scandal"],
  ["HORMUZ", "Three tankers hit by mines, Iran says"],
  ["KATHMANDU", "5.4 quake shakes Nepal, felt in India"],
  ["CANBERRA", "Inflation 4.9%, RBA in focus"],
  ["TOKYO", "Service prices +4.2%, fastest since 1990"],
  ["LONDON", "Bitcoin slides below $60,000"],
];

// THE DAY IN UTC — 7 time points across the day.
const TIMELINE: [string, string][] = [
  ["OVERNIGHT", "Houthis hit Riyadh tower"],
  ["00:18", "Shenzhou-24 lifts off, Jiuquan"],
  ["00:30", "Australia CPI prints 4.9%"],
  ["13:30", "US PCE, GDP, claims due"],
  ["17:45", "UCL night: Barca, Liverpool"],
  ["19:00", "Fed Beige Book out"],
  ["20:00", "UCL: PSG-Roma, Bayern"],
];

// THE DAY IN NUMBERS — 6 figures.
const NUMBERS: [string, string][] = [
  ["700,000+", "Russian war dead in Ukraine, new count"],
  ["11", "wounded in the Riyadh tower strike"],
  ["4.9%", "Australia's October inflation"],
  ["4.2%", "Japan service prices at 36-year high"],
  ["20%+", "Brent crude's slide in November"],
  ["<$60k", "Bitcoin slips below $60,000"],
];

// ALSO ON... — 28 one-line briefs, numbered 13-40.
const BRIEFS: string[] = [
  "Warsaw: NATO early-warning jets for Poland",
  "Brussels: EU announces fresh Russia sanctions",
  "UN: Russia, Ukraine trade blame on shipping",
  "New York: UN flags deepening Gaza strain",
  "Doha: US, Qatar talk strategic cooperation",
  "Kabul: RFE/RL back on air for Afghan girls",
  "Baghdad: Iran drones hit Kurdish camp",
  "Hormuz: Pugh's 15 km swim flags war's toll",
  "Ankara: Army helicopter crashes, 2nd in 2 wks",
  "Moscow: Putin: Europe hurts itself on oil, gas",
  "New Delhi: BJP, Akali Dal reunite for Punjab",
  "Dhaka: Hasina plans Dec 16 return",
  "Islamabad: Petrol pumps threaten shutdown",
  "Quake: 4.0 tremor hits Pakistan border",
  "Washington: CIA hit by cyberattack",
  "Washington: AG backs Nvidia chief Huang",
  "New York: CleanSpark -7.5% on $987m loss",
  "Thurmond: Town sues to save 12 old buildings",
  "Denver: Lawyer who torched house dies of OD",
  "Melbourne: 1965 film find links lost kin",
  "Stanford: Founder sold startup for $4.5bn",
  "Berlin: Germany leads industrial AI use",
  "Mumbai: Mumbai beat Odisha by 22 runs",
  "Melbourne: England beat Australia by 8 wkts",
  "Kolkata: India women thrash China 6-2",
  "Goa: FC Goa edge NorthEast Utd 1-0",
  "Bristol: Bristol City 1-1 Wrexham",
  "Washington: US envoy unsure on Israel aid",
];

// WHERE IT HAPPENED — 8 pins: [number, lon, lat, label]
const PINS: [number, number, number, string][] = [
  [1, 100, 40, "Jiuquan"],
  [2, 30.5, 50.5, "Kyiv"],
  [3, 20, 32, "Benghazi"],
  [4, 46.7, 24.6, "Riyadh"],
  [5, 2.3, 48.9, "Paris"],
  [6, 56, 26.5, "Hormuz"],
  [7, 85.3, 27.7, "Kathmandu"],
  [8, -77, 38.9, "Washington"],
];

const DATE_CHECK: string[] = [
  "DATE CHECK — Left out on purpose, first reported before Wednesday:",
  "ICJ Myanmar ruling, Shenzhen summit, GTA VI release (19 Nov); Nvidia reinstating Huang (23 Nov); Nepal PM visit (22-23 Nov);",
  "Waymo ban (11 Nov); Sanofi-Insmed, US confidence, Giuliani medal, turkey pardon, Huawei verdict (24 Nov).",
  "Not yet: US PCE, GDP and jobless claims (due 13:30 UTC) and the Fed's Beige Book (19:00 UTC).",
];

// ---- layout ----------------------------------------------------------------
const RAIL_W = 104; // THE WIRE rail width
const MX = 112; // main area left edge
const MW = 904; // main area width (112..1016)

function pill(text: string, x: number, y: number, tag: string): void {
  const w = textWidth(text, 1) + 8;
  const h = 11;
  if (tag === "CONFIRMED") {
    rect(x, y, w, h, NAVY);
    drawText(text, x + 4, y + 2, 1, WHITE, true);
  } else if (tag === "OFFICIALS") {
    rect(x, y, w, h, FLAME);
    drawText(text, x + 4, y + 2, 1, WHITE, true);
  } else if (tag === "REPORTED") {
    rect(x, y, w, h, WHITE);
    frame(x, y, w, h, NAVY, 1);
    drawText(text, x + 4, y + 2, 1, NAVY, true);
  } else {
    rect(x, y, w, h, CREAM2);
    frame(x, y, w, h, FLAME, 1);
    drawText(text, x + 4, y + 2, 1, FLAME, true);
  }
}

function drawMasthead(): void {
  drawText("THE WIRE", 20, 8, 1, FLAME, true);
  drawTextCentered("THE WORLD ON ONE PAGE", 512, 8, 1, NAVY, true);
  drawTextRight(`${STORY_COUNT} STORIES · 6 REGIONS`, 1004, 8, 1, SLATE, true);
  drawTextCentered("WEDNESDAY 25 NOVEMBER 2026", 512, 24, 6, NAVY, true);
  hline(20, 72, 984, FLAME, 3);
  hline(20, 77, 984, NAVY, 1);
  drawTextCentered("ONE DAY · ONE PAGE — EVERY STORY FIRST REPORTED TODAY", 512, 84, 1, SLATE, true);
}

function drawWire(): void {
  rect(0, 104, RAIL_W, 912, NAVY);
  drawText("THE WIRE", 18, 112, 1, WHITE, true);
  drawText("ALL DAY", 18, 122, 1, FLAME, true);
  vline(16, 140, 862, NAVY2, 2);
  const step = 71;
  for (let i = 0; i < WIRE.length; i++) {
    const y = 146 + i * step;
    disc(17, y + 4, 3, FLAME);
    drawText(WIRE[i][0], 26, y, 1, FLAME, true);
    drawPara(WIRE[i][1], 26, y + 10, 74, 1, WHITE, 9);
  }
}

function drawUtcStrip(): void {
  const y = 104;
  const h = 46;
  frame(MX, y, MW, h, INK, 1);
  rect(MX, y, 88, h, NAVY);
  drawText("THE DAY", MX + 8, y + 10, 1, WHITE, true);
  drawText("IN UTC", MX + 8, y + 22, 1, WHITE, true);
  const cw = (MW - 88) / TIMELINE.length;
  for (let i = 0; i < TIMELINE.length; i++) {
    const x = MX + 88 + i * cw;
    if (i > 0) vline(Math.round(x), y + 4, h - 8, LINE, 1);
    drawText(TIMELINE[i][0], x + 6, y + 8, 1, FLAME, true);
    drawPara(TIMELINE[i][1], x + 6, y + 20, cw - 12, 1, INK, 9);
  }
}

function drawNumbersStrip(): void {
  const y = 154;
  const h = 46;
  frame(MX, y, MW, h, INK, 1);
  rect(MX, y, 88, h, FLAME);
  drawText("THE DAY", MX + 8, y + 10, 1, WHITE, true);
  drawText("IN NUMBERS", MX + 8, y + 22, 1, WHITE, true);
  const cw = (MW - 88) / NUMBERS.length;
  for (let i = 0; i < NUMBERS.length; i++) {
    const x = MX + 88 + i * cw;
    if (i > 0) vline(Math.round(x), y + 4, h - 8, LINE, 1);
    drawText(NUMBERS[i][0], x + 6, y + 8, 2, i === 0 ? FLAME : NAVY, true);
    drawPara(NUMBERS[i][1], x + 6, y + 26, cw - 12, 1, SLATE, 9);
  }
}

function drawHero(): void {
  const y = 204;
  const h = 168;
  rect(MX, y, MW, h, PANEL);
  frame(MX, y, MW, h, INK, 1);
  drawShip(MX + 1, y + 1, 300, h - 2);
  vline(MX + 306, y + 6, h - 12, LINE, 1);
  const tx = MX + 320;
  const tw = MW - 320 - 16;
  drawText(HERO.kicker, tx, y + 10, 1, FLAME, true);
  drawText(HERO.tag, tx, y + 24, 1, SLATE, true);
  hline(tx, y + 36, 120, FLAME, 2);
  drawPara(HERO.headline, tx, y + 44, tw, 3, INK, 24, true);
  drawPara(HERO.deck, tx, y + 100, tw, 1, INK, 10);
  drawText(HERO.foot, tx, y + 136, 1, FLAME, true);
}

function drawLeads(): void {
  const y = 376;
  const h = 160;
  const w = 448;
  for (let i = 0; i < LEADS.length; i++) {
    const x = MX + i * (w + 8);
    rect(x, y, w, h, PANEL);
    frame(x, y, w, h, INK, 1);
    if (LEADS[i].draw === "rocket") drawRocket(x + 1, y + 1, w - 2, 82);
    else drawTower(x + 1, y + 1, w - 2, 82);
    drawText(LEADS[i].tag, x + 8, y + 90, 1, SLATE, true);
    drawPara(LEADS[i].headline, x + 8, y + 104, w - 16, 2, INK, 17, true);
    drawPara(LEADS[i].deck, x + 8, y + 140, w - 16, 1, INK, 10);
  }
}

function drawPic(x: number, y: number, w: number, h: number, kind: string): void {
  if (kind === "court") drawCourt(x, y, w, h);
  else if (kind === "medal") drawMedal(x, y, w, h);
  else if (kind === "bars") drawBars(x, y, w, h);
  else if (kind === "exam") drawExam(x, y, w, h);
  else if (kind === "quake") drawQuake(x, y, w, h);
  else if (kind === "radar") drawRadar(x, y, w, h);
  else if (kind === "flameGas") drawFlameGas(x, y, w, h);
  else if (kind === "tanker") drawTanker(x, y, w, h);
  else if (kind === "satellite") drawSatellite(x, y, w, h);
  else if (kind === "office") drawOffice(x, y, w, h);
  else if (kind === "arson") drawArson(x, y, w, h);
  else if (kind === "crowd") drawCrowd(x, y, w, h);
}

function drawGrid(): void {
  const y0 = 540;
  const cw = 145;
  const ch = 101;
  const gap = 6;
  const stripe: Record<string, RGB> = { CONFIRMED: NAVY, OFFICIALS: FLAME, REPORTED: GOLD, FORECAST: SLATE };
  for (let i = 0; i < PICTURES.length; i++) {
    const s = PICTURES[i];
    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = MX + col * (cw + gap);
    const y = y0 + row * (ch + gap);
    rect(x, y, cw, ch, PANEL);
    frame(x, y, cw, ch, LINE, 1);
    // tag stripe on the left edge (colour-coded, explained in the footer)
    rect(x, y, 4, ch, stripe[s.tag]);
    drawPic(x + 5, y + 1, cw - 6, 38, s.draw);
    drawText(`${s.n} · ${s.region}`, x + 8, y + 42, 1, FLAME, true);
    drawText(`${s.source} · ${s.tag}`, x + 8, y + 51, 1, SLATE, true);
    drawPara(s.headline, x + 8, y + 60, cw - 16, 1, INK, 9, true, 2);
    drawPara(s.deck, x + 8, y + 78, cw - 16, 1, SLATE, 9, false, 2);
  }
}

function drawMapBriefs(): void {
  const y = 752;
  // map panel
  drawText("WHERE IT HAPPENED", MX, y + 4, 1, NAVY, true);
  drawMap(MX, y + 20, 300, 140);
  frame(MX, y + 20, 300, 140, INK, 1);
  for (const [n, lon, lat] of PINS) mapPin(MX, y + 20, 300, 140, lon, lat, n);
  drawText("EUROPE 2 · M. EAST 2 · ASIA 2 · AFRICA 1 · AMERICAS 1", MX, y + 166, 1, SLATE, true);
  drawText("1 Jiuquan  2 Kyiv  3 Benghazi  4 Riyadh", MX, y + 176, 1, SLATE, true);
  drawText("5 Paris  6 Hormuz  7 Kathmandu  8 Washington", MX, y + 186, 1, SLATE, true);
  // briefs
  const bx = MX + 312;
  drawText("ALSO ON WEDNESDAY 25 NOVEMBER", bx, y + 4, 1, NAVY, true);
  const colW = 288;
  for (let i = 0; i < BRIEFS.length; i++) {
    const col = Math.floor(i / 14);
    const row = i % 14;
    const x = bx + col * (colW + 12);
    const yy = y + 18 + row * 13;
    const num = String(13 + i);
    drawText(num, x, yy, 1, FLAME, true);
    drawText(BRIEFS[i], x + textWidth(num + " ", 1), yy, 1, INK);
  }
}

function drawFooter(): void {
  const y = 956;
  const h = 46;
  frame(MX, y, MW, h, FLAME, 2);
  drawText(DATE_CHECK[0], MX + 8, y + 5, 1, FLAME, true);
  drawText(DATE_CHECK[1], MX + 8, y + 15, 1, INK);
  drawText(DATE_CHECK[2], MX + 8, y + 25, 1, INK);
  drawText(DATE_CHECK[3], MX + 8, y + 35, 1, INK);
  drawText(
    "CONFIRMED record · OFFICIALS officials · REPORTED report · FORECAST due — Sources: AP, Reuters, AFP, Yonhap, RFE/RL, Xinhua, FAA, NATO",
    MX,
    1008,
    1,
    SLATE
  );
}

// ---- main ------------------------------------------------------------------
function render(): void {
  fill(PAPER);
  drawMasthead();
  drawWire();
  drawUtcStrip();
  drawNumbersStrip();
  drawHero();
  drawLeads();
  drawGrid();
  drawMapBriefs();
  drawFooter();
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
mkdirSync(outDir, { recursive: true });
render();
const png = encodePNG(W, H, fb);
writeFileSync(`${outDir}/entry.png`, png);
console.log(JSON.stringify({ width: W, height: H, bytes: png.length }));
