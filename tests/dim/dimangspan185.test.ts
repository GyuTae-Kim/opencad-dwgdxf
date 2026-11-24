/**
 * 185차: 두 선 각도 치수의 재는 범위(`angularSpan`)에서 꼭짓점이 선 밖일 때의 연장 사분면.
 * Autodesk DIMANGULAR 도움말 「선 선택」: 두 선의 교점이 각도 꼭짓점이고, 치수선이 재는 선과 만나지 않으면 보조선을 더하며, 호는 늘 180° 미만이다.
 * AutoCAD 2026 도움말 「About Creating Angular Dimensions」: 기준선·연속 각도 치수는 180° 이하다.
 * 고치기 전에는 `angularSpan`이 두 선 갈래의 반대쪽 반직선을 첫 두 반직선(대개 첫 선의 두 점)에서만 만들어, 둘째 선의 두 점이 꼭짓점 같은 쪽이면
 * 둘째 선의 연장 반직선이 없었다. 그 사분면에 치수 호를 두면 치수 그림의 값은 90°인데 범위는 180°로 잡혀, DIMCONTINUE·DIMBASELINE이 엉뚱한 변에서
 * 180°보다 큰 각도를 이어 붙였다. 두 선이 꼭짓점에서 만나거나 첫 선만 꼭짓점에 닿는 꼴은 전과 같은 값이다(마지막 묶음 — 고치기 전 판에서도 통과).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createAngular2LineDimension, rawDimVars } from '../../src/edit/dim';
import { angularSpan } from '../../src/edit/dim/angular';
import { registerDimCommands } from '../../src/app/dimcmds';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { line } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });
const TAU = 2 * Math.PI;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const R3 = 3 * Math.SQRT2;

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');

describe('angularSpan 두 선 — 재는 범위가 치수 그림의 값과 같다', () => {
  // 첫 선은 +X 위, 둘째 선은 각도 th 방향 위. 각 선이 꼭짓점에 닿음(touch)·꼭짓점 밖(off)·꼭짓점을 지남(cross)
  const seg = (h: number, kind: 'touch' | 'off' | 'cross', flip: boolean): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] => {
    const [t0, t1] = kind === 'touch' ? [0, 10] : kind === 'off' ? [5, 10] : [-5, 10];
    const a = V(t0 * Math.cos(h), t0 * Math.sin(h));
    const b = V(t1 * Math.cos(h), t1 * Math.sin(h));
    return flip ? [b, a] : [a, b];
  };
  const kinds = ['touch', 'off', 'cross'] as const;
  for (const k1 of kinds)
    for (const k2 of kinds)
      it(`첫 선 ${k1} · 둘째 선 ${k2}: 네 사분면 모두 범위 = 값 < 180°`, () => {
        const bad: string[] = [];
        for (const th of [Math.PI / 2, Math.PI / 3])
          for (const flip of [false, true]) {
            // 네 사분면의 이등분선과 그 사분면의 크기
            const quads: [number, number][] = [
              [th / 2, th],
              [(th + Math.PI) / 2, Math.PI - th],
              [Math.PI + th / 2, th],
              [Math.PI + (th + Math.PI) / 2, Math.PI - th],
            ];
            for (const [g, size] of quads) {
              const [a1, b1] = seg(0, k1, flip);
              const [a2, b2] = seg(th, k2, flip);
              const d = createAngular2LineDimension(makeDoc(), a1, b1, a2, b2, V(3 * Math.cos(g), 3 * Math.sin(g)), { style: 'ISO-25' });
              const sp = angularSpan(d);
              const tag = `th=${((th * 180) / Math.PI).toFixed(0)} flip=${flip} g=${((g * 180) / Math.PI).toFixed(0)}`;
              // 치수 그림(angular)의 값은 고치기 전에도 그 사분면의 크기다
              if (Math.abs(d.measurement - size) > 1e-9) bad.push(`${tag} measurement=${d.measurement}`);
              if (!sp || Math.abs(sp.sweep - size) > 1e-9 || norm(g - sp.start) > sp.sweep + 1e-9) bad.push(`${tag} sweep=${sp?.sweep} start=${sp?.start}`);
              else if (Math.abs(sp.R - 3) > 1e-9 || !sp.forward) bad.push(`${tag} R=${sp.R} forward=${sp.forward}`);
            }
          }
        expect(bad).toEqual([]);
      });

  it('둘 다 꼭짓점 밖: (5, 0)-(10, 0)과 (0, 5)-(0, 10), 치수 호 (3, −3) → −Y에서 +X까지 90°', () => {
    const d = createAngular2LineDimension(makeDoc(), V(5, 0), V(10, 0), V(0, 5), V(0, 10), V(3, -3), { style: 'ISO-25' });
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    const sp = angularSpan(d)!;
    expect(sp.sweep).toBeCloseTo(Math.PI / 2, 9);
    expect(norm(sp.start)).toBeCloseTo((3 * Math.PI) / 2, 9);
    // 시작 변(둘째 선의 연장)에는 정의점이 없어 치수 호 위 점, 끝 변은 첫 선의 먼 끝점
    expect(sp.pStart.x).toBeCloseTo(0, 9);
    expect(sp.pStart.y).toBeCloseTo(-R3, 9);
    expect(sp.pEnd).toEqual({ x: 10, y: 0 });
  });
});

describe('DIMANGULAR로 만든 두 선 치수에서 DIMCONTINUE·DIMBASELINE', () => {
  const twoLines = async (l1: [number, number, number, number], l2: [number, number, number, number], at1: [number, number], at2: [number, number], arcAt: string) => {
    const h = harness();
    const a = h.add(line(...l1));
    const b = h.add(line(...l2));
    await h.run('DIMANGULAR', [{ pick: a.handle, at: at1 }, { pick: b.handle, at: at2 }, arcAt]);
    return h;
  };
  const step = (h: H, d: DimensionEntity) => {
    const raw = rawDimVars(h.doc, d) as Record<string, number>;
    return raw.DIMDLI * (raw.DIMSCALE > 0 ? raw.DIMSCALE : 1);
  };

  it('둘 다 꼭짓점 밖, 치수 호 (−3, −3): DIMCONTINUE (10, −10)은 −Y 변에서 45°', async () => {
    const h = await twoLines([5, 0, 10, 0], [0, 5, 0, 10], [7, 0], [0, 7], '-3,-3');
    await h.run('DIMCONTINUE', ['10,-10', '']);
    const [base, d] = dims(h);
    expect(dims(h).length).toBe(2);
    expect(base!.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(d!.dimType & 7).toBe(5);
    expect([d!.defPoint4.x, d!.defPoint4.y]).toEqual([0, 0]);
    expect(d!.defPoint2.x).toBeCloseTo(0, 9);
    expect(d!.defPoint2.y).toBeCloseTo(-R3, 9);
    expect(d!.measurement).toBeCloseTo(Math.PI / 4, 9);
    const sp = angularSpan(d!)!;
    expect(norm(sp.start)).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(sp.R).toBeCloseTo(R3, 9);
  });

  it('둘 다 꼭짓점 밖, 치수 호 (3, −3): DIMBASELINE (10, 10)은 −Y 변에서 135°, 한 칸 바깥', async () => {
    const h = await twoLines([5, 0, 10, 0], [0, 5, 0, 10], [7, 0], [0, 7], '3,-3');
    await h.run('DIMBASELINE', ['10,10', '']);
    const [base, d] = dims(h);
    expect(dims(h).length).toBe(2);
    expect(base!.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(d!.defPoint2.x).toBeCloseTo(0, 9);
    expect(d!.defPoint2.y).toBeCloseTo(-R3, 9);
    expect(d!.measurement).toBeCloseTo((3 * Math.PI) / 4, 9);
    const sp = angularSpan(d!)!;
    expect(norm(sp.start)).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(sp.R).toBeCloseTo(R3 + step(h, base!), 9);
  });

  it('첫 선만 꼭짓점 밖((5, 0)-(10, 0) 다음 (0, 0)-(0, 10)), 치수 호 (−3, −3): DIMCONTINUE (10, −10)은 −Y 변에서 45°', async () => {
    const h = await twoLines([5, 0, 10, 0], [0, 0, 0, 10], [7, 0], [0, 7], '-3,-3');
    await h.run('DIMCONTINUE', ['10,-10', '']);
    const [base, d] = dims(h);
    expect(base!.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(d!.defPoint2.x).toBeCloseTo(0, 9);
    expect(d!.defPoint2.y).toBeCloseTo(-R3, 9);
    expect(d!.measurement).toBeCloseTo(Math.PI / 4, 9);
  });

  describe('전과 같은 꼴(고치기 전 판에서도 통과)', () => {
    it('꼭짓점에서 만나는 두 선, 치수 호 (3, 3): DIMCONTINUE (−10, 0)은 둘째 선 끝점 (0, 10)에서 90°', async () => {
      const h = await twoLines([0, 0, 10, 0], [0, 0, 0, 10], [7, 0], [0, 7], '3,3');
      await h.run('DIMCONTINUE', ['-10,0', '']);
      const [base, d] = dims(h);
      expect(base!.measurement).toBeCloseTo(Math.PI / 2, 9);
      expect(d!.defPoint2).toEqual({ x: 0, y: 10, z: 0 });
      expect(d!.measurement).toBeCloseTo(Math.PI / 2, 9);
      expect(angularSpan(d!)!.R).toBeCloseTo(R3, 9);
    });
    it('꼭짓점에서 만나는 두 선, 치수 호 (3, 3): DIMBASELINE (−10, 0)은 첫 선 끝점 (10, 0)에서 180°', async () => {
      const h = await twoLines([0, 0, 10, 0], [0, 0, 0, 10], [7, 0], [0, 7], '3,3');
      await h.run('DIMBASELINE', ['-10,0', '']);
      const [base, d] = dims(h);
      expect(d!.defPoint2).toEqual({ x: 10, y: 0, z: 0 });
      expect(d!.measurement).toBeCloseTo(Math.PI, 9);
      expect(angularSpan(d!)!.R).toBeCloseTo(R3 + step(h, base!), 9);
    });
    it('첫 선이 꼭짓점에 닿고 둘째 선이 밖: 치수 호 (3, −3) → −Y에서 +X까지 90°, 정의점 그대로', () => {
      const d = createAngular2LineDimension(makeDoc(), V(0, 0), V(10, 0), V(0, 5), V(0, 10), V(3, -3), { style: 'ISO-25' });
      const sp = angularSpan(d)!;
      expect(sp.sweep).toBeCloseTo(Math.PI / 2, 9);
      expect(norm(sp.start)).toBeCloseTo((3 * Math.PI) / 2, 9);
      expect(sp.pEnd).toEqual({ x: 10, y: 0 });
    });
    it('꼭짓점에서 만나는 두 선의 네 사분면: 시작·범위·변의 점', () => {
      const cases: [number, number, number, { x: number; y: number }, { x: number; y: number }][] = [
        [3, 3, 0, { x: 10, y: 0 }, { x: 0, y: 10 }],
        [-3, 3, Math.PI / 2, { x: 0, y: 10 }, { x: -R3, y: 0 }],
        [-3, -3, Math.PI, { x: -R3, y: 0 }, { x: 0, y: -R3 }],
        [3, -3, (3 * Math.PI) / 2, { x: 0, y: -R3 }, { x: 10, y: 0 }],
      ];
      for (const [x, y, s, ps, pe] of cases) {
        const d = createAngular2LineDimension(makeDoc(), V(0, 0), V(10, 0), V(0, 0), V(0, 10), V(x, y), { style: 'ISO-25' });
        const sp = angularSpan(d)!;
        expect(sp.sweep).toBeCloseTo(Math.PI / 2, 9);
        expect(norm(sp.start)).toBeCloseTo(s, 9);
        expect(sp.pStart.x).toBeCloseTo(ps.x, 9);
        expect(sp.pStart.y).toBeCloseTo(ps.y, 9);
        expect(sp.pEnd.x).toBeCloseTo(pe.x, 9);
        expect(sp.pEnd.y).toBeCloseTo(pe.y, 9);
      }
    });
  });
});
