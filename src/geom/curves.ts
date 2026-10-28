/**
 * 곡선을 꺾은선으로 나눈다. 결과는 [x0, y0, x1, y1, …] 숫자 배열(로컬 좌표)이다.
 * tol은 현(chord)과 곡선 사이 최대 거리다.
 */
import type { Vec2, Vec3 } from '../core/model';

export const TAU = Math.PI * 2;

/** 반지름 r, 중심각 sweep인 호를 나눌 조각 수 */
export function arcSegments(r: number, sweep: number, tol: number): number {
  const s = Math.abs(sweep);
  if (!(r > 0) || !(s > 0)) return 1;
  let step: number;
  if (tol >= r) step = Math.PI / 2;
  else step = 2 * Math.acos(1 - tol / r);
  if (!(step > 0)) step = Math.PI / 64;
  const n = Math.ceil(s / step);
  const minN = Math.max(1, Math.ceil((s / TAU) * 8));
  return Math.min(Math.max(n, minN), Math.max(minN, Math.ceil((s / TAU) * 1024)));
}

/** a를 [0, 2π)로 */
export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** 반시계 방향 호 a0 → a1의 중심각(0 < sweep ≤ 2π) */
export function ccwSweep(a0: number, a1: number): number {
  let s = normAngle(a1) - normAngle(a0);
  if (s <= 1e-12) s += TAU;
  return s;
}

/** 반시계 호. includeStart가 거짓이면 첫 점을 뺀다. */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  sweep: number,
  tol: number,
  out: number[] = [],
  includeStart = true,
): number[] {
  const n = arcSegments(r, sweep, tol);
  for (let i = includeStart ? 0 : 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

export function circlePoints(cx: number, cy: number, r: number, tol: number, out: number[] = []): number[] {
  return arcPoints(cx, cy, r, 0, TAU, tol, out);
}

/** 타원(호): 장축 벡터(mx, my), 비율, 매개변수 p0 → p1(반시계) */
export function ellipsePoints(
  cx: number,
  cy: number,
  mx: number,
  my: number,
  ratio: number,
  p0: number,
  p1: number,
  tol: number,
  out: number[] = [],
  includeStart = true,
): number[] {
  const a = Math.hypot(mx, my);
  const ux = a ? mx / a : 1;
  const uy = a ? my / a : 0;
  // 단축 = 장축을 90° 돌린 것 × 비율
  const vx = -uy * a * ratio;
  const vy = ux * a * ratio;
  let sweep = p1 - p0;
  if (Math.abs(sweep - TAU) < 1e-9 || Math.abs(sweep) < 1e-12) sweep = TAU;
  else sweep = ccwSweep(p0, p1);
  const n = arcSegments(a, sweep, tol);
  for (let i = includeStart ? 0 : 1; i <= n; i++) {
    const t = p0 + (sweep * i) / n;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push(cx + mx * c + vx * s, cy + my * c + vy * s);
  }
  return out;
}

/** 볼록도(bulge)가 있는 선분을 나눈다. 끝점은 넣고 시작점은 넣지 않는다. */
export function bulgePoints(x0: number, y0: number, x1: number, y1: number, bulge: number, tol: number, out: number[]): void {
  if (Math.abs(bulge) < 1e-12) {
    out.push(x1, y1);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) {
    out.push(x1, y1);
    return;
  }
  const theta = 4 * Math.atan(bulge); // 중심각(부호 = 방향)
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  // 중심: 현 중점에서 수직으로
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const h = r * Math.cos(Math.abs(theta) / 2);
  const nx = -dy / chord;
  const ny = dx / chord;
  // bulge > 0이면 반시계, 중심은 진행 방향 왼쪽(h는 중심각이 π를 넘으면 음수가 되어 반대쪽)
  const side = bulge > 0 ? 1 : -1;
  const cx = mx + nx * h * side;
  const cy = my + ny * h * side;
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  const n = arcSegments(r, Math.abs(theta), tol);
  for (let i = 1; i <= n; i++) {
    const a = a0 + (theta * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  // 마지막 점은 정확한 끝점
  out[out.length - 2] = x1;
  out[out.length - 1] = y1;
}

export interface BulgeVertex {
  x: number;
  y: number;
  bulge: number;
}

export function bulgePolylinePoints(vs: readonly BulgeVertex[], closed: boolean, tol: number): number[] {
  const out: number[] = [];
  if (!vs.length) return out;
  out.push(vs[0]!.x, vs[0]!.y);
  const n = vs.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = vs[i]!;
    const b = vs[(i + 1) % n]!;
    bulgePoints(a.x, a.y, b.x, b.y, a.bulge, tol, out);
  }
  return out;
}

/** bulgePolylinePoints와 같다. 정점은 평탄 좌표 [x, y, 볼록, …] */
export function bulgeFlatPoints(vs: readonly number[], closed: boolean, tol: number): number[] {
  const out: number[] = [];
  const n = (vs.length / 3) | 0;
  if (!n) return out;
  out.push(vs[0]!, vs[1]!);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = i * 3;
    const b = ((i + 1) % n) * 3;
    bulgePoints(vs[a]!, vs[a + 1]!, vs[b]!, vs[b + 1]!, vs[a + 2]!, tol, out);
  }
  return out;
}

/** 볼록도 → 호 정의 */
export function bulgeArc(x0: number, y0: number, x1: number, y1: number, bulge: number): { cx: number; cy: number; r: number; a0: number; sweep: number } | null {
  if (Math.abs(bulge) < 1e-12) return null;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return null;
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const h = r * Math.cos(Math.abs(theta) / 2);
  const nx = -dy / chord;
  const ny = dx / chord;
  const side = bulge > 0 ? 1 : -1;
  const cx = mx + nx * h * side;
  const cy = my + ny * h * side;
  return { cx, cy, r, a0: Math.atan2(y0 - cy, x0 - cx), sweep: theta };
}

// ---------------------------------------------------------------------------
// NURBS
// ---------------------------------------------------------------------------

function findSpan(n: number, p: number, u: number, U: readonly number[]): number {
  if (u >= U[n + 1]!) return n;
  if (u <= U[p]!) return p;
  let lo = p;
  let hi = n + 1;
  let mid = (lo + hi) >> 1;
  while (u < U[mid]! || u >= U[mid + 1]!) {
    if (u < U[mid]!) hi = mid;
    else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}

/** de Boor로 한 점 계산(동차 좌표). ctrl은 [x, y, z, w]가 아니라 Vec3 + 가중치 */
function deBoor(p: number, U: readonly number[], P: readonly Vec3[], W: readonly number[] | undefined, u: number): Vec3 {
  const n = P.length - 1;
  const k = findSpan(n, p, u, U);
  const dx: number[] = [];
  const dy: number[] = [];
  const dz: number[] = [];
  const dw: number[] = [];
  for (let j = 0; j <= p; j++) {
    const idx = Math.min(Math.max(k - p + j, 0), n);
    const w = W ? W[idx]! : 1;
    const q = P[idx]!;
    dx.push(q.x * w);
    dy.push(q.y * w);
    dz.push(q.z * w);
    dw.push(w);
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1]! - U[i]!;
      const a = den === 0 ? 0 : (u - U[i]!) / den;
      dx[j] = (1 - a) * dx[j - 1]! + a * dx[j]!;
      dy[j] = (1 - a) * dy[j - 1]! + a * dy[j]!;
      dz[j] = (1 - a) * dz[j - 1]! + a * dz[j]!;
      dw[j] = (1 - a) * dw[j - 1]! + a * dw[j]!;
    }
  }
  const w = dw[p] || 1;
  return { x: dx[p]! / w, y: dy[p]! / w, z: dz[p]! / w };
}

/** NURBS 위의 한 점(매개변수 u는 매듭 범위로 자른다) */
export function nurbsPoint(degree: number, knots: readonly number[], ctrl: readonly Vec3[], weights: readonly number[] | undefined, u: number): Vec3 {
  const n = ctrl.length;
  const p = Math.max(1, Math.min(degree, n - 1));
  const U = knots.length === n + p + 1 ? knots : clampedKnots(n, p);
  return deBoor(p, U, ctrl, weights, Math.min(Math.max(u, U[p]!), U[n]!));
}

/** 균일 열린 매듭(맞춤 매듭이 없을 때) */
export function clampedKnots(nCtrl: number, degree: number): number[] {
  const m = nCtrl + degree + 1;
  const U: number[] = [];
  const inner = nCtrl - degree;
  for (let i = 0; i < m; i++) {
    if (i <= degree) U.push(0);
    else if (i >= nCtrl) U.push(inner);
    else U.push(i - degree);
  }
  return U;
}

/** NURBS를 나눈다. 결과는 3D 점 [x, y, z, …] */
export function nurbsPoints(degree: number, knots: readonly number[], ctrl: readonly Vec3[], weights: readonly number[] | undefined, tol: number): number[] {
  const out: number[] = [];
  const n = ctrl.length;
  if (n === 0) return out;
  if (n === 1) return [ctrl[0]!.x, ctrl[0]!.y, ctrl[0]!.z];
  const p = Math.max(1, Math.min(degree, n - 1));
  let U = knots;
  if (U.length !== n + p + 1) {
    U = clampedKnots(n, p);
  }
  if (p === 1 && !weights) {
    for (const q of ctrl) out.push(q.x, q.y, q.z);
    return out;
  }
  const u0 = U[p]!;
  const u1 = U[n]!;
  // 매듭 구간마다 조정점 다각형 길이로 나눌 수를 정한다.
  for (let s = p; s < n; s++) {
    const a = U[s]!;
    const b = U[s + 1]!;
    if (b <= a) continue;
    let len = 0;
    for (let j = s - p; j < s; j++) {
      const q0 = ctrl[Math.max(0, j)]!;
      const q1 = ctrl[Math.min(n - 1, j + 1)]!;
      len += Math.hypot(q1.x - q0.x, q1.y - q0.y, q1.z - q0.z);
    }
    const m = Math.min(64, Math.max(p === 2 ? 4 : 6, Math.ceil(Math.sqrt(len / Math.max(tol, 1e-12)) * 0.8)));
    const startI = out.length === 0 ? 0 : 1;
    for (let i = startI; i <= m; i++) {
      const u = a + ((b - a) * i) / m;
      const q = deBoor(p, U, ctrl, weights, Math.min(Math.max(u, u0), u1));
      out.push(q.x, q.y, q.z);
    }
  }
  return out;
}

/**
 * 맞춤점을 지나는 3차 B 스플라인의 조정점(전역 보간, 현 길이 매개변수).
 * 끝 접선이 주어지면 그 방향으로 맞춘다.
 */
export function interpolateFitPoints(fit: readonly Vec3[], startTangent?: Vec3, endTangent?: Vec3): { ctrl: Vec3[]; knots: number[]; degree: number } {
  const n = fit.length;
  if (n < 2) return { ctrl: [...fit], knots: [0, 0, 1, 1], degree: 1 };
  if (n === 2 && !startTangent && !endTangent) return { ctrl: [...fit], knots: [0, 0, 1, 1], degree: 1 };
  const p = Math.min(3, n - 1 + (startTangent ? 1 : 0) + (endTangent ? 1 : 0));
  // 현 길이 매개변수
  const d: number[] = [0];
  let total = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(fit[i]!.x - fit[i - 1]!.x, fit[i]!.y - fit[i - 1]!.y, fit[i]!.z - fit[i - 1]!.z);
    d.push(total);
  }
  const t = d.map((v) => (total > 0 ? v / total : 0));
  const hasS = !!startTangent;
  const hasE = !!endTangent;
  const m = n + (hasS ? 1 : 0) + (hasE ? 1 : 0); // 조정점 수
  // 매듭: 평균법(The NURBS Book 9.8)
  const params: number[] = [];
  if (hasS) params.push(t[0]!);
  params.push(...t);
  if (hasE) params.push(t[n - 1]!);
  const U: number[] = new Array(m + p + 1).fill(0);
  for (let i = 0; i <= p; i++) {
    U[i] = 0;
    U[m + i] = 1;
  }
  for (let j = 1; j < m - p; j++) {
    let s = 0;
    for (let i = j; i < j + p; i++) s += params[Math.min(i, params.length - 1)]!;
    U[j + p] = s / p;
  }
  // 행렬 A·P = 오른쪽
  const A: number[][] = [];
  const rhs: Vec3[] = [];
  const basis = (u: number): number[] => {
    const row = new Array(m).fill(0);
    const span = findSpan(m - 1, p, u, U);
    const N = basisFuns(span, u, p, U);
    for (let j = 0; j <= p; j++) row[span - p + j] = N[j];
    return row;
  };
  A.push(basis(t[0]!));
  rhs.push(fit[0]!);
  if (hasS) {
    const row = new Array(m).fill(0);
    const f = p / (U[p + 1]! || 1);
    row[0] = -f;
    row[1] = f;
    A.push(row);
    rhs.push(scaleV(startTangent!, total));
  }
  for (let i = 1; i < n - 1; i++) {
    A.push(basis(t[i]!));
    rhs.push(fit[i]!);
  }
  if (hasE) {
    const row = new Array(m).fill(0);
    const f = p / (1 - U[m - 1]! || 1);
    row[m - 2] = -f;
    row[m - 1] = f;
    A.push(row);
    rhs.push(scaleV(endTangent!, total));
  }
  A.push(basis(t[n - 1]!));
  rhs.push(fit[n - 1]!);
  const ctrl = solve(A, rhs);
  if (!ctrl) return { ctrl: [...fit], knots: clampedKnots(n, 1), degree: 1 };
  return { ctrl, knots: U, degree: p };
}

/**
 * AutoCAD의 맞춤점 스플라인(열린 곡선, 맞춤 공차 0)이 맞춤점 자료에서 만드는 조정점·매듭.
 * AutoCAD가 같은 도면을 DWG(맞춤점 자료만)와 DXF(조정점·매듭·맞춤점)로 쓴 짝으로 정했다:
 * - 3차, 조정점 = 맞춤점 + 2, 매듭 = [t0 ×4, t1 … t(n−2), t(n−1) ×4]. t는 맞춤점 매개변수를 정규화하지 않은 값
 *   (knotParam 0 현 길이 누적, 1 현 길이 제곱근 누적, 2 균일 0·1·2…).
 * - 끝 접선이 있으면 그 벡터(크기까지)가 그 끝의 1차 도함수, 없으면 그 끝의 2차 도함수가 0(자연 끝).
 * 맞춤점이 둘보다 적거나 이웃 맞춤점이 겹쳐(매개변수가 같아) 풀 수 없으면 null.
 */
export function fitSplineAcad(fit: readonly Vec3[], knotParam: number, startTangent?: Vec3, endTangent?: Vec3): { ctrl: Vec3[]; knots: number[]; degree: 3 } | null {
  const n = fit.length;
  if (n < 2) return null;
  const t: number[] = [0];
  for (let i = 1; i < n; i++) {
    const a = fit[i - 1]!;
    const b = fit[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const step = knotParam === 2 ? 1 : knotParam === 1 ? Math.sqrt(d) : d;
    if (!(step > 0) || !Number.isFinite(step)) return null;
    t.push(t[i - 1]! + step);
  }
  const T = t[n - 1]!;
  const U = [0, 0, 0, 0, ...t.slice(1, n - 1), T, T, T, T];
  const m = n + 1; // 마지막 조정점 번호
  const N = m + 1;
  // 세 줄 띠 행렬: dl[i] = A[i+1][i], d[i] = A[i][i], du[i] = A[i][i+1]
  const dl = new Float64Array(N - 1);
  const d = new Float64Array(N);
  const du = new Float64Array(N - 1);
  const bx = new Float64Array(N);
  const by = new Float64Array(N);
  const bz = new Float64Array(N);
  const rhs = (i: number, v: Vec3, s = 1) => {
    bx[i] = v.x * s;
    by[i] = v.y * s;
    bz[i] = v.z * s;
  };
  const has = (v?: Vec3): v is Vec3 => !!v && (v.x !== 0 || v.y !== 0 || v.z !== 0);
  // 첫 조정점 = 첫 맞춤점
  d[0] = 1;
  rhs(0, fit[0]!);
  // 시작 조건: P1 − P0 = 접선·(U4 − U1)/3, 또는 (P1 − P0)/(U4 − U1) = (P2 − P1)/(U5 − U2)
  const d1 = U[4]! - U[1]!;
  const d2 = U[5]! - U[2]!;
  if (has(startTangent)) {
    dl[0] = -1;
    d[1] = 1;
    rhs(1, startTangent, d1 / 3);
  } else {
    dl[0] = -1 / d1;
    d[1] = 1 / d1 + 1 / d2;
    du[1] = -1 / d2;
  }
  // 안쪽 맞춤점: 매듭 t_i에서 0이 아닌 기저 셋(조정점 i, i+1, i+2)
  for (let i = 1; i < n - 1; i++) {
    const r = i + 1;
    const B = basisFuns(i + 3, t[i]!, 3, U);
    dl[r - 1] = B[0]!;
    d[r] = B[1]!;
    du[r] = B[2]!;
    rhs(r, fit[i]!);
  }
  // 끝 조건: P_m − P_{m−1} = 접선·(U_{m+3} − U_m)/3, 또는 2차 도함수 0
  const e1 = U[m + 3]! - U[m]!;
  const e2 = U[m + 2]! - U[m - 1]!;
  if (has(endTangent)) {
    if (m - 2 >= 0) dl[m - 2] = 0;
    d[m - 1] = -1;
    du[m - 1] = 1;
    rhs(m - 1, endTangent, e1 / 3);
  } else {
    dl[m - 2] = 1 / e2;
    d[m - 1] = -(1 / e1 + 1 / e2);
    du[m - 1] = 1 / e1;
  }
  // 마지막 조정점 = 마지막 맞춤점
  d[m] = 1;
  rhs(m, fit[n - 1]!);
  if (!solveTridiagonal(dl, d, du, [bx, by, bz])) return null;
  const ctrl: Vec3[] = [];
  for (let i = 0; i < N; i++) ctrl.push({ x: bx[i]! || 0, y: by[i]! || 0, z: bz[i]! || 0 });
  // 양끝은 맞춤점 그대로(소거의 반올림 없이)
  ctrl[0] = { ...fit[0]! };
  ctrl[m] = { ...fit[n - 1]! };
  return { ctrl, knots: U, degree: 3 };
}

/** DXF 70의 매듭 매개변수 비트(32 현 길이·64 제곱근·128 균일) → 0·1·2(비트가 없으면 AutoCAD 기본 현 길이) */
export function knotParamOfFlags(flags: number): number {
  return flags & 128 ? 2 : flags & 64 ? 1 : 0;
}

/**
 * 조정점이 없는 맞춤점 스플라인의 곡선. 열린 곡선(맞춤 공차 0)은 AutoCAD가 맞춤점 자료에서 만드는 곡선(fitSplineAcad, 70의 매듭 매개변수 비트),
 * 닫힌 곡선·근사 공차는 전역 보간(AutoCAD의 계산을 모른다).
 */
export function fitPointsCurve(e: { fitPoints: readonly Vec3[]; flags: number; startTangent?: Vec3; endTangent?: Vec3; fitTolerance?: number }): { ctrl: Vec3[]; knots: number[]; degree: number } {
  if (!(e.flags & 1) && !((e.fitTolerance ?? 0) > 1e-9)) {
    const s = fitSplineAcad(e.fitPoints, knotParamOfFlags(e.flags), e.startTangent, e.endTangent);
    if (s) return s;
  }
  return interpolateFitPoints(e.fitPoints, e.startTangent, e.endTangent);
}

/**
 * 세 줄 띠 행렬 풀기(부분 피벗 — LAPACK dgtsv와 같은 차례). dl·d·du와 오른쪽 b를 덮어쓴다(dl은 피벗으로 생긴 둘째 위 띠로 쓴다).
 * 특이하면 false.
 */
function solveTridiagonal(dl: Float64Array, d: Float64Array, du: Float64Array, bs: Float64Array[]): boolean {
  const n = d.length;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]!) >= Math.abs(dl[i]!)) {
      if (d[i] === 0) return false;
      const f = dl[i]! / d[i]!;
      d[i + 1] = d[i + 1]! - f * du[i]!;
      for (const b of bs) b[i + 1] = b[i + 1]! - f * b[i]!;
      dl[i] = 0;
    } else {
      const f = d[i]! / dl[i]!;
      d[i] = dl[i]!;
      const tmp = d[i + 1]!;
      d[i + 1] = du[i]! - f * tmp;
      if (i < n - 2) {
        dl[i] = du[i + 1]!;
        du[i + 1] = -f * dl[i]!;
      } else dl[i] = 0;
      du[i] = tmp;
      for (const b of bs) {
        const tb = b[i]!;
        b[i] = b[i + 1]!;
        b[i + 1] = tb - f * b[i + 1]!;
      }
    }
  }
  if (!(Math.abs(d[n - 1]!) > 0)) return false;
  for (const b of bs) {
    b[n - 1] = b[n - 1]! / d[n - 1]!;
    if (n > 1) b[n - 2] = (b[n - 2]! - du[n - 2]! * b[n - 1]!) / d[n - 2]!;
    for (let i = n - 3; i >= 0; i--) b[i] = (b[i]! - du[i]! * b[i + 1]! - dl[i]! * b[i + 2]!) / d[i]!;
  }
  for (const b of bs) for (let i = 0; i < n; i++) if (!Number.isFinite(b[i]!)) return false;
  return true;
}

function scaleV(v: Vec3, s: number): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: (v.x / l) * s, y: (v.y / l) * s, z: (v.z / l) * s };
}

function basisFuns(i: number, u: number, p: number, U: readonly number[]): number[] {
  const N = new Array(p + 1).fill(0);
  const left = new Array(p + 1).fill(0);
  const right = new Array(p + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[i + 1 - j]!;
    right[j] = U[i + j]! - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const den = right[r + 1] + left[j - r];
      const temp = den === 0 ? 0 : N[r] / den;
      N[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    N[j] = saved;
  }
  return N;
}

/** 가우스 소거(작은 행렬용) */
function solve(A: number[][], b: Vec3[]): Vec3[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!.x, b[i]!.y, b[i]!.z]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const rowC = M[c]!;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const row = M[r]!;
      const f = row[c]! / rowC[c]!;
      if (f === 0) continue;
      for (let k = c; k < n + 3; k++) row[k] = row[k]! - f * rowC[k]!;
    }
  }
  return M.map((row, i) => ({ x: row[n]! / row[i]!, y: row[n + 1]! / row[i]!, z: row[n + 2]! / row[i]! }));
}

/** 2D 점 배열의 범위 */
export function boundsOf(pts: readonly number[], stride = 2): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += stride) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function v2(x: number, y: number): Vec2 {
  return { x, y };
}
