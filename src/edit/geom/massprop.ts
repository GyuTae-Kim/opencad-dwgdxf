/**
 * MASSPROP(2D 영역의 질량 특성): 면적·둘레·범위·도심·관성 모멘트(원점 기준)·관성 곱·회전 반경·도심 기준 주 모멘트와 방향.
 * 영역은 닫힌 고리들(평면 [x, y, …])로 받는다. 다른 고리 안에 홀수 번 든 고리는 구멍이다(REGION의 섬).
 *
 * REGION은 ACIS 모서리의 정확한 곡선(선·원/타원 호·넙스)을 그린 정리로 적분한다(화면용 다각형이 아니다 — r = 10 원 영역의 면적이
 * 313.9350이 아니라 314.1593). 같은 면(face)의 안쪽 고리만 구멍이고, 서로 다른 면·서로 다른 REGION은 더한다(AutoCAD와 같다).
 */
import type { AcisCurve } from '../../core/model';

export interface MassProps {
  area: number;
  perimeter: number;
  box: [number, number, number, number];
  centroid: [number, number];
  /** 원점 기준 ∫y² dA, ∫x² dA */
  ix: number;
  iy: number;
  /** 원점 기준 ∫xy dA */
  ixy: number;
  /** 회전 반경 √(I/A) */
  rx: number;
  ry: number;
  /** 도심 기준 주 모멘트와 축 방향(단위 벡터) */
  principal: { i: number; dir: [number, number] }[];
}

/** 고리 하나의 (부호 면적, ∫x dA, ∫y dA, ∫x² dA, ∫y² dA, ∫xy dA, 둘레) — 반시계 +. 그린 정리 */
function ringIntegrals(r: readonly number[]): number[] {
  let a = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let per = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = r[i * 2]!;
    const y0 = r[i * 2 + 1]!;
    const j = (i + 1) % n;
    const x1 = r[j * 2]!;
    const y1 = r[j * 2 + 1]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    sx += (x0 + x1) * c;
    sy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
    per += Math.hypot(x1 - x0, y1 - y0);
  }
  return [a / 2, sx / 6, sy / 6, sxx / 12, syy / 12, sxy / 24, per];
}

function inside(px: number, py: number, r: readonly number[]): boolean {
  let c = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2]!;
    const yi = r[i * 2 + 1]!;
    const xj = r[j * 2]!;
    const yj = r[j * 2 + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** 고리 하나: 안팎 판정용 다각형, 적분값(ringIntegrals와 같은 차례, 고리 방향의 부호), 범위 */
export interface RegionLoop {
  ring: number[];
  v: number[];
  box: [number, number, number, number];
}

function ringBox(r: readonly number[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    minX = Math.min(minX, r[i]!);
    maxX = Math.max(maxX, r[i]!);
    minY = Math.min(minY, r[i + 1]!);
    maxY = Math.max(maxY, r[i + 1]!);
  }
  return [minX, minY, maxX, maxY];
}

/** 다각형 고리 */
export function ringLoop(r: readonly number[]): RegionLoop {
  return { ring: [...r], v: ringIntegrals(r), box: ringBox(r) };
}

/** 닫힌 고리들의 질량 특성(구멍은 빼고). 고리가 없으면 null */
export function massProps(rings: readonly number[][]): MassProps | null {
  return massPropsOfGroups([rings.filter((r) => r.length >= 6).map(ringLoop)]);
}

/**
 * 묶음마다(한 면, 또는 함께 재는 닫힌 객체들) 다른 고리 안에 홀수 번 든 고리는 구멍으로 빼고, 묶음끼리는 더한다.
 * 고리가 없으면 null
 */
export function massPropsOfGroups(groups: readonly (readonly RegionLoop[])[]): MassProps | null {
  const all = groups.flat();
  if (!all.length) return null;
  let A = 0;
  let SX = 0;
  let SY = 0;
  let SXX = 0;
  let SYY = 0;
  let SXY = 0;
  let P = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const list of groups)
    list.forEach((lp, k) => {
      const r = lp.ring;
      // 구멍인가: 첫 꼭짓점이 같은 묶음의 다른 고리 안에 든 횟수
      let depth = 0;
      for (let m = 0; m < list.length; m++) if (m !== k && inside(r[0]!, r[1]!, list[m]!.ring)) depth++;
      const v = lp.v;
      // 고리 방향과 관계없이 바깥 = +, 구멍 = −
      const s = (v[0]! >= 0 ? 1 : -1) * (depth % 2 ? -1 : 1);
      A += s * v[0]!;
      SX += s * v[1]!;
      SY += s * v[2]!;
      SXX += s * v[3]!;
      SYY += s * v[4]!;
      SXY += s * v[5]!;
      P += v[6]!;
      minX = Math.min(minX, lp.box[0]);
      minY = Math.min(minY, lp.box[1]);
      maxX = Math.max(maxX, lp.box[2]);
      maxY = Math.max(maxY, lp.box[3]);
    });
  if (!(Math.abs(A) > 0)) return null;
  const cx = SX / A;
  const cy = SY / A;
  // 도심 기준(평행축 정리)
  const icx = SYY - A * cy * cy;
  const icy = SXX - A * cx * cx;
  const icxy = SXY - A * cx * cy;
  // 축 방향 d(단위)에 대한 모멘트 = Qd·d, Q = [[icx, −icxy], [−icxy, icy]] — 주 모멘트는 Q의 고윳값(작은 것 I, 큰 것 J)
  const avg = (icx + icy) / 2;
  const rad = Math.hypot((icx - icy) / 2, icxy);
  const dirOf = (lam: number): [number, number] => {
    if (Math.abs(icxy) > 1e-12 * Math.max(1, Math.abs(icx), Math.abs(icy))) {
      const l = Math.hypot(icxy, icx - lam);
      return [icxy / l, (icx - lam) / l];
    }
    return Math.abs(lam - icx) <= Math.abs(lam - icy) ? [1, 0] : [0, 1];
  };
  // 원처럼 두 주 모멘트가 같으면(방향이 정해지지 않는다) X·Y 축 — 같은 방향 둘이 되지 않게
  const iso = rad <= 1e-10 * Math.max(1, Math.abs(icx), Math.abs(icy));
  const principal: MassProps['principal'] = iso
    ? [
        { i: avg, dir: [1, 0] },
        { i: avg, dir: [0, 1] },
      ]
    : [avg - rad, avg + rad].map((lam) => ({ i: lam, dir: dirOf(lam) }));
  return {
    area: A,
    perimeter: P,
    box: [minX, minY, maxX, maxY],
    centroid: [cx, cy],
    ix: SYY,
    iy: SXX,
    ixy: SXY,
    rx: Math.sqrt(Math.abs(SYY / A)),
    ry: Math.sqrt(Math.abs(SXX / A)),
    principal,
  };
}

/** REGION의 모서리 선(순서 없는 열린 선들)을 끝점끼리 이어 닫힌 고리들로 */
export function wiresToRings(wires: readonly { x: number; y: number }[][], tol = 1e-6): number[][] {
  const left = wires.filter((w) => w.length >= 2).map((w) => w.map((p) => [p.x, p.y] as [number, number]));
  const rings: number[][] = [];
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol * Math.max(1, Math.abs(a[0]), Math.abs(a[1]));
  while (left.length) {
    const chain = left.shift()!;
    for (let guard = 0; guard < 100000 && !near(chain[0]!, chain[chain.length - 1]!); guard++) {
      const end = chain[chain.length - 1]!;
      const i = left.findIndex((w) => near(w[0]!, end) || near(w[w.length - 1]!, end));
      if (i < 0) break;
      const w = left.splice(i, 1)[0]!;
      const seg = near(w[0]!, end) ? w : [...w].reverse();
      chain.push(...seg.slice(1));
    }
    if (chain.length >= 4 && near(chain[0]!, chain[chain.length - 1]!)) rings.push(chain.slice(0, -1).flat());
  }
  return rings;
}

// ---------------------------------------------------------------------------
// REGION: ACIS 모서리의 정확한 곡선
// ---------------------------------------------------------------------------

/** 8점 가우스-르장드르 마디·가중치([-1, 1]) */
const GX = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** 넙스 점과 미분 [x, y, dx/du, dy/du](de Boor — 마지막 단계의 두 점으로 미분, 유리면 몫의 미분) */
function nurbsEval(c: Extract<AcisCurve, { k: 'nurbs' }>, u: number): [number, number, number, number] {
  const p = c.degree;
  const U = c.knots;
  const n = c.ctrl.length - 1;
  let k = p;
  while (k < n && u >= U[k + 1]!) k++;
  const d: number[][] = [];
  for (let j = 0; j <= p; j++) {
    const P = c.ctrl[k - p + j]!;
    const w = c.weights ? c.weights[k - p + j]! : 1;
    d.push([P.x * w, P.y * w, w]);
  }
  for (let r = 1; r < p; r++)
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1]! - U[i]!;
      const a = den === 0 ? 0 : (u - U[i]!) / den;
      for (let q = 0; q < 3; q++) d[j]![q] = (1 - a) * d[j - 1]![q]! + a * d[j]![q]!;
    }
  const den = U[k + 1]! - U[k]!;
  const a = den === 0 ? 0 : (u - U[k]!) / den;
  const d0 = d[p - 1]!;
  const d1 = d[p]!;
  const H = [0, 1, 2].map((q) => (1 - a) * d0[q]! + a * d1[q]!);
  const D = [0, 1, 2].map((q) => (den === 0 ? 0 : (p * (d1[q]! - d0[q]!)) / den));
  const x = H[0]! / H[2]!;
  const y = H[1]! / H[2]!;
  return [x, y, (D[0]! - D[2]! * x) / H[2]!, (D[1]! - D[2]! * y) / H[2]!];
}

function nurbsPoint(c: Extract<AcisCurve, { k: 'nurbs' }>, u: number): [number, number] {
  const r = nurbsEval(c, u);
  return [r[0], r[1]];
}

/**
 * 곡선 하나를 s0 → s1(rev면 반대)으로 따라간 그린 정리 적분 [면적, ∫x, ∫y, ∫x², ∫y², ∫xy, 길이]과 범위를 더한다.
 * 면적 = ½∮(x dy − y dx), ∫x = ½∮x² dy, ∫y = −½∮y² dx, ∫x² = ⅓∮x³ dy, ∫y² = −⅓∮y³ dx, ∫xy = ½∮x²y dy
 * (닫힌 고리 전체로는 ringIntegrals와 같은 값 — 모서리마다 같은 식을 써야 한다)
 */
function addCurve(acc: number[], box: number[], f: (t: number) => [number, number, number, number], a: number, b: number, pieces: number): void {
  const h = (b - a) / pieces;
  for (let i = 0; i < pieces; i++) {
    const m = a + h * (i + 0.5);
    for (let g = 0; g < 8; g++) {
      const [x, y, dx, dy] = f(m + (h / 2) * GX[g]!);
      const w = (GW[g]! * h) / 2;
      acc[0]! += w * 0.5 * (x * dy - y * dx);
      acc[1]! += w * 0.5 * x * x * dy;
      acc[2]! += w * -0.5 * y * y * dx;
      acc[3]! += (w * x * x * x * dy) / 3;
      acc[4]! += (w * -y * y * y * dx) / 3;
      acc[5]! += w * 0.5 * x * x * y * dy;
      acc[6]! += Math.abs(w) * Math.hypot(dx, dy);
      box[0] = Math.min(box[0]!, x);
      box[1] = Math.min(box[1]!, y);
      box[2] = Math.max(box[2]!, x);
      box[3] = Math.max(box[3]!, y);
    }
  }
}

function addPoint(box: number[], x: number, y: number): void {
  box[0] = Math.min(box[0]!, x);
  box[1] = Math.min(box[1]!, y);
  box[2] = Math.max(box[2]!, x);
  box[3] = Math.max(box[3]!, y);
}

/** 모서리 하나(정확한 곡선, 없으면 그 선을 이은 선분들)를 고리 방향으로 적분한다 */
function addEdge(acc: number[], box: number[], curve: AcisCurve | null, pts: readonly { x: number; y: number }[], rev: boolean): void {
  const seg = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    addCurve(acc, box, (t) => [p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, q.x - p.x, q.y - p.y], 0, 1, 1);
  if (curve?.k === 'line') {
    const [p, q] = rev ? [curve.b, curve.a] : [curve.a, curve.b];
    seg(p, q);
    addPoint(box, p.x, p.y);
    addPoint(box, q.x, q.y);
    return;
  }
  if (curve?.k === 'ell') {
    const { c, u, v } = curve;
    const f = (t: number): [number, number, number, number] => {
      const ct = Math.cos(t);
      const st = Math.sin(t);
      return [c.x + u.x * ct + v.x * st, c.y + u.y * ct + v.y * st, -u.x * st + v.x * ct, -u.y * st + v.y * ct];
    };
    const [a, b] = rev ? [curve.s1, curve.s0] : [curve.s0, curve.s1];
    addCurve(acc, box, f, a, b, Math.max(4, Math.ceil(Math.abs(b - a) / (Math.PI / 16))));
    // 범위: 끝점과 축 방향의 극점(구간 안에 있으면)
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const cands = [lo, hi];
    for (const base of [Math.atan2(v.x, u.x), Math.atan2(v.y, u.y)])
      for (let k = Math.floor((lo - base) / Math.PI) - 1; k <= Math.ceil((hi - base) / Math.PI) + 1; k++) {
        const t = base + k * Math.PI;
        if (t >= lo && t <= hi) cands.push(t);
      }
    for (const t of cands) {
      const [x, y] = f(t);
      addPoint(box, x, y);
    }
    return;
  }
  if (curve?.k === 'nurbs') {
    const [a, b] = rev ? [curve.s1, curve.s0] : [curve.s0, curve.s1];
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // 매듭 구간마다(구간 안에서는 매끄럽다)
    const breaks = [lo, ...[...new Set(curve.knots)].filter((k) => k > lo && k < hi), hi];
    if (rev) breaks.reverse();
    const f = (t: number) => nurbsEval(curve, t);
    for (let i = 0; i + 1 < breaks.length; i++) addCurve(acc, box, f, breaks[i]!, breaks[i + 1]!, 4);
    for (const t of [a, b]) {
      const [x, y] = nurbsPoint(curve, t);
      addPoint(box, x, y);
    }
    // 범위: 구간마다 촘촘히 보고 가장 바깥 표본 둘레를 삼분 탐색으로 다듬는다
    for (let i = 0; i + 1 < breaks.length; i++) {
      const t0 = Math.min(breaks[i]!, breaks[i + 1]!);
      const t1 = Math.max(breaks[i]!, breaks[i + 1]!);
      const n = 32;
      const h = (t1 - t0) / n;
      for (let axis = 0; axis < 2; axis++)
        for (const sign of [1, -1]) {
          let best = t0;
          let bv = -Infinity;
          for (let k = 0; k <= n; k++) {
            const t = t0 + h * k;
            const val = sign * nurbsPoint(curve, t)[axis]!;
            if (val > bv) [bv, best] = [val, t];
          }
          let lo = Math.max(t0, best - h);
          let hi = Math.min(t1, best + h);
          for (let it = 0; it < 60; it++) {
            const m1 = lo + (hi - lo) / 3;
            const m2 = hi - (hi - lo) / 3;
            if (sign * nurbsPoint(curve, m1)[axis]! < sign * nurbsPoint(curve, m2)[axis]!) lo = m1;
            else hi = m2;
          }
          const [x, y] = nurbsPoint(curve, (lo + hi) / 2);
          addPoint(box, x, y);
        }
    }
    return;
  }
  const list = rev ? [...pts].reverse() : pts;
  for (let i = 0; i + 1 < list.length; i++) seg(list[i]!, list[i + 1]!);
  for (const p of list) addPoint(box, p.x, p.y);
}

/**
 * REGION 하나의 묶음(면마다 고리들). 면 구성(acisLoops)과 정확한 곡선이 있으면 그것으로, 없으면 모서리 선을 이은 고리 하나의 묶음.
 * 고리를 만들 수 없으면 빈 목록
 */
export function regionGroups(e: { wires?: readonly { x: number; y: number }[][]; acisCurves?: readonly (AcisCurve | null)[]; acisLoops?: readonly (readonly (readonly number[])[])[] }): RegionLoop[][] {
  const wires = e.wires ?? [];
  if (e.acisLoops?.length && e.acisCurves && e.acisCurves.length === wires.length) {
    const groups: RegionLoop[][] = [];
    let ok = true;
    for (const face of e.acisLoops) {
      const loops: RegionLoop[] = [];
      for (const edges of face) {
        const lp = chainLoop(edges, wires, e.acisCurves);
        if (lp) loops.push(lp);
        else ok = false;
      }
      if (loops.length) groups.push(loops);
    }
    if (ok && groups.length) return groups;
  }
  const rings = wiresToRings(wires);
  return rings.length ? [rings.map(ringLoop)] : [];
}

/** 고리 하나의 모서리들을 끝점끼리 이어(방향을 맞춰) 적분한다. 닫히지 않으면 null */
function chainLoop(edges: readonly number[], wires: readonly { x: number; y: number }[][], curves: readonly (AcisCurve | null)[]): RegionLoop | null {
  const items = edges.map((i) => ({ i, w: wires[i]! })).filter((x) => x.w && x.w.length >= 2);
  if (!items.length) return null;
  let size = 0;
  for (const x of items) for (const p of x.w) size = Math.max(size, Math.abs(p.x), Math.abs(p.y));
  const tol = 1e-6 * Math.max(1, size);
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
  const acc = [0, 0, 0, 0, 0, 0, 0];
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const ring: number[] = [];
  const first = items.shift()!;
  const start = first.w[0]!;
  let end = first.w[first.w.length - 1]!;
  addEdge(acc, box, curves[first.i] ?? null, first.w, false);
  for (const p of first.w.slice(0, -1)) ring.push(p.x, p.y);
  while (items.length) {
    const k = items.findIndex((x) => near(x.w[0]!, end) || near(x.w[x.w.length - 1]!, end));
    if (k < 0) return null;
    const x = items.splice(k, 1)[0]!;
    const rev = !near(x.w[0]!, end);
    const pts = rev ? [...x.w].reverse() : x.w;
    addEdge(acc, box, curves[x.i] ?? null, x.w, rev);
    for (const p of pts.slice(0, -1)) ring.push(p.x, p.y);
    end = pts[pts.length - 1]!;
  }
  if (!near(start, end) || ring.length < 6) return null;
  return { ring, v: acc, box: box as [number, number, number, number] };
}
