/**
 * SPLINEDIT 계산: 닫기·열기, 맞춤 데이터(추가·삭제·이동·공차·소거), 정점(추가·이동·가중치), 폴리선으로 변환, 반전.
 *
 * - 맞춤점 스플라인(맞춤점 2개 이상)은 맞춤점을 고칠 때마다 곡선(조정점·매듭)을 다시 만든다:
 *   열린 곡선은 AutoCAD와 같은 3차 보간(70의 매듭 매개변수, 끝 접선이 있으면 그 끝의 도함수, 없으면 자연 끝 — fitSplineAcad),
 *   닫힌 곡선은 맞춤점을 지나는 주기 3차 곡선.
 * - 닫힌(주기) 조정점 스플라인: 조정점 n개 + 처음 차수 개 반복, 매듭 0 … n + 2·차수(고정되지 않음).
 * - 맞춤점 스플라인의 정점을 고치면 맞춤 데이터를 버리고 조정점 정의가 된다(AutoCAD와 같다).
 * 문서의 조정점·맞춤점은 평탄 좌표(src/core/flat3.ts) — 계산은 풀어 쓴 점으로 하고 결과를 되담는다.
 */
import type { SplineEntity, Vec2, Vec3 } from '../../core/model';
import { clampedKnots, fitSplineAcad, interpolateFitPoints, knotParamOfFlags } from '../../geom/curves';
import { pieceNearest } from './curve';
import { dist } from './math';
import { domain, elevateBezier, insertKnot, joinBeziers, joinNurbs, normalizeNurbs, periodicInterpolate, toBezier } from './nurbs';
import { cloneEntity, splineNurbs } from './path';
import { count3, ctrlCount, fitCount, pack3, splineCtrl, splineFit } from '../../core/flat3';
import { reverseSpline } from './query';

export function isFitSpline(e: SplineEntity): boolean {
  return fitCount(e) >= 2;
}

export function isSplineClosed(e: SplineEntity): boolean {
  return (e.flags & 1) !== 0;
}

/** 주기(닫힌) 조정점 형태인지: 끝의 차수 개 조정점이 처음과 같다 */
export function isPeriodicForm(e: SplineEntity): boolean {
  const p = e.degree;
  const n = ctrlCount(e);
  if (!(e.flags & 2) || n < 2 * p + 1) return false;
  const c = e.controlVerts;
  for (let i = 0; i < p; i++) {
    const a = i * 3;
    const b = (n - p + i) * 3;
    if (Math.hypot(c[a]! - c[b]!, c[a + 1]! - c[b + 1]!) > 1e-9 * Math.max(1, Math.abs(c[a]!), Math.abs(c[a + 1]!))) return false;
  }
  return true;
}

/** 맞춤점에서 곡선을 다시 만든다(닫힘·접선 반영) */
export function refit(e: SplineEntity): SplineEntity {
  const out = cloneEntity(e);
  const fit = splineFit(e);
  if (fit.length < 2) return out;
  if (isSplineClosed(e) && fit.length >= 3) {
    const c = periodicInterpolate(fit);
    if (c) {
      out.degree = c.degree;
      out.knots = c.knots;
      out.controlVerts = pack3(c.ctrl);
      delete out.weights;
      out.flags = (out.flags & ~4) | 1 | 2;
      delete out.startTangent;
      delete out.endTangent;
      return out;
    }
  }
  const s = fitSplineAcad(fit, knotParamOfFlags(e.flags), e.startTangent, e.endTangent) ?? interpolateFitPoints(fit, e.startTangent, e.endTangent);
  out.degree = s.degree;
  out.knots = s.knots;
  out.controlVerts = pack3(s.ctrl);
  delete out.weights;
  out.flags = out.flags & ~(1 | 2 | 4);
  return out;
}

/** 조정점 정의로 바꾼다(맞춤 데이터 소거) */
export function purgeFit(e: SplineEntity): SplineEntity {
  const out = cloneEntity(e);
  if (ctrlCount(out) < 2 && fitCount(e) >= 2) {
    const n = splineNurbs(e);
    if (n) {
      out.degree = n.degree;
      out.knots = n.knots;
      out.controlVerts = pack3(n.ctrl);
      if (n.weights) out.weights = n.weights;
    }
  }
  out.fitVerts = [];
  delete out.startTangent;
  delete out.endTangent;
  return out;
}

// ---------------------------------------------------------------------------
// 닫기·열기
// ---------------------------------------------------------------------------

export function closeSpline(e: SplineEntity): SplineEntity | null {
  if (isSplineClosed(e)) return null;
  if (isFitSpline(e)) {
    if (fitCount(e) < 3) return null;
    const x = cloneEntity(e);
    const fit = splineFit(x);
    // 마지막 맞춤점이 첫 점과 같으면(예전 방식) 뺀다
    if (dist(fit[0]!, fit[fit.length - 1]!) <= 1e-9) {
      fit.pop();
      x.fitVerts = pack3(fit);
    }
    if (fit.length < 3) return null;
    x.flags |= 1;
    delete x.startTangent;
    delete x.endTangent;
    return refit(x);
  }
  const n0 = splineNurbs(e);
  if (!n0 || n0.ctrl.length < 3) return null;
  const P = n0.ctrl.map((q) => ({ ...q }));
  // 끝 조정점이 첫 조정점과 같으면(끝이 닿은 곡선) 하나 뺀다
  if (P.length > 3 && dist(P[0]!, P[P.length - 1]!) <= 1e-9 * Math.max(1, Math.abs(P[0]!.x), Math.abs(P[0]!.y))) P.pop();
  const p = Math.min(n0.degree, P.length - 1);
  const out = cloneEntity(e);
  out.degree = p;
  out.controlVerts = pack3([...P, ...P.slice(0, p)]);
  out.knots = [];
  for (let i = 0, nk = count3(out.controlVerts) + p + 1; i < nk; i++) out.knots.push(i);
  if (n0.weights) out.weights = [...n0.weights.slice(0, P.length), ...n0.weights.slice(0, p)];
  else delete out.weights;
  out.flags |= 1 | 2;
  out.fitVerts = [];
  return out;
}

export function openSpline(e: SplineEntity): SplineEntity | null {
  if (!isSplineClosed(e)) return null;
  if (isFitSpline(e)) {
    const x = cloneEntity(e);
    x.flags &= ~(1 | 2);
    return refit(x);
  }
  const out = cloneEntity(e);
  const p = e.degree;
  if (isPeriodicForm(e)) {
    const n = ctrlCount(e) - p;
    out.controlVerts = e.controlVerts.slice(0, n * 3);
    if (e.weights) out.weights = e.weights.slice(0, n);
    out.degree = Math.min(p, n - 1);
    out.knots = clampedKnots(n, out.degree);
  }
  out.flags &= ~(1 | 2);
  return out;
}

// ---------------------------------------------------------------------------
// 맞춤 데이터
// ---------------------------------------------------------------------------

function withFit(e: SplineEntity, fit: Vec3[]): SplineEntity {
  const x = cloneEntity(e);
  x.fitVerts = pack3(fit);
  return refit(x);
}

/** i 다음(before면 앞)에 맞춤점 추가 */
export function fitAdd(e: SplineEntity, i: number, p: Vec2, before = false): SplineEntity | null {
  if (!isFitSpline(e) || i < 0 || i >= fitCount(e)) return null;
  const fit = splineFit(e);
  fit.splice(before ? i : i + 1, 0, { x: p.x, y: p.y, z: fit[i]!.z });
  return withFit(e, fit);
}

export function fitDelete(e: SplineEntity, i: number): SplineEntity | null {
  const min = isSplineClosed(e) ? 3 : 2;
  if (!isFitSpline(e) || fitCount(e) <= min || i < 0 || i >= fitCount(e)) return null;
  const fit = splineFit(e);
  fit.splice(i, 1);
  return withFit(e, fit);
}

export function fitMove(e: SplineEntity, i: number, p: Vec2): SplineEntity | null {
  if (!isFitSpline(e) || i < 0 || i >= fitCount(e)) return null;
  const fit = splineFit(e);
  fit[i] = { x: p.x, y: p.y, z: fit[i]!.z };
  return withFit(e, fit);
}

/** 맞춤 공차(값만 바꾼다 — 곡선은 맞춤점을 지난다) */
export function fitTolerance(e: SplineEntity, tol: number): SplineEntity | null {
  if (!isFitSpline(e) || !(tol >= 0)) return null;
  const x = cloneEntity(e);
  x.fitTolerance = tol;
  return x;
}

/** 시작·끝 접선(단위 방향). null이면 지운다(시스템 기본값) */
export function fitTangents(e: SplineEntity, start: Vec2 | null | undefined, end: Vec2 | null | undefined): SplineEntity | null {
  if (!isFitSpline(e) || isSplineClosed(e)) return null;
  const x = cloneEntity(e);
  const unit = (v: Vec2): Vec3 => {
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l, z: 0 };
  };
  if (start !== undefined) {
    if (start) x.startTangent = unit(start);
    else delete x.startTangent;
  }
  if (end !== undefined) {
    if (end) x.endTangent = unit(end);
    else delete x.endTangent;
  }
  return refit(x);
}

// ---------------------------------------------------------------------------
// 정점(조정점)
// ---------------------------------------------------------------------------

/** 편집할 조정점 수(주기 형태의 반복은 세지 않는다) */
export function cvCount(e: SplineEntity): number {
  const n = ctrlCount(e);
  return isPeriodicForm(e) ? n - e.degree : n;
}

function cvBase(e: SplineEntity): SplineEntity {
  return isFitSpline(e) || ctrlCount(e) < 2 ? purgeFit(e) : cloneEntity(e);
}

export function cvMove(e: SplineEntity, i: number, p: Vec2): SplineEntity | null {
  const x = cvBase(e);
  const n = ctrlCount(x);
  if (i < 0 || i >= cvCount(x)) return null;
  // 평탄 좌표의 x·y만 바꾼다(z는 그대로)
  const c = x.controlVerts;
  c[i * 3] = p.x;
  c[i * 3 + 1] = p.y;
  if (isPeriodicForm(e) && i < x.degree) {
    const j = (n - x.degree + i) * 3;
    c[j] = p.x;
    c[j + 1] = p.y;
    c[j + 2] = c[i * 3 + 2]!;
  }
  return x;
}

export function cvWeight(e: SplineEntity, i: number, w: number): SplineEntity | null {
  if (!(w > 0)) return null;
  const x = cvBase(e);
  const n = ctrlCount(x);
  if (i < 0 || i >= cvCount(x)) return null;
  const ws = x.weights && x.weights.length === n ? [...x.weights] : new Array<number>(n).fill(1);
  ws[i] = w;
  if (isPeriodicForm(e) && i < x.degree) ws[n - x.degree + i] = w;
  x.weights = ws;
  if (ws.some((v) => Math.abs(v - 1) > 1e-12)) x.flags |= 4;
  else {
    x.flags &= ~4;
    delete x.weights;
  }
  return x;
}

/** 곡선 위 q에 가장 가까운 매개변수에 매듭을 넣어 조정점을 하나 더한다(모양 유지, 주기 형태는 제외) */
export function cvAdd(e: SplineEntity, q: Vec2): SplineEntity | null {
  if (isPeriodicForm(e)) return null;
  const x = cvBase(e);
  const n = splineNurbs(x);
  if (!n) return null;
  const [a, b] = domain(n);
  const r = pieceNearest({ k: 'nurbs', n, u0: a, u1: b }, q, true);
  const u = a + (b - a) * r.t;
  if (!(u > a) || !(u < b)) return null;
  const m = normalizeNurbs(insertKnot(n, u, 1));
  if (m.ctrl.length === n.ctrl.length) return null;
  x.degree = m.degree;
  x.knots = m.knots;
  x.controlVerts = pack3(m.ctrl);
  if (m.weights) x.weights = m.weights;
  else delete x.weights;
  return x;
}

/**
 * 정점 편집 삭제(D): 조정점 i를 지운다(모양이 바뀐다 — AutoCAD와 같다). 열린 곡선은 고정 균일 매듭으로 다시,
 * 주기 형태는 남은 조정점으로 다시 닫는다. 조정점이 너무 적어지면 null.
 */
export function cvDelete(e: SplineEntity, i: number): SplineEntity | null {
  const x = cvBase(e);
  const p = x.degree;
  const periodic = isPeriodicForm(x);
  const xc = splineCtrl(x);
  const base = periodic ? xc.slice(0, xc.length - p) : xc;
  const w = x.weights && x.weights.length === xc.length ? (periodic ? x.weights.slice(0, base.length) : x.weights.slice()) : null;
  if (i < 0 || i >= base.length) return null;
  if (base.length - 1 < (periodic ? 3 : 2)) return null;
  base.splice(i, 1);
  w?.splice(i, 1);
  const out = cloneEntity(x);
  if (periodic) {
    const q = Math.min(p, base.length - 1);
    out.degree = q;
    out.controlVerts = pack3([...base, ...base.slice(0, q)]);
    out.knots = [];
    for (let k = 0, nk = count3(out.controlVerts) + q + 1; k < nk; k++) out.knots.push(k);
    if (w) out.weights = [...w, ...w.slice(0, q)];
    else delete out.weights;
    return out;
  }
  const q = Math.min(p, base.length - 1);
  out.degree = q;
  out.controlVerts = pack3(base);
  out.knots = clampedKnots(base.length, q);
  if (w) out.weights = w;
  else delete out.weights;
  return out;
}

/** 정점 편집 순서 올리기(E): 순서(차수 + 1)를 order로(모양 그대로, 조정점이 늘어난다). 지금보다 낮거나 26을 넘으면 null */
export function elevateOrder(e: SplineEntity, order: number): SplineEntity | null {
  const x = cvBase(e);
  const n = splineNurbs(x);
  if (!n) return null;
  const target = Math.round(order) - 1;
  if (target <= n.degree || target > 25) return null;
  const segs = toBezier(n).map((sg) => elevateBezier(sg, target - (sg.length - 1)));
  const m = joinBeziers(segs);
  if (!m) return null;
  const out = cloneEntity(x);
  out.degree = m.degree;
  out.knots = m.knots;
  out.controlVerts = pack3(m.ctrl);
  if (m.weights) {
    out.weights = m.weights;
    out.flags |= 4;
  } else {
    delete out.weights;
    out.flags &= ~4;
  }
  // 고정 매듭 곡선이 되므로 주기 표시는 뗀다(닫힘은 그대로)
  out.flags &= ~2;
  return out;
}

/**
 * 맞춤 데이터 꼬임(K): 곡선 위 q에 맞춤점을 넣고 그 점에서 접선이 끊기게(뾰족하게) 한다.
 * 맞춤 데이터는 꼬임을 담을 수 없어 결과는 조정점 정의(두 보간 곡선을 이은 것). 닫힌 곡선·맞춤점 스플라인이 아니면 null.
 */
export function fitKink(e: SplineEntity, q: Vec2): SplineEntity | null {
  if (!isFitSpline(e) || isSplineClosed(e)) return null;
  const n = splineNurbs(e);
  if (!n) return null;
  const [a, b] = domain(n);
  const piece = { k: 'nurbs' as const, n, u0: a, u1: b };
  const at = (p: Vec2) => pieceNearest(piece, p, true).t;
  const t = at(q);
  if (!(t > 1e-9) || !(t < 1 - 1e-9)) return null;
  const Q = pieceNearest(piece, q, true).p;
  const fit = splineFit(e);
  const ts = fit.map((f) => at(f));
  let i = ts.findIndex((v) => v > t);
  if (i < 0) i = fit.length;
  const z = fit[Math.max(0, i - 1)]!.z;
  const mid = { x: Q.x, y: Q.y, z };
  const left = [...fit.slice(0, i), mid];
  const right = [mid, ...fit.slice(i)];
  if (left.length < 2 || right.length < 2) return null;
  const kp = knotParamOfFlags(e.flags);
  const L = fitSplineAcad(left, kp, e.startTangent) ?? interpolateFitPoints(left, e.startTangent, undefined);
  const R = fitSplineAcad(right, kp, undefined, e.endTangent) ?? interpolateFitPoints(right, undefined, e.endTangent);
  const j = joinNurbs([
    { degree: L.degree, knots: L.knots, ctrl: L.ctrl },
    { degree: R.degree, knots: R.knots, ctrl: R.ctrl },
  ]);
  if (!j) return null;
  const out = cloneEntity(e);
  out.degree = j.degree;
  out.knots = j.knots;
  out.controlVerts = pack3(j.ctrl);
  delete out.weights;
  out.flags &= ~(1 | 2 | 4);
  out.fitVerts = [];
  delete out.startTangent;
  delete out.endTangent;
  return out;
}

export function reverseSplineEntity(e: SplineEntity): SplineEntity {
  return reverseSpline(e);
}
