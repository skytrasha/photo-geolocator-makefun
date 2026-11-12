// Code-only geolocator for make.fun photo-geolocator-01.
// No model calls, no photo table, no weights: a baseline JPEG is decoded to an
// 8x-downsampled RGB thumbnail (DC coefficients plus chroma), colour/biome
// features are measured, and the agent picks a climate-region centroid.
// Always answers every photo (an unanswered one scores the maximum error).

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47,
  55, 62, 63,
];

interface Photo {
  id: string;
  url: string;
  answered: boolean;
}

interface Guess {
  id: string;
  lat: number;
  lon: number;
}

interface Features {
  r: number;
  g: number;
  b: number;
  H: number;
  S: number;
  V: number;
  green: number;
  brown: number;
  reds: number;
  gray: number;
  snow: number;
  sky: number;
  yellow: number;
  texture: number;
}

interface FeatSet {
  a: Features;
  t: Features;
  m: Features;
  b: Features;
}

interface Region {
  name: string;
  lat: number;
  lon: number;
  biome: string;
}

// Climate-region centroids: geographic priors, not a table of competition photos.
const REGIONS: Region[] = [
  { name: "boreal_ru", lat: 58.0, lon: 40.0, biome: "boreal" },
  { name: "boreal_ca", lat: 55.0, lon: -100.0, biome: "boreal" },
  { name: "scandinavia", lat: 64.0, lon: 18.0, biome: "boreal" },
  { name: "siberia_e", lat: 52.0, lon: 128.0, biome: "boreal" },
  { name: "ca_west", lat: 53.0, lon: -122.0, biome: "boreal" },
  { name: "w_europe", lat: 50.5, lon: 8.0, biome: "temperate" },
  { name: "e_europe", lat: 52.0, lon: 30.0, biome: "temperate" },
  { name: "e_us", lat: 39.0, lon: -80.0, biome: "temperate" },
  { name: "midwest_us", lat: 42.0, lon: -90.0, biome: "temperate" },
  { name: "w_us", lat: 40.0, lon: -121.0, biome: "temperate" },
  { name: "japan", lat: 36.0, lon: 138.0, biome: "temperate" },
  { name: "korea", lat: 36.0, lon: 128.0, biome: "temperate" },
  { name: "sw_us", lat: 35.0, lon: -110.0, biome: "arid" },
  { name: "mexico", lat: 21.0, lon: -100.0, biome: "dry" },
  { name: "andes", lat: -24.0, lon: -67.0, biome: "arid" },
  { name: "australia_arid", lat: -27.0, lon: 134.0, biome: "arid" },
  { name: "mideast", lat: 26.0, lon: 50.0, biome: "arid" },
  { name: "pakistan", lat: 28.0, lon: 68.0, biome: "arid" },
  { name: "iran", lat: 32.0, lon: 53.0, biome: "arid" },
  { name: "c_asia", lat: 43.0, lon: 74.0, biome: "arid" },
  { name: "levant", lat: 33.0, lon: 36.0, biome: "dry" },
  { name: "yucatan", lat: 21.0, lon: -88.0, biome: "tropical" },
  { name: "amazon", lat: -8.0, lon: -55.0, biome: "tropical" },
  { name: "e_brazil", lat: -16.0, lon: -42.0, biome: "dry_tropical" },
  { name: "s_brazil", lat: -25.0, lon: -50.0, biome: "temperate_s" },
  { name: "pampas", lat: -35.0, lon: -62.0, biome: "temperate_s" },
  { name: "chile_s", lat: -40.0, lon: -73.0, biome: "temperate_s" },
  { name: "nz", lat: -42.0, lon: 172.0, biome: "temperate_s" },
  { name: "australia_e", lat: -33.0, lon: 150.0, biome: "temperate_s" },
  { name: "w_africa", lat: 6.0, lon: -5.0, biome: "tropical" },
  { name: "congo", lat: 1.0, lon: 22.0, biome: "tropical" },
  { name: "e_africa", lat: -6.0, lon: 36.0, biome: "savanna" },
  { name: "sahel", lat: 13.0, lon: 0.0, biome: "savanna" },
  { name: "s_africa", lat: -24.0, lon: 28.0, biome: "savanna" },
  { name: "madagascar", lat: -18.0, lon: 47.0, biome: "tropical" },
  { name: "india_n", lat: 27.0, lon: 80.0, biome: "tropical" },
  { name: "india_s", lat: 11.0, lon: 78.0, biome: "tropical" },
  { name: "se_asia", lat: 14.0, lon: 101.0, biome: "tropical" },
  { name: "indonesia", lat: 0.0, lon: 110.0, biome: "tropical" },
  { name: "png", lat: -6.0, lon: 145.0, biome: "tropical" },
  { name: "china_s", lat: 25.0, lon: 110.0, biome: "subtrop" },
];

const ALLOW: Record<string, Set<string>> = {
  boreal: new Set(["boreal"]),
  arid: new Set(["arid", "dry"]),
  tropical: new Set(["tropical", "subtrop", "dry_tropical"]),
  savanna: new Set(["savanna", "dry_tropical", "tropical"]),
  urban: new Set(["temperate", "dry", "temperate_s"]),
  temperate: new Set(["temperate", "subtrop", "temperate_s", "boreal"]),
  open: new Set(["temperate", "temperate_s", "savanna", "arid", "boreal"]),
};

function need(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") throw new Error(`${name} is not set`);
  return v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

// --- Baseline JPEG (SOF0) decoder: DC thumbnail + mean AC energy -------------

class BitStream {
  bytes: Uint8Array;
  pos: number;
  buf = 0;
  n = 0;
  marker = 0;

  constructor(bytes: Uint8Array, pos: number) {
    this.bytes = bytes;
    this.pos = pos;
  }

  private pullByte(): number {
    if (this.marker !== 0) return -1;
    if (this.pos >= this.bytes.length) return -1;
    const b = this.bytes[this.pos++]!;
    if (b !== 0xff) return b;
    if (this.pos >= this.bytes.length) return -1;
    let n = this.bytes[this.pos++]!;
    while (n === 0xff) {
      if (this.pos >= this.bytes.length) return -1;
      n = this.bytes[this.pos++]!;
    }
    if (n === 0x00) return 0xff;
    this.marker = 0xff00 | n;
    return -1;
  }

  private fill(k: number): boolean {
    while (this.n < k) {
      const b = this.pullByte();
      if (b < 0) {
        // End of scan (EOI): pad with zeros so the last short Huffman codes can be read.
        if (this.marker === 0xffd9 || (this.marker === 0 && this.pos >= this.bytes.length)) {
          const pad = k - this.n;
          this.buf <<= pad;
          this.n = k;
          return true;
        }
        return false;
      }
      this.buf = (this.buf << 8) | b;
      this.n += 8;
    }
    return true;
  }

  getBits(k: number): number {
    if (k === 0) return 0;
    if (!this.fill(k)) return -1;
    const shift = this.n - k;
    const v = (this.buf >> shift) & ((1 << k) - 1);
    this.n = shift;
    this.buf &= shift === 0 ? 0 : (1 << shift) - 1;
    return v;
  }

  peekBits(k: number): number {
    if (k === 0) return 0;
    if (!this.fill(k)) return -1;
    return (this.buf >> (this.n - k)) & ((1 << k) - 1);
  }

  consume(k: number): void {
    this.n -= k;
    this.buf &= (1 << this.n) - 1;
  }

  align(): void {
    this.buf = 0;
    this.n = 0;
  }
}

interface Huff {
  lut: Int32Array;
}

function buildHuff(counts: number[], symbols: number[]): Huff {
  const lut = new Int32Array(1 << 16);
  lut.fill(-1);
  let code = 0;
  let si = 0;
  for (let len = 1; len <= 16; len++) {
    const c = counts[len] ?? 0;
    for (let i = 0; i < c; i++) {
      const sym = symbols[si++] ?? 0;
      const first = code << (16 - len);
      const num = 1 << (16 - len);
      const pack = (len << 8) | sym;
      for (let k = 0; k < num; k++) lut[first + k] = pack;
      code++;
    }
    code <<= 1;
  }
  return { lut };
}

function huffDecode(bs: BitStream, h: Huff): number {
  const peek = bs.peekBits(16);
  if (peek < 0) return -1;
  const pack = h.lut[peek]!;
  if (pack < 0) return -1;
  const len = pack >> 8;
  bs.consume(len);
  return pack & 0xff;
}

function extendBits(v: number, t: number): number {
  if (t === 0) return 0;
  const vt = 1 << (t - 1);
  return v < vt ? v - ((1 << t) - 1) : v;
}

interface FrameComp {
  id: number;
  hs: number;
  vs: number;
  tq: number;
}

interface ScanComp {
  id: number;
  dc: number;
  ac: number;
  hs: number;
  vs: number;
  tq: number;
}

interface Thumb {
  width: number;
  height: number;
  rgb: Uint8Array; // width*height*3
  texture: number;
}

function readMarker(bytes: Uint8Array, pos: number): { marker: number; pos: number } {
  if (pos + 1 >= bytes.length || bytes[pos] !== 0xff) throw new Error("jpeg: expected marker");
  pos++;
  while (pos < bytes.length && bytes[pos] === 0xff) pos++;
  if (pos >= bytes.length) throw new Error("jpeg: truncated marker");
  return { marker: 0xff00 | bytes[pos]!, pos: pos + 1 };
}

function readSeg(bytes: Uint8Array, pos: number): { data: Uint8Array; pos: number } {
  if (pos + 2 > bytes.length) throw new Error("jpeg: truncated length");
  const len = (bytes[pos]! << 8) | bytes[pos + 1]!;
  if (len < 2 || pos + len > bytes.length) throw new Error("jpeg: bad segment length");
  return { data: bytes.subarray(pos + 2, pos + len), pos: pos + len };
}

function decodeJpegThumb(bytes: Uint8Array): Thumb {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("jpeg: not SOI");
  let pos = 2;
  const qtables: (number[] | null)[] = [null, null, null, null];
  const huffDC: (Huff | null)[] = [null, null, null, null];
  const huffAC: (Huff | null)[] = [null, null, null, null];
  let width = 0;
  let height = 0;
  let comps: FrameComp[] = [];
  let restart = 0;

  while (pos < bytes.length) {
    const m = readMarker(bytes, pos);
    pos = m.pos;
    const mk = m.marker;
    if (mk === 0xffd9) throw new Error("jpeg: EOI before SOS");
    if (mk === 0xffda) break;
    if (mk === 0xffd0 || (mk >= 0xffd0 && mk <= 0xffd7)) continue;
    const seg = readSeg(bytes, pos);
    const data = seg.data;
    pos = seg.pos;
    if (mk === 0xffdb) {
      let i = 0;
      while (i < data.length) {
        const pq = data[i]!;
        const prec = pq >> 4;
        const id = pq & 0x0f;
        i++;
        const t: number[] = new Array(64);
        for (let k = 0; k < 64; k++) {
          if (prec) {
            t[ZIGZAG[k]!] = (data[i]! << 8) | data[i + 1]!;
            i += 2;
          } else {
            t[ZIGZAG[k]!] = data[i++]!;
          }
        }
        if (id < 4) qtables[id] = t;
      }
    } else if (mk === 0xffc4) {
      let i = 0;
      while (i < data.length) {
        const tc = data[i]!;
        i++;
        const counts = [0];
        let nsym = 0;
        for (let L = 1; L <= 16; L++) {
          const c = data[i++]!;
          counts[L] = c;
          nsym += c;
        }
        const symbols: number[] = [];
        for (let s = 0; s < nsym; s++) symbols.push(data[i++]!);
        const cls = tc >> 4;
        const id = tc & 0x0f;
        if (id < 4) (cls === 0 ? huffDC : huffAC)[id] = buildHuff(counts, symbols);
      }
    } else if (mk === 0xffc0) {
      const prec = data[0]!;
      if (prec !== 8) throw new Error("jpeg: only 8-bit SOF0");
      height = (data[1]! << 8) | data[2]!;
      width = (data[3]! << 8) | data[4]!;
      const nc = data[5]!;
      comps = [];
      let o = 6;
      for (let i = 0; i < nc; i++) {
        const id = data[o]!;
        const samp = data[o + 1]!;
        const tq = data[o + 2]!;
        comps.push({ id, hs: samp >> 4, vs: samp & 0x0f, tq });
        o += 3;
      }
    } else if (mk === 0xffc2 || mk === 0xffc1) {
      throw new Error("jpeg: progressive/extended not supported");
    } else if (mk === 0xffdd) {
      restart = (data[0]! << 8) | data[1]!;
    }
  }

  // SOS
  const sos = readSeg(bytes, pos);
  pos = sos.pos;
  const ns = sos.data[0]!;
  const scan: ScanComp[] = [];
  let o = 1;
  for (let i = 0; i < ns; i++) {
    const id = sos.data[o]!;
    const ta = sos.data[o + 1]!;
    const fc = comps.find((c) => c.id === id);
    if (!fc) throw new Error("jpeg: scan component missing from SOF");
    scan.push({ id, dc: ta >> 4, ac: ta & 0x0f, hs: fc.hs, vs: fc.vs, tq: fc.tq });
    o += 2;
  }

  if (width < 1 || height < 1) throw new Error("jpeg: no SOF0");
  const hMax = Math.max(...comps.map((c) => c.hs));
  const vMax = Math.max(...comps.map((c) => c.vs));
  const mcuW = 8 * hMax;
  const mcuH = 8 * vMax;
  const mcusX = Math.ceil(width / mcuW);
  const mcusY = Math.ceil(height / mcuH);
  const tw = mcusX * hMax;
  const th = mcusY * vMax;
  const planes: Float32Array[] = [];
  const pred = new Int32Array(scan.length);

  for (let i = 0; i < scan.length; i++) {
    const c = scan[i]!;
    planes[i] = new Float32Array((tw / hMax) * c.hs * ((th / vMax) * c.vs));
  }

  const bs = new BitStream(bytes, pos);
  let mcuCount = 0;
  let acEnergy = 0;
  let acN = 0;

  const decodeBlock = (ci: number): { dc: number; acE: number } => {
    const c = scan[ci]!;
    const hdc = huffDC[c.dc];
    const hac = huffAC[c.ac];
    const qt = qtables[c.tq];
    if (!hdc || !hac || !qt) throw new Error("jpeg: missing table");
    const t = huffDecode(bs, hdc);
    if (t < 0) throw new Error("jpeg: bad DC");
    const diffBits = t ? bs.getBits(t) : 0;
    if (t && diffBits < 0) throw new Error("jpeg: truncated DC");
    const diff = extendBits(diffBits, t);
    pred[ci] += diff;
    const dc = pred[ci]! * qt[0]!;
    let acE = 0;
    let k = 1;
    while (k < 64) {
      const rs = huffDecode(bs, hac);
      if (rs < 0) throw new Error("jpeg: bad AC");
      if (rs === 0) break; // EOB
      if (rs === 0xf0) {
        k += 16;
        continue;
      }
      const run = rs >> 4;
      const sz = rs & 0x0f;
      k += run;
      if (k >= 64) break;
      const bits = sz ? bs.getBits(sz) : 0;
      if (sz && bits < 0) throw new Error("jpeg: truncated AC");
      const val = extendBits(bits, sz) * qt[ZIGZAG[k]!]!;
      acE += val * val;
      k++;
    }
    return { dc, acE };
  };

  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restart > 0 && mcuCount > 0 && mcuCount % restart === 0) {
        // RST marker already consumed into bs.marker, or still in stream
        if (bs.marker >= 0xffd0 && bs.marker <= 0xffd7) bs.marker = 0;
        bs.align();
        pred.fill(0);
      }
      for (let ci = 0; ci < scan.length; ci++) {
        const c = scan[ci]!;
        const pw = (tw / hMax) * c.hs;
        const plane = planes[ci]!;
        for (let vy = 0; vy < c.vs; vy++) {
          for (let hx = 0; hx < c.hs; hx++) {
            const { dc, acE } = decodeBlock(ci);
            acEnergy += acE;
            acN++;
            const bx = mx * c.hs + hx;
            const by = my * c.vs + vy;
            plane[by * pw + bx] = dc;
          }
        }
      }
      mcuCount++;
    }
  }

  // Assemble RGB thumbnail at Y-block resolution (one pixel per 8x8 Y sample).
  const yComp = scan[0]!;
  const outW = mcusX * yComp.hs;
  const outH = mcusY * yComp.vs;
  const rgb = new Uint8Array(outW * outH * 3);
  const yPlane = planes[0]!;
  const yW = outW;
  const hasC = scan.length >= 3;

  const sampleC = (ci: number, x: number, y: number): number => {
    const c = scan[ci]!;
    const pw = (tw / hMax) * c.hs;
    const ph = (th / vMax) * c.vs;
    const cx = Math.min(pw - 1, Math.floor((x * c.hs) / yComp.hs));
    const cy = Math.min(ph - 1, Math.floor((y * c.vs) / yComp.vs));
    return planes[ci]![cy * pw + cx]!;
  };

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const Y = yPlane[y * yW + x]! / 8 + 128;
      let Cb = 128;
      let Cr = 128;
      if (hasC) {
        Cb = sampleC(1, x, y) / 8 + 128;
        Cr = sampleC(2, x, y) / 8 + 128;
      } else if (scan.length === 1) {
        // grayscale
      }
      const r = clamp(Math.round(Y + 1.402 * (Cr - 128)), 0, 255);
      const g = clamp(Math.round(Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128)), 0, 255);
      const b = clamp(Math.round(Y + 1.772 * (Cb - 128)), 0, 255);
      const i = (y * outW + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }

  const texture = acN > 0 ? Math.sqrt(acEnergy / acN) / 1024 : 0;
  return { width: outW, height: outH, rgb, texture };
}

function emptyFeat(): Features {
  return { r: 0, g: 0, b: 0, H: 0, S: 0, V: 0, green: 0, brown: 0, reds: 0, gray: 0, snow: 0, sky: 0, yellow: 0, texture: 0 };
}

function stats(pixels: Array<[number, number, number]>, texture: number): Features {
  const f = emptyFeat();
  const n = pixels.length;
  if (n === 0) return f;
  let r = 0, g = 0, b = 0, H = 0, S = 0, V = 0;
  let green = 0, brown = 0, reds = 0, gray = 0, snow = 0, sky = 0, yellow = 0;
  for (const p of pixels) {
    const rf = p[0] / 255, gf = p[1] / 255, bf = p[2] / 255;
    r += rf; g += gf; b += bf;
    const hsv = rgbToHsv(rf, gf, bf);
    const h = hsv[0], s = hsv[1], v = hsv[2];
    H += h; S += s; V += v;
    if (h >= 0.18 && h <= 0.45 && s >= 0.18 && v >= 0.12) green++;
    if ((h <= 0.12 || h >= 0.95) && s >= 0.15 && s <= 0.85 && v >= 0.12 && v <= 0.75) brown++;
    if ((h <= 0.06 || h >= 0.97) && s >= 0.35 && v >= 0.2) reds++;
    if (s <= 0.12 && v >= 0.15 && v <= 0.85) gray++;
    if (s <= 0.12 && v >= 0.82) snow++;
    if (h >= 0.5 && h <= 0.72 && s >= 0.15 && v >= 0.35) sky++;
    if (h >= 0.1 && h <= 0.18 && s >= 0.35 && v >= 0.35) yellow++;
  }
  f.r = r / n; f.g = g / n; f.b = b / n;
  f.H = H / n; f.S = S / n; f.V = V / n;
  f.green = green / n; f.brown = brown / n; f.reds = reds / n;
  f.gray = gray / n; f.snow = snow / n; f.sky = sky / n; f.yellow = yellow / n;
  f.texture = texture;
  return f;
}

function featuresOf(thumb: Thumb): FeatSet {
  const { width: w, height: h, rgb, texture } = thumb;
  const all: Array<[number, number, number]> = [];
  const top: Array<[number, number, number]> = [];
  const mid: Array<[number, number, number]> = [];
  const bot: Array<[number, number, number]> = [];
  const y1 = Math.floor(h / 3);
  const y2 = Math.floor((2 * h) / 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const p: [number, number, number] = [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!];
      all.push(p);
      if (y < y1) top.push(p);
      else if (y < y2) mid.push(p);
      else bot.push(p);
    }
  }
  return { a: stats(all, texture), t: stats(top, texture), m: stats(mid, texture), b: stats(bot, texture) };
}

function biomeOf(f: FeatSet): string {
  const snow = f.a.snow;
  const green = f.a.green;
  const bg = f.b.green;
  const brown = f.a.brown + f.a.reds;
  const gray = f.a.gray;
  const sky = f.t.sky;
  const S = f.a.S;
  const V = f.a.V;
  const tV = f.t.V;
  const lush = Math.max(green, bg);
  if (snow >= 0.22 && lush < 0.15) return "boreal";
  if (tV >= 0.88 && S < 0.18 && lush < 0.1 && (snow >= 0.1 || gray >= 0.25)) return "boreal";
  if (brown >= 0.3 && lush < 0.12) return "arid";
  if (lush < 0.07 && S >= 0.18 && V >= 0.52 && brown >= 0.15) return "arid";
  if (lush >= 0.22 && S >= 0.38 && V >= 0.55) return "tropical";
  if (lush >= 0.3 && sky >= 0.4) return "tropical";
  if (lush >= 0.22 && tV < 0.65 && S >= 0.28) {
    if (V <= 0.52 && sky < 0.25) return "boreal";
    if (S >= 0.45 && bg >= 0.3) return "tropical";
    return "temperate";
  }
  if (lush >= 0.18 && S >= 0.4) return "tropical";
  if (lush >= 0.08 && lush <= 0.25 && brown >= 0.1 && S >= 0.28) return "savanna";
  if (gray >= 0.42 && lush < 0.12) return "urban";
  if (lush >= 0.12) return "temperate";
  if (sky >= 0.85 && lush < 0.12 && S >= 0.28) return "open";
  return "temperate";
}

function scoreRegion(f: FeatSet, r: Region, b: string): number {
  let s = 0;
  const allow = ALLOW[b] ?? new Set();
  s += allow.has(r.biome) ? 3 : -5;
  if (r.biome === b || (b === "tropical" && r.biome === "tropical") || (b === "boreal" && r.biome === "boreal") ||
    (b === "arid" && r.biome === "arid")) s += 2;
  if (b === "boreal" && r.lat > 40) s += 1.8;
  if (b === "boreal" && r.lat < 0) s -= 2;
  if (b === "temperate" && r.lat > 25) s += 0.8;
  if (b === "temperate" && r.lat < -20) s -= 0.2;
  if (f.a.reds >= 0.05 && (r.name === "australia_arid" || r.name === "s_africa" || r.name === "e_africa" ||
    r.name === "sahel" || r.name === "congo" || r.name === "e_brazil")) s += 1.3;
  if (f.a.V >= 0.55 && f.a.brown >= 0.3 && (r.name === "mideast" || r.name === "andes" || r.name === "pakistan" ||
    r.name === "iran")) s += 1.1;
  if (f.a.S >= 0.42 && f.a.green >= 0.25 && (r.name === "png" || r.name === "indonesia" || r.name === "amazon" ||
    r.name === "congo" || r.name === "se_asia")) s += 1.0;
  if (f.a.green >= 0.22 && f.a.S < 0.4 && f.t.V < 0.72 && (r.name === "scandinavia" || r.name === "boreal_ru" ||
    r.name === "w_europe")) s += 1.0;
  if (f.t.sky >= 0.9 && f.a.green < 0.12) {
    if (r.lat > 45) s += 0.7;
    if ((r.name === "pampas" || r.name === "chile_s") && f.a.S >= 0.4) s += 0.8;
  }
  if (r.name === "e_us" || r.name === "w_europe" || r.name === "boreal_ru" || r.name === "e_brazil" ||
    r.name === "mexico") s += 0.2;
  return s;
}

function locate(jpeg: Uint8Array): { lat: number; lon: number } {
  try {
    const thumb = decodeJpegThumb(jpeg);
    const f = featuresOf(thumb);
    const b = biomeOf(f);
    let best = REGIONS[0]!;
    let bestS = -1e9;
    for (const r of REGIONS) {
      const s = scoreRegion(f, r, b);
      if (s > bestS) {
        bestS = s;
        best = r;
      }
    }
    return { lat: best.lat, lon: best.lon };
  } catch {
    // Decode failed: still answer, using a mid-latitude land prior.
    return { lat: 40, lon: 10 };
  }
}

function isLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}
function isLon(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

async function main(): Promise<number> {
  const envUrl = need("MAKEFUN_ENV_URL").replace(/\/+$/, "");
  const listed = (await (await fetch(`${envUrl}/photos`)).json()) as { photos: Photo[] };
  const photos = listed.photos.filter((p) => !p.answered).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const answers: Guess[] = [];
  for (const p of photos) {
    const jpeg = new Uint8Array(await (await fetch(`${envUrl}${p.url}`)).arrayBuffer());
    const c = locate(jpeg);
    const lat = clamp(c.lat, -90, 90);
    const lon = clamp(c.lon, -180, 180);
    if (isLat(lat) && isLon(lon)) answers.push({ id: p.id, lat, lon });
  }
  if (answers.length === 0) return 1;
  const res = await fetch(`${envUrl}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  const text = await res.text();
  process.stdout.write(`geolocator: ${answers.length} of ${photos.length} photos answered: HTTP ${res.status} ${text}\n`);
  return res.ok ? 0 : 1;
}

// Promise form so this file runs both as ESM (the server's node22) and as
// a CommonJS script (node without "type": "module" in package.json).
main().then((code) => {
  process.exitCode = code;
}, (err: unknown) => {
  process.stderr.write(`geolocator: ${(err as Error).stack ?? String(err)}\n`);
  process.exitCode = 1;
});
