/**
 * 글꼴: 단선 글꼴(SHX 대신, Hershey Roman Simplex)과 윤곽 글꼴(Noto Sans KR 조각).
 * 글리프 좌표는 "문자 높이 = 1"로 맞춘다(대문자 높이 기준, AutoCAD 문자 높이와 같다).
 */
import earcut from 'earcut';
import type { Font } from 'opentype.js';
import { STROKE_CAP_HEIGHT, STROKE_GLYPHS } from './strokefont-data';
import { gdtGlyph } from '../edit/annot/tolerance';

export interface GlyphGeom {
  /** 전진 폭(문자 높이 단위) */
  advance: number;
  /** 단선 글꼴의 선(각각 [x, y, …]) */
  strokes?: Float32Array[];
  /** 단선 글꼴의 선분 목록 [x0, y0, x1, y1, …](인스턴스 그리기용) */
  segs?: Float32Array;
  /** 윤곽 글꼴의 삼각형 [x0,y0,x1,y1,x2,y2,…] */
  tris?: Float32Array;
  /** 윤곽선(작게 보일 때·외곽선 모드) */
  contours?: Float32Array[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 이 모양이 나타내는 문자(배치할 때 정한다, null = 여러 문자가 같은 모양) */
  ch?: string | null;
}

export interface FontFace {
  readonly kind: 'stroke' | 'outline';
  /** 기준선 아래 깊이(문자 높이 단위) */
  readonly descent: number;
  glyph(code: number): GlyphGeom | null;
  has(code: number): boolean;
}

// ---------------------------------------------------------------------------
// 단선 글꼴
// ---------------------------------------------------------------------------

class StrokeFace implements FontFace {
  readonly kind = 'stroke' as const;
  readonly descent = 7 / STROKE_CAP_HEIGHT;
  private readonly glyphs = new Map<number, GlyphGeom>();

  constructor() {
    const k = 1 / STROKE_CAP_HEIGHT;
    for (const [code, w, data] of STROKE_GLYPHS) {
      const strokes: Float32Array[] = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      if (data) {
        for (const st of data.split(';')) {
          const pts = st.split(' ').flatMap((p) => p.split(',').map(Number));
          const f = new Float32Array(pts.length);
          for (let i = 0; i < pts.length; i += 2) {
            const x = pts[i]! * k;
            const y = pts[i + 1]! * k;
            f[i] = x;
            f[i + 1] = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
          strokes.push(f);
        }
      }
      if (!strokes.length) {
        minX = 0;
        minY = 0;
        maxX = w * k;
        maxY = 0;
      }
      const segs: number[] = [];
      for (const st of strokes) {
        if (st.length === 2) segs.push(st[0]!, st[1]!, st[0]!, st[1]!);
        for (let i = 2; i < st.length; i += 2) segs.push(st[i - 2]!, st[i - 1]!, st[i]!, st[i + 1]!);
      }
      this.glyphs.set(code, { advance: w * k, strokes, segs: new Float32Array(segs), minX, minY, maxX, maxY });
    }
  }

  has(code: number): boolean {
    return this.glyphs.has(code);
  }

  glyph(code: number): GlyphGeom | null {
    return this.glyphs.get(code) ?? null;
  }
}

export const strokeFace: FontFace = new StrokeFace();

/**
 * GDT 글꼴(gdt.shx·amgdt.shx) 대신: 소문자 a~z를 기하 공차 기호(직각도 b, 위치도 j, 지름 n, Ⓜ m …)로 그린다.
 * 기호 모양은 TOLERANCE와 같은 이 프로젝트의 단선 도형(edit/annot/tolerance.ts gdtGlyph). 그 밖의 글자는 다음 글꼴이 맡는다
 */
class GdtFace implements FontFace {
  readonly kind = 'stroke' as const;
  readonly descent = strokeFace.descent;
  private readonly glyphs = new Map<number, GlyphGeom | null>();

  has(code: number): boolean {
    return !!this.glyph(code);
  }

  glyph(code: number): GlyphGeom | null {
    if (code < 0x61 || code > 0x7a) return null;
    let g = this.glyphs.get(code);
    if (g !== undefined) return g;
    g = null;
    const strokesIn = gdtGlyph(String.fromCharCode(code));
    if (strokesIn) {
      // 기호 상자(가운데 0,0, 크기 1)를 기준선 위 문자 높이 1 칸으로
      const strokes: Float32Array[] = [];
      const segs: number[] = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const st of strokesIn) {
        const pts = st.closed && st.pts.length ? [...st.pts, st.pts[0]!] : st.pts;
        const f = new Float32Array(pts.length * 2);
        pts.forEach((p, i) => {
          const x = p.x + 0.55;
          const y = p.y + 0.5;
          f[i * 2] = x;
          f[i * 2 + 1] = y;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          if (i) segs.push(f[i * 2 - 2]!, f[i * 2 - 1]!, x, y);
        });
        strokes.push(f);
      }
      g = { advance: 1.1, strokes, segs: new Float32Array(segs), minX, minY, maxX, maxY };
    }
    this.glyphs.set(code, g);
    return g;
  }
}

export const gdtFace: FontFace = new GdtFace();

/** GDT 기호 글꼴 이름인지(gdt·amgdt, 확장자 무관) */
export function isGdtFont(font: string): boolean {
  return /^(am)?gdt(\.shx)?$/i.test(font.trim().replace(/^.*[\\/]/, ''));
}

// ---------------------------------------------------------------------------
// 윤곽 글꼴(조각 단위로 받는다)
// ---------------------------------------------------------------------------

interface Manifest {
  family: string;
  unitsPerEm: number;
  chunks: { file: string; ranges: [number, number][]; size: number }[];
}

export type Fetcher = (url: string) => Promise<ArrayBuffer>;

const defaultFetcher: Fetcher = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`글꼴을 받지 못했습니다: ${url}`);
  return r.arrayBuffer();
};

function flattenPath(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[], scale: number): number[][] {
  const contours: number[][] = [];
  let cur: number[] | null = null;
  let px = 0;
  let py = 0;
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        cur = [];
        contours.push(cur);
        px = c.x!;
        py = c.y!;
        cur.push(px * scale, py * scale);
        break;
      case 'L':
        px = c.x!;
        py = c.y!;
        cur?.push(px * scale, py * scale);
        break;
      case 'Q': {
        const n = 4;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const a = (1 - t) * (1 - t);
          const b = 2 * (1 - t) * t;
          const d = t * t;
          cur?.push((a * px + b * c.x1! + d * c.x!) * scale, (a * py + b * c.y1! + d * c.y!) * scale);
        }
        px = c.x!;
        py = c.y!;
        break;
      }
      case 'C': {
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          const a = u * u * u;
          const b = 3 * u * u * t;
          const e = 3 * u * t * t;
          const d = t * t * t;
          cur?.push((a * px + b * c.x1! + e * c.x2! + d * c.x!) * scale, (a * py + b * c.y1! + e * c.y2! + d * c.y!) * scale);
        }
        px = c.x!;
        py = c.y!;
        break;
      }
      case 'Z':
        cur = null;
        break;
    }
  }
  return contours.filter((c) => c.length >= 6);
}

function pointInPolygon(x: number, y: number, c: number[]): boolean {
  let inside = false;
  for (let i = 0, n = c.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = c[i]!;
    const yi = c[i + 1]!;
    const xj = c[j]!;
    const yj = c[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function signedArea(c: number[]): number {
  let a = 0;
  for (let i = 0, n = c.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
  }
  return a / 2;
}

/**
 * 윤곽 → 삼각형(0이 아닌 감김 규칙).
 * 글꼴 윤곽은 서로 겹칠 수 있다(가변 글꼴). 가장 큰 윤곽과 같은 방향이면 채움, 반대 방향이면 구멍으로 보고,
 * 구멍은 그것을 품은 가장 작은 채움 윤곽에 붙인다. 겹친 채움은 그대로 겹쳐 그린다.
 */
export function triangulateContours(contours: number[][]): number[] {
  if (!contours.length) return [];
  const areas = contours.map(signedArea);
  let big = 0;
  for (let i = 1; i < areas.length; i++) if (Math.abs(areas[i]!) > Math.abs(areas[big]!)) big = i;
  const sign = Math.sign(areas[big]!) || 1;
  const fills: number[] = [];
  const holes: number[] = [];
  areas.forEach((a, i) => (Math.sign(a) === sign ? fills : holes).push(i));
  const holeOf = new Map<number, number[]>();
  for (const hIdx of holes) {
    const hc = contours[hIdx]!;
    const x = (hc[0]! + hc[2]!) / 2;
    const y = (hc[1]! + hc[3]!) / 2;
    let best = -1;
    let bestArea = Infinity;
    for (const f of fills) {
      const fa = Math.abs(areas[f]!);
      if (fa < bestArea && pointInPolygon(x, y, contours[f]!)) {
        best = f;
        bestArea = fa;
      }
    }
    if (best >= 0) {
      const l = holeOf.get(best) ?? [];
      l.push(hIdx);
      holeOf.set(best, l);
    }
  }
  const out: number[] = [];
  for (const f of fills) {
    const flat = [...contours[f]!];
    const holeIdx: number[] = [];
    for (const hIdx of holeOf.get(f) ?? []) {
      holeIdx.push(flat.length / 2);
      flat.push(...contours[hIdx]!);
    }
    const idx = earcut(flat, holeIdx, 2);
    for (const k of idx) out.push(flat[k * 2]!, flat[k * 2 + 1]!);
  }
  return out;
}

export type OutlineMode = 'cap' | 'cjk';

/** 라틴 트루타입 계열: Arial·Times·Courier와 글자 폭이 같은 Liberation 글꼴로 그린다 */
export type LatinFamily = 'sans' | 'serif' | 'mono';

export function latinFamilyOf(font: string): LatinFamily | null {
  const f = font.trim().toLowerCase();
  if (!f || /\.shx$/.test(f)) return null;
  if (/arial|helvet|swiss|arimo|liberation ?sans|tahoma|verdana|calibri|segoe|franklin|century gothic|isocpeur|isocteur/.test(f)) return 'sans';
  if (/times|tinos|liberation ?serif|georgia|garamond|book antiqua|cambria|bookman|palatino/.test(f)) return 'serif';
  if (/courier|cousine|consolas|liberation ?mono|lucida console|monospace/.test(f)) return 'mono';
  return null;
}

/** AutoCAD가 문자 높이로 쓰는 원래 글꼴의 대문자 높이(em 비율). 폭을 원래 글꼴과 같게 맞춘다 */
const LATIN_FILES: Record<LatinFamily, { file: string; cap: number }> = {
  sans: { file: 'LiberationSans-Regular.ttf', cap: 1467 / 2048 },
  serif: { file: 'LiberationSerif-Regular.ttf', cap: 1356 / 2048 },
  mono: { file: 'LiberationMono-Regular.ttf', cap: 1170 / 2048 },
};

class OutlineFace implements FontFace {
  readonly kind = 'outline' as const;
  private readonly cache = new Map<number, GlyphGeom | null>();

  constructor(
    private readonly lookup: (code: number) => Font | null,
    private readonly scaleOf: (font: Font) => number,
    readonly descent: number,
  ) {}

  has(code: number): boolean {
    const f = this.lookup(code);
    return !!f && f.charToGlyphIndex(String.fromCodePoint(code)) > 0;
  }

  glyph(code: number): GlyphGeom | null {
    if (this.cache.has(code)) return this.cache.get(code)!;
    const font = this.lookup(code);
    if (!font) return null;
    const g = font.charToGlyph(String.fromCodePoint(code));
    if (!g || g.index === 0) {
      this.cache.set(code, null);
      return null;
    }
    const scale = this.scaleOf(font);
    const path = typeof g.path === 'function' ? g.path() : g.path;
    const contours = flattenPath(path.commands, scale);
    const tris = triangulateContours(contours);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of contours)
      for (let i = 0; i < c.length; i += 2) {
        if (c[i]! < minX) minX = c[i]!;
        if (c[i]! > maxX) maxX = c[i]!;
        if (c[i + 1]! < minY) minY = c[i + 1]!;
        if (c[i + 1]! > maxY) maxY = c[i + 1]!;
      }
    const advance = (g.advanceWidth ?? font.unitsPerEm) * scale;
    if (!contours.length) {
      minX = 0;
      maxX = advance;
      minY = 0;
      maxY = 0;
    }
    const geom: GlyphGeom = {
      advance,
      tris: new Float32Array(tris),
      contours: contours.map((c) => new Float32Array(c)),
      minX,
      minY,
      maxX,
      maxY,
    };
    this.cache.set(code, geom);
    return geom;
  }
}

/** 글꼴 폴더 옆 폴더(URL이든 파일 경로든) */
function siblingDir(base: string, name: string): string {
  if (/^[a-z]+:/i.test(base)) return new URL(`../${name}/`, base).href;
  return base.replace(/[^/]+\/?$/, '') + name + '/';
}

/** Noto Sans KR 조각 모음 */
export class OutlineLibrary {
  private manifest: Manifest | null = null;
  private readonly fonts = new Map<string, Font>();
  private readonly loading = new Map<string, Promise<void>>();
  unitsPerEm = 1000;
  /** 대문자 높이 = 1이 되는 배율 */
  capScale = 1 / 733;
  /** 한글 글자 높이 ≈ 1이 되는 배율(SHX 큰 글꼴 대신 쓸 때). '가'의 높이가 904/1000 em이다. */
  cjkScale = 1 / 880;
  readonly capFace: FontFace;
  readonly cjkFace: FontFace;
  private parse: ((b: ArrayBuffer) => Font) | null = null;
  private readonly latin = new Map<LatinFamily, Font>();
  private readonly latinFaces = new Map<LatinFamily, FontFace>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = defaultFetcher,
  ) {
    // 'g'의 아래 끝이 기준선 아래 250/1000 em, 대문자 높이는 733
    this.capFace = new OutlineFace((c) => this.fontFor(c), () => this.capScale, 0.34);
    this.cjkFace = new OutlineFace((c) => this.fontFor(c), () => this.cjkScale, 0.34);
  }

  /** Liberation 라틴 글꼴 면(받아 둔 경우만, 아니면 null) */
  latinFace(fam: LatinFamily): FontFace | null {
    if (!this.latin.has(fam)) return null;
    let f = this.latinFaces.get(fam);
    if (!f) {
      const info = LATIN_FILES[fam];
      f = new OutlineFace(() => this.latin.get(fam) ?? null, (font) => 1 / (info.cap * font.unitsPerEm), 0.3);
      this.latinFaces.set(fam, f);
    }
    return f;
  }

  /** 라틴 글꼴을 받아 둔다 */
  async requireLatin(fams: Iterable<LatinFamily>): Promise<void> {
    if (!this.parse) {
      const mod = await import('opentype.js');
      this.parse = mod.parse;
    }
    await Promise.all(
      [...new Set(fams)].map(async (fam) => {
        if (this.latin.has(fam)) return;
        const key = 'latin:' + fam;
        let p = this.loading.get(key);
        if (!p) {
          p = this.fetcher(siblingDir(this.baseUrl, 'liberation') + LATIN_FILES[fam].file).then((buf) => {
            this.latin.set(fam, this.parse!(buf));
          });
          this.loading.set(key, p);
        }
        await p;
      }),
    );
  }

  private async loadManifest(): Promise<Manifest> {
    if (!this.manifest) {
      const buf = await this.fetcher(this.baseUrl + 'manifest.json');
      this.manifest = JSON.parse(new TextDecoder().decode(buf)) as Manifest;
      this.unitsPerEm = this.manifest.unitsPerEm;
    }
    return this.manifest;
  }

  private chunkOf(code: number): string | null {
    const m = this.manifest;
    if (!m) return null;
    for (const c of m.chunks) for (const [a, b] of c.ranges) if (code >= a && code <= b) return c.file;
    return null;
  }

  fontFor(code: number): Font | null {
    const f = this.chunkOf(code);
    return f ? (this.fonts.get(f) ?? null) : null;
  }

  /** 문자들이 든 조각을 받아 둔다. */
  async require(codes: Iterable<number>): Promise<void> {
    await this.loadManifest();
    if (!this.parse) {
      const mod = await import('opentype.js');
      this.parse = mod.parse;
    }
    const need = new Set<string>(['base.ttf']);
    for (const c of codes) {
      const f = this.chunkOf(c);
      if (f) need.add(f);
    }
    await Promise.all(
      [...need].map((file) => {
        if (this.fonts.has(file)) return Promise.resolve();
        let p = this.loading.get(file);
        if (!p) {
          p = this.fetcher(this.baseUrl + file).then((buf) => {
            const font = this.parse!(buf);
            this.fonts.set(file, font);
            if (file === 'base.ttf') {
              const cap = font.tables.os2?.sCapHeight;
              if (cap) this.capScale = 1 / cap;
            }
          });
          this.loading.set(file, p);
        }
        return p;
      }),
    );
  }
}

/** 단선 글꼴로 그릴 수 있는 문자인지 */
export function strokeHas(code: number): boolean {
  return strokeFace.has(code);
}
