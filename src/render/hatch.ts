/**
 * 해치: 경계 고리 만들기, 채우기 삼각분할, 무늬 선 자르기.
 * 좌표는 해치 OCS(2D)다. 호출한 쪽이 월드로 옮긴다.
 */
import earcut from 'earcut';
import { pushAll } from '../core/arrays';
import { LINETYPE_ELEMENTS } from '../core/limits';
import type { HatchEntity, HatchPath, HatchPatternLine } from '../core/model';
import { type FitWork, arcPoints, bulgeFlatPoints, ccwSweep, ellipsePoints, interpolateFitPoints, nurbsPoints } from '../geom/curves';
import { type DashWork, dashInterval } from './linetype';
import { hatchEdges } from '../core/hatchedges';

/** 경로 하나 → 닫힌 고리 [x, y, …]. fit이 있으면 맞춤점 보간의 일을 더한다 */
export function pathLoop(p: HatchPath, tol: number, fit?: FitWork): number[] {
  if (p.polyline) return bulgeFlatPoints(p.polyline.verts, true, tol);
  const out: number[] = [];
  const push = (x: number, y: number) => {
    const n = out.length;
    if (n >= 2 && Math.abs(out[n - 2]! - x) < 1e-12 && Math.abs(out[n - 1]! - y) < 1e-12) return;
    out.push(x, y);
  };
  for (const e of hatchEdges(p)) {
    switch (e.type) {
      case 'line':
        push(e.start.x, e.start.y);
        push(e.end.x, e.end.y);
        break;
      case 'arc': {
        const sweep = ccwSweep(e.startAngle, e.endAngle);
        const pts = arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, sweep, tol);
        if (!e.ccw) reversePairs(pts);
        for (let i = 0; i < pts.length; i += 2) push(pts[i]!, pts[i + 1]!);
        break;
      }
      case 'ellipse': {
        // 해치 타원 경계의 각도는 기하 각도 → 매개변수로
        const toParam = (a: number) => Math.atan2(Math.sin(a) / (e.ratio || 1), Math.cos(a));
        const p0 = toParam(e.startAngle);
        let p1 = toParam(e.endAngle);
        const full = Math.abs(ccwSweep(e.startAngle, e.endAngle) - Math.PI * 2) < 1e-9;
        if (full) p1 = p0 + Math.PI * 2;
        const pts = ellipsePoints(e.center.x, e.center.y, e.majorAxis.x, e.majorAxis.y, e.ratio, p0, p1, tol);
        if (!e.ccw) reversePairs(pts);
        for (let i = 0; i < pts.length; i += 2) push(pts[i]!, pts[i + 1]!);
        break;
      }
      case 'spline': {
        let ctrl = e.controlPoints.map((q) => ({ x: q.x, y: q.y, z: 0 }));
        let knots = e.knots;
        let degree = e.degree;
        if (ctrl.length < 2 && e.fitPoints && e.fitPoints.length >= 2) {
          const s = interpolateFitPoints(
            e.fitPoints.map((q) => ({ x: q.x, y: q.y, z: 0 })),
            e.startTangent ? { x: e.startTangent.x, y: e.startTangent.y, z: 0 } : undefined,
            e.endTangent ? { x: e.endTangent.x, y: e.endTangent.y, z: 0 } : undefined,
            fit,
          );
          ctrl = s.ctrl;
          knots = s.knots;
          degree = s.degree;
        }
        const pts = nurbsPoints(degree, knots, ctrl, e.rational ? e.weights : undefined, tol);
        for (let i = 0; i < pts.length; i += 3) push(pts[i]!, pts[i + 1]!);
        break;
      }
    }
  }
  // 닫힘점 제거
  const n = out.length;
  if (n >= 4 && Math.abs(out[0]! - out[n - 2]!) < 1e-9 && Math.abs(out[1]! - out[n - 1]!) < 1e-9) out.length = n - 2;
  return out;
}

function reversePairs(a: number[]): void {
  for (let i = 0, j = a.length - 2; i < j; i += 2, j -= 2) {
    const x = a[i]!;
    const y = a[i + 1]!;
    a[i] = a[j]!;
    a[i + 1] = a[j + 1]!;
    a[j] = x;
    a[j + 1] = y;
  }
}

function pointInRing(x: number, y: number, c: readonly number[]): boolean {
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

/** 해치 스타일에 따라 쓸 고리를 고른다(2 = 가장 바깥만). */
export function hatchLoops(h: HatchEntity, tol: number, fit?: FitWork): number[][] {
  let loops = h.paths.map((p) => ({ p, ring: pathLoop(p, tol, fit) })).filter((l) => l.ring.length >= 6);
  if (h.hatchStyle === 2) {
    const outer = loops.filter((l) => l.p.flags & 1 || l.p.flags & 16);
    if (outer.length) loops = outer;
  }
  return loops.map((l) => l.ring);
}

/**
 * 고리 포함 관계와 삼각분할에 든 일: 견준 고리 상자 수 + 포함 판정에서 본 변 수 + earcut(정점 수 + 구멍 수의 제곱).
 * limit을 넘으면 limited를 세우고 빈 삼각형을 돌려준다(부른 쪽이 경계만 그린다)
 */
export interface LoopWork {
  n: number;
  limit?: number;
  limited?: boolean;
}

/** 고리가 이만큼 이하면 격자 없이 모든 고리를 판정한다(해치 대부분은 고리가 몇 개뿐이다) */
const INDEX_MIN_LOOPS = 16;
/** 정점이 이보다 많은 고리는 여러 번 물을 때 변을 가로 띠로 나눠 둔다 */
const SLAB_MIN_VERTS = 64;
/** 격자 칸을 이보다 많이 덮는 고리(바깥 경계 등)는 칸마다 넣지 않고 늘 본다 */
const WIDE_CELLS = 64;
/** 바깥 고리 하나의 구멍이 이보다 많으면 칸으로 잘라 삼각분할한다: earcut은 구멍을 하나 이을 때마다 이어 둔 구멍을 모두 훑는다(구멍 1만 개 3.4초) */
export const STRIP_HOLES = 512;
/** 칸 하나에 넣는 구멍 수(이만큼 모인 뒤 처음 나는 틈에서 자른다) */
const STRIP_SIZE = 64;

/** 고리 안 변을 가로 띠로 나눈 색인: 점의 y가 든 띠의 변만 본다 */
interface RingSlabs {
  y0: number;
  s: number;
  count: number;
  start: Int32Array;
  edges: Int32Array;
}

/** 변을 가로 띠에 넣는다. 긴 변이 많아 넣는 수가 정점의 8배를 넘으면 만들지 않는다(null) */
function ringSlabs(c: readonly number[]): RingSlabs | null {
  const len = c.length;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 1; i < len; i += 2) {
    if (c[i]! < y0) y0 = c[i]!;
    if (c[i]! > y1) y1 = c[i]!;
  }
  const count = Math.max(1, len >> 3);
  let s = y1 > y0 ? count / (y1 - y0) : 0;
  if (!Number.isFinite(s)) s = 0;
  const slab = (y: number) => Math.min(count - 1, Math.max(0, Math.floor((y - y0) * s)));
  const start = new Int32Array(count + 1);
  let total = 0;
  for (let i = 0, j = len - 2; i < len; j = i, i += 2) {
    const a = slab(Math.min(c[i + 1]!, c[j + 1]!));
    const b = slab(Math.max(c[i + 1]!, c[j + 1]!));
    total += b - a + 1;
    if (total > len * 4) return null;
    for (let q = a; q <= b; q++) start[q + 1]!++;
  }
  for (let q = 0; q < count; q++) start[q + 1]! += start[q]!;
  const fill = start.slice(0, count);
  const edges = new Int32Array(total);
  for (let i = 0, j = len - 2; i < len; j = i, i += 2) {
    const a = slab(Math.min(c[i + 1]!, c[j + 1]!));
    const b = slab(Math.max(c[i + 1]!, c[j + 1]!));
    for (let q = a; q <= b; q++) edges[fill[q]!++] = i;
  }
  return { y0, s, count, start, edges };
}

/**
 * 고리 상자 격자: 점을 품을 수 있는 고리만 골라 포함을 판정한다.
 * 판정은 pointInRing의 식 그대로이고 상자로는 그 식이 거짓일 수밖에 없는 고리만 거르므로 결과가 같다.
 * (y가 상자 밖이면 지나는 변이 없고, x가 상자 왼쪽이면 지나는 변을 모두 세어 짝수다. x는 교점 계산의 반올림만큼 넉넉히 둔다.)
 * 교점 식의 곱이 넘치거나(좌표 1e299면 무한대) 아주 작아 정밀도를 잃으면 이 논리가 깨지므로, 좌표와 점이 모두 safe일 때만 거른다
 */
class LoopIndex {
  private readonly box: Float64Array;
  /** 좌표가 safe가 아닌 고리: 상자로 거르지 않는다 */
  private readonly bad: Uint8Array;
  private readonly wide: number[] = [];
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly g: number;
  private readonly gx0: number;
  private readonly gy0: number;
  private readonly sx: number;
  private readonly sy: number;
  private readonly asked: Int32Array;
  private readonly slabs: (RingSlabs | null | undefined)[];
  /** 고리가 적어 모두 판정한다 */
  private readonly linear: boolean;
  work = 0;

  constructor(private readonly loops: readonly number[][]) {
    const n = loops.length;
    this.linear = n <= INDEX_MIN_LOOPS;
    if (this.linear) {
      this.box = new Float64Array(0);
      this.bad = new Uint8Array(0);
      this.asked = new Int32Array(0);
      this.slabs = [];
      this.start = new Int32Array(1);
      this.items = new Int32Array(0);
      this.g = 1;
      this.gx0 = this.gy0 = this.sx = this.sy = 0;
      return;
    }
    const box = (this.box = new Float64Array(n * 4));
    this.bad = new Uint8Array(n);
    this.asked = new Int32Array(n);
    this.slabs = new Array(n);
    let gx0 = Infinity;
    let gy0 = Infinity;
    let gx1 = -Infinity;
    let gy1 = -Infinity;
    let good = 0;
    for (let k = 0; k < n; k++) {
      const c = loops[k]!;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let ok = true;
      for (let i = 0; i < c.length; i += 2) {
        const x = c[i]!;
        const y = c[i + 1]!;
        if (!safe(x) || !safe(y)) ok = false;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (!ok) {
        this.bad[k] = 1;
        this.wide.push(k);
        continue;
      }
      const m = (Math.abs(minX) + Math.abs(maxX)) * 1e-9;
      minX -= m;
      maxX += m;
      const b = k * 4;
      box[b] = minX;
      box[b + 1] = minY;
      box[b + 2] = maxX;
      box[b + 3] = maxY;
      good++;
      if (minX < gx0) gx0 = minX;
      if (minY < gy0) gy0 = minY;
      if (maxX > gx1) gx1 = maxX;
      if (maxY > gy1) gy1 = maxY;
    }
    const g = (this.g = Math.min(512, Math.max(1, Math.ceil(Math.sqrt(good)))));
    const sx = gx1 > gx0 ? g / (gx1 - gx0) : 0;
    const sy = gy1 > gy0 ? g / (gy1 - gy0) : 0;
    this.gx0 = gx0;
    this.gy0 = gy0;
    this.sx = Number.isFinite(sx) ? sx : 0;
    this.sy = Number.isFinite(sy) ? sy : 0;
    // 칸마다 고리 번호(CSR)
    const start = (this.start = new Int32Array(g * g + 1));
    const span = new Int32Array(n * 4);
    for (let k = 0; k < n; k++) {
      if (this.bad[k]) continue;
      const b = k * 4;
      const cx0 = this.cell(box[b]!, this.gx0, this.sx);
      const cy0 = this.cell(box[b + 1]!, this.gy0, this.sy);
      const cx1 = this.cell(box[b + 2]!, this.gx0, this.sx);
      const cy1 = this.cell(box[b + 3]!, this.gy0, this.sy);
      if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > WIDE_CELLS) {
        this.wide.push(k);
        span[b] = -1;
        continue;
      }
      span[b] = cx0;
      span[b + 1] = cy0;
      span[b + 2] = cx1;
      span[b + 3] = cy1;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) start[cy * g + cx + 1]!++;
    }
    for (let q = 0; q < g * g; q++) start[q + 1]! += start[q]!;
    const fill = start.slice(0, g * g);
    const items = (this.items = new Int32Array(start[g * g]!));
    for (let k = 0; k < n; k++) {
      const b = k * 4;
      if (this.bad[k] || span[b]! < 0) continue;
      for (let cy = span[b + 1]!; cy <= span[b + 3]!; cy++) for (let cx = span[b]!; cx <= span[b + 2]!; cx++) items[fill[cy * g + cx]!++] = k;
    }
  }

  private cell(v: number, v0: number, s: number): number {
    return Math.min(this.g - 1, Math.max(0, Math.floor((v - v0) * s)));
  }

  /** 점 (x, y)를 품는 고리마다 fn(번호). 결과는 모든 고리에 pointInRing을 한 것과 같다(번호 순서는 다를 수 있다) */
  containing(x: number, y: number, self: number, fn: (k: number) => void): void {
    if (this.linear || !safe(x) || !safe(y)) {
      for (let k = 0; k < this.loops.length; k++) {
        if (k === self) continue;
        this.work += 1 + (this.loops[k]!.length >> 1);
        if (pointInRing(x, y, this.loops[k]!)) fn(k);
      }
      return;
    }
    const q = this.cell(y, this.gy0, this.sy) * this.g + this.cell(x, this.gx0, this.sx);
    for (let r = this.start[q]!, e = this.start[q + 1]!; r < e; r++) this.test(this.items[r]!, x, y, self, fn);
    for (const k of this.wide) this.test(k, x, y, self, fn);
  }

  private test(k: number, x: number, y: number, self: number, fn: (k: number) => void): void {
    if (k === self) return;
    this.work++;
    const c = this.loops[k]!;
    if (!this.bad[k]) {
      const b = k * 4;
      if (!(y >= this.box[b + 1]! && y < this.box[b + 3]! && x >= this.box[b]! && x < this.box[b + 2]!)) return;
      if (c.length > SLAB_MIN_VERTS * 2 && (this.asked[k] = this.asked[k]! + 1) > 4) {
        let sl = this.slabs[k];
        if (sl === undefined) {
          sl = this.slabs[k] = ringSlabs(c);
          this.work += c.length;
        }
        if (sl) {
          if (inSlabs(x, y, c, sl, this)) fn(k);
          return;
        }
      }
    }
    this.work += c.length >> 1;
    if (pointInRing(x, y, c)) fn(k);
  }
}

/**
 * 상자로 걸러도 되는 좌표: 0이거나 절댓값이 1e-100~1e100. 두 값의 차는 0이거나 1e-116 이상이라
 * 교점 식의 곱·몫이 정상 수 범위에 들고 반올림 오차만 남는다(넘침·아래 넘침이 없다)
 */
function safe(v: number): boolean {
  const a = Math.abs(v);
  return v === 0 || (a >= 1e-100 && a <= 1e100);
}

/** pointInRing과 같은 식을 점의 y가 든 띠의 변에만 쓴다(홀짝이라 변 순서는 상관없다) */
function inSlabs(x: number, y: number, c: readonly number[], sl: RingSlabs, w: { work: number }): boolean {
  const q = Math.min(sl.count - 1, Math.max(0, Math.floor((y - sl.y0) * sl.s)));
  let inside = false;
  const len = c.length;
  for (let r = sl.start[q]!, e = sl.start[q + 1]!; r < e; r++) {
    const i = sl.edges[r]!;
    const j = i === 0 ? len - 2 : i - 2;
    const xi = c[i]!;
    const yi = c[i + 1]!;
    const xj = c[j]!;
    const yj = c[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  w.work += sl.start[q + 1]! - sl.start[q]!;
  return inside;
}

/** 일이 한도를 넘었는지(넘으면 limited를 세운다) */
function over(work: LoopWork | undefined, n: number): boolean {
  if (!work || work.limit === undefined || work.n + n <= work.limit) return false;
  work.limited = true;
  return true;
}

/** 고리들을 홀짝 규칙으로 삼각분할. work가 있으면 든 일을 더하고, 한도를 넘으면 빈 배열을 돌려준다 */
export function triangulateLoops(loops: number[][], work?: LoopWork): number[] {
  const index = new LoopIndex(loops);
  // 고리 안쪽 점: 첫 변의 중점
  const mid = (c: readonly number[]): [number, number] => [(c[0]! + c[2]!) / 2, (c[1]! + c[3]!) / 2];
  // 한도에 닿으면 그때까지 든 일을 더하고 멈춘다
  const stop = (): number[] => {
    if (work) work.n += index.work;
    return [];
  };
  const depth = new Int32Array(loops.length);
  for (let i = 0; i < loops.length; i++) {
    const [x, y] = mid(loops[i]!);
    index.containing(x, y, i, () => depth[i]!++);
    if (over(work, index.work)) return stop();
  }
  // 구멍: 깊이가 하나 얕은, 자기를 품은 고리마다(j 순으로 돌므로 번호 순이다)
  const holesOf: number[][] = loops.map(() => []);
  for (let j = 0; j < loops.length; j++) {
    if (depth[j]! % 2 === 0) continue;
    const [x, y] = mid(loops[j]!);
    index.containing(x, y, j, (i) => {
      if (depth[i] === depth[j]! - 1) holesOf[i]!.push(j);
    });
    if (over(work, index.work)) return stop();
  }
  if (work) work.n += index.work;
  const out: number[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depth[i]! % 2 !== 0) continue;
    const holes = holesOf[i]!;
    if (holes.length > STRIP_HOLES && stripTriangulate(loops[i]!, holes.map((j) => loops[j]!), out, work)) continue;
    if (work && work.limited) return [];
    const flat = [...loops[i]!];
    const starts: number[] = [];
    for (const j of holes) {
      starts.push(flat.length / 2);
      pushAll(flat, loops[j]!);
    }
    if (!earcutFill(flat, starts, out, work)) return [];
  }
  return out;
}

/** earcut 한 번(일 = 정점 수 + 구멍 수의 제곱) */
function earcutFill(flat: number[], holes: number[], out: number[], work?: LoopWork): boolean {
  const cost = (flat.length >> 1) + holes.length * holes.length;
  if (over(work, cost)) return false;
  if (work) work.n += cost;
  const idx = earcut(flat, holes, 2);
  for (const k of idx) out.push(flat[k * 2]!, flat[k * 2 + 1]!);
  return true;
}

/**
 * 구멍이 아주 많은 바깥 고리: 구멍 상자 사이 틈에서 가로 띠로 자르고, 구멍이 많은 띠는 다시 세로 틈에서 잘라 칸마다 삼각분할한다(안 되면 세로 먼저).
 * earcut은 구멍을 왼쪽으로 이으면서 이어 둔 블록을 모두 훑고 다리 끝 삼각형 안의 점을 보므로, 구멍이 적고 왼쪽 변이 짧은 칸이 빠르다.
 * 틈에서만 자르므로 구멍은 잘리지 않고 칸 하나에만 든다(구멍을 가로질러 자르면 잘린 구멍이 칸 경계에 닿아 earcut이 그 구멍을 채운다).
 * 바깥 고리를 칸으로 자르면(서덜랜드-호지먼) 홀짝 채움이 원래 영역과 칸의 교집합 그대로다. 어느 축에도 틈이 없으면 false
 */
function stripTriangulate(outer: number[], holes: number[][], out: number[], work?: LoopWork): boolean {
  for (const v of outer) if (!Number.isFinite(v)) return false;
  for (const h of holes) for (const v of h) if (!Number.isFinite(v)) return false;
  for (const axes of [
    [1, 0],
    [0, 1],
  ] as const) {
    const pieces: number[] = [];
    const r = splitFill(outer, holes, axes, 0, pieces, work);
    if (r === 'limited') return false;
    if (r === 'ok') {
      pushAll(out, pieces);
      return true;
    }
  }
  return false;
}

/** 구멍을 axes[level] 축의 틈에서 나눠 칸마다 더 나누거나 삼각분할한다. 첫 단계에서 틈이 없으면 'nocut' */
function splitFill(outer: number[], holes: number[][], axes: readonly [0 | 1, 0 | 1], level: number, out: number[], work?: LoopWork): 'ok' | 'nocut' | 'limited' {
  const fill = (o: number[], hs: number[][]) => {
    const flat = [...o];
    const starts: number[] = [];
    for (const h of hs) {
      starts.push(flat.length / 2);
      pushAll(flat, h);
    }
    return earcutFill(flat, starts, out, work) ? 'ok' : 'limited';
  };
  if (level >= axes.length || holes.length <= STRIP_SIZE) return fill(outer, holes);
  const axis = axes[level]!;
  const lo = new Float64Array(holes.length);
  const hi = new Float64Array(holes.length);
  for (let k = 0; k < holes.length; k++) {
    const h = holes[k]!;
    let a = Infinity;
    let b = -Infinity;
    for (let i = axis; i < h.length; i += 2) {
      if (h[i]! < a) a = h[i]!;
      if (h[i]! > b) b = h[i]!;
    }
    lo[k] = a;
    hi[k] = b;
  }
  const order = Array.from(holes, (_, k) => k).sort((p, q) => lo[p]! - lo[q]!);
  // 구멍이 STRIP_SIZE개 모인 뒤 처음 나는 틈(앞 구멍들의 끝 < 다음 구멍의 시작)의 가운데에서 자른다
  const groups: number[][] = [[]];
  const cuts: number[] = [];
  let reach = -Infinity;
  for (const k of order) {
    const g = groups[groups.length - 1]!;
    if (g.length >= STRIP_SIZE && lo[k]! > reach) {
      cuts.push((reach + lo[k]!) / 2);
      groups.push([k]);
    } else g.push(k);
    if (hi[k]! > reach) reach = hi[k]!;
  }
  if (!cuts.length) return level === 0 ? 'nocut' : fill(outer, holes);
  for (let q = 0; q < groups.length; q++) {
    const x0 = q > 0 ? cuts[q - 1]! : -Infinity;
    const x1 = q < cuts.length ? cuts[q]! : Infinity;
    const rect: [number, number, number, number] = axis === 0 ? [x0, -Infinity, x1, Infinity] : [-Infinity, x0, Infinity, x1];
    if (over(work, outer.length >> 1)) return 'limited';
    if (work) work.n += outer.length >> 1;
    const [o] = clipLoopsToRect([outer], rect);
    // 구멍은 바깥 고리 안이라 칸에 바깥 고리가 없으면 구멍도 없다
    if (!o) continue;
    const hs = groups[q]!.sort((p, r) => p - r).map((k) => holes[k]!);
    if (splitFill(o, hs, axes, level + 1, out, work) === 'limited') return 'limited';
  }
  return 'ok';
}

/** 한 해치를 그릴 무늬 선 수의 상한(넘으면 성기게 그리고, 확대하면 보이는 곳만 원래 간격으로 — build.ts) */
export const HATCH_LINE_LIMIT = 200000;

/** 해치를 만들 때 무늬 선 수의 상한(AutoCAD HPMAXLINES 기본값) */
export const HATCH_CREATE_LIMIT = 1000000;

/** 무늬 선 간격을 f배로(너무 촘촘한 해치를 멀리서 볼 때 성기게 그린다) */
export function spreadPattern(lines: readonly HatchPatternLine[], f: number): HatchPatternLine[] {
  return lines.map((l) => ({ ...l, offset: { x: l.offset.x * f, y: l.offset.y * f } }));
}

/** 고리(평평한 [x, y, …])들을 사각형으로 자른다(서덜랜드-호지먼 — 홀짝 채우기에 그대로 쓸 수 있다). 무한대 경계는 자르지 않는다 */
export function clipLoopsToRect(loops: number[][], r: readonly [number, number, number, number]): number[][] {
  const out: number[][] = [];
  for (const loop of loops) {
    let pts: number[] = loop;
    const sides: [number, number, number][] = [
      [0, r[0], 1],
      [0, r[2], -1],
      [1, r[1], 1],
      [1, r[3], -1],
    ];
    for (const [axis, v, sign] of sides) {
      const next: number[] = [];
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]!;
        const ay = pts[i * 2 + 1]!;
        const j = (i + 1) % n;
        const bx = pts[j * 2]!;
        const by = pts[j * 2 + 1]!;
        const ia = ((axis ? ay : ax) - v) * sign >= 0;
        const ib = ((axis ? by : bx) - v) * sign >= 0;
        if (ia !== ib) {
          // 자르는 축 좌표는 경계값 그대로: 보간하면 경계에서 조금 벗어나(179.5 → 179.50000000000003) 오목한 고리를 자른 폭 0 통로가 꼬인다
          const t = (v - (axis ? ay : ax)) / ((axis ? by : bx) - (axis ? ay : ax));
          if (axis) next.push(ax + (bx - ax) * t, v);
          else next.push(v, ay + (by - ay) * t);
        }
        if (ib) next.push(bx, by);
      }
      pts = next;
      if (pts.length < 6) break;
    }
    if (pts.length >= 6) out.push(pts);
  }
  return out;
}

/**
 * 무늬 선을 경계로 자른다. 결과: 선분 [x0, y0, x1, y1, …], 너무 많으면 null
 *
 * 무늬 선 하나마다 모든 경계 변을 보면 선 수 × 변 수라, 촘촘한 해치(선 20만 개)에 변이 많으면(곡선 경계) 몇 초가 걸린다.
 * 변마다 지나는 선 번호(k) 범위를 미리 구해 k 순으로 쓸어 가며 그 선에 걸칠 수 있는 변만 본다(교차 판정·순서는 그대로).
 * work가 있으면 들인 일을 더한다(무늬가 조각을 내지 않아도 시간이 드는 것을 블록 펼침 한도가 센다).
 * 일이 budget을 넘으면 null(장면에 남은 일 — 무늬 선 수 × 변 수가 해치 하나로 장면 한도를 넘어 몇 초씩 돌지 않게).
 */
export function patternSegments(lines: readonly HatchPatternLine[], loops: number[][], limit = HATCH_LINE_LIMIT, work?: DashWork, budget = Infinity): number[] | null {
  const out: number[] = [];
  if (!loops.length) return out;
  // 조각 한도(선 하나당 8)까지 형식 안의 무늬(요소 12개)가 밟는 수. 구간 하나는 조각 하나에 주기 4개까지 세므로(주기 2개 길이에 대시 하나 + 2) 4배를 둔다
  const stepLimit = limit * 8 * LINETYPE_ELEMENTS * 4;
  let steps = 0;
  // 경계 상자
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let edgeCount = 0;
  for (const l of loops) {
    edgeCount += l.length >> 1;
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i]!);
      maxX = Math.max(maxX, l[i]!);
      minY = Math.min(minY, l[i + 1]!);
      maxY = Math.max(maxY, l[i + 1]!);
    }
  }
  // 변 끝점(고리마다 마지막 점 → 첫 점으로 닫힌다)
  const ax = new Float64Array(edgeCount);
  const ay = new Float64Array(edgeCount);
  const bx = new Float64Array(edgeCount);
  const by = new Float64Array(edgeCount);
  {
    let e = 0;
    for (const l of loops) {
      const n = l.length;
      for (let i = 0; i < n; i += 2, e++) {
        const j = (i + 2) % n;
        ax[e] = l[i]!;
        ay[e] = l[i + 1]!;
        bx[e] = l[j]!;
        by[e] = l[j + 1]!;
      }
    }
  }
  const corners = [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
  const kLo = new Float64Array(edgeCount);
  const kHi = new Float64Array(edgeCount);
  const order = new Int32Array(edgeCount);
  const active = new Int32Array(edgeCount);
  let count = 0;
  for (const pl of lines) {
    const ux = Math.cos(pl.angle);
    const uy = Math.sin(pl.angle);
    // 선 사이 간격 = 오프셋의 법선 성분
    const nx = -uy;
    const ny = ux;
    const spacing = pl.offset.x * nx + pl.offset.y * ny;
    if (Math.abs(spacing) < 1e-12) continue;
    // 상자 꼭짓점의 법선 방향 거리로 k 범위
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const d = (corners[i]! - pl.base.x) * nx + (corners[i + 1]! - pl.base.y) * ny;
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
    }
    let k0 = Math.ceil(dMin / spacing);
    let k1 = Math.floor(dMax / spacing);
    if (k0 > k1) [k0, k1] = [k1, k0];
    if (k1 - k0 > limit) return null;
    // 번호가 2^53을 넘으면(기준점이 아주 멀거나 간격이 아주 작은 자료) k++가 값을 바꾸지 못해 아래 고리가 끝나지 않는다.
    // 간격을 넓히면(spreadPattern) 번호가 작아지므로 "너무 촘촘함"으로 돌려준다
    if (Math.abs(k0) >= Number.MAX_SAFE_INTEGER || Math.abs(k1) >= Number.MAX_SAFE_INTEGER) return null;
    if (work) {
      work.n += edgeCount >> 2;
      if (work.n > budget) return null;
    }
    // 변마다 걸칠 수 있는 선 번호 범위(반올림 오차만큼 한 칸씩 넉넉히 — 실제 교차는 아래에서 예전 식 그대로 판정)
    for (let e = 0; e < edgeCount; e++) {
      const ka = ((ax[e]! - pl.base.x) * nx + (ay[e]! - pl.base.y) * ny) / spacing;
      const kb = ((bx[e]! - pl.base.x) * nx + (by[e]! - pl.base.y) * ny) / spacing;
      kLo[e] = Math.floor(Math.min(ka, kb)) - 1;
      kHi[e] = Math.ceil(Math.max(ka, kb)) + 1;
      order[e] = e;
    }
    sortEdges(order, kLo, k0, k1, edgeCount);
    let next = 0;
    let nActive = 0;
    const dashes = pl.dashes;
    const period = dashes.reduce((a, b) => a + Math.abs(b), 0);
    const onDashes = dashes.filter((d) => d >= 0).length;
    const ts: number[] = [];
    for (let k = k0; k <= k1; k++) {
      // 이 선에 걸칠 수 있는 변: 새로 들어온 변을 더하고 지나간 변은 뺀다
      while (next < edgeCount && kLo[order[next]!]! <= k) active[nActive++] = order[next++]!;
      if (!nActive) {
        // 다음 변이 시작하는 선까지 건너뛴다
        if (next >= edgeCount) break;
        const skip = Math.max(k, Math.floor(kLo[order[next]!]!) - 1);
        if (skip > k) k = skip;
        continue;
      }
      if (work) {
        work.n += 1 + (nActive >> 2);
        if (work.n > budget) return null;
      }
      // 선 k의 원점(무늬 시작)
      const ox = pl.base.x + pl.offset.x * k;
      const oy = pl.base.y + pl.offset.y * k;
      ts.length = 0;
      let w = 0;
      for (let r = 0; r < nActive; r++) {
        const e = active[r]!;
        if (kHi[e]! < k) continue;
        active[w++] = e;
        const da = (ax[e]! - ox) * nx + (ay[e]! - oy) * ny;
        const db = (bx[e]! - ox) * nx + (by[e]! - oy) * ny;
        if ((da > 0) === (db > 0)) continue;
        if (da === db) continue;
        const s = da / (da - db);
        const px = ax[e]! + (bx[e]! - ax[e]!) * s;
        const py = ay[e]! + (by[e]! - ay[e]!) * s;
        ts.push((px - ox) * ux + (py - oy) * uy);
      }
      nActive = w;
      if (ts.length < 2) continue;
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const t0 = ts[i]!;
        const t1 = ts[i + 1]!;
        if (t1 - t0 < 1e-12) continue;
        // 한도는 구간 뒤에 보므로 대시가 아주 짧으면 구간 하나가 수십억 조각을 만든다. 펼치기 전에 세어 같은 결과(null)를 돌려준다
        if (dashes.length && period > 0 && (t1 - t0) / period - 2 > (limit * 8 - count) / Math.max(1, onDashes)) return null;
        // 틈은 조각을 내지 않아 위의 조각 수가 못 본다. 요소를 밟는 수가 예산을 넘으면 이 구간은 실선으로
        const intervalSteps = dashes.length && period > 0 ? ((t1 - t0) / period + 2) * dashes.length : 0;
        steps += intervalSteps;
        if (steps > stepLimit) {
          if (work) work.limited = true;
          dashInterval(t0, t1, [], 0, (a, b) => {
            out.push(ox + ux * a, oy + uy * a, ox + ux * b, oy + uy * b);
            count++;
          });
        } else {
          if (work) work.n += Math.floor(intervalSteps / 8);
          dashInterval(t0, t1, dashes, period, (a, b) => {
            out.push(ox + ux * a, oy + uy * a, ox + ux * b, oy + uy * b);
            count++;
          });
        }
        if (count > limit * 8) return null;
      }
    }
  }
  return out;
}

/**
 * 변 번호를 걸치기 시작하는 선 번호(kLo) 순으로 늘어놓는다. 비교 함수 정렬은 무늬 선마다 변 수 × log라
 * 무늬 선 2,000개 × 변 2만 개가 4.7초였다. kLo는 정수이고 쓸기는 [k0, k1]만 보므로 그 밖은 양 끝 칸으로 눌러 같은 칸끼리는 순서를 가리지 않는다
 * (k0 앞 변은 첫 선에서 모두 들어오고 k1 뒤 변은 들어오지 않는다. 교점은 정렬해 쓰므로 들어오는 순서가 결과를 바꾸지 않는다).
 * 칸 수가 변 수의 4배 안이면 칸별 세기(계수 정렬), 아니면 (칸, 변) 한 수로 묶어 형식 배열 정렬
 */
function sortEdges(order: Int32Array, kLo: Float64Array, k0: number, k1: number, edgeCount: number): void {
  const cells = k1 - k0 + 3;
  const cellOf = (e: number) => {
    const v = kLo[e]! - k0 + 1;
    return v <= 0 ? 0 : v >= cells - 1 ? cells - 1 : v;
  };
  if (cells <= edgeCount * 4 + 64) {
    const start = new Int32Array(cells + 1);
    for (let e = 0; e < edgeCount; e++) start[cellOf(e) + 1]!++;
    for (let c = 0; c < cells; c++) start[c + 1]! += start[c]!;
    for (let e = 0; e < edgeCount; e++) order[start[cellOf(e)]!++] = e;
    return;
  }
  if (cells * edgeCount < Number.MAX_SAFE_INTEGER) {
    const keys = new Float64Array(edgeCount);
    for (let e = 0; e < edgeCount; e++) keys[e] = cellOf(e) * edgeCount + e;
    keys.sort();
    for (let e = 0; e < edgeCount; e++) order[e] = keys[e]! % edgeCount;
    return;
  }
  for (let e = 0; e < edgeCount; e++) order[e] = e;
  order.sort((p, q) => kLo[p]! - kLo[q]!);
}

/** 사용자 정의 무늬(_USER 등)가 선 정의 없이 왔을 때 각도·간격으로 만든다. */
export function userPattern(h: HatchEntity): HatchPatternLine[] {
  const a = h.patternAngle;
  const s = h.patternScale || 1;
  const off = { x: -Math.sin(a) * s, y: Math.cos(a) * s };
  const lines: HatchPatternLine[] = [{ angle: a, base: { x: 0, y: 0 }, offset: off, dashes: [] }];
  if (h.patternDouble) lines.push({ angle: a + Math.PI / 2, base: { x: 0, y: 0 }, offset: { x: -Math.cos(a) * s, y: -Math.sin(a) * s }, dashes: [] });
  return lines;
}
