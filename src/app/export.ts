/**
 * 내보내기: PNG(화면 그대로), SVG·PDF(벡터, 표시 목록에서).
 * PDF는 직접 쓴다(선·채움만, 문자는 모양 그대로 그린다).
 */
import { ensureLayoutVariants, viewportModel } from './psltscale';
import { MODEL_SPACE } from '../core/model';
import { trackExport, type ExportFormat } from './analytics';
import { imageDataUrl, imagePixels, xrefPlacements } from './refs';
import type { CtbTable } from '../render/ctb';
import type { DisplayList } from '../render/displaylist';
import { GLYPH_STRIDE, SEG_STRIDE, TRI_STRIDE } from '../render/displaylist';
import type { App } from './app';
import type { DocState } from './docstate';
import type { LayerState, PlotStyle } from '../render/styles';
import type { SpaceScene } from './scene';
import { layoutViewports, paperInfo, viewportXf } from './scene';

export type Affine = [number, number, number, number, number, number];

interface Sink {
  seg(x0: number, y0: number, x1: number, y1: number, style: number): void;
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, style: number): void;
  /** 글자 하나(글리프가 나타내는 문자, 글리프 단위 → 출력 좌표 아핀, 그리기 깊이, 전진 폭(글리프 단위)). 검색되는 문자를 쓸 때만 */
  char?(ch: string, m: Affine, style: number, depth: number, advance?: number): void;
}

/** 표시 목록을 그리기 순서(깊이)대로 내보낸다. m: 도면 → 출력 좌표 */
export function walk(dl: DisplayList, m: Affine, visible: (s: number) => boolean, sink: Sink, clip?: [number, number, number, number]): void {
  type Item = { d: number; f: () => void };
  const items: Item[] = [];
  const X = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  for (const c of dl.chunks) {
    if (clip && (c.maxX < clip[0] || c.minX > clip[2] || c.maxY < clip[1] || c.minY > clip[3])) continue;
    for (const [buf, n] of [
      [c.tris, c.triCount],
      [c.ttris, c.ttriCount],
    ] as const) {
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      for (let i = 0; i < n; i++) {
        const o = i * 3 * TRI_STRIDE;
        const s = u[o + 3]!;
        if (!visible(s)) continue;
        const a = X(f[o]! + c.ox, f[o + 1]! + c.oy);
        const b = X(f[o + TRI_STRIDE]! + c.ox, f[o + TRI_STRIDE + 1]! + c.oy);
        const d = X(f[o + 2 * TRI_STRIDE]! + c.ox, f[o + 2 * TRI_STRIDE + 1]! + c.oy);
        items.push({ d: f[o + 2]!, f: () => sink.tri(a[0], a[1], b[0], b[1], d[0], d[1], s) });
      }
    }
    for (const [buf, n] of [
      [c.segs, c.segCount],
      [c.tsegs, c.tsegCount],
    ] as const) {
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      for (let i = 0; i < n; i++) {
        const o = i * SEG_STRIDE;
        const s = u[o + 5]!;
        if (!visible(s)) continue;
        const a = X(f[o]! + c.ox, f[o + 1]! + c.oy);
        const b = X(f[o + 2]! + c.ox, f[o + 3]! + c.oy);
        items.push({ d: f[o + 4]! - 1e-9, f: () => sink.seg(a[0], a[1], b[0], b[1], s) });
      }
    }
  }
  const gs = dl.glyphs;
  const inst = new Float32Array(gs.instances);
  for (const r of gs.runs) {
    const g = gs.glyphs[r.glyph]!;
    for (let k = r.start; k < r.start + r.count; k++) {
      const o = k * GLYPH_STRIDE;
      const s = inst[o + 9]!;
      if (!visible(s)) continue;
      const a = inst[o]!;
      const b = inst[o + 1]!;
      const c = inst[o + 2]!;
      const d = inst[o + 3]!;
      const e = inst[o + 4]! + inst[o + 5]!;
      const ff = inst[o + 6]! + inst[o + 7]!;
      // 삽입점이 자르기 밖이어도 글자 일부가 안에 들 수 있다(글자 크기만큼 넉넉히, 실제 자르기는 출력의 자르기 경로)
      const pad = 2 * (Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(d));
      if (clip && (e < clip[0] - pad || e > clip[2] + pad || ff < clip[1] - pad || ff > clip[3] + pad)) continue;
      const G = (x: number, y: number) => X(a * x + c * y + e, b * x + d * y + ff);
      const depth = inst[o + 8]!;
      if (sink.char && g.ch) {
        const o0 = X(e, ff);
        const ux = [m[0] * a + m[2] * b, m[1] * a + m[3] * b];
        const uy = [m[0] * c + m[2] * d, m[1] * c + m[3] * d];
        sink.char(g.ch, [ux[0]!, ux[1]!, uy[0]!, uy[1]!, o0[0], o0[1]], s, depth, g.adv);
      }
      if (g.kind === 0) {
        const v = gs.fillVerts;
        const first = g.first;
        const count = g.count;
        items.push({
          d: depth,
          f: () => {
            for (let i = first; i + 2 < first + count; i += 3) {
              const p0 = G(v[i * 2]!, v[i * 2 + 1]!);
              const p1 = G(v[i * 2 + 2]!, v[i * 2 + 3]!);
              const p2 = G(v[i * 2 + 4]!, v[i * 2 + 5]!);
              sink.tri(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], s);
            }
          },
        });
      } else {
        const v = gs.strokeSegs;
        const first = g.first;
        const count = g.count;
        items.push({
          d: depth - 1e-9,
          f: () => {
            for (let i = first; i < first + count; i++) {
              const p0 = G(v[i * 4]!, v[i * 4 + 1]!);
              const p1 = G(v[i * 4 + 2]!, v[i * 4 + 3]!);
              sink.seg(p0[0], p0[1], p1[0], p1[1], s);
            }
          },
        });
      }
    }
  }
  items.sort((p, q) => q.d - p.d);
  for (const it of items) it.f();
}

export interface Page {
  /** 출력 크기(포인트 또는 픽셀) */
  width: number;
  height: number;
  /** 배치를 대화상자 보기(LayoutPlotView)로 그렸다(간격띄우기를 이미 넣었다) */
  viewed?: boolean;
  /** 그릴 장면들(순서대로), 출력 좌표 변환, 스타일 표, 자르기, 스타일의 도면층 이름(PDF 도면층) */
  layers: { scene: SpaceScene; m: Affine; styles: Float32Array; clipPx?: [number, number, number, number]; clipWorld?: [number, number, number, number]; clipPoly?: number[]; layerName?: (style: number) => string | undefined }[];
  /** 투명도를 출력한다(스타일의 알파) */
  transparency?: boolean;
  background: number;
  /** 선가중치 mm → 출력 단위 */
  lwScale: number;
}

export interface PageOptions {
  plotStyle?: PlotStyle;
  /** 플롯 스타일 표(CTB): 있으면 ACI별 펜으로 색·선가중치를 정한다 */
  ctb?: CtbTable;
  /** 선가중치 출력 */
  lineweights: boolean;
  /** 투명도 출력(PDF 투명 그래픽 상태, SVG opacity). 없으면 불투명 */
  transparency?: boolean;
  /** 배치: 도면 공간을 뷰포트 다음에 그린다(없으면 도면 공간 먼저 — AutoCAD 기본) */
  paperspaceLast?: boolean;
}

/** 배치를 대화상자 설정으로 플롯할 때의 보기: 도면 공간 영역 region을 출력 좌표 (offX, offY)부터 k배로 */
export interface LayoutPlotView {
  /** 쪽 크기(출력 단위) */
  width: number;
  height: number;
  /** 플롯할 도면 공간 영역 [x0, y0, x1, y1] */
  region: [number, number, number, number];
  /** 출력 단위 / 도면 공간 단위 */
  k: number;
  /** region 왼쪽 위 구석의 출력 좌표 */
  offX: number;
  offY: number;
  /** 선가중치 배율(선가중치 축척) */
  lwFactor: number;
}

/** 스타일 번호 → 도면층 이름(PDF 도면층으로 묶을 때) */
function layerNamer(scene: SpaceScene, layers: readonly LayerState[]): (style: number) => string | undefined {
  return (i) => layers[scene.styles.specs[i]?.layer ?? -1]?.name;
}

/** 두 사각형 [x0, y0, x1, y1]의 겹침 */
function meet(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

/** 모형의 사각형(도면 좌표)을 용지에 놓는다. k = 출력 단위 / 도면 단위, 원점 = 용지 위 왼쪽 기준 출력 좌표 */
/** 장면의 외부 참조 인스턴스를 출력 레이어로(호스트 레이어 L 아래에 그린다) */
function xrefLayers(st: DocState, L: Page['layers'][number], opt: PageOptions, vpFrozen?: ReadonlySet<string>): Page['layers'] {
  const out: Page['layers'] = [];
  const m = L.m;
  for (const p of xrefPlacements(st, L.scene.source, (sty) => L.styles[sty * 8 + 5]! > 0, vpFrozen)) {
    const mm: Affine = [m[0] * p.m[0] + m[2] * p.m[1], m[1] * p.m[0] + m[3] * p.m[1], m[0] * p.m[2] + m[2] * p.m[3], m[1] * p.m[2] + m[3] * p.m[3], m[0] * p.m[4] + m[2] * p.m[5] + m[4], m[1] * p.m[4] + m[3] * p.m[5] + m[5]];
    const styles = p.file.scene.styleData(p.layers, `${p.key}|${opt.plotStyle || opt.ctb ? 'plot' : 'export'}`, false, 0xffffff, opt.lineweights, undefined, opt.plotStyle, opt.ctb);
    const layer: Page['layers'][number] = { scene: p.file.scene, m: mm, styles, clipPx: L.clipPx, clipPoly: L.clipPoly, layerName: layerNamer(p.file.scene, p.layers) };
    const c = p.clip;
    if (c && !L.clipPoly) layer.clipPoly = c.map((v, i) => (i & 1 ? m[1] * c[i - 1]! + m[3] * v + m[5] : m[0] * v + m[2] * c[i + 1]! + m[4]));
    out.push(layer);
  }
  return out;
}

/**
 * 모형의 사각형 rect(도면 좌표)를 쪽 가운데에 놓는다. clipRect를 주면 그 바깥은 그리지 않는다(플롯 영역 — 같은 용지 위라도)
 */
export function modelPage(st: DocState, rect: [number, number, number, number], width: number, height: number, k: number, unitsPerMm: number, opt: PageOptions, clip = true, clipRect?: [number, number, number, number]): Page | null {
  const scene = st.scenes.get(MODEL_SPACE);
  if (!scene) return null;
  const [x0, y0, x1, y1] = rect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const styles = scene.styleData(st.sceneLayers(MODEL_SPACE), opt.plotStyle || opt.ctb ? 'plot' : 'export', false, 0xffffff, opt.lineweights, undefined, opt.plotStyle, opt.ctb);
  const m: Affine = [k, 0, 0, -k, width / 2 - cx * k, height / 2 + cy * k];
  const page: Page = { width, height, background: 0xffffff, lwScale: unitsPerMm, layers: [], transparency: !!opt.transparency };
  const c = clipRect ? meet(rect, clipRect) : rect;
  const L: Page['layers'][number] = { scene, m, styles, clipWorld: [c[0], c[1], c[2], c[3]], layerName: layerNamer(scene, st.sceneLayers(MODEL_SPACE)) };
  if (clip) L.clipPx = [width / 2 - (cx - c[0]) * k, height / 2 - (c[3] - cy) * k, width / 2 + (c[2] - cx) * k, height / 2 + (cy - c[1]) * k];
  page.layers.push(...xrefLayers(st, L, opt), L);
  return page;
}

/**
 * 배치를 쪽으로. view가 없으면 배치 용지 그대로(1:1), 있으면 그 영역·축척·자리(대화상자 설정)로 그리고 영역 밖은 자른다.
 * 그리는 순서는 AutoCAD 기본처럼 도면 공간 먼저, 그 위에 뷰포트(paperspaceLast면 반대)
 */
export function layoutPage(st: DocState, space: string, unitsPerMm: number, opt: PageOptions, view?: LayoutPlotView): Page | null {
  const scene = st.scenes.get(space);
  const lay = st.layoutFor(space);
  if (!lay) return null;
  const paper = paperInfo(lay, scene?.bounds ?? null);
  // 도면 공간 (x, y) → 출력 ((x − X0)·k + offX, (Y1 − y)·k + offY)
  const k = view ? view.k : paper.mmPerUnit * unitsPerMm;
  const X0 = view ? view.region[0] : paper.minX;
  const Y1 = view ? view.region[3] : paper.maxY;
  const offX = view?.offX ?? 0;
  const offY = view?.offY ?? 0;
  const tx = (x: number) => (x - X0) * k + offX;
  const ty = (y: number) => (Y1 - y) * k + offY;
  const width = view ? view.width : (paper.maxX - paper.minX) * k;
  const height = view ? view.height : (paper.maxY - paper.minY) * k;
  const page: Page = { width, height, background: 0xffffff, lwScale: unitsPerMm * (view?.lwFactor ?? 1), layers: [], viewed: !!view, transparency: !!opt.transparency };
  // 플롯 영역(출력 좌표)
  const area: [number, number, number, number] | null = view ? [offX, offY, offX + (view.region[2] - view.region[0]) * k, offY + (view.region[3] - view.region[1]) * k] : null;
  const vpLayers: Page['layers'] = [];
  if (st.scenes.has(MODEL_SPACE)) {
    for (const vp of layoutViewports(st.doc, lay)) {
      const vx = viewportXf(st.doc, vp);
      const vm = viewportModel(null, st, vx);
      if (!vm) continue;
      const model = vm.scene;
      const idx = vm.index;
      const frozen = new Set<number>();
      for (const n of vx.frozen) {
        const i = idx.get(n);
        if (i !== undefined) frozen.add(i);
      }
      const kk = vx.k * k;
      const c = Math.cos(-vx.twist);
      const s = Math.sin(-vx.twist);
      const cx = tx(vp.center.x);
      const cy = ty(vp.center.y);
      const m: Affine = [kk * c, -kk * s, -kk * s, -kk * c, 0, 0];
      m[4] = cx - (m[0] * vx.refX + m[2] * vx.refY);
      m[5] = cy - (m[1] * vx.refX + m[3] * vx.refY);
      const hw = vp.width / 2;
      const hh = vp.height / 2;
      const rad = Math.hypot(hw, hh) / vx.k;
      let clipPx: [number, number, number, number] = [cx - hw * k, cy - hh * k, cx + hw * k, cy + hh * k];
      if (area) clipPx = meet(clipPx, area);
      if (clipPx[2] <= clipPx[0] || clipPx[3] <= clipPx[1]) continue;
      // 다각형·원 뷰포트 경계(출력 좌표). 플롯 영역으로 자를 때는 영역과 겹친 부분
      let clipPoly = vx.clip ? vx.clip.map((v, i) => (i & 1 ? ty(v) : tx(v))) : undefined;
      if (clipPoly && area) clipPoly = clipPolygonToRect(clipPoly, area);
      const vl: Page['layers'][number] = {
        scene: model,
        m,
        styles: model.styleData(vm.layers, `${opt.plotStyle || opt.ctb ? 'vp-plot' : 'vp'}${vm.ovKey ? `|${vm.ovKey}` : ''}`, false, 0xffffff, opt.lineweights, frozen.size ? frozen : undefined, opt.plotStyle, opt.ctb),
        clipPx,
        clipWorld: [vx.refX - rad, vx.refY - rad, vx.refX + rad, vx.refY + rad],
        clipPoly: clipPoly && clipPoly.length >= 6 ? clipPoly : undefined,
        layerName: layerNamer(model, vm.layers),
      };
      vpLayers.push(...xrefLayers(st, vl, opt, vx.frozen), vl);
    }
  }
  const paperLayers: Page['layers'] = [];
  if (scene) {
    const pl: Page['layers'][number] = {
      scene,
      m: [k, 0, 0, -k, -X0 * k + offX, Y1 * k + offY],
      styles: scene.styleData(st.sceneLayers(space), opt.plotStyle || opt.ctb ? 'paper-plot' : 'paper', false, 0xffffff, opt.lineweights, undefined, opt.plotStyle, opt.ctb),
      layerName: layerNamer(scene, st.sceneLayers(space)),
    };
    if (area) {
      pl.clipPx = area;
      if (view) pl.clipWorld = [view.region[0], view.region[1], view.region[2], view.region[3]];
    }
    paperLayers.push(...xrefLayers(st, pl, opt), pl);
  }
  page.layers.push(...(opt.paperspaceLast ? [...vpLayers, ...paperLayers] : [...paperLayers, ...vpLayers]));
  return page;
}

/** 다각형(출력 좌표 [x, y, …])을 사각형으로 자른다(서덜랜드-호지먼) */
function clipPolygonToRect(poly: number[], r: [number, number, number, number]): number[] {
  let pts: [number, number][] = [];
  for (let i = 0; i + 1 < poly.length; i += 2) pts.push([poly[i]!, poly[i + 1]!]);
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= r[0], (a, b) => [r[0], a[1] + ((b[1] - a[1]) * (r[0] - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= r[2], (a, b) => [r[2], a[1] + ((b[1] - a[1]) * (r[2] - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= r[1], (a, b) => [a[0] + ((b[0] - a[0]) * (r[1] - a[1])) / (b[1] - a[1]), r[1]]],
    [(p) => p[1] <= r[3], (a, b) => [a[0] + ((b[0] - a[0]) * (r[3] - a[1])) / (b[1] - a[1]), r[3]]],
  ];
  for (const [inside, cross] of edges) {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (inside(b)) {
        if (!inside(a)) out.push(cross(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cross(a, b));
    }
    pts = out;
    if (!pts.length) break;
  }
  return pts.flat();
}

/** 지금 공간을 출력 페이지로(배치는 용지, 모형은 지금 화면) */
function pageFor(app: App, unitsPerMm: number, fitWidth?: number): Page | null {
  const st = app.active;
  if (!st) return null;
  const v = app.view;
  const opt: PageOptions = { lineweights: app.view.lwDisplay };
  if (!st.onLayout) {
    // 타일 뷰포트면 활성 타일의 화면
    const [x0, y0, x1, y1] = v.visibleWorld();
    const ww = x1 - x0;
    const wh = y1 - y0;
    const W = fitWidth ?? ww * v.camera().scale;
    const k = W / ww;
    return modelPage(st, [x0, y0, x1, y1], W, wh * k, k, unitsPerMm, opt, false);
  }
  return layoutPage(st, st.displaySpace, unitsPerMm, opt);
}

function css(styles: Float32Array, s: number): string {
  const r = Math.round(styles[s * 8]! * 255);
  const g = Math.round(styles[s * 8 + 1]! * 255);
  const b = Math.round(styles[s * 8 + 2]! * 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export async function exportSvg(app: App): Promise<Blob | null> {
  // SVG 단위 = mm(배치) 또는 화면 픽셀(모형)
  const st = app.active;
  if (!st) return null;
  if (st.onLayout) await ensureLayoutVariants(app, st, st.displaySpace);
  const page = pageFor(app, 1);
  if (!page) return null;
  return exportPageSvg(page, !st.onLayout ? 'px' : 'mm');
}

/** 출력할 래스터 이미지: UV(0~1, v는 위가 0) → 출력 좌표 아핀과 경계 삼각형(출력 좌표) */
interface PageImage {
  key: string;
  /** [a, b, c, d, e, f]: 출력 = (a·u + c·v + e, b·u + d·v + f) */
  uv: Affine;
  tris: number[];
}

function pageImages(L: Page['layers'][number]): PageImage[] {
  const out: PageImage[] = [];
  const m = L.m;
  for (const im of L.scene.source.images ?? []) {
    if (!(L.styles[im.style * 8 + 5]! > 0) || !imagePixels(im.key)) continue;
    const v = im.verts;
    if (v.length < 12) continue;
    // 첫 삼각형으로 UV → 월드 아핀을 푼다
    const P = (i: number) => [v[i * 4]! + im.ox, v[i * 4 + 1]! + im.oy, v[i * 4 + 2]!, v[i * 4 + 3]!] as const;
    const [x0, y0, u0, w0] = P(0);
    const [x1, y1, u1, w1] = P(1);
    const [x2, y2, u2, w2] = P(2);
    const du1 = u1 - u0;
    const dv1 = w1 - w0;
    const du2 = u2 - u0;
    const dv2 = w2 - w0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const a = ((x1 - x0) * dv2 - (x2 - x0) * dv1) / det;
    const c = ((x2 - x0) * du1 - (x1 - x0) * du2) / det;
    const b = ((y1 - y0) * dv2 - (y2 - y0) * dv1) / det;
    const d = ((y2 - y0) * du1 - (y1 - y0) * du2) / det;
    const e = x0 - a * u0 - c * w0;
    const f = y0 - b * u0 - d * w0;
    // 월드 → 출력(L.m)과 합친다
    const uv: Affine = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
    const tris: number[] = [];
    for (let i = 0; i + 3 < v.length; i += 4) {
      const x = v[i]! + im.ox;
      const y = v[i + 1]! + im.oy;
      tris.push(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    }
    out.push({ key: im.key, uv, tris });
  }
  return out;
}

/** 페이지 하나를 SVG로. unit이 px이면 선 굵기를 1로 고정한다 */
export function exportPageSvg(page: Page, unit: 'px' | 'mm' = 'mm'): Blob {
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${page.width.toFixed(2)}${unit}" height="${page.height.toFixed(2)}${unit}" viewBox="0 0 ${page.width.toFixed(3)} ${page.height.toFixed(3)}">`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  let clipId = 0;
  for (const L of page.layers) {
    const styles = L.styles;
    const visible = (s: number) => styles[s * 8 + 5]! > 0;
    if (L.clipPoly && L.clipPoly.length >= 6) {
      const pts = [];
      for (let i = 0; i + 1 < L.clipPoly.length; i += 2) pts.push(`${L.clipPoly[i]!.toFixed(3)},${L.clipPoly[i + 1]!.toFixed(3)}`);
      out.push(`<clipPath id="c${clipId}"><polygon points="${pts.join(' ')}"/></clipPath><g clip-path="url(#c${clipId})">`);
      clipId++;
    } else if (L.clipPx) {
      const [x0, y0, x1, y1] = L.clipPx;
      out.push(`<clipPath id="c${clipId}"><rect x="${x0.toFixed(3)}" y="${y0.toFixed(3)}" width="${(x1 - x0).toFixed(3)}" height="${(y1 - y0).toFixed(3)}"/></clipPath><g clip-path="url(#c${clipId})">`);
      clipId++;
    } else out.push('<g>');
    // 래스터 이미지(벡터보다 먼저)
    for (const im of pageImages(L)) {
      const url = imageDataUrl(im.key);
      if (!url) continue;
      let d = '';
      for (let i = 0; i + 5 < im.tris.length; i += 6) d += `M${im.tris[i]!.toFixed(3)} ${im.tris[i + 1]!.toFixed(3)}L${im.tris[i + 2]!.toFixed(3)} ${im.tris[i + 3]!.toFixed(3)}L${im.tris[i + 4]!.toFixed(3)} ${im.tris[i + 5]!.toFixed(3)}Z`;
      const t = im.uv.map((x) => x.toFixed(6)).join(' ');
      out.push(`<clipPath id="c${clipId}"><path d="${d}"/></clipPath><image clip-path="url(#c${clipId})" href="${url}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${t})"/>`);
      clipId++;
    }
    // 같은 스타일의 선분은 한 경로로 모은다
    let curStyle = -1;
    let path = '';
    let curKind: 'seg' | 'tri' | '' = '';
    const flush = () => {
      if (!path) return;
      const a = page.transparency ? Math.min(1, Math.max(0, styles[curStyle * 8 + 3]!)) : 1;
      const op = a < 0.999 ? ` opacity="${a.toFixed(3)}"` : '';
      if (curKind === 'seg') {
        const w = (styles[curStyle * 8 + 4]! > 0 ? styles[curStyle * 8 + 4]! : THIN_MM) * page.lwScale;
        out.push(`<path d="${path}" fill="none" stroke="${css(styles, curStyle)}" stroke-width="${(unit === 'px' ? 1 : w).toFixed(3)}" stroke-linecap="round"${op}/>`);
      } else out.push(`<path d="${path}" fill="${css(styles, curStyle)}"${op}/>`);
      path = '';
    };
    walk(
      L.scene.source,
      L.m,
      visible,
      {
        seg(x0, y0, x1, y1, s) {
          if (s !== curStyle || curKind !== 'seg') {
            flush();
            curStyle = s;
            curKind = 'seg';
          }
          path += `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}`;
        },
        tri(x0, y0, x1, y1, x2, y2, s) {
          if (s !== curStyle || curKind !== 'tri') {
            flush();
            curStyle = s;
            curKind = 'tri';
          }
          path += `M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
        },
      },
      L.clipWorld,
    );
    flush();
    out.push('</g>');
  }
  out.push('</svg>');
  return new Blob([out.join('\n')], { type: 'image/svg+xml' });
}

export async function exportPdf(app: App): Promise<Blob | null> {
  const st = app.active;
  if (!st) return null;
  if (st.onLayout) await ensureLayoutVariants(app, st, st.displaySpace);
  // 모형: 지금 화면을 A3 가로(420 mm) 폭에 맞춘다
  const page = pageFor(app, PT_PER_MM, !st.onLayout ? 420 * PT_PER_MM : undefined);
  if (!page) return null;
  return pdfDocument([page], st.name);
}

export const PT_PER_MM = 72 / 25.4;

/** PDF 문서 전체가 함께 쓰는 자원: 도면층(선택 내용 그룹), 투명도 그래픽 상태, 검색용 문자 글꼴 */
export class PdfResources {
  /** 도면층 이름 → 번호(/OCn) */
  readonly layers = new Map<string, number>();
  /** 알파(소수 셋째 자리) → 번호(/GSn) */
  readonly alphas = new Map<string, number>();
  /**
   * (문자, 전진 폭) → [글꼴 번호, 글꼴 안 코드(1~255)]. 같은 문자라도 글꼴마다 폭이 달라 폭별로 코드를 둔다
   * — PDF 글꼴의 /Widths가 실제 글자 폭이어야 PDF 보기 프로그램이 낱말을 이어 읽는다(글자 사이에 빈칸이 끼지 않게).
   */
  readonly chars = new Map<string, [number, number]>();
  /** 코드 차례의 (문자, 전진 폭) */
  readonly glyphs: { cp: number; adv?: number }[] = [];

  layer(name: string): number {
    let n = this.layers.get(name);
    if (n === undefined) this.layers.set(name, (n = this.layers.size));
    return n;
  }

  alpha(a: string): number {
    let n = this.alphas.get(a);
    if (n === undefined) this.alphas.set(a, (n = this.alphas.size));
    return n;
  }

  char(cp: number, adv?: number): [number, number] {
    const a = adv !== undefined && Number.isFinite(adv) && adv >= 0 ? Math.round(adv * 1000) / 1000 : undefined;
    const key = `${cp}:${a ?? ''}`;
    let c = this.chars.get(key);
    if (!c) {
      const i = this.chars.size;
      this.chars.set(key, (c = [Math.floor(i / 255), (i % 255) + 1]));
      this.glyphs.push(a !== undefined ? { cp, adv: a } : { cp });
    }
    return c;
  }

  get fontCount(): number {
    return Math.ceil(this.chars.size / 255);
  }
}

/** 선가중치 0·기본값을 출력할 굵기(mm): AutoCAD처럼 가장 가는 선. PDF·SVG·인쇄가 같은 값을 쓴다 */
const THIN_MM = 0.1;

/**
 * PDF 내용 스트림. images에 쓴 이미지 열쇠를 차례로 모은다(/Im0, /Im1 …).
 * res가 있으면 도면층(OCG)·투명도·검색용 숨은 문자를 함께 쓴다(그 자원을 pdfDocument가 문서에 넣는다).
 */
export function pdfContent(page: Page, images: string[] = [], res?: PdfResources): string {
  const ops: string[] = [];
  const H = page.height;
  ops.push('1 1 1 rg', `0 0 ${page.width.toFixed(2)} ${H.toFixed(2)} re f`, '1 J 1 j');
  const chars: { ch: string; m: Affine; d: number; adv?: number }[] = [];
  for (const L of page.layers) {
    const styles = L.styles;
    const visible = (s: number) => styles[s * 8 + 5]! > 0;
    ops.push('q');
    if (L.clipPoly && L.clipPoly.length >= 6) {
      const p = L.clipPoly;
      const path = [`${p[0]!.toFixed(2)} ${(H - p[1]!).toFixed(2)} m`];
      for (let i = 2; i + 1 < p.length; i += 2) path.push(`${p[i]!.toFixed(2)} ${(H - p[i + 1]!).toFixed(2)} l`);
      ops.push(...path, 'h W n');
    } else if (L.clipPx) {
      const [x0, y0, x1, y1] = L.clipPx;
      ops.push(`${x0.toFixed(2)} ${(H - y1).toFixed(2)} ${(x1 - x0).toFixed(2)} ${(y1 - y0).toFixed(2)} re W n`);
    }
    // 래스터 이미지(벡터보다 먼저): 경계 삼각형으로 자르고, 단위 사각형(아래 왼쪽 원점)을 출력 좌표로
    for (const im of pageImages(L)) {
      let n = images.indexOf(im.key);
      if (n < 0) {
        n = images.length;
        images.push(im.key);
      }
      const clip: string[] = [];
      const T = im.tris;
      for (let i = 0; i + 5 < T.length; i += 6) clip.push(`${T[i]!.toFixed(2)} ${(H - T[i + 1]!).toFixed(2)} m ${T[i + 2]!.toFixed(2)} ${(H - T[i + 3]!).toFixed(2)} l ${T[i + 4]!.toFixed(2)} ${(H - T[i + 5]!).toFixed(2)} l h`);
      // PDF 이미지 좌표 (s, t): t = 1 - v
      const [a, b, c, d, e, f] = im.uv;
      const cm = [a, -b, -c, d, c + e, H - (d + f)].map((x) => x.toFixed(6)).join(' ');
      ops.push('q', ...clip, 'W n', `${cm} cm`, `/Im${n} Do`, 'Q');
    }
    let cur = -1;
    let kind = '';
    let buf: string[] = [];
    // 지금 열린 도면층(/OC … BDC)과 투명도
    let openLayer: number | null = null;
    let curAlpha = '1.000';
    const color = (s: number) => `${styles[s * 8]!.toFixed(3)} ${styles[s * 8 + 1]!.toFixed(3)} ${styles[s * 8 + 2]!.toFixed(3)}`;
    const flush = () => {
      if (!buf.length) return;
      if (res) {
        const name = L.layerName?.(cur);
        const want = name ? res.layer(name) : null;
        if (want !== openLayer) {
          if (openLayer !== null) ops.push('EMC');
          if (want !== null) ops.push(`/OC /OC${want} BDC`);
          openLayer = want;
        }
        const a = page.transparency ? Math.min(1, Math.max(0, styles[cur * 8 + 3]!)).toFixed(3) : '1.000';
        if (a !== curAlpha) {
          ops.push(`/GS${res.alpha(a)} gs`);
          curAlpha = a;
        }
      }
      if (kind === 'seg') {
        const w = (styles[cur * 8 + 4]! > 0 ? styles[cur * 8 + 4]! : THIN_MM) * page.lwScale;
        ops.push(`${color(cur)} RG ${w.toFixed(3)} w`, ...buf, 'S');
      } else ops.push(`${color(cur)} rg`, ...buf, 'f');
      buf = [];
    };
    walk(
      L.scene.source,
      L.m,
      visible,
      {
        seg(x0, y0, x1, y1, s) {
          if (s !== cur || kind !== 'seg' || buf.length > 20000) {
            flush();
            cur = s;
            kind = 'seg';
          }
          buf.push(`${x0.toFixed(2)} ${(H - y0).toFixed(2)} m ${x1.toFixed(2)} ${(H - y1).toFixed(2)} l`);
        },
        // 같은 스타일의 이어진 삼각형(해치·채우기·윤곽 글자)은 한 경로로 칠한다 — 나눠 칠하면 이음매에 가는 흰 선이 보인다
        tri(x0, y0, x1, y1, x2, y2, s) {
          if (s !== cur || kind !== 'tri' || buf.length > 400000) {
            flush();
            cur = s;
            kind = 'tri';
          }
          buf.push(`${x0.toFixed(2)} ${(H - y0).toFixed(2)} m ${x1.toFixed(2)} ${(H - y1).toFixed(2)} l ${x2.toFixed(2)} ${(H - y2).toFixed(2)} l h`);
        },
        char: res
          ? (ch, m, _s, d, adv) => {
              void _s;
              chars.push(adv !== undefined ? { ch, m, d, adv } : { ch, m, d });
            }
          : undefined,
      },
      L.clipWorld,
    );
    flush();
    if (openLayer !== null) ops.push('EMC');
    ops.push('Q');
  }
  if (res && chars.length) ops.push(...hiddenText(chars, H, res));
  return ops.join('\n');
}

/**
 * 검색·복사되는 숨은 문자(글자 그리기 방식 3): 글자마다 그 글리프 자리에 둔다.
 * 같은 객체의 글자(같은 깊이)끼리 줄 → 줄 안 차례로 놓아 읽는 순서를 맞춘다
 */
function hiddenText(chars: { ch: string; m: Affine; d: number; adv?: number }[], H: number, res: PdfResources): string[] {
  const items = chars.map((c) => {
    const ux = Math.hypot(c.m[0], c.m[1]) || 1;
    const dx = c.m[0] / ux;
    const dy = c.m[1] / ux;
    // 줄 방향으로의 위치와 줄에 수직인 위치(출력 좌표는 y가 아래로)
    return { ...c, along: c.m[4] * dx + c.m[5] * dy, across: -c.m[4] * dy + c.m[5] * dx, h: Math.hypot(c.m[2], c.m[3]) || 1 };
  });
  items.sort((a, b) => a.d - b.d || (Math.abs(a.across - b.across) > a.h * 0.5 ? a.across - b.across : a.along - b.along));
  const out = ['BT', '3 Tr'];
  let font = -1;
  for (const it of items) {
    const cp = it.ch.codePointAt(0)!;
    const [f, code] = res.char(cp, it.adv);
    if (f !== font) {
      out.push(`/T${f} 1 Tf`);
      font = f;
    }
    const m = it.m;
    out.push(`${m[0].toFixed(4)} ${(-m[1]).toFixed(4)} ${m[2].toFixed(4)} ${(-m[3]).toFixed(4)} ${m[4].toFixed(2)} ${(H - m[5]).toFixed(2)} Tm <${code.toString(16).padStart(2, '0')}> Tj`);
  }
  out.push('ET');
  return out;
}

/** 여러 페이지 PDF */
export async function pdfDocument(pages: Page[], title: string): Promise<Blob> {
  const out: { w: number; h: number; content: Uint8Array; flate: boolean; images: string[] }[] = [];
  const keys: string[] = [];
  const res = new PdfResources();
  for (const p of pages) {
    const used: string[] = [];
    const raw = new TextEncoder().encode(pdfContent(p, used, res));
    const z = await deflate(raw);
    for (const k of used) if (!keys.includes(k)) keys.push(k);
    out.push({ w: p.width, h: p.height, content: z ?? raw, flate: !!z, images: used });
  }
  // 이미지 XObject(RGB, 알파가 있으면 SMask)
  const xobjs: PdfImage[] = [];
  for (const k of keys) {
    const px = imagePixels(k)!;
    const rgb = await deflate(px.rgb);
    const alpha = px.alpha ? await deflate(px.alpha) : null;
    xobjs.push({ key: k, w: px.w, h: px.h, rgb: rgb ?? px.rgb, alpha: px.alpha ? (alpha ?? px.alpha) : null, flate: !!rgb });
  }
  return buildPdf(out, title, xobjs, res);
}

interface PdfImage {
  key: string;
  w: number;
  h: number;
  rgb: Uint8Array;
  alpha: Uint8Array | null;
  flate: boolean;
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** PDF 글자(문자열) — 아스키는 그대로, 아니면 UTF-16BE 16진 */
function pdfText(t: string): string {
  if (/^[\x20-\x7e]*$/.test(t)) return `(${t.replace(/[()\\]/g, (c) => '\\' + c)})`;
  let hex = 'FEFF';
  for (let i = 0; i < t.length; i++) hex += t.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

function buildPdf(pages: { w: number; h: number; content: Uint8Array; flate: boolean; images: string[] }[], title: string, images: PdfImage[] = [], res = new PdfResources()): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const add = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    pos += u.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = pos;
    add(`${n} 0 obj\n`);
    if (typeof body === 'string') add(body);
    else body();
    add('\nendobj\n');
  };
  // 1 카탈로그, 2 페이지 목록, 3 정보, 4부터 페이지·내용 쌍, 그다음 이미지·도면층·그래픽 상태·글꼴
  const n = pages.length;
  const pageObj = (i: number) => 4 + i * 2;
  let next = 4 + n * 2;
  const imgObj = new Map<string, number>();
  for (const im of images) {
    imgObj.set(im.key, next);
    next += im.alpha ? 2 : 1;
  }
  const layerNames = [...res.layers.keys()];
  const ocgObj = layerNames.map(() => next++);
  const alphaList = [...res.alphas.keys()];
  const gsObj = alphaList.map(() => next++);
  // 글꼴마다 글꼴·ToUnicode·빈 글리프 하나
  const fontObj: number[] = [];
  for (let f = 0; f < res.fontCount; f++) {
    fontObj.push(next);
    next += 3;
  }
  const props = layerNames.map((_, i) => `/OC${i} ${ocgObj[i]} 0 R`).join(' ');
  const gstates = alphaList.map((_, i) => `/GS${i} ${gsObj[i]} 0 R`).join(' ');
  const fonts = fontObj.map((o, i) => `/T${i} ${o} 0 R`).join(' ');
  add('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n');
  const ocProps = layerNames.length ? ` /OCProperties << /OCGs [${ocgObj.map((o) => `${o} 0 R`).join(' ')}] /D << /Order [${ocgObj.map((o) => `${o} 0 R`).join(' ')}] /ON [${ocgObj.map((o) => `${o} 0 R`).join(' ')}] >> >>` : '';
  obj(1, `<< /Type /Catalog /Pages 2 0 R${ocProps} >>`);
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(3, `<< /Producer (OpenCAD DWG DXF) /Title ${pdfText(title || 'drawing')} >>`);
  pages.forEach((p, i) => {
    const xo = p.images.map((k, j) => `/Im${j} ${imgObj.get(k)} 0 R`).join(' ');
    const resources = [xo ? `/XObject << ${xo} >>` : '', props ? `/Properties << ${props} >>` : '', gstates ? `/ExtGState << ${gstates} >>` : '', fonts ? `/Font << ${fonts} >>` : ''].filter(Boolean).join(' ');
    obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}] /Contents ${pageObj(i) + 1} 0 R /Resources << ${resources} >> >>`);
    obj(pageObj(i) + 1, () => {
      add(`<< /Length ${p.content.length}${p.flate ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
      add(p.content);
      add('\nendstream');
    });
  });
  for (const im of images) {
    const no = imgObj.get(im.key)!;
    const filt = im.flate ? ' /Filter /FlateDecode' : '';
    obj(no, () => {
      add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8${filt}${im.alpha ? ` /SMask ${no + 1} 0 R` : ''} /Length ${im.rgb.length} >>\nstream\n`);
      add(im.rgb);
      add('\nendstream');
    });
    if (im.alpha)
      obj(no + 1, () => {
        add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8${filt} /Length ${im.alpha!.length} >>\nstream\n`);
        add(im.alpha!);
        add('\nendstream');
      });
  }
  layerNames.forEach((name, i) => obj(ocgObj[i]!, `<< /Type /OCG /Name ${pdfText(name)} >>`));
  alphaList.forEach((a, i) => obj(gsObj[i]!, `<< /Type /ExtGState /ca ${a} /CA ${a} >>`));
  // 검색용 글꼴(Type3, 빈 글리프 — 문자 그리기 방식 3이라 보이지 않는다). 글꼴마다 255자.
  // 코드 → (문자, 전진 폭)은 들어온 차례로 글꼴마다 255개씩. /Widths는 글리프의 실제 전진 폭(문자 높이 단위 — Tm이 글리프 축이라 그대로)
  const byFont: { cp: number; adv?: number }[][] = [];
  res.glyphs.forEach((g, i) => ((byFont[Math.floor(i / 255)] ??= [])[(i % 255) + 1] = g));
  fontObj.forEach((o, f) => {
    const codes = byFont[f] ?? [];
    const last = codes.length - 1;
    const names = [];
    for (let c = 1; c <= last; c++) names.push(`/g${c}`);
    const widths = [];
    for (let c = 1; c <= last; c++) {
      const g = codes[c];
      widths.push(g?.adv !== undefined ? +g.adv.toFixed(3) : g && g.cp >= 0x1100 ? 1 : 0.6);
    }
    obj(o, `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1 1] /FontMatrix [1 0 0 1 0 0] /CharProcs << ${names.map((g) => `${g} ${o + 2} 0 R`).join(' ')} >> /Encoding << /Type /Encoding /Differences [1 ${names.join(' ')}] >> /FirstChar 1 /LastChar ${last} /Widths [${widths.join(' ')}] /ToUnicode ${o + 1} 0 R /Resources << >> >>`);
    const map: string[] = [];
    for (let c = 1; c <= last; c++) {
      const cp = codes[c]?.cp;
      if (cp === undefined) continue;
      let u = '';
      for (const unit of String.fromCodePoint(cp)) for (let k = 0; k < unit.length; k++) u += unit.charCodeAt(k).toString(16).padStart(4, '0');
      map.push(`<${c.toString(16).padStart(2, '0')}> <${u}>`);
    }
    const cmap = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap', '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def', '/CMapName /OpenCAD-UCS def', '/CMapType 2 def', '1 begincodespacerange', '<01> <FF>', 'endcodespacerange'];
    for (let i = 0; i < map.length; i += 100) {
      const chunk = map.slice(i, i + 100);
      cmap.push(`${chunk.length} beginbfchar`, ...chunk, 'endbfchar');
    }
    cmap.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
    const cm = enc.encode(cmap.join('\n'));
    obj(o + 1, () => {
      add(`<< /Length ${cm.length} >>\nstream\n`);
      add(cm);
      add('\nendstream');
    });
    const glyph = enc.encode('0 0 d0');
    obj(o + 2, () => {
      add(`<< /Length ${glyph.length} >>\nstream\n`);
      add(glyph);
      add('\nendstream');
    });
  });
  const total = next;
  const xref = pos;
  add(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export async function exportPng(app: App, scale = 2): Promise<Blob | null> {
  void scale;
  return exportRaster(app, 'png');
}

/** 24비트 BMP(아래에서 위로, 줄마다 4바이트 맞춤) */
export function encodeBmp(w: number, h: number, rgba: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
  const row = (w * 3 + 3) & ~3;
  const size = 54 + row * h;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, row * h, true);
  // 72 dpi
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    let o = 54 + y * row;
    for (let x = 0; x < w; x++) {
      const i = src + x * 4;
      out[o++] = rgba[i + 2]!;
      out[o++] = rgba[i + 1]!;
      out[o++] = rgba[i]!;
    }
  }
  return out;
}

/** 지금 화면을 장치 픽셀 그대로 다시 그려 이미지로(오버레이 제외) */
export async function exportRaster(app: App, kind: 'png' | 'jpg' | 'bmp'): Promise<Blob | null> {
  const v = app.view;
  if (!app.active) return null;
  v.renderGL();
  if (kind === 'png') return new Promise((resolve) => v.glCanvas.toBlob((b) => resolve(b), 'image/png'));
  // JPEG·BMP는 알파가 없으므로 화면 배경 위에 옮겨 그린다
  const c = document.createElement('canvas');
  c.width = v.glCanvas.width;
  c.height = v.glCanvas.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = getComputedStyle(v.glCanvas).backgroundColor || '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(v.glCanvas, 0, 0);
  if (kind === 'jpg') return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  const data = g.getImageData(0, 0, c.width, c.height).data;
  return new Blob([encodeBmp(c.width, c.height, data)], { type: 'image/bmp' });
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  const format = name.split('.').pop()?.toLowerCase();
  if (format && ['png', 'jpg', 'bmp', 'pdf', 'svg', 'dxf', 'dwg'].includes(format)) trackExport(format as ExportFormat);
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function baseName(name: string): string {
  return name.replace(/\.(dxf|dwg)$/i, '');
}
