/**
 * 곡선에 한 점으로 닿는 경계(이중근)의 접원과 촘촘한 접점(10차).
 * - Ttr: 타원 맨 아래와 선 y = −5 사이가 3이면 반지름 1.5인 원은 타원 맨 아래 한 점과 선에 함께 닿는다(AutoCAD는 원을 그린다).
 *   곡률원으로 바꿔 풀면 그 근처의 곡률원은 모두 타원 안쪽에 들어 있어(타원 꼭짓점의 곡률원이 가장 크다) 닿는 해가 없다 —
 *   해석적 풀이가 없을 때 가장 가까이 가는 점으로 되풀이해 경계 해를 찾는다. 답은 정의(곡선까지 거리 = 반지름)로 확인한다.
 * - 점에서 스플라인에 그은 접선: 표본 간격보다 가까운 두 접점(부호가 바뀌지 않는 구간)도 극값으로 찾는다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity } from '../../src/core/model';
import { type Piece, pieceAt, pieceD1 } from '../../src/edit/geom/curve';
import { entityPath } from '../../src/edit/geom/path';
import { tangentsFromPoint } from '../../src/edit/geom/tangent';
import { circleTTR, circleTTT } from '../../src/edit/geom/drawgeom';
import { circle, ellipse, line, spline } from '../edit/make';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const piece = (e: Entity): Piece => entityPath(e)!.pieces[0]!;
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

/** 중심에서 곡선까지 최소 거리(촘촘한 표본 + 삼분 탐색) */
function minDist(pc: Piece, c: Pt): number {
  const N = 20000;
  let bi = 0;
  let bd = Infinity;
  const at = (t: number) => d2(pieceAt(pc, t), c);
  for (let i = 0; i <= N; i++) {
    const d = at(i / N);
    if (d < bd) {
      bd = d;
      bi = i / N;
    }
  }
  let lo = bi - 1 / N;
  let hi = bi + 1 / N;
  for (let k = 0; k < 100; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (at(m1) < at(m2)) hi = m2;
    else lo = m1;
  }
  return at((lo + hi) / 2);
}

describe('곡선에 한 점으로 닿는 경계의 접원', () => {
  const ell = piece(ellipse(0, 0, 4, 0, 0.5)); // 맨 아래 (0, −2)
  const low = piece(line(-20, -5, 20, -5));

  it('Ttr: 타원과 선 y = −5 사이 3, 반지름 1.5 → 타원 맨 아래와 선에 닿는 원 (0, −3.5)(전에는 해가 없다고 했다)', () => {
    for (const pick of [P(2, -1.7), P(-2, -1.7), P(0.3, -2)]) {
      const k = circleTTR(ell, pick, low, P(pick.x, -5), 1.5)!;
      expect(k, `${pick.x}`).not.toBeNull();
      expect(k.r).toBe(1.5);
      expect(k.c.x).toBeCloseTo(0, 6);
      expect(k.c.y).toBeCloseTo(-3.5, 9);
      expect(minDist(ell, k.c)).toBeCloseTo(1.5, 7);
    }
    // 반지름이 더 작으면 여전히 해가 없고, 더 크면 두 점에서 닿는 보통 해(예전과 같다)
    expect(circleTTR(ell, P(2, -1.7), low, P(2, -5), 1)).toBeNull();
    expect(circleTTR(ell, P(2, -1.7), low, P(2, -5), 1.4)).toBeNull();
    const big = circleTTR(ell, P(2, -1.7), low, P(2, -5), 2)!;
    expect(big.c.y).toBeCloseTo(-3, 9);
    expect(big.c.x).toBeGreaterThan(0.5);
  });

  it('Ttr: 타원과 원(위쪽 끝이 y = −5)도 같은 경계에서 닿는다, TTT의 보통 해는 그대로', () => {
    const cir = piece(circle(0, -8, 3));
    const k = circleTTR(ell, P(1, -1.9), cir, P(0.5, -5), 1.5)!;
    expect(k).not.toBeNull();
    expect(k.c.x).toBeCloseTo(0, 6);
    expect(k.c.y).toBeCloseTo(-3.5, 9);
    expect(minDist(ell, k.c)).toBeCloseTo(1.5, 7);
    expect(d2(k.c, P(0, -8))).toBeCloseTo(4.5, 9);
    const left = piece(line(-6, -10, -6, 10));
    const t = circleTTT([
      { piece: ell, pick: P(-3, -1.3) },
      { piece: low, pick: P(-5, -5) },
      { piece: left, pick: P(-6, -4) },
    ])!;
    expect(t.c.y + 5).toBeCloseTo(t.r, 9);
    expect(t.c.x + 6).toBeCloseTo(t.r, 9);
    expect(minDist(ell, t.c)).toBeCloseTo(t.r, 7);
  });
});

describe('점에서 스플라인에 그은 접선: 표본 간격보다 가까운 두 접점', () => {
  // 포물선 y = 2.5 − (x − 5)²/10 (2차 베지어, x = 10t). 꼭대기 근처 바로 위의 점에서 두 접점이 t ≈ 0.5048, 0.5112 —
  // 표본(1/64 간격) 한 칸 안에 함께 들어 부호가 바뀌지 않는다
  const pc = piece(spline([[0, 0], [5, 5], [10, 0]], 2));
  const xq = 5.08;
  const h = 1e-4;
  const q = P(xq, 2.5 - (xq - 5) ** 2 / 10 + h);

  it('두 접점을 모두 찾고, 접선 방향이 도함수와 나란하다', () => {
    const ts = tangentsFromPoint(pc, q).sort((a, b) => a.t - b.t);
    const want = [xq - Math.sqrt(10 * h), xq + Math.sqrt(10 * h)].map((x) => x / 10);
    expect(ts.length).toBe(2);
    ts.forEach((s, i) => {
      expect(s.t).toBeCloseTo(want[i]!, 9);
      const D = pieceD1(pc, s.t);
      expect(Math.abs(cross(D, { x: s.p.x - q.x, y: s.p.y - q.y })) / (Math.hypot(D.x, D.y) * d2(s.p, q))).toBeLessThan(1e-9);
    });
  });

  it('곡선 바로 아래(안쪽)의 점은 접점이 없다', () => {
    expect(tangentsFromPoint(pc, P(xq, 2.5 - (xq - 5) ** 2 / 10 - h))).toEqual([]);
  });
});
