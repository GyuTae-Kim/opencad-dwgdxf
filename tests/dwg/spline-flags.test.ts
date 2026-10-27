/**
 * SPLINE 플래그: DWG R2013+의 첫 값·플래그·매듭 매개변수 ↔ DXF 70(7차 실제 도면 훑기 — 자료는 직접 만든 합성 문서).
 * AutoCAD가 같은 도면을 DWG·DXF로 쓴 짝: 첫 값 1인 맞춤점 스플라인 = 1024 + 매듭 매개변수(32 현 길이·64 제곱근·128 균일), 닫힘은 1.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, SplineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';

let seq = 0x7b00;
const h = () => (seq++).toString(16).toUpperCase();
const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)!.entities;
const find = <T>(d: CadDocument, handle: string) => ms(d).find((e) => e.handle === handle) as T;
const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

function spline(flags: number, ctrl: Vec3[], fit: Vec3[]): SplineEntity {
  const n = ctrl.length;
  const knots = n ? [...Array(4).fill(0), ...Array.from({ length: n - 4 }, (_, i) => i + 1), ...Array(4).fill(n - 3)] : [];
  return { ...entityDefaults(), handle: h(), layer: '0', type: 'SPLINE', flags, degree: 3, knots, controlPoints: ctrl, fitPoints: fit, knotTolerance: 1e-10, controlTolerance: 1e-10, fitTolerance: 1e-10 };
}

describe('SPLINE 플래그(DWG R2013+ ↔ DXF 70)', () => {
  const fit = [P(0, 0), P(10, 5), P(20, 0), P(30, 5)];
  const ctrl = [P(0, 0), P(5, 5), P(10, 0), P(15, 5), P(20, 0)];
  const roundTrip = (e: SplineEntity, version: string) => {
    const doc = createNewDocument('metric');
    ms(doc).push(e);
    return find<SplineEntity>(readDwg(writeDwg(doc, { version: version as never }).data), e.handle);
  };

  it('맞춤점만 있는 스플라인(DXF 70 = 0): R2018 DWG에 1024·균일 매듭 비트가 생기지 않는다(전에는 1160 — 매듭 매개변수를 균일로 써서 AutoCAD에서 모양이 달라질 수 있었다)', () => {
    const back = roundTrip(spline(0, [], fit), 'AC1032');
    expect(back.flags & ~24).toBe(0);
    expect(back.fitPoints.length).toBe(4);
  });

  it('맞춤점 방식 비트(1024 + 현 길이 32 / 균일 128)는 맞춤점 스플라인으로 그대로 돈다', () => {
    for (const f of [1024 | 32 | 8, 1024 | 128 | 8, 1024 | 64]) {
      const back = roundTrip(spline(f, [], fit), 'AC1032');
      expect(back.flags & ~24, String(f)).toBe(f & ~24);
    }
  });

  it('닫힌 조정점 스플라인은 닫힘 1만(전에는 512가 붙었다), 조정점은 그대로', () => {
    const closed = [...ctrl, ctrl[0]!];
    for (const v of ['AC1015', 'AC1032']) {
      const back = roundTrip(spline(1 | 8, closed, []), v);
      expect(back.flags & ~24, v).toBe(1);
      expect(back.controlPoints.length).toBe(closed.length);
    }
  });

  it('조정점 스플라인은 높은 비트 없이(매듭 매개변수 사용자 지정)', () => {
    const back = roundTrip(spline(8, ctrl, []), 'AC1032');
    expect(back.flags & ~24).toBe(0);
    expect(back.controlPoints.length).toBe(5);
  });
});

