/**
 * 그리기 명령의 형상 계산(DOM 없음): RECTANG(회전·모따기·모깎기·영역), CIRCLE Ttr(접선 접선 반지름)·TTT·3P의 접점(점과 접선 섞기),
 * XLINE 이등분·간격띄우기, PLINE 호 옵션(중심·반지름·방향)의 볼록 값, ELLIPSE 호의 각도 ↔ 매개변수.
 * 좌표는 WCS 평면도다.
 */
import type { Entity, EntityBase, LwVertex, SplineEntity, Vec2, Vec3 } from '../../core/model';
import { bulgeArc, clampedKnots, fitSplineAcad, interpolateFitPoints } from '../../geom/curves';
import type { Piece } from './curve';
import { pieceAt, pieceD1, pieceNearest } from './curve';
import { footNear, osculatingPiece } from './tangent';
import { ccwSweep, dist, wrapPi } from './math';
import { inherit } from './path';
import { fitKind, frameVerts, isClosed, isPolyline } from './pedit';
import { closeSpline } from './splinedit';

// ---------------------------------------------------------------------------
// RECTANG
// ---------------------------------------------------------------------------

export interface RectOptions {
  /** 모따기 거리(첫 번째 = 회전한 X축 방향 변, 두 번째 = Y축 방향 변) */
  chamfer?: [number, number];
  /** 모깎기 반지름 */
  fillet?: number;
  /** 선 폭 */
  width?: number;
}

/** 첫 구석점 a와 다른 구석점 b, 회전 각도(라디안)로 네 구석(a에서 시작해 X축 방향 변 먼저) */
export function rectCorners(a: Vec2, b: Vec2, rot = 0): Vec2[] {
  const u = { x: Math.cos(rot), y: Math.sin(rot) };
  const v = { x: -u.y, y: u.x };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lx = dx * u.x + dy * u.y;
  const ly = dx * v.x + dy * v.y;
  return [a, { x: a.x + u.x * lx, y: a.y + u.y * lx }, { x: a.x + u.x * lx + v.x * ly, y: a.y + u.y * lx + v.y * ly }, { x: a.x + v.x * ly, y: a.y + v.y * ly }];
}

/** 길이(X)·폭(Y)과 방향 부호로 다른 구석점 */
export function rectOtherCorner(a: Vec2, length: number, width: number, rot = 0, sx = 1, sy = 1): Vec2 {
  const u = { x: Math.cos(rot), y: Math.sin(rot) };
  const v = { x: -u.y, y: u.x };
  return { x: a.x + u.x * length * sx + v.x * width * sy, y: a.y + u.y * length * sx + v.y * width * sy };
}

/** 모따기·모깎기가 이 크기의 직사각형에 들어가는지 */
export function rectCornersFit(length: number, width: number, opt: RectOptions): boolean {
  const L = Math.abs(length);
  const W = Math.abs(width);
  if (opt.fillet && opt.fillet > 0) return 2 * opt.fillet <= L + 1e-12 && 2 * opt.fillet <= W + 1e-12;
  if (opt.chamfer && (opt.chamfer[0] > 0 || opt.chamfer[1] > 0)) return 2 * opt.chamfer[0] <= L + 1e-12 && 2 * opt.chamfer[1] <= W + 1e-12;
  return true;
}

/**
 * 직사각형 폴리선 정점(닫힘). 모따기·모깎기는 구석마다 들어오는 변·나가는 변을 자르고,
 * 모깎기는 그 사이를 90° 호(볼록 = ±tan(π/8), 방향은 직사각형의 감김 방향)로 잇는다.
 * 들어가지 않으면 구석을 그대로 둔다.
 */
export function rectVertices(corners: readonly Vec2[], opt: RectOptions = {}): LwVertex[] {
  const w = opt.width ?? 0;
  const vx = (p: Vec2, bulge = 0): LwVertex => ({ x: p.x, y: p.y, bulge, startWidth: w, endWidth: w });
  const L = dist(corners[0]!, corners[1]!);
  const W = dist(corners[1]!, corners[2]!);
  const r = opt.fillet ?? 0;
  const ch = opt.chamfer ?? [0, 0];
  const useFillet = r > 0 && rectCornersFit(L, W, { fillet: r });
  const useChamfer = !useFillet && (ch[0] > 0 || ch[1] > 0) && rectCornersFit(L, W, { chamfer: ch });
  if (!useFillet && !useChamfer) return corners.map((p) => vx(p));
  // 감김 방향: 넓이 부호
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = corners[i]!;
    const q = corners[(i + 1) % 4]!;
    area += p.x * q.y - q.x * p.y;
  }
  const bulge = (area >= 0 ? 1 : -1) * Math.tan(Math.PI / 8);
  const out: LwVertex[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4]!;
    const P = corners[i]!;
    const next = corners[(i + 1) % 4]!;
    const lin = dist(prev, P);
    const lout = dist(P, next);
    // 변 0·2는 X축 방향, 변 1·3은 Y축 방향 → 구석 i로 들어오는 변은 (i + 3) % 4
    const inX = (i + 3) % 2 === 0;
    const cutIn = useFillet ? r : inX ? ch[0] : ch[1];
    const cutOut = useFillet ? r : inX ? ch[1] : ch[0];
    const p1 = lin > 0 ? { x: P.x + ((prev.x - P.x) * cutIn) / lin, y: P.y + ((prev.y - P.y) * cutIn) / lin } : P;
    const p2 = lout > 0 ? { x: P.x + ((next.x - P.x) * cutOut) / lout, y: P.y + ((next.y - P.y) * cutOut) / lout } : P;
    out.push(vx(p1, useFillet ? bulge : 0), vx(p2));
  }
  // 겹친 정점(자른 길이가 변의 절반)은 하나로: 뒤 정점의 볼록을 앞 정점이 잇는다
  const merged: LwVertex[] = [];
  for (const v of out) {
    const last = merged[merged.length - 1];
    if (last && Math.hypot(last.x - v.x, last.y - v.y) <= 1e-9 * Math.max(1, Math.abs(v.x), Math.abs(v.y))) last.bulge = v.bulge || last.bulge;
    else merged.push(v);
  }
  const first = merged[0]!;
  const last = merged[merged.length - 1]!;
  if (merged.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) <= 1e-9 * Math.max(1, Math.abs(first.x), Math.abs(first.y))) {
    merged.pop();
    last.bulge = last.bulge || 0;
  }
  return merged;
}

/** 모따기·모깎기로 줄어드는 넓이(구석 네 곳) */
export function rectAreaLoss(opt: RectOptions): number {
  if (opt.fillet && opt.fillet > 0) return (4 - Math.PI) * opt.fillet * opt.fillet;
  if (opt.chamfer) return 2 * opt.chamfer[0] * opt.chamfer[1];
  return 0;
}

/** 영역(A): 넓이와 한 변(길이 또는 폭)으로 다른 변. 모따기·모깎기 넓이를 뺀 값이 넓이가 되게 */
export function rectOtherSide(area: number, side: number, opt: RectOptions): number | null {
  if (!(side > 0) || !(area > 0)) return null;
  const v = (area + rectAreaLoss(opt)) / side;
  return v > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// CIRCLE Ttr
// ---------------------------------------------------------------------------

type Locus = { k: 'line'; a: Vec2; d: Vec2 } | { k: 'circle'; c: Vec2; r: number };

/** 조각을 연장한 곡선(선 → 무한선, 호 → 원). 타원·스플라인은 null */
function carrier(p: Piece): { k: 'line'; a: Vec2; d: Vec2 } | { k: 'circle'; c: Vec2; r: number } | null {
  if (p.k === 'line') {
    const l = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
    return l > 0 ? { k: 'line', a: p.a, d: { x: (p.b.x - p.a.x) / l, y: (p.b.y - p.a.y) / l } } : null;
  }
  if (p.k === 'arc') return { k: 'circle', c: p.c, r: p.r };
  return null;
}

/** 곡선에서 거리 r인 점의 자취(선 → 평행선 둘, 원 → 동심원) */
function loci(c: NonNullable<ReturnType<typeof carrier>>, r: number): Locus[] {
  if (c.k === 'line') {
    const n = { x: -c.d.y, y: c.d.x };
    return [
      { k: 'line', a: { x: c.a.x + n.x * r, y: c.a.y + n.y * r }, d: c.d },
      { k: 'line', a: { x: c.a.x - n.x * r, y: c.a.y - n.y * r }, d: c.d },
    ];
  }
  const out: Locus[] = [{ k: 'circle', c: c.c, r: c.r + r }];
  if (Math.abs(c.r - r) > 1e-12) out.push({ k: 'circle', c: c.c, r: Math.abs(c.r - r) });
  return out;
}

function meet(A: Locus, B: Locus): Vec2[] {
  if (A.k === 'line' && B.k === 'line') {
    const den = A.d.x * B.d.y - A.d.y * B.d.x;
    if (Math.abs(den) < 1e-12) return [];
    const t = ((B.a.x - A.a.x) * B.d.y - (B.a.y - A.a.y) * B.d.x) / den;
    return [{ x: A.a.x + A.d.x * t, y: A.a.y + A.d.y * t }];
  }
  if (A.k === 'circle' && B.k === 'line') return meet(B, A);
  if (A.k === 'line' && B.k === 'circle') {
    const fx = A.a.x - B.c.x;
    const fy = A.a.y - B.c.y;
    const b = fx * A.d.x + fy * A.d.y;
    const c = fx * fx + fy * fy - B.r * B.r;
    const disc = b * b - c;
    if (disc < -1e-12 * Math.max(1, B.r * B.r)) return [];
    const s = Math.sqrt(Math.max(0, disc));
    return [-b - s, -b + s].map((t) => ({ x: A.a.x + A.d.x * t, y: A.a.y + A.d.y * t }));
  }
  if (A.k === 'circle' && B.k === 'circle') {
    const d = dist(A.c, B.c);
    if (d < 1e-12 || d > A.r + B.r + 1e-9 || d < Math.abs(A.r - B.r) - 1e-9) return [];
    const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
    const ux = (B.c.x - A.c.x) / d;
    const uy = (B.c.y - A.c.y) / d;
    const mx = A.c.x + ux * a;
    const my = A.c.y + uy * a;
    return [
      { x: mx - uy * h, y: my + ux * h },
      { x: mx + uy * h, y: my - ux * h },
    ];
  }
  return [];
}

/**
 * 두 곡선(선·호 조각, 연장해서 본다)에 접하는 반지름 r의 원. 해가 여럿이면 접점이 고른 점에 가장 가까운 것(AutoCAD와 같다).
 * 해가 없으면 null.
 */
export function circleTTR(p1: Piece, pick1: Vec2, p2: Piece, pick2: Vec2, r: number): { c: Vec2; r: number } | null {
  if (!(r > 0)) return null;
  return solveWithCurves(
    [
      { piece: p1, pick: pick1 },
      { piece: p2, pick: pick2 },
    ],
    (its) => {
      const [a, b] = its as { piece: Piece; pick: Vec2 }[];
      return ttrAnalytic(a!.piece, a!.pick, b!.piece, b!.pick, r);
    },
  );
}

function ttrAnalytic(p1: Piece, pick1: Vec2, p2: Piece, pick2: Vec2, r: number): { c: Vec2; r: number } | null {
  const c1 = carrier(p1);
  const c2 = carrier(p2);
  if (!c1 || !c2) return null;
  let best: { c: Vec2; score: number } | null = null;
  for (const A of loci(c1, r))
    for (const B of loci(c2, r))
      for (const c of meet(A, B)) {
        const t1 = pieceNearest(p1, c, false).p;
        const t2 = pieceNearest(p2, c, false).p;
        const score = dist(t1, pick1) + dist(t2, pick2);
        if (!best || score < best.score - 1e-12) best = { c, score };
      }
  return best ? { c: best.c, r } : null;
}

/** 원이 지나거나 접할 것: 점, 또는 접할 선·호 조각과 그 위의 고른 점 */
export type CircleItem = { point: Vec2 } | { piece: Piece; pick: Vec2 };

/**
 * 세 곡선(선·호 조각, 연장해서 본다)에 모두 접하는 원(아폴로니우스 문제 — AutoCAD 리본의 접선, 접선, 접선).
 * 해가 여럿이면 접점이 고른 점에 가장 가까운 것. 해가 없으면 null.
 */
export function circleTTT(picks: readonly { piece: Piece; pick: Vec2 }[]): { c: Vec2; r: number } | null {
  return circleThrough(picks);
}

/**
 * 세 가지(점은 지나고, 선·호 조각은 연장해서 접한다)를 모두 만족하는 원 — CIRCLE 3P의 점·지연된 접점, TTT.
 * 점은 반지름 0인 원으로 본다. 해가 여럿이면 접점이 고른 점에 가장 가까운 것. 해가 없으면 null.
 *
 * 미지수 u = (x, y, r). 선(단위 법선 n): n·(x, y) − n·a = s·r. 원(중심 c, 반지름 R): |(x, y) − c|² = (R + s·r)², s = ±1.
 * 원 식끼리 빼면 일차식이 되므로 일차식 둘 + 이차식 하나(원이 없으면 일차식 셋)로 푼다.
 */
export function circleThrough(items: readonly CircleItem[]): { c: Vec2; r: number } | null {
  if (items.length !== 3) return null;
  return solveWithCurves(items, throughAnalytic);
}

/**
 * 타원·타원호·스플라인(NURBS)이 든 원 문제: 곡선을 접할 자리의 곡률원(거의 곧으면 접선)으로 바꿔 해석적으로 풀고,
 * 그 원의 중심에서 곡선에 내린 수선의 발에서 곡률원을 다시 잡아 되풀이한다. 고정점에서는 원이 발에서 곡선과 같은 접선을
 * 가지므로(중심 → 발 = 곡선의 법선, 곡률원도 그 법선 위) 곡선에 접한다. 곡률원은 곡선과 2차까지 맞아 빨리 수렴한다.
 * 첫 바퀴는 고른 점에서, 다음부터는 앞 바퀴의 발에서 해를 고른다. 수렴하지 않거나 접점이 범위 밖(스플라인)이면 null.
 * 타원호는 원호처럼 연장해서(타원 전체) 본다. 곡선이 없으면 해석적 풀이 그대로.
 */
function solveWithCurves(items: readonly CircleItem[], solve: (items: readonly CircleItem[]) => { c: Vec2; r: number } | null): { c: Vec2; r: number } | null {
  const curved = items.map((it) => 'piece' in it && (it.piece.k === 'ell' || it.piece.k === 'nurbs'));
  if (!curved.some(Boolean)) return solve(items);
  const ts = items.map((it, i) => (curved[i] && 'piece' in it ? pieceNearest(it.piece, it.pick, it.piece.k !== 'ell').t : 0));
  let size = 1;
  for (const it of items) size = Math.max(size, Math.hypot('point' in it ? it.point.x : it.pick.x, 'point' in it ? it.point.y : it.pick.y));
  let prev: { c: Vec2; r: number } | null = null;
  for (let k = 0; k < 60; k++) {
    const approx = items.map((it, i): CircleItem => {
      if (!curved[i] || !('piece' in it)) return it;
      const foot = pieceAt(it.piece, ts[i]!);
      return { piece: osculatingPiece(it.piece, ts[i]!), pick: k === 0 ? it.pick : foot };
    });
    const s = solve(approx);
    if (!s) return null;
    items.forEach((it, i) => {
      if (curved[i] && 'piece' in it) ts[i] = footNear(it.piece, s.c, ts[i]!, it.piece.k === 'ell');
    });
    const done = prev && dist(prev.c, s.c) + Math.abs(prev.r - s.r) <= 1e-13 * Math.max(size, s.r);
    prev = s;
    if (done) break;
  }
  if (!prev) return null;
  // 곡선마다 발에서 접하는지(거리 = 반지름, 반지름 ⟂ 곡선)
  const tol = 1e-7 * Math.max(size, prev.r);
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!curved[i] || !('piece' in it)) continue;
    const pc = it.piece;
    const tt = ts[i]!;
    if (pc.k === 'nurbs' && (tt < -1e-9 || tt > 1 + 1e-9)) return null;
    const P = pieceAt(pc, tt);
    const D = pieceD1(pc, tt);
    const w = { x: P.x - prev.c.x, y: P.y - prev.c.y };
    const lw = Math.hypot(w.x, w.y);
    const ld = Math.hypot(D.x, D.y);
    if (Math.abs(lw - prev.r) > tol || !(ld > 0) || Math.abs(w.x * D.x + w.y * D.y) > 1e-7 * lw * ld) return null;
  }
  return prev;
}

function throughAnalytic(items: readonly CircleItem[]): { c: Vec2; r: number } | null {
  if (items.length !== 3) return null;
  const picks = items.map((it) => ('point' in it ? { pick: it.point } : { pick: it.pick }));
  const cs = items.map((it) => ('point' in it ? ({ k: 'circle', c: it.point, r: 0 } as const) : carrier(it.piece)));
  if (cs.some((c) => !c)) return null;
  const car = cs as NonNullable<ReturnType<typeof carrier>>[];
  const size = Math.max(1, ...picks.map((p) => Math.hypot(p.pick.x, p.pick.y)));
  let best: { c: Vec2; r: number; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const sg = [mask & 1 ? -1 : 1, mask & 2 ? -1 : 1, mask & 4 ? -1 : 1];
    const lin: number[][] = [];
    const quad: { cx: number; cy: number; R: number; s: number }[] = [];
    car.forEach((c, i) => {
      if (c.k === 'line') {
        const n = { x: -c.d.y, y: c.d.x };
        lin.push([n.x, n.y, -sg[i]!, n.x * c.a.x + n.y * c.a.y]);
      } else quad.push({ cx: c.c.x, cy: c.c.y, R: c.r, s: sg[i]! });
    });
    const q0 = quad[0];
    for (let j = 1; j < quad.length; j++) {
      const q = quad[j]!;
      const k0 = q0!.cx ** 2 + q0!.cy ** 2 - q0!.R ** 2;
      const kj = q.cx ** 2 + q.cy ** 2 - q.R ** 2;
      lin.push([2 * (q.cx - q0!.cx), 2 * (q.cy - q0!.cy), 2 * (q.s * q.R - q0!.s * q0!.R), kj - k0]);
    }
    const sols: [number, number, number][] = [];
    if (!q0) {
      const u = solve3(lin);
      if (u) sols.push(u);
    } else {
      const [A, B] = lin as [number[], number[]];
      // 두 평면의 교선 u = u0 + t·w (w = 법선의 외적, u0 = 최소 노름 해)
      const w = [A[1]! * B[2]! - A[2]! * B[1]!, A[2]! * B[0]! - A[0]! * B[2]!, A[0]! * B[1]! - A[1]! * B[0]!];
      const aa = A[0]! ** 2 + A[1]! ** 2 + A[2]! ** 2;
      const bb = B[0]! ** 2 + B[1]! ** 2 + B[2]! ** 2;
      const ab = A[0]! * B[0]! + A[1]! * B[1]! + A[2]! * B[2]!;
      const det = aa * bb - ab * ab;
      if (!(Math.abs(det) > 1e-18 * Math.max(1, aa * bb))) continue;
      const l1 = (A[3]! * bb - B[3]! * ab) / det;
      const l2 = (B[3]! * aa - A[3]! * ab) / det;
      const u0 = [0, 1, 2].map((i) => l1 * A[i]! + l2 * B[i]!);
      const g = [-2 * q0.cx, -2 * q0.cy, -2 * q0.s * q0.R];
      const k0 = q0.cx ** 2 + q0.cy ** 2 - q0.R ** 2;
      const qa = w[0]! ** 2 + w[1]! ** 2 - w[2]! ** 2;
      const qb = 2 * (u0[0]! * w[0]! + u0[1]! * w[1]! - u0[2]! * w[2]!) + g[0]! * w[0]! + g[1]! * w[1]! + g[2]! * w[2]!;
      const qc = u0[0]! ** 2 + u0[1]! ** 2 - u0[2]! ** 2 + g[0]! * u0[0]! + g[1]! * u0[1]! + g[2]! * u0[2]! + k0;
      const ts: number[] = [];
      if (Math.abs(qa) < 1e-14 * Math.max(1, Math.abs(qb), Math.abs(qc))) {
        if (Math.abs(qb) > 1e-18) ts.push(-qc / qb);
      } else {
        const disc = qb * qb - 4 * qa * qc;
        if (disc >= -1e-12 * Math.max(1, qb * qb)) {
          const sq = Math.sqrt(Math.max(0, disc));
          ts.push((-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa));
        }
      }
      for (const t of ts) sols.push([u0[0]! + t * w[0]!, u0[1]! + t * w[1]!, u0[2]! + t * w[2]!]);
    }
    for (const [x, y, r] of sols) {
      if (!(r > 1e-9 * size) || !Number.isFinite(x + y + r)) continue;
      const c = { x, y };
      let score = 0;
      let ok = true;
      car.forEach((cr, i) => {
        let tp: Vec2;
        if (cr.k === 'line') {
          const t = (x - cr.a.x) * cr.d.x + (y - cr.a.y) * cr.d.y;
          tp = { x: cr.a.x + cr.d.x * t, y: cr.a.y + cr.d.y * t };
        } else {
          const dd = dist(c, cr.c);
          const u = dd > 1e-12 ? { x: (x - cr.c.x) / dd, y: (y - cr.c.y) / dd } : { x: 1, y: 0 };
          const a = { x: cr.c.x + u.x * cr.r, y: cr.c.y + u.y * cr.r };
          const b = { x: cr.c.x - u.x * cr.r, y: cr.c.y - u.y * cr.r };
          tp = Math.abs(dist(a, c) - r) <= Math.abs(dist(b, c) - r) ? a : b;
        }
        if (Math.abs(dist(tp, c) - r) > 1e-6 * Math.max(size, r)) ok = false;
        score += dist(tp, picks[i]!.pick);
      });
      if (ok && (!best || score < best.score - 1e-12)) best = { c, r, score };
    }
  }
  return best ? { c: best.c, r: best.r } : null;
}

/** 3×3 일차 방정식 [a b c | d] 세 줄(크라메르). 특이하면 null */
function solve3(m: number[][]): [number, number, number] | null {
  if (m.length !== 3) return null;
  const D = (a: number[][]) => a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const base = m.map((r) => [r[0]!, r[1]!, r[2]!]);
  const d = D(base);
  if (!(Math.abs(d) > 1e-14)) return null;
  const col = (k: number) => D(base.map((r, i) => r.map((v, j) => (j === k ? m[i]![3]! : v))));
  return [col(0) / d, col(1) / d, col(2) / d];
}

// ---------------------------------------------------------------------------
// XLINE
// ---------------------------------------------------------------------------

/** 정점 v에서 시작점 a·끝점 b 사이 각도를 이등분하는 방향(라디안). 세 점이 겹치면 null */
export function bisectAngle(v: Vec2, a: Vec2, b: Vec2): number | null {
  if (dist(v, a) < 1e-12 || dist(v, b) < 1e-12) return null;
  const a0 = Math.atan2(a.y - v.y, a.x - v.x);
  const a1 = Math.atan2(b.y - v.y, b.x - v.x);
  return a0 + ccwSweep(a0, a1) / 2;
}

/** 선 조각(선·폴리선 직선 구간·구성선)을 거리 d만큼 side 쪽으로 옮긴 무한선의 기준점·방향 */
export function offsetLine(a: Vec2, b: Vec2, d: number, side: Vec2): { base: Vec2; dir: Vec2 } | null {
  const l = dist(a, b);
  if (!(l > 0)) return null;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const n = { x: -u.y, y: u.x };
  const s = (side.x - a.x) * n.x + (side.y - a.y) * n.y >= 0 ? 1 : -1;
  return { base: { x: a.x + n.x * d * s, y: a.y + n.y * d * s }, dir: u };
}

// ---------------------------------------------------------------------------
// PLINE 호 옵션: 볼록 값(시작점 → 끝점, 중심각 부호 = 방향)
// ---------------------------------------------------------------------------

export const bulgeOfSweep = (sw: number): number => Math.tan(sw / 4);

/** 중심과 끝점 방향으로 반시계(ccw = 거짓이면 시계) 호. 끝점은 반지름에 맞춘 점 */
export function arcByCenter(start: Vec2, c: Vec2, toward: Vec2, ccw = true): { end: Vec2; bulge: number } | null {
  const r = dist(start, c);
  if (!(r > 0)) return null;
  const a0 = Math.atan2(start.y - c.y, start.x - c.x);
  const a1 = Math.atan2(toward.y - c.y, toward.x - c.x);
  let sw = ccwSweep(a0, a1);
  if (!ccw) sw = sw - Math.PI * 2;
  if (Math.abs(sw) < 1e-12) return null;
  return { end: { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, bulge: bulgeOfSweep(sw) };
}

/** 중심과 중심각(부호 있는 라디안)으로 호 */
export function arcByCenterAngle(start: Vec2, c: Vec2, sw: number): { end: Vec2; bulge: number } | null {
  const r = dist(start, c);
  if (!(r > 0) || Math.abs(sw) < 1e-12) return null;
  const a1 = Math.atan2(start.y - c.y, start.x - c.x) + sw;
  return { end: { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, bulge: bulgeOfSweep(sw) };
}

/** 중심과 현의 길이(음수면 큰 호)로 호(반시계) */
export function arcByCenterChord(start: Vec2, c: Vec2, chord: number): { end: Vec2; bulge: number } | null {
  const r = dist(start, c);
  if (!(r > 0) || Math.abs(chord) > 2 * r + 1e-12 || chord === 0) return null;
  let sw = 2 * Math.asin(Math.min(1, Math.abs(chord) / (2 * r)));
  if (chord < 0) sw = Math.PI * 2 - sw;
  return arcByCenterAngle(start, c, sw);
}

/** 반지름·중심각·현 방향으로 호 */
export function arcByRadiusAngle(start: Vec2, r: number, sw: number, chordDir: number): { end: Vec2; bulge: number } | null {
  if (!(r > 0) || Math.abs(sw) < 1e-12) return null;
  const L = 2 * r * Math.sin(Math.abs(sw) / 2);
  return { end: { x: start.x + L * Math.cos(chordDir), y: start.y + L * Math.sin(chordDir) }, bulge: bulgeOfSweep(sw) };
}

/** 반지름과 끝점으로 호(작은 호, 반시계. 큰 호는 반지름을 음수로) */
export function arcByRadiusEnd(start: Vec2, r: number, end: Vec2): number | null {
  const L = dist(start, end);
  if (!(L > 0) || Math.abs(r) * 2 < L - 1e-12) return null;
  let sw = 2 * Math.asin(Math.min(1, L / (2 * Math.abs(r))));
  if (r < 0) sw = Math.PI * 2 - sw;
  return bulgeOfSweep(sw);
}

/**
 * 시작점 → 끝점과 볼록(+ 반시계, − 시계)으로 ARC 객체 값: 중심·반지름·반시계 시작각·끝각,
 * 그린 차례의 끝점과 그 접선 방향(이어 그리기). 만들 수 없으면 null
 */
export function arcFromBulge(s: Vec2, e: Vec2, bulge: number): { c: Vec2; r: number; a0: number; a1: number; end: Vec2; endDir: number } | null {
  const k = bulgeArc(s.x, s.y, e.x, e.y, bulge);
  if (!k || !(k.r > 0) || !Number.isFinite(k.r)) return null;
  const c = { x: k.cx, y: k.cy };
  const ae = Math.atan2(e.y - c.y, e.x - c.x);
  if (k.sweep > 0) return { c, r: k.r, a0: k.a0, a1: k.a0 + k.sweep, end: { ...e }, endDir: ae + Math.PI / 2 };
  return { c, r: k.r, a0: k.a0 + k.sweep, a1: k.a0, end: { ...e }, endDir: ae - Math.PI / 2 };
}

/** 시작 접선 방향(라디안)과 끝점으로 호의 볼록 */
export function arcByDirection(start: Vec2, dir: number, end: Vec2): number | null {
  if (!(dist(start, end) > 0)) return null;
  const chord = Math.atan2(end.y - start.y, end.x - start.x);
  const half = wrapPi(chord - dir);
  return Math.tan(half / 2);
}

// ---------------------------------------------------------------------------
// SPLINE
// ---------------------------------------------------------------------------

export type KnotParam = 'chord' | 'sqrt' | 'uniform';

const KNOT_PARAM: Record<KnotParam, number> = { chord: 0, sqrt: 1, uniform: 2 };
/** DXF 70: 맞춤점 방식(1024) + 매듭 매개변수 비트(AutoCAD SPLINE 맞춤 방식으로 그린 곡선과 같은 값) */
const FIT_FLAGS: Record<KnotParam, number> = { chord: 1024 | 32, sqrt: 1024 | 64, uniform: 1024 | 128 };

/**
 * 맞춤점 스플라인의 조정점·매듭(열린 곡선): AutoCAD와 같은 보간(fitSplineAcad — 매듭은 맞춤점 매개변수, 끝 접선이 있으면 그 끝의 도함수,
 * 없으면 자연 끝). 같은 맞춤점이면 AutoCAD가 같은 곡선을 만들어 DWG에 맞춤점 자료로 쓸 수 있다.
 */
export function fitSplineNurbs(fit: readonly Vec3[], knots: KnotParam = 'chord', startTangent?: Vec3, endTangent?: Vec3): { degree: number; knots: number[]; ctrl: Vec3[] } {
  return fitSplineAcad(fit, KNOT_PARAM[knots], startTangent, endTangent) ?? interpolateFitPoints(fit, startTangent, endTangent);
}

/** 맞춤점 스플라인 객체(닫기면 맞춤점을 지나는 주기 곡선 — SPLINEDIT 닫기와 같다) */
export function makeFitSpline(base: Omit<EntityBase, 'type' | 'handle'>, fit: readonly Vec3[], opt: { knots?: KnotParam; closed?: boolean; startTangent?: Vec3; endTangent?: Vec3; tolerance?: number } = {}): SplineEntity | null {
  if (fit.length < 2) return null;
  const s = fitSplineNurbs(fit, opt.knots, opt.closed ? undefined : opt.startTangent, opt.closed ? undefined : opt.endTangent);
  const e: SplineEntity = {
    ...base,
    type: 'SPLINE',
    handle: '',
    // 열린 곡선은 맞춤점 방식 비트(닫힌 맞춤점 곡선은 AutoCAD의 계산을 몰라 예전처럼)
    flags: opt.closed ? 8 : 8 | FIT_FLAGS[opt.knots ?? 'chord'],
    degree: s.degree,
    knots: s.knots,
    controlPoints: s.ctrl,
    fitPoints: fit.map((q) => ({ ...q })),
    knotTolerance: 1e-10,
    controlTolerance: 1e-10,
    fitTolerance: opt.tolerance && opt.tolerance > 0 ? opt.tolerance : 1e-10,
  };
  if (!opt.closed) {
    if (opt.startTangent) e.startTangent = { ...opt.startTangent };
    if (opt.endTangent) e.endTangent = { ...opt.endTangent };
    return e;
  }
  return closeSpline(e) ?? e;
}

/** 조정점(CV) 스플라인 객체(차수 degree, 고정 균일 매듭. 닫기면 주기 형태) */
export function makeCvSpline(base: Omit<EntityBase, 'type' | 'handle'>, ctrl: readonly Vec3[], degree: number, closed = false): SplineEntity | null {
  if (ctrl.length < 2) return null;
  const p = Math.max(1, Math.min(degree, ctrl.length - 1));
  const e: SplineEntity = {
    ...base,
    type: 'SPLINE',
    handle: '',
    flags: 8,
    degree: p,
    knots: clampedKnots(ctrl.length, p),
    controlPoints: ctrl.map((q) => ({ ...q })),
    fitPoints: [],
    knotTolerance: 1e-10,
    controlTolerance: 1e-10,
    fitTolerance: 1e-10,
  };
  if (!closed) return e;
  return ctrl.length >= 3 ? (closeSpline(e) ?? e) : e;
}

/**
 * 스플라인 맞춤 폴리선(PEDIT 스플라인) → 같은 곡선의 SPLINE(SPLINE 객체(O)): 틀 정점 = 조정점,
 * 2차·3차 균일 B 스플라인(열린 틀은 끝을 고정, 닫힌 틀은 주기). 스플라인 맞춤이 아니면 null.
 */
export function splineFromFitPolyline(e: Entity): SplineEntity | null {
  if (e.type !== 'POLYLINE' || !isPolyline(e) || fitKind(e) !== 'spline') return null;
  const vs = frameVerts(e);
  if (vs.length < 2) return null;
  const d3 = e.kind === '3d';
  const ctrl = vs.map((v) => ({ x: v.x, y: v.y, z: d3 ? v.z : e.elevation }));
  const degree = e.smoothType === 5 ? 2 : 3;
  const s = makeCvSpline(inherit(e), ctrl, degree, isClosed(e));
  if (s && d3 && ctrl.some((q) => Math.abs(q.z - ctrl[0]!.z) > 1e-12)) s.flags &= ~8;
  return s;
}

// ---------------------------------------------------------------------------
// ELLIPSE 호
// ---------------------------------------------------------------------------

/** 장축에서 잰 각도(라디안) → 타원 매개변수 */
export function ellipseAngleToParam(angle: number, ratio: number): number {
  return Math.atan2(Math.sin(angle) / ratio, Math.cos(angle));
}

/** 타원 매개변수 → 장축에서 잰 각도 */
export function ellipseParamToAngle(param: number, ratio: number): number {
  return Math.atan2(Math.sin(param) * ratio, Math.cos(param));
}
