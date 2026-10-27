/**
 * 곡선의 접선(src/edit/geom/tangent.ts)과 타원·스플라인에 접하는 원(drawgeom circleTTR·circleTTT·circleThrough).
 * 답은 정의로 확인한다: 접점은 곡선 위에 있고, 접선 방향이 곡선의 도함수와 나란하다(외적 = 0).
 * 타원은 단위원 좌표로 옮겨 원점에서 접선까지 거리 = 1, 스플라인은 촘촘한 표본으로 따로 찾은 근과 맞춘다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/model';
import { type Piece, pieceAt, pieceD1 } from '../../src/edit/geom/curve';
import { entityPath } from '../../src/edit/geom/path';
import { commonTangentCurves, osculatingPiece, tangentNearPick, tangentsFromPoint } from '../../src/edit/geom/tangent';
import { circleTTR, circleTTT, circleThrough } from '../../src/edit/geom/drawgeom';
import { circle, ellipse, line, spline } from '../edit/make';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const piece = (e: Entity): Piece => entityPath(e)!.pieces[0]!;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 타원 조각의 단위원 좌표 */
function unit(pc: Extract<Piece, { k: 'ell' }>, q: Pt): Pt {
  const det = pc.u.x * pc.v.y - pc.u.y * pc.v.x;
  const rx = q.x - pc.c.x;
  const ry = q.y - pc.c.y;
  return { x: (rx * pc.v.y - ry * pc.v.x) / det, y: (pc.u.x * ry - pc.u.y * rx) / det };
}

/** 직선 ab가 타원에 접하는지: 단위원 좌표에서 원점까지 거리 1 */
function lineTouchesEllipse(pc: Extract<Piece, { k: 'ell' }>, a: Pt, b: Pt): number {
  const A = unit(pc, a);
  const B = unit(pc, b);
  return Math.abs(cross({ x: B.x - A.x, y: B.y - A.y }, { x: -A.x, y: -A.y })) / d2(A, B);
}

/** 원 중심 c에서 곡선까지의 최소 거리(촘촘한 표본 + 그 근처 삼분 탐색) */
function minDist(pc: Piece, c: Pt, extend = false): number {
  const N = 20000;
  let bi = 0;
  let bd = Infinity;
  const span = extend ? 4 : 1;
  const at = (t: number) => d2(pieceAt(pc, t), c);
  for (let i = 0; i <= N; i++) {
    const t = (extend ? -1.5 : 0) + (span * i) / N;
    const d = at(t);
    if (d < bd) {
      bd = d;
      bi = t;
    }
  }
  let lo = bi - span / N;
  let hi = bi + span / N;
  for (let k = 0; k < 100; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (at(m1) < at(m2)) hi = m2;
    else lo = m1;
  }
  return at((lo + hi) / 2);
}

describe('점에서 그은 접선의 접점', () => {
  it('타원 x²/16 + y²/4 = 1과 (8, 0): 극선 x = 2 위의 두 점, 안의 점은 없음', () => {
    const pc = piece(ellipse(0, 0, 4, 0, 0.5));
    const ts = tangentsFromPoint(pc, P(8, 0));
    expect(ts.length).toBe(2);
    for (const s of ts) {
      expect(s.p.x).toBeCloseTo(2, 12);
      expect(Math.abs(s.p.y)).toBeCloseTo(Math.sqrt(3), 12);
      expect(d2(pieceAt(pc, s.t), s.p)).toBeLessThan(1e-12);
    }
    expect(tangentsFromPoint(pc, P(1, 1))).toEqual([]);
  });

  it('기울어진 타원호: 범위 안의 접점만, 접선 방향 = 도함수', () => {
    // 중심 (10,5), 장축 (3,4), 비 0.4, 매개변수 0 → π(반쪽)
    const full = piece(ellipse(10, 5, 3, 4, 0.4));
    const half = piece(ellipse(10, 5, 3, 4, 0.4, 0, Math.PI));
    const q = P(20, 20);
    const all = tangentsFromPoint(full, q);
    expect(all.length).toBe(2);
    for (const s of all) {
      const D = pieceD1(full, s.t);
      expect(Math.abs(cross(D, { x: s.p.x - q.x, y: s.p.y - q.y })) / (Math.hypot(D.x, D.y) * d2(s.p, q))).toBeLessThan(1e-12);
      expect(Math.hypot(unit(full as Extract<Piece, { k: 'ell' }>, s.p).x, unit(full as Extract<Piece, { k: 'ell' }>, s.p).y)).toBeCloseTo(1, 12);
    }
    const some = tangentsFromPoint(half, q);
    expect(some.length).toBe(1);
    expect(all.some((s) => d2(s.p, some[0]!.p) < 1e-12)).toBe(true);
  });

  it('스플라인: 근 찾기의 접점이 촘촘한 표본으로 찾은 접점과 같다', () => {
    const pc = piece(spline([[0, 0], [5, 10], [10, -6], [15, 8], [20, 0]]));
    const q = P(10, 20);
    const ts = tangentsFromPoint(pc, q);
    // 따로: 20만 표본의 부호 바뀜
    const f = (t: number) => {
      const p = pieceAt(pc, t);
      return cross(pieceD1(pc, t), { x: p.x - q.x, y: p.y - q.y });
    };
    const ref: number[] = [];
    const N = 200000;
    for (let i = 0; i < N; i++) if (Math.sign(f(i / N)) !== Math.sign(f((i + 1) / N))) ref.push((i + 0.5) / N);
    expect(ts.length).toBe(ref.length);
    expect(ts.length).toBeGreaterThanOrEqual(2);
    for (const s of ts) {
      expect(ref.some((t) => Math.abs(t - s.t) < 2 / N)).toBe(true);
      const D = pieceD1(pc, s.t);
      expect(Math.abs(cross(D, { x: s.p.x - q.x, y: s.p.y - q.y })) / (Math.hypot(D.x, D.y) * d2(s.p, q))).toBeLessThan(1e-9);
    }
    // 찍은 자리에 가까운 것
    const near = tangentNearPick(pc, P(20, 0), q)!;
    expect(near.x).toBeGreaterThan(14);
  });

  it('스플라인 위의 점 자신은 접점이 아니다', () => {
    const pc = piece(spline([[0, 0], [5, 5], [10, 0]], 2));
    const on = pieceAt(pc, 0.3);
    expect(tangentsFromPoint(pc, on).every((s) => d2(s.p, on) > 1e-6)).toBe(true);
  });
});

describe('두 곡선의 공통 접선', () => {
  const ell = piece(ellipse(0, 0, 4, 0, 0.5)) as Extract<Piece, { k: 'ell' }>;
  const cir = piece(circle(20, 0, 3));

  it('타원과 원: 고른 자리 쪽(위·아래 바깥, 엇갈린 안쪽) 접선', () => {
    const cases: [Pt, Pt, (a: Pt, b: Pt) => boolean][] = [
      [P(0, 2), P(20, 3), (a, b) => a.y > 0 && b.y > 0],
      [P(0, -2), P(20, -3), (a, b) => a.y < 0 && b.y < 0],
      [P(0, 2), P(20, -3), (a, b) => a.y > 0 && b.y < 0],
    ];
    for (const [pa, pb, ok] of cases) {
      const t = commonTangentCurves(ell, pa, cir, pb)!;
      expect(t).not.toBeNull();
      expect(ok(t[0], t[1])).toBe(true);
      expect(lineTouchesEllipse(ell, t[0], t[1])).toBeCloseTo(1, 9);
      // 원 중심에서 접선까지 거리 = 반지름, 접점은 원 위
      const dir = { x: t[1].x - t[0].x, y: t[1].y - t[0].y };
      expect(Math.abs(cross(dir, { x: 20 - t[0].x, y: -t[0].y })) / Math.hypot(dir.x, dir.y)).toBeCloseTo(3, 9);
      expect(d2(t[1], P(20, 0))).toBeCloseTo(3, 9);
    }
  });

  it('두 타원, 한 타원이 다른 타원 안이면 없다', () => {
    const e2 = piece(ellipse(15, 6, 0, 3, 0.4)) as Extract<Piece, { k: 'ell' }>;
    const t = commonTangentCurves(ell, P(0, 2), e2, P(15, 9))!;
    expect(lineTouchesEllipse(ell, t[0], t[1])).toBeCloseTo(1, 9);
    expect(lineTouchesEllipse(e2, t[0], t[1])).toBeCloseTo(1, 9);
    const inner = piece(ellipse(0, 0, 2, 0, 0.5));
    expect(commonTangentCurves(ell, P(4, 0), inner, P(2, 0))).toBeNull();
  });

  it('스플라인과 원: 두 접점에서 접선 방향이 곡선과 나란하다', () => {
    const sp = piece(spline([[0, 0], [5, 10], [10, -6], [15, 8], [20, 0]]));
    const c = piece(circle(10, 20, 2));
    const t = commonTangentCurves(sp, P(4, 5), c, P(8, 20))!;
    expect(t).not.toBeNull();
    const dir = { x: t[1].x - t[0].x, y: t[1].y - t[0].y };
    expect(Math.abs(cross(dir, { x: 10 - t[0].x, y: 20 - t[0].y })) / Math.hypot(dir.x, dir.y)).toBeCloseTo(2, 9);
    // 스플라인 접점의 도함수
    let best = { t: 0, d: Infinity };
    for (let i = 0; i <= 20000; i++) {
      const d = d2(pieceAt(sp, i / 20000), t[0]);
      if (d < best.d) best = { t: i / 20000, d };
    }
    expect(best.d).toBeLessThan(1e-3);
    const D = pieceD1(sp, best.t);
    expect(Math.abs(cross(D, dir)) / (Math.hypot(D.x, D.y) * Math.hypot(dir.x, dir.y))).toBeLessThan(1e-3);
  });
});

describe('타원·스플라인에 접하는 원', () => {
  const ellE = ellipse(0, 0, 4, 0, 0.5);
  const ell = piece(ellE);
  const low = piece(line(-20, -5, 20, -5));

  it('Ttr: 타원과 선 y = −5에 접하는 반지름 1인 원', () => {
    const k = circleTTR(ell, P(2, -1.7), low, P(2, -5), 1)!;
    expect(k).not.toBeNull();
    expect(k.r).toBe(1);
    expect(k.c.y).toBeCloseTo(-4, 9);
    expect(k.c.x).toBeGreaterThan(0);
    expect(minDist(ell, k.c)).toBeCloseTo(1, 7);
    // 다른 쪽을 고르면 왼쪽 해
    const k2 = circleTTR(ell, P(-2, -1.7), low, P(-2, -5), 1)!;
    expect(k2.c.x).toBeCloseTo(-k.c.x, 9);
  });

  it('TTT: 타원과 두 선에 접하는 원, 3P: 두 점을 지나고 타원에 접하는 원', () => {
    const left = piece(line(-6, -10, -6, 10));
    const k = circleTTT([
      { piece: ell, pick: P(-3, -1.3) },
      { piece: low, pick: P(-5, -5) },
      { piece: left, pick: P(-6, -4) },
    ])!;
    expect(k).not.toBeNull();
    expect(k.c.y + 5).toBeCloseTo(k.r, 9);
    expect(k.c.x + 6).toBeCloseTo(k.r, 9);
    expect(minDist(ell, k.c)).toBeCloseTo(k.r, 7);
    const t = circleThrough([{ point: P(8, 0) }, { point: P(8, 6) }, { piece: ell, pick: P(3.5, 1) }])!;
    expect(d2(t.c, P(8, 0))).toBeCloseTo(t.r, 9);
    expect(d2(t.c, P(8, 6))).toBeCloseTo(t.r, 9);
    expect(minDist(ell, t.c)).toBeCloseTo(t.r, 7);
  });

  it('타원호는 연장해서(원호처럼), 스플라인은 범위 안에서만 접한다', () => {
    // 오른쪽 반만 있는 타원호(−90° → 90°)라도 왼쪽 아래 해가 있다
    const halfArc = piece(ellipse(0, 0, 4, 0, 0.5, -Math.PI / 2, Math.PI / 2));
    const k = circleTTR(halfArc, P(-2, -1.7), low, P(-2, -5), 1)!;
    expect(k.c.x).toBeLessThan(0);
    expect(minDist(halfArc, k.c, true)).toBeCloseTo(1, 7);
    // U자 베지어 스플라인(맨 아래 (0, −5))과 선 y = −8: 반지름 1.5인 원은 맨 아래에서 접한다
    const sp = piece(spline([[-10, 10], [-5, -10], [5, -10], [10, 10]]));
    const floor = piece(line(-20, -8, 20, -8));
    const s = circleTTR(sp, P(1, -4.9), floor, P(0, -8), 1.5)!;
    expect(s).not.toBeNull();
    expect(s.c.x).toBeCloseTo(0, 7);
    expect(s.c.y).toBeCloseTo(-6.5, 9);
    expect(minDist(sp, s.c)).toBeCloseTo(1.5, 7);
    // 닿을 수 없는 선(x = 30)이면 해가 없다(수렴하지 않으면 null)
    expect(circleTTR(sp, P(9, 5), piece(line(30, -20, 30, 20)), P(30, 0), 1)).toBeNull();
  });

  it('곡률원: 타원 꼭짓점의 곡률 반지름 b²/a, a²/b', () => {
    const o = osculatingPiece(ell, 0) as Extract<Piece, { k: 'arc' }>;
    expect(o.k).toBe('arc');
    expect(o.r).toBeCloseTo(1, 12);
    expect(o.c.x).toBeCloseTo(3, 12);
    const o2 = osculatingPiece(ell, 0.25) as Extract<Piece, { k: 'arc' }>;
    expect(o2.r).toBeCloseTo(8, 9);
    expect(o2.c.y).toBeCloseTo(-6, 9);
    expect(osculatingPiece(piece(spline([[0, 0], [5, 0], [10, 0]], 2)), 0.5).k).toBe('line');
  });
});
