/**
 * 객체 고르기: 범위 격자 색인 + 객체 형상과의 거리.
 * 형상은 메인 스레드에서 객체 하나씩 다시 만들어(장면 빌더) 캐시한다.
 */
import type { CadDocument, Entity } from '../core/model';
import { SceneBuilder } from '../render/build';
import type { DisplayList, EntityBox } from '../render/displaylist';
import { BoxList, GLYPH_STRIDE, SEG_STRIDE, TRI_STRIDE } from '../render/displaylist';
import type { TextEngine } from '../text/layout';
import type { OverlayGeom, Pt } from './view';
import { fenceHits, polygonHits } from '../edit/geom/selpoly';

export function expandDisplayList(dl: DisplayList): OverlayGeom {
  const segs: number[] = [];
  const tris: number[] = [];
  for (const c of dl.chunks) {
    for (const [buf, n] of [
      [c.segs, c.segCount],
      [c.tsegs, c.tsegCount],
    ] as const) {
      const f = new Float32Array(buf);
      for (let i = 0; i < n; i++) {
        const o = i * SEG_STRIDE;
        segs.push(f[o]! + c.ox, f[o + 1]! + c.oy, f[o + 2]! + c.ox, f[o + 3]! + c.oy);
      }
    }
    for (const [buf, n] of [
      [c.tris, c.triCount],
      [c.ttris, c.ttriCount],
    ] as const) {
      const f = new Float32Array(buf);
      for (let i = 0; i < n * 3; i++) {
        const o = i * TRI_STRIDE;
        tris.push(f[o]! + c.ox, f[o + 1]! + c.oy);
      }
    }
  }
  const gs = dl.glyphs;
  const inst = new Float32Array(gs.instances);
  for (const r of gs.runs) {
    const g = gs.glyphs[r.glyph]!;
    for (let k = r.start; k < r.start + r.count; k++) {
      const o = k * GLYPH_STRIDE;
      const a = inst[o]!;
      const b = inst[o + 1]!;
      const c = inst[o + 2]!;
      const d = inst[o + 3]!;
      const e = inst[o + 4]! + inst[o + 5]!;
      const f = inst[o + 6]! + inst[o + 7]!;
      if (g.kind === 0) {
        const v = gs.fillVerts;
        for (let i = g.first; i < g.first + g.count; i++) {
          const x = v[i * 2]!;
          const y = v[i * 2 + 1]!;
          tris.push(a * x + c * y + e, b * x + d * y + f);
        }
      } else {
        const v = gs.strokeSegs;
        for (let i = g.first; i < g.first + g.count; i++) {
          const x0 = v[i * 4]!;
          const y0 = v[i * 4 + 1]!;
          const x1 = v[i * 4 + 2]!;
          const y1 = v[i * 4 + 3]!;
          segs.push(a * x0 + c * y0 + e, b * x0 + d * y0 + f, a * x1 + c * y1 + e, b * x1 + d * y1 + f);
        }
      }
    }
  }
  return { segs, tris };
}

/** 범위 상자 안을 눌러도 고르는 문자 종류 */
const TEXT_PICK_BY_BOX = new Set(['TEXT', 'MTEXT', 'ATTDEF']);

function distSeg(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

function inTri(px: number, py: number, t: number[], i: number): boolean {
  const ax = t[i]!;
  const ay = t[i + 1]!;
  const bx = t[i + 2]!;
  const by = t[i + 3]!;
  const cx = t[i + 4]!;
  const cy = t[i + 5]!;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** 점들의 범위 상자 [minX, minY, maxX, maxY] */
function ptsBox(pts: readonly Pt[]): [number, number, number, number] {
  const r: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (p.x < r[0]) r[0] = p.x;
    if (p.y < r[1]) r[1] = p.y;
    if (p.x > r[2]) r[2] = p.x;
    if (p.y > r[3]) r[3] = p.y;
  }
  return r;
}

function segRect(x0: number, y0: number, x1: number, y1: number, r: [number, number, number, number]): boolean {
  // 리앙-바스키 자르기
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, x0 - r[0]) && clip(dx, r[2] - x0) && clip(-dy, y0 - r[1]) && clip(dy, r[3] - y0);
}

export class Picker {
  /** 장면의 객체 상자(묶은 형식 — 범위는 형식 배열로 보고, 걸린 상자만 객체로 꺼낸다). 상자 번호가 곧 그리기 순서다 */
  readonly boxes: BoxList;
  /** 편집으로 지우거나 바뀐 기존 객체(고르지 않는다) */
  readonly exclude = new Set<string>();
  /** 편집으로 새로 생기거나 바뀐 객체의 범위 */
  extra: EntityBox[] = [];
  private cell = 1;
  /** 범위 격자: 칸 (gx0 + cx, gy0 + cy)의 번호 k = cy·gw + cx, 그 칸의 상자 번호는 items[start[k] .. start[k + 1]) */
  private gx0 = 0;
  private gy0 = 0;
  private gw = 0;
  private gh = 0;
  private start = new Int32Array(1);
  private items = new Int32Array(0);
  /** 칸을 아주 많이 차지하는 큰 상자와 범위가 수가 아닌 상자 */
  private big = new Int32Array(0);
  private readonly cache = new Map<string, OverlayGeom>();
  private builder: SceneBuilder;

  constructor(
    private readonly doc: CadDocument,
    boxes: BoxList | readonly EntityBox[],
    text: TextEngine,
    space: string,
  ) {
    this.builder = new SceneBuilder(doc, { text });
    this.builder.prepare(space);
    this.boxes = boxes instanceof BoxList ? boxes : BoxList.from(boxes);
    this.buildGrid();
  }

  private buildGrid(): void {
    const n = this.boxes.length;
    const bb = this.boxes.bounds;
    const finite = (i: number) => Number.isFinite(bb[i * 4]! + bb[i * 4 + 1]! + bb[i * 4 + 2]! + bb[i * 4 + 3]!);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (!finite(i)) continue;
      const o = i * 4;
      if (bb[o]! < minX) minX = bb[o]!;
      if (bb[o + 1]! < minY) minY = bb[o + 1]!;
      if (bb[o + 2]! > maxX) maxX = bb[o + 2]!;
      if (bb[o + 3]! > maxY) maxY = bb[o + 3]!;
    }
    const span = Math.max(maxX - minX, maxY - minY, 1e-9);
    const cell = (this.cell = Number.isFinite(span) ? span / Math.max(8, Math.min(256, Math.sqrt(n) * 2)) : 1);
    if (Number.isFinite(minX)) {
      this.gx0 = Math.floor(minX / cell);
      this.gy0 = Math.floor(minY / cell);
      this.gw = Math.floor(maxX / cell) - this.gx0 + 1;
      this.gh = Math.floor(maxY / cell) - this.gy0 + 1;
    }
    const { gx0, gy0, gw, gh } = this;
    // 상자가 덮는 칸 범위. 아주 큰 객체와 범위가 수가 아닌 객체는 따로(big)
    const span4 = (i: number): [number, number, number, number] | null => {
      if (!finite(i)) return null;
      const o = i * 4;
      const x0 = Math.max(0, Math.floor(bb[o]! / cell) - gx0);
      const x1 = Math.min(gw - 1, Math.floor(bb[o + 2]! / cell) - gx0);
      const y0 = Math.max(0, Math.floor(bb[o + 1]! / cell) - gy0);
      const y1 = Math.min(gh - 1, Math.floor(bb[o + 3]! / cell) - gy0);
      return (x1 - x0 + 1) * (y1 - y0 + 1) > 4096 ? null : [x0, x1, y0, y1];
    };
    const start = new Int32Array(gw * gh + 1);
    let nbig = 0;
    for (let i = 0; i < n; i++) {
      const s = span4(i);
      if (!s) {
        nbig++;
        continue;
      }
      for (let y = s[2]; y <= s[3]; y++) for (let x = s[0]; x <= s[1]; x++) start[y * gw + x + 1]!++;
    }
    for (let k = 0; k < gw * gh; k++) start[k + 1]! += start[k]!;
    const items = new Int32Array(start[gw * gh]!);
    const fill = start.slice(0, gw * gh);
    const big = new Int32Array(nbig);
    nbig = 0;
    for (let i = 0; i < n; i++) {
      const s = span4(i);
      if (!s) {
        big[nbig++] = i;
        continue;
      }
      for (let y = s[2]; y <= s[3]; y++) for (let x = s[0]; x <= s[1]; x++) items[fill[y * gw + x]!++] = i;
    }
    this.start = start;
    this.items = items;
    this.big = big;
  }

  /** 상자 i가 점 (x, y)에서 tol 안인지 */
  private near(i: number, x: number, y: number, tol: number): boolean {
    const bb = this.boxes.bounds;
    const o = i * 4;
    return bb[o]! - tol <= x && bb[o + 2]! + tol >= x && bb[o + 1]! - tol <= y && bb[o + 3]! + tol >= y;
  }

  /** 상자 i가 사각형과 겹치는지 */
  private overlaps(i: number, r: readonly [number, number, number, number]): boolean {
    const bb = this.boxes.bounds;
    const o = i * 4;
    return !(bb[o + 2]! < r[0] || bb[o]! > r[2] || bb[o + 3]! < r[1] || bb[o + 1]! > r[3]);
  }

  /** 점 근처(tol 안)의 후보와 그리기 순서(편집으로 생긴 객체는 맨 위) */
  private hits(x: number, y: number, tol: number): { b: EntityBox; ord: number }[] {
    const out: { b: EntityBox; ord: number }[] = [];
    for (const i of this.baseCandidates(x, y, tol)) {
      if (!this.exclude.has(this.boxes.handle(i))) out.push({ b: this.boxes.at(i), ord: i });
    }
    for (const b of this.extra) if (b.minX - tol <= x && b.maxX + tol >= x && b.minY - tol <= y && b.maxY + tol >= y) out.push({ b, ord: Number.MAX_SAFE_INTEGER });
    return out;
  }

  /** 점 근처(tol 안)의 후보 */
  candidates(x: number, y: number, tol: number): EntityBox[] {
    return this.hits(x, y, tol).map((h) => h.b);
  }

  /** 사각형과 겹치는 고를 수 있는 상자(편집으로 생긴 객체 포함) */
  private inRect(r: readonly [number, number, number, number]): EntityBox[] {
    const out: EntityBox[] = [];
    for (let i = 0; i < this.boxes.length; i++) {
      if (this.overlaps(i, r) && !this.exclude.has(this.boxes.handle(i))) out.push(this.boxes.at(i));
    }
    for (const b of this.extra) if (!(b.maxX < r[0] || b.minX > r[2] || b.maxY < r[1] || b.minY > r[3])) out.push(b);
    return out;
  }

  /** 편집 결과 반영: 바뀐 핸들의 형상 캐시를 지운다 */
  invalidate(handles: Iterable<string>): void {
    for (const h of handles) this.cache.delete(h);
  }

  /** 점 근처 상자 번호(찾은 차례, 겹치지 않게) */
  private baseCandidates(x: number, y: number, tol: number): number[] {
    const out = new Set<number>();
    const x0 = Math.floor((x - tol) / this.cell);
    const x1 = Math.floor((x + tol) / this.cell);
    const y0 = Math.floor((y - tol) / this.cell);
    const y1 = Math.floor((y + tol) / this.cell);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) {
      for (let i = 0; i < this.boxes.length; i++) if (this.near(i, x, y, tol)) out.add(i);
    } else {
      const { gx0, gy0, gw, gh, start, items } = this;
      for (let gx = Math.max(x0, gx0); gx <= Math.min(x1, gx0 + gw - 1); gx++)
        for (let gy = Math.max(y0, gy0); gy <= Math.min(y1, gy0 + gh - 1); gy++) {
          const k = (gy - gy0) * gw + (gx - gx0);
          for (let j = start[k]!; j < start[k + 1]!; j++) {
            const i = items[j]!;
            if (this.near(i, x, y, tol)) out.add(i);
          }
        }
      for (const i of this.big) if (this.near(i, x, y, tol)) out.add(i);
    }
    return [...out];
  }

  geometry(handle: string): OverlayGeom {
    let g = this.cache.get(handle);
    if (!g) {
      const e = this.doc.entityIndex.get(handle);
      g = e ? expandDisplayList(this.builder.buildEntities([e])) : { segs: [], tris: [] };
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(handle, g);
    }
    return g;
  }

  /** 문서에 아직 없는 객체(미리보기)의 형상 */
  geometryOf(list: Entity[]): OverlayGeom {
    try {
      return expandDisplayList(this.builder.buildEntities(list));
    } catch {
      return { segs: [], tris: [] };
    }
  }

  /** 범위 상자가 사각형과 겹치는 객체(자르기·연장 경계 후보) */
  overlapping(r: [number, number, number, number]): string[] {
    return this.inRect(r).map((b) => b.handle);
  }

  distance(handle: string, x: number, y: number): number {
    // 문자는 글자 획 사이·윤곽 글꼴 조각을 받기 전에도 고를 수 있게 범위 상자 안이면 거리 0(AutoCAD처럼 글자 상자를 누르면 잡힌다)
    if (TEXT_PICK_BY_BOX.has(this.doc.entityIndex.get(handle)?.type ?? '')) {
      const b = this.box(handle);
      if (b && x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return 0;
    }
    const g = this.geometry(handle);
    let best = Infinity;
    const s = g.segs;
    for (let i = 0; i + 3 < s.length; i += 4) {
      const d = distSeg(x, y, s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!);
      if (d < best) best = d;
    }
    const t = g.tris ?? [];
    for (let i = 0; i + 5 < t.length; i += 6) if (inTri(x, y, t, i)) return 0;
    return best;
  }

  /** 가장 가까운 객체 */
  pick(x: number, y: number, tol: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    let bestOrder = -1;
    for (const { b, ord } of this.hits(x, y, tol)) {
      const d = this.distance(b.handle, x, y);
      if (d > tol) continue;
      if (d < bestD - tol * 0.05 || (Math.abs(d - bestD) <= tol * 0.05 && ord > bestOrder)) {
        best = b.handle;
        bestD = d;
        bestOrder = ord;
      }
    }
    return best;
  }

  /** 허용 거리 안의 객체 모두(앞에 그린 것·가까운 것 먼저) — 선택 순환용 */
  pickAll(x: number, y: number, tol: number): string[] {
    const hits: { h: string; d: number; ord: number }[] = [];
    const seen = new Set<string>();
    for (const { b, ord } of this.hits(x, y, tol)) {
      if (seen.has(b.handle)) continue;
      const d = this.distance(b.handle, x, y);
      if (d > tol) continue;
      seen.add(b.handle);
      hits.push({ h: b.handle, d, ord });
    }
    hits.sort((a, b) => (Math.abs(a.d - b.d) > tol * 0.05 ? a.d - b.d : b.ord - a.ord));
    return hits.map((x) => x.h);
  }

  /** 창 선택(window = 완전히 안, 아니면 걸침) */
  select(r: [number, number, number, number], crossing: boolean): string[] {
    const out: string[] = [];
    for (const b of this.inRect(r)) {
      const inside = b.minX >= r[0] && b.maxX <= r[2] && b.minY >= r[1] && b.maxY <= r[3];
      if (inside) {
        out.push(b.handle);
        continue;
      }
      if (!crossing) continue;
      const g = this.geometry(b.handle);
      let hit = false;
      const s = g.segs;
      for (let i = 0; i + 3 < s.length && !hit; i += 4) hit = segRect(s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!, r);
      const t = g.tris ?? [];
      for (let i = 0; i + 5 < t.length && !hit; i += 6) {
        for (let k = 0; k < 3 && !hit; k++) {
          const j = i + k * 2;
          const n = i + ((k + 1) % 3) * 2;
          hit = segRect(t[j]!, t[j + 1]!, t[n]!, t[n + 1]!, r);
        }
        if (!hit) hit = inTri(r[0], r[1], t, i);
      }
      if (hit) out.push(b.handle);
    }
    return out;
  }

  /** 다각형 선택(crossing이면 걸침 폴리곤 CP, 아니면 윈도우 폴리곤 WP). 다각형은 저절로 닫는다 */
  selectPolygon(poly: Pt[], crossing: boolean): string[] {
    // 다각형 안이거나 다각형과 만나는 상자는 다각형의 범위 상자와 겹친다
    return polygonHits(this.inRect(ptsBox(poly)), (h) => this.geometry(h), poly, crossing);
  }

  /** 울타리 선택(F): 꺾은선과 만나는 객체 */
  selectFence(pts: Pt[]): string[] {
    return fenceHits(this.inRect(ptsBox(pts)), (h) => this.geometry(h), pts);
  }

  entity(handle: string): Entity | undefined {
    return this.doc.entityIndex.get(handle);
  }

  box(handle: string): EntityBox | undefined {
    const x = this.extra.find((b) => b.handle === handle);
    if (x) return x;
    if (this.exclude.has(handle)) return undefined;
    const i = this.boxes.indexOf(handle);
    return i < 0 ? undefined : this.boxes.at(i);
  }

  /** 점 근처 선분들(스냅 교차점·근처점용). owners를 주면 선분마다 그 객체의 핸들을 같은 차례로 담는다(스냅 점의 Z) */
  segmentsNear(x: number, y: number, tol: number, limit = 4000, owners?: string[]): number[] {
    const out: number[] = [];
    for (const b of this.candidates(x, y, tol)) {
      const s = this.geometry(b.handle).segs;
      for (let i = 0; i + 3 < s.length; i += 4) {
        if (distSeg(x, y, s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!) <= tol) {
          out.push(s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!);
          owners?.push(b.handle);
        }
        if (out.length > limit * 4) return out;
      }
    }
    return out;
  }

  /** 선택한 객체의 그립 위치 */
  static pointNear(a: Pt, b: Pt, tol: number): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
  }
}
