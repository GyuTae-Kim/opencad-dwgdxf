/**
 * AutoCAD 방식 맞춤점 스플라인 보간(src/geom/curves.ts fitSplineAcad).
 * AutoCAD가 같은 도면을 DWG(맞춤점 자료)와 DXF(조정점·매듭)로 쓴 짝에서 정한 규칙을 정의로 확인한다(자료는 직접 만든 합성 점):
 * 3차, 조정점 = 맞춤점 + 2, 매듭 = 맞춤점 매개변수(현 길이 누적·제곱근 누적·1씩, 정규화하지 않음) 양끝 4겹,
 * 끝 접선이 있으면 그 벡터가 곧 그 끝의 1차 도함수, 없으면 2차 도함수 0(자연 끝).
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../src/core/model';
import { fitSplineAcad, nurbsPoint } from '../../src/geom/curves';

const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

/** 1·2차 도함수(끝, 차분이 아니라 조정점 식) */
function endDerivs(ctrl: Vec3[], U: number[], atEnd: boolean) {
  const m = ctrl.length - 1;
  const q = (i: number) => {
    const d = U[i + 4]! - U[i + 1]!;
    const v = sub(ctrl[i + 1]!, ctrl[i]!);
    return { x: (3 * v.x) / d, y: (3 * v.y) / d, z: (3 * v.z) / d };
  };
  if (!atEnd) return { d1: q(0), d2: sub(q(1), q(0)) };
  return { d1: q(m - 1), d2: sub(q(m - 1), q(m - 2)) };
}

describe('AutoCAD 방식 맞춤점 스플라인(fitSplineAcad)', () => {
  const fit = [P(0, 0), P(4, 3), P(10, 3), P(13, -1), P(20, 2)];

  it('현 길이: 매듭은 누적 현 길이(정규화 안 함), 조정점 n + 2, 맞춤점을 매듭에서 지나고 양끝 2차 도함수 0', () => {
    const s = fitSplineAcad(fit, 0)!;
    expect(s.degree).toBe(3);
    expect(s.ctrl.length).toBe(fit.length + 2);
    expect(s.knots.length).toBe(fit.length + 6);
    const t = [0];
    for (let i = 1; i < fit.length; i++) t.push(t[i - 1]! + len(sub(fit[i]!, fit[i - 1]!)));
    expect(s.knots.slice(0, 4)).toEqual([0, 0, 0, 0]);
    for (let i = 1; i < fit.length - 1; i++) expect(s.knots[i + 3]).toBeCloseTo(t[i]!, 12);
    for (let i = 0; i < 4; i++) expect(s.knots[fit.length + 2 + i]).toBeCloseTo(t[t.length - 1]!, 12);
    fit.forEach((f, i) => {
      const q = nurbsPoint(3, s.knots, s.ctrl, undefined, t[i]!);
      expect(len(sub(q, f))).toBeLessThan(1e-12);
    });
    expect(s.ctrl[0]).toEqual(fit[0]);
    expect(s.ctrl[s.ctrl.length - 1]).toEqual(fit[fit.length - 1]);
    expect(len(endDerivs(s.ctrl, s.knots, false).d2)).toBeLessThan(1e-12);
    expect(len(endDerivs(s.ctrl, s.knots, true).d2)).toBeLessThan(1e-12);
  });

  it('끝 접선은 크기까지 그대로 그 끝의 1차 도함수(단위 벡터로 바꾸지 않는다)', () => {
    const st = P(3, 8);
    const et = P(-1, 5);
    const s = fitSplineAcad(fit, 0, st, et)!;
    const a = endDerivs(s.ctrl, s.knots, false).d1;
    const b = endDerivs(s.ctrl, s.knots, true).d1;
    expect(len(sub(a, st))).toBeLessThan(1e-12);
    expect(len(sub(b, et))).toBeLessThan(1e-12);
    // 한쪽만 주면 다른 끝은 자연 끝
    const one = fitSplineAcad(fit, 0, st)!;
    expect(len(sub(endDerivs(one.ctrl, one.knots, false).d1, st))).toBeLessThan(1e-12);
    expect(len(endDerivs(one.ctrl, one.knots, true).d2)).toBeLessThan(1e-12);
  });

  it('두 맞춤점: 접선이 없으면 곧은 선(조정점 4개 고른 간격), 균일 매듭이면 [0, 1]과 조정점 = 끝 ± 접선/3', () => {
    const s = fitSplineAcad([P(1, 1), P(7, 4)], 0)!;
    expect(s.ctrl.length).toBe(4);
    expect(s.ctrl[1]!.x).toBeCloseTo(3, 12);
    expect(s.ctrl[1]!.y).toBeCloseTo(2, 12);
    expect(s.ctrl[2]!.x).toBeCloseTo(5, 12);
    const u = fitSplineAcad([P(1, 1), P(7, 4)], 2, P(6, 9), P(-3, 3))!;
    expect(u.knots).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(u.ctrl[1]).toEqual({ x: 3, y: 4, z: 0 });
    expect(u.ctrl[2]).toEqual({ x: 8, y: 3, z: 0 });
  });

  it('제곱근·균일 매개변수, 3D 점', () => {
    const f3 = [P(0, 0, 0), P(4, 0, 3), P(4, 9, 3), P(0, 9, 10)];
    const sq = fitSplineAcad(f3, 1)!;
    expect(sq.knots[4]).toBeCloseTo(Math.sqrt(5), 12);
    expect(sq.knots[5]).toBeCloseTo(Math.sqrt(5) + 3, 12);
    const un = fitSplineAcad(f3, 2)!;
    expect(un.knots).toEqual([0, 0, 0, 0, 1, 2, 3, 3, 3, 3]);
    for (const s of [sq, un]) {
      const ts = [s.knots[3]!, s.knots[4]!, s.knots[5]!, s.knots[6]!];
      f3.forEach((f, i) => expect(len(sub(nurbsPoint(3, s.knots, s.ctrl, undefined, ts[i]!), f))).toBeLessThan(1e-12));
    }
  });

  it('맞춤점이 겹치거나(현 길이 0) 하나뿐이면 null, 많은 점도 빨리 푼다', () => {
    expect(fitSplineAcad([P(0, 0), P(0, 0), P(5, 5)], 0)).toBeNull();
    expect(fitSplineAcad([P(0, 0)], 0)).toBeNull();
    const many = Array.from({ length: 5000 }, (_, i) => P(i, Math.sin(i / 7) * 10));
    const t0 = performance.now();
    const s = fitSplineAcad(many, 0)!;
    expect(performance.now() - t0).toBeLessThan(500);
    expect(s.ctrl.length).toBe(5002);
    const q = nurbsPoint(3, s.knots, s.ctrl, undefined, s.knots[2503]!);
    expect(len(sub(q, many[2500]!))).toBeLessThan(1e-9);
  });
});
