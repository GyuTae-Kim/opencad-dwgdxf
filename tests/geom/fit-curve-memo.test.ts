/**
 * 41차: 객체 스냅이 맞춤점 곡선을 다시 풀어 블록 6개에서 스냅 1회가 5초 걸리던 결함.
 * 전역 보간은 점 수의 세제곱쯤 걸리므로 그리기 밖 호출자는 풀어 둔 곡선을 다시 쓴다(src/geom/curves.ts sharedFitCurve).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SnapPoint, entitySnaps } from '../../src/app/snap';
import type { CadDocument, SplineEntity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { fitPointsCurve, sharedFitCurve } from '../../src/geom/curves';
import { identity } from '../../src/geom/matrix';

const ring = (n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.cos((i * Math.PI * 2) / n) * 10, Math.sin((i * Math.PI * 2) / n) * 10, 0);
  return out;
};
const spline = (flags: number, fitVerts: number[]): SplineEntity => ({
  ...entityDefaults(),
  type: 'SPLINE',
  handle: '1F',
  flags,
  degree: 3,
  knots: [],
  controlVerts: [],
  fitVerts,
  knotTolerance: 1e-9,
  controlTolerance: 1e-9,
  fitTolerance: 0,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('풀어 둔 맞춤점 곡선', () => {
  it('값은 fitPointsCurve와 같고 같은 자료면 다시 풀지 않는다', () => {
    const e = spline(1, ring(40));
    const a = sharedFitCurve(e);
    expect(a).toEqual(fitPointsCurve(e));
    expect(sharedFitCurve(e)).toBe(a);
  });

  it('점을 제자리에서 고치면 다시 푼다', () => {
    const e = spline(1, ring(40));
    const a = sharedFitCurve(e);
    e.fitVerts[0]! += 1;
    const b = sharedFitCurve(e);
    expect(b).not.toBe(a);
    expect(b).toEqual(fitPointsCurve(e));
  });

  it('닫힘, 맞춤 공차, 끝 접선이 바뀌어도 다시 푼다', () => {
    const e = spline(0, ring(40));
    const a = sharedFitCurve(e);
    e.flags = 1;
    const closed = sharedFitCurve(e);
    expect(closed).not.toBe(a);
    e.fitTolerance = 0.5;
    const loose = sharedFitCurve(e);
    expect(loose).not.toBe(closed);
    e.startTangent = { x: 1, y: 0, z: 0 };
    const tangent = sharedFitCurve(e);
    expect(tangent).not.toBe(loose);
    expect(tangent).toEqual(fitPointsCurve(e));
    // 접선을 제자리에서 고쳐도 옛 곡선을 돌려주지 않는다
    e.startTangent.x = 2;
    const moved = sharedFitCurve(e);
    expect(moved).not.toBe(tangent);
    // 값이 같은 새 객체면 다시 풀지 않는다
    e.startTangent = { x: 2, y: 0, z: 0 };
    expect(sharedFitCurve(e)).toBe(moved);
  });
});

describe('객체 스냅', () => {
  const doc: CadDocument = createNewDocument('metric');
  const snaps = (e: SplineEntity) => {
    const out: SnapPoint[] = [];
    entitySnaps(doc, e, identity(), out);
    return out;
  };

  it('닫힌 맞춤점 스플라인은 곡선을 풀지 않는다(끝점이 없다)', () => {
    const e = spline(1, ring(40));
    const hypot = vi.spyOn(Math, 'hypot');
    const out = snaps(e);
    expect(hypot).not.toHaveBeenCalled();
    expect(out.map((p) => p.kind)).toEqual(new Array(40).fill('nod'));
  });

  it('열린 맞춤점 스플라인은 끝점과 맞춤점을 낸다', () => {
    const out = snaps(spline(0, ring(40)));
    expect(out.filter((p) => p.kind === 'end').length).toBe(2);
    expect(out.filter((p) => p.kind === 'nod').length).toBe(40);
    expect(out[0]!.x).toBeCloseTo(10, 6);
    expect(out[0]!.y).toBeCloseTo(0, 6);
  });

  it('곡선을 그릴 자료가 없으면 내지 않는다', () => {
    expect(snaps(spline(0, [1, 2, 3]))).toEqual([]);
  });
});
