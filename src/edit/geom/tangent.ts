/**
 * 곡선의 접선(평면도 WCS XY): 점에서 곡선에 그은 접선의 접점, 두 곡선의 공통 접선, 곡선 위 한 점의 곡률원.
 * - 원·호: 해석적(중심에서 잰 각).
 * - 타원·타원호: 아핀 변환으로 해석적 — 타원은 단위원의 아핀 상이고, 접함(한 점에서 만나고 방향이 같음)은 아핀 변환에서
 *   보존되므로 점을 단위원 좌표로 옮겨 단위원의 접점을 구하고 되돌린다.
 * - NURBS(스플라인): 매개변수 위의 근 찾기. f(t) = D1(t) × (P(t) − p)의 부호가 바뀌는 구간을 표본으로 가두고,
 *   그 안에서 뉴턴(f′ = D2 × (P − p))을 쓰되 구간을 벗어나면 이분법으로 바꾼다. 표본 한 칸 안에 두 근이 함께 들어 부호가 바뀌지 않는
 *   경우(점이 곡선에 아주 가까울 때)는 f′의 부호가 바뀌는 칸에서 f의 극값을 찾아, 극값에서 부호가 바뀌면 두 근, 0에 닿으면 이중근으로 본다.
 *   마지막에 잔차를 보고 접점이 아니면 버린다(곡선 위의 점 자신, 꺾인 매듭 등). 수렴하지 않으면 후보가 없다.
 * - 공통 접선(타원·스플라인이 낄 때): 미지수 (t1, t2)의 2차원 뉴턴. F1 = D1a × (Pb − Pa), F2 = D1a × D1b.
 *   두 곡선의 표본 격자에서 F가 작은 곳(이웃보다 작은 곳)들을 시작점으로 쓰고, 수렴한 해 중 접점이 찍은 자리에 가장 가까운 것.
 * 매개변수 t는 조각의 [0, 1](src/edit/geom/curve.ts). 완전한 원·타원은 주기로 감는다.
 */
import type { Vec2 } from '../../core/model';
import { type ArcPiece, type LinePiece, type Piece, pieceAt, pieceD1, pieceSize } from './curve';
import { TAU, ccwFrom, cross, dist } from './math';

/** d²P/dt² (NURBS는 1차 도함수의 중심 차분 — 뉴턴의 기울기·곡률원에만 쓰고, 해의 정확도는 P·D1의 잔차로 본다) */
export function pieceD2(p: Piece, t: number): Vec2 {
  switch (p.k) {
    case 'line':
      return { x: 0, y: 0 };
    case 'arc': {
      const a = p.a0 + p.sw * t;
      const k = p.r * p.sw * p.sw;
      return { x: -k * Math.cos(a), y: -k * Math.sin(a) };
    }
    case 'ell': {
      const th = p.t0 + p.dt * t;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const k = p.dt * p.dt;
      return { x: -(p.u.x * c + p.v.x * s) * k, y: -(p.u.y * c + p.v.y * s) * k };
    }
    case 'nurbs': {
      const h = 1e-6;
      const a = Math.max(0, t - h);
      const b = Math.min(1, t + h);
      const d0 = pieceD1(p, a);
      const d1 = pieceD1(p, b);
      return { x: (d1.x - d0.x) / (b - a), y: (d1.y - d0.y) / (b - a) };
    }
  }
}

/** 완전한 원·타원(매개변수를 감는다) */
export function piecePeriodic(p: Piece): boolean {
  return (p.k === 'arc' && Math.abs(p.sw) >= TAU - 1e-9) || (p.k === 'ell' && Math.abs(p.dt) >= TAU - 1e-9);
}

/** 각 a(원·타원의 각 매개변수)가 조각 범위 안이면 조각 매개변수 t, 아니면 null */
function angleParam(a0: number, sw: number, a: number): number | null {
  if (Math.abs(sw) >= TAU - 1e-9) return ccwFrom(a0, sw > 0 ? a : 2 * a0 - a) / TAU;
  const dd = sw > 0 ? ccwFrom(a0, a) : ccwFrom(a, a0);
  const s = Math.abs(sw);
  if (dd <= s + 1e-9 * Math.max(1, s)) return Math.min(1, dd / s);
  // 끝 바로 앞(반올림)
  if (TAU - dd <= 1e-9) return 0;
  return null;
}

/** 범위 안으로(주기면 감고, 아니면 [0, 1] 밖은 null) */
function inDomain(p: Piece, t: number, tol = 1e-9): number | null {
  if (piecePeriodic(p)) return ((t % 1) + 1) % 1;
  if (t < -tol || t > 1 + tol) return null;
  return Math.min(1, Math.max(0, t));
}

export interface CurvePoint {
  t: number;
  p: Vec2;
}

/** NURBS 표본 수: 매듭 구간마다 여럿(최소 64, 최대 cap) */
function nurbsSamples(p: Extract<Piece, { k: 'nurbs' }>, cap: number): number {
  const U = p.n.knots;
  const lo = Math.min(p.u0, p.u1);
  const hi = Math.max(p.u0, p.u1);
  let spans = 0;
  for (let i = 0; i + 1 < U.length; i++) if (U[i + 1]! > U[i]! && U[i + 1]! > lo && U[i]! < hi) spans++;
  return Math.min(cap, Math.max(64, spans * 12));
}

/**
 * 1차원 근: f가 [a, b]에서 부호를 바꿀 때 뉴턴·이분법 섞기(구간 안을 벗어나는 뉴턴 걸음은 이분법으로).
 * 늘 수렴하므로 결과의 뜻(접점인지)은 부르는 쪽이 잔차로 판정한다
 */
function bracketRoot(f: (t: number) => number, df: (t: number) => number, a: number, b: number, fa: number): number {
  let lo = a;
  let hi = b;
  let flo = fa;
  let t = (a + b) / 2;
  for (let i = 0; i < 100; i++) {
    const ft = f(t);
    if (ft === 0) return t;
    if (Math.sign(ft) === Math.sign(flo)) {
      lo = t;
      flo = ft;
    } else hi = t;
    if (hi - lo <= 1e-15) break;
    const d = df(t);
    let n = d !== 0 ? t - ft / d : NaN;
    if (!(n > lo && n < hi)) n = (lo + hi) / 2;
    if (Math.abs(n - t) <= 1e-16) return n;
    t = n;
  }
  return (lo + hi) / 2;
}

/**
 * 점 q에서 조각에 그은 접선의 접점들(조각 범위 안). 선은 없음. q가 원·타원 안이면 없음.
 * 원·호·타원은 해석적, NURBS는 근 찾기(잔차가 큰 근은 버린다)
 */
export function tangentsFromPoint(pc: Piece, q: Vec2): CurvePoint[] {
  const out: CurvePoint[] = [];
  switch (pc.k) {
    case 'line':
      return out;
    case 'arc': {
      const dx = q.x - pc.c.x;
      const dy = q.y - pc.c.y;
      const d = Math.hypot(dx, dy);
      if (!(pc.r > 0) || d <= pc.r * (1 + 1e-12)) return out;
      const th = Math.atan2(dy, dx);
      const ph = Math.acos(pc.r / d);
      for (const a of [th + ph, th - ph]) {
        const t = angleParam(pc.a0, pc.sw, a);
        if (t !== null) out.push({ t, p: { x: pc.c.x + pc.r * Math.cos(a), y: pc.c.y + pc.r * Math.sin(a) } });
      }
      return out;
    }
    case 'ell': {
      // 단위원 좌표: q = c + u·X + v·Y
      const det = pc.u.x * pc.v.y - pc.u.y * pc.v.x;
      const size = pieceSize(pc);
      if (!(Math.abs(det) > 1e-12 * size * size)) return out;
      const rx = q.x - pc.c.x;
      const ry = q.y - pc.c.y;
      const X = (rx * pc.v.y - ry * pc.v.x) / det;
      const Y = (pc.u.x * ry - pc.u.y * rx) / det;
      const d = Math.hypot(X, Y);
      if (d <= 1 + 1e-12) return out;
      const th = Math.atan2(Y, X);
      const ph = Math.acos(1 / d);
      for (const a of [th + ph, th - ph]) {
        const t = angleParam(pc.t0, pc.dt, a);
        if (t !== null) out.push({ t, p: pieceAt(pc, t) });
      }
      return out;
    }
    case 'nurbs': {
      const size = pieceSize(pc);
      const f = (t: number) => {
        const P = pieceAt(pc, t);
        return cross(pieceD1(pc, t), { x: P.x - q.x, y: P.y - q.y });
      };
      const df = (t: number) => {
        const P = pieceAt(pc, t);
        return cross(pieceD2(pc, t), { x: P.x - q.x, y: P.y - q.y });
      };
      // f′의 도함수(극값을 뉴턴으로 다듬을 때만 — 이분법으로 가둔다)
      const ddf = (t: number) => {
        const h = 1e-6;
        const a = Math.max(0, t - h);
        const b = Math.min(1, t + h);
        return (df(b) - df(a)) / (b - a);
      };
      const N = nurbsSamples(pc, 1024);
      let t0 = 0;
      let f0 = f(0);
      let g0 = df(0);
      const roots: number[] = [];
      for (let i = 1; i <= N; i++) {
        const t1 = i / N;
        const f1 = f(t1);
        const g1 = df(t1);
        if (f0 === 0) roots.push(t0);
        else if (f1 !== 0 && Math.sign(f0) !== Math.sign(f1)) roots.push(bracketRoot(f, df, t0, t1, f0));
        else if (f1 !== 0 && g0 !== 0 && g1 !== 0 && Math.sign(g0) !== Math.sign(g1)) {
          // 부호는 그대로인데 f가 이 칸 안에서 극값을 가진다: 극값에서 부호가 바뀌면 두 근, 아니면 극값 자신(이중근이면 잔차로 남는다)
          const tm = bracketRoot(df, ddf, t0, t1, g0);
          const fm = f(tm);
          if (fm !== 0 && Math.sign(fm) !== Math.sign(f0)) {
            roots.push(bracketRoot(f, df, t0, tm, f0));
            roots.push(bracketRoot(f, df, tm, t1, fm));
          } else roots.push(tm);
        }
        t0 = t1;
        f0 = f1;
        g0 = g1;
      }
      if (f0 === 0) roots.push(1);
      for (const t of roots) {
        const P = pieceAt(pc, t);
        const D = pieceD1(pc, t);
        const w = { x: P.x - q.x, y: P.y - q.y };
        const lw = Math.hypot(w.x, w.y);
        const ld = Math.hypot(D.x, D.y);
        // 곡선 위의 q 자신, 도함수가 0인 곳, 부호만 뛰는 꺾임(잔차가 큰 것)은 접점이 아니다
        if (lw <= 1e-9 * size || !(ld > 0) || Math.abs(cross(D, w)) > 1e-9 * lw * ld) continue;
        if (!out.some((o) => dist(o.p, P) <= 1e-9 * size)) out.push({ t, p: P });
      }
      return out;
    }
  }
}

/** 점 q에서 그은 접선의 접점 중 찍은 자리(pick)에 가장 가까운 것. 없으면 null */
export function tangentNearPick(pc: Piece, pick: Vec2, q: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  for (const s of tangentsFromPoint(pc, q)) if (!best || dist(s.p, pick) < dist(best, pick)) best = s.p;
  return best;
}

interface Sample {
  t: number;
  p: Vec2;
  /** 단위 접선 */
  d: Vec2;
}

function samples(pc: Piece): Sample[] {
  const N = pc.k === 'nurbs' ? nurbsSamples(pc, 256) : 72;
  const periodic = piecePeriodic(pc);
  const out: Sample[] = [];
  for (let i = 0; i <= (periodic ? N - 1 : N); i++) {
    const t = i / N;
    const D = pieceD1(pc, t);
    const l = Math.hypot(D.x, D.y);
    out.push({ t, p: pieceAt(pc, t), d: l > 0 ? { x: D.x / l, y: D.y / l } : { x: 0, y: 0 } });
  }
  return out;
}

/** 공통 접선 표본 잔차(작을수록 접선에 가깝다, 0~3) */
function tangentResidual(a: Sample, b: Sample): number {
  const w = { x: b.p.x - a.p.x, y: b.p.y - a.p.y };
  const l = Math.hypot(w.x, w.y);
  if (!(l > 0)) return Infinity;
  return Math.abs(cross(a.d, b.d)) + Math.abs(cross(a.d, { x: w.x / l, y: w.y / l })) + Math.abs(cross(b.d, { x: w.x / l, y: w.y / l }));
}

/** (t1, t2) 2차원 뉴턴. 수렴하면 범위 안의 (t1, t2), 아니면 null */
function newtonCommon(A: Piece, B: Piece, t1: number, t2: number, step: number, size: number): [number, number] | null {
  for (let i = 0; i < 60; i++) {
    const Pa = pieceAt(A, t1);
    const Pb = pieceAt(B, t2);
    const Da = pieceD1(A, t1);
    const Db = pieceD1(B, t2);
    const Ea = pieceD2(A, t1);
    const Eb = pieceD2(B, t2);
    const w = { x: Pb.x - Pa.x, y: Pb.y - Pa.y };
    const F1 = cross(Da, w);
    const F2 = cross(Da, Db);
    // ∂F1/∂t1 = Ea × w (Da × Da = 0), ∂F1/∂t2 = Da × Db, ∂F2/∂t1 = Ea × Db, ∂F2/∂t2 = Da × Eb
    const j11 = cross(Ea, w);
    const j12 = cross(Da, Db);
    const j21 = cross(Ea, Db);
    const j22 = cross(Da, Eb);
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || det === 0) return null;
    let d1 = (F1 * j22 - F2 * j12) / det;
    let d2 = (j11 * F2 - j21 * F1) / det;
    // 표본 간격 몇 칸보다 멀리 뛰지 않는다(다른 해로 건너가지 않게)
    const m = Math.max(Math.abs(d1), Math.abs(d2));
    if (m > step) {
      d1 *= step / m;
      d2 *= step / m;
    }
    t1 -= d1;
    t2 -= d2;
    if (!piecePeriodic(A) && (t1 < -0.05 || t1 > 1.05)) return null;
    if (!piecePeriodic(B) && (t2 < -0.05 || t2 > 1.05)) return null;
    if (Math.abs(d1) < 1e-14 && Math.abs(d2) < 1e-14) break;
  }
  const a = inDomain(A, t1);
  const b = inDomain(B, t2);
  if (a === null || b === null) return null;
  // 잔차(단위 방향)로 접선인지 본다
  const Pa = pieceAt(A, a);
  const Pb = pieceAt(B, b);
  const Da = pieceD1(A, a);
  const Db = pieceD1(B, b);
  const la = Math.hypot(Da.x, Da.y);
  const lb = Math.hypot(Db.x, Db.y);
  const w = { x: Pb.x - Pa.x, y: Pb.y - Pa.y };
  const lw = Math.hypot(w.x, w.y);
  if (!(la > 0 && lb > 0) || lw <= 1e-9 * size) return null;
  if (Math.abs(cross(Da, w)) > 1e-9 * la * lw || Math.abs(cross(Da, Db)) > 1e-9 * la * lb) return null;
  return [a, b];
}

/**
 * 두 곡선 조각(원·호·타원·타원호·NURBS)의 공통 접선. 두 접점이 조각 범위 안에 있고 찍은 자리에 가장 가까운 것.
 * 접선이 없거나(한 곡선이 다른 곡선 안) 뉴턴이 수렴하지 않으면 null.
 */
export function commonTangentCurves(A: Piece, pickA: Vec2, B: Piece, pickB: Vec2): [Vec2, Vec2] | null {
  if (A.k === 'line' || B.k === 'line') return null;
  const size = Math.max(pieceSize(A), pieceSize(B), dist(pieceAt(A, 0.5), pieceAt(B, 0.5)));
  const sa = samples(A);
  const sb = samples(B);
  const na = sa.length;
  const nb = sb.length;
  const pa = piecePeriodic(A);
  const pb = piecePeriodic(B);
  const R = new Float64Array(na * nb);
  for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) R[i * nb + j] = tangentResidual(sa[i]!, sb[j]!);
  // 이웃(주기면 감아서)보다 작은 곳이 시작점 후보
  const seeds: { i: number; j: number; r: number }[] = [];
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const r = R[i * nb + j]!;
      if (!(r < 0.6)) continue;
      let min = true;
      for (let di = -1; di <= 1 && min; di++)
        for (let dj = -1; dj <= 1 && min; dj++) {
          if (!di && !dj) continue;
          let ii = i + di;
          let jj = j + dj;
          if (pa) ii = (ii + na) % na;
          if (pb) jj = (jj + nb) % nb;
          if (ii < 0 || ii >= na || jj < 0 || jj >= nb) continue;
          if (R[ii * nb + jj]! < r) min = false;
        }
      if (min) seeds.push({ i, j, r });
    }
  seeds.sort((x, y) => x.r - y.r);
  const step = 3 / Math.min(na, nb);
  const sols: [Vec2, Vec2][] = [];
  for (const s of seeds.slice(0, 24)) {
    const res = newtonCommon(A, B, sa[s.i]!.t, sb[s.j]!.t, step, size);
    if (!res) continue;
    const T1 = pieceAt(A, res[0]);
    const T2 = pieceAt(B, res[1]);
    if (!sols.some(([u, v]) => dist(u, T1) <= 1e-9 * size && dist(v, T2) <= 1e-9 * size)) sols.push([T1, T2]);
  }
  let best: [Vec2, Vec2] | null = null;
  let bd = Infinity;
  for (const s of sols) {
    const d = dist(s[0], pickA) + dist(s[1], pickB);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** 곡선 위 매개변수 t의 곡률원(호 조각). 거의 곧으면 접선(선 조각) */
export function osculatingPiece(pc: Piece, t: number): ArcPiece | LinePiece {
  const P = pieceAt(pc, t);
  const D = pieceD1(pc, t);
  const E = pieceD2(pc, t);
  const l = Math.hypot(D.x, D.y);
  const size = pieceSize(pc);
  const k = l > 0 ? cross(D, E) / (l * l * l) : 0;
  if (!(Math.abs(k) * size > 1e-9)) return { k: 'line', a: P, b: { x: P.x + D.x, y: P.y + D.y }, inf0: true, inf1: true };
  const n = { x: -D.y / l, y: D.x / l };
  const r = 1 / Math.abs(k);
  const c = { x: P.x + (n.x * Math.sign(k)) * r, y: P.y + (n.y * Math.sign(k)) * r };
  return { k: 'arc', c, r, a0: Math.atan2(P.y - c.y, P.x - c.x), sw: TAU };
}

/**
 * 점 c에서 곡선에 내린 수선의 발(t0 근처 — 뉴턴, g(t) = (P − c)·D1). 주기면 감고, 아니면 [0, 1]에 묶는다.
 * 타원호는 연장한 타원에서(extend)
 */
export function footNear(pc: Piece, c: Vec2, t0: number, extend = false): number {
  const periodic = piecePeriodic(pc);
  // 연장한 타원호: 각 매개변수라 범위 밖 t도 타원 위(묶지 않는다)
  const free = periodic || (extend && pc.k === 'ell');
  let t = t0;
  for (let i = 0; i < 50; i++) {
    const P = pieceAt(pc, t);
    const D = pieceD1(pc, t);
    const E = pieceD2(pc, t);
    const w = { x: P.x - c.x, y: P.y - c.y };
    const g = w.x * D.x + w.y * D.y;
    const dg = D.x * D.x + D.y * D.y + w.x * E.x + w.y * E.y;
    // 극대(수선의 발 중 먼 쪽)로 가면 기울기만 따라 내려간다
    let dt = dg > 0 ? -g / dg : -Math.sign(g) * 0.01;
    if (Math.abs(dt) > 0.1) dt = 0.1 * Math.sign(dt);
    t += dt;
    if (!free) t = Math.min(1, Math.max(0, t));
    if (Math.abs(dt) < 1e-15) break;
  }
  return periodic ? ((t % 1) + 1) % 1 : t;
}
