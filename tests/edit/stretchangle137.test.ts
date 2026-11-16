/**
 * 늘이기·그립이 다시 재는 각도 치수 측정값(137차): 편집 커널(edit/geom/stretch.ts moveDimPoint)은 두 선 각도를 두 선 사이 작은 쪽 각,
 * 세 점 각도를 작은 쪽 각으로 다시 쟀다. AutoCAD가 저장한 값은 두 선의 교점에서 호 자리(16)가 든 부채꼴, 세 점은 호 자리(10) 쪽이다
 * (136차 dimmeasure.ts — 실제 도면 두 선 각도 89개 중 36개가 작은 쪽 각과 다름). 앱 명령은 치수 생성기로 블록을 다시 만들며 값을 덮지만,
 * 생성기가 못 다루는 치수와 커널만 쓰는 쪽은 이 값이 남는다.
 */
import { describe, expect, it } from 'vitest';
import { createAngular2LineDimension, createAngularDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { moveDimPoint } from '../../src/edit/geom/stretch';
import { P, bench } from '../dimassoc/helpers';

describe('늘이기·그립의 각도 치수 측정값(137차)', () => {
  it('두 선 각도: 호 자리가 든 부채꼴의 각, 정의점을 옮겨도 치수 생성기 값과 같다', () => {
    const b = bench();
    const obtuse = Math.atan2(40, -30);
    const d = b.addDim(createAngular2LineDimension(b.doc, P(0, 400), P(50, 400), P(0, 400), P(-30, 440), P(10, 420)), []);
    expect(d.measurement).toBeCloseTo(obtuse, 12);
    expect(moveDimPoint(d, 'defPoint5', { x: 0, y: 0 }).measurement).toBeCloseTo(obtuse, 12);
    // 둘째 선의 끝을 옮긴다(교점·호 자리는 그대로)
    const m = moveDimPoint(d, 'defPoint4', { x: -10, y: 0 });
    expect(m.measurement).toBeCloseTo(generateDimensionGeometry(b.doc, m).measurement, 9);
    expect(m.measurement).toBeGreaterThan(Math.PI / 2);
    // 같은 두 선이라도 호 자리가 예각 쪽 부채꼴이면 예각(두 방향 13→14·15→10 사이 각은 둔각이다)
    const a = b.addDim(createAngular2LineDimension(b.doc, P(0, 500), P(50, 500), P(0, 500), P(-30, 540), P(-20, 505)), []);
    expect(a.measurement).toBeCloseTo(Math.PI - obtuse, 12);
    expect(moveDimPoint(a, 'defPoint5', { x: 0, y: 0 }).measurement).toBeCloseTo(Math.PI - obtuse, 12);
    const m2 = moveDimPoint(a, 'defPoint3', { x: 10, y: 5 });
    expect(m2.measurement).toBeCloseTo(generateDimensionGeometry(b.doc, m2).measurement, 9);
  });

  it('세 점 각도: 호 자리가 넓은 쪽이면 270°', () => {
    const b = bench();
    const d = b.addDim(createAngularDimension(b.doc, P(0, 200), P(50, 200), P(0, 250), P(-30, 170)), []);
    expect(d.measurement).toBeCloseTo((3 * Math.PI) / 2, 12);
    const m = moveDimPoint(d, 'defPoint3', { x: 0, y: 0 });
    expect(m.measurement).toBeCloseTo((3 * Math.PI) / 2, 12);
    const m2 = moveDimPoint(d, 'defPoint2', { x: 0, y: 50 });
    expect(m2.measurement).toBeCloseTo(generateDimensionGeometry(b.doc, m2).measurement, 9);
  });

  it('평행해진 두 선은 잴 수 없어 전처럼 두 방향 사이 각(유한)', () => {
    const b = bench();
    const d = b.addDim(createAngular2LineDimension(b.doc, P(0, 0), P(50, 0), P(0, 10), P(-30, 50), P(10, 20)), []);
    const m = moveDimPoint(d, 'defPoint4', { x: 30, y: 40 });
    expect(m.defPoint4).toEqual(P(30, 50));
    expect(Number.isFinite(m.measurement)).toBe(true);
  });
});
