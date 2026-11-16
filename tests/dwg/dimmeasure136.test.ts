/**
 * 실제 측정값이 없는 치수(136차): R2000 전 DWG에는 치수의 실제 측정값(DXF 42) 칸이 없다 — AutoCAD가 같은 도면을 쓴 R13·R14 DXF에도 42가 없다.
 * 전에는 R13·R14 DWG 리더가 0으로 두어 특성 창 측정값·표시 문자가 0이었고, R2000+ DWG로 저장하면 0을(DXF에서 읽은 것은 NaN 비트를) 썼다.
 * 이제는 DXF·R12 리더처럼 없음(NaN)으로 읽고, 표시·R2000+ DWG 저장은 정의점으로 잰다(edit/geom/dimmeasure.ts — 실제 도면의 AutoCAD 값과 같은 셈).
 * 이 앱은 R13·R14 DWG를 쓰지 못해(R2000으로 쓴다) 읽기는 표본 도면(CAD_FIXTURES — AutoCAD가 같은 도면을 R14·R2000으로 쓴 것)으로 본다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import {
  createAlignedDimension,
  createAngular2LineDimension,
  createAngularDimension,
  createArcLengthDimension,
  createDiameterDimension,
  createLinearDimension,
  createOrdinateDimension,
  createRadialDimension,
} from '../../src/edit/dim';
import { dimGeomMeasurement } from '../../src/edit/geom/dimmeasure';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { dimDisplayText, dimMeasurement } from '../../src/app/inquiry';
import { FIXTURES } from '../oracle/ezdxf';
import { P, bench } from '../dimassoc/helpers';

/** 종류마다 치수 하나(측정값은 치수 생성기 값) */
function build(): { doc: CadDocument; dims: DimensionEntity[] } {
  const b = bench();
  const d = b.doc;
  const made = [
    createLinearDimension(d, P(0, 0), P(100, 30), P(50, 60), { rotation: Math.PI / 6 }),
    createAlignedDimension(d, P(0, 0), P(30, 40), P(10, 50)),
    createRadialDimension(d, P(200, 0), 25, Math.PI / 4),
    createDiameterDimension(d, P(300, 0), 20, P(300, 40)),
    createAngularDimension(d, P(0, 100), P(50, 100), P(0, 150), P(30, 130)),
    // 호 자리가 넓은 쪽(270°)
    createAngularDimension(d, P(0, 200), P(50, 200), P(0, 250), P(-30, 170)),
    // 두 선: 호 자리가 든 부채꼴(둔각·예각)
    createAngular2LineDimension(d, P(0, 400), P(50, 400), P(0, 400), P(-30, 440), P(10, 420)),
    createAngular2LineDimension(d, P(0, 500), P(50, 500), P(0, 500), P(-30, 540), P(-20, 505)),
    createOrdinateDimension(d, P(10, 5), P(15, 40)),
    createOrdinateDimension(d, P(10, 5), P(40, 5)),
    createArcLengthDimension(d, P(0, 600), 20, 0, Math.PI / 3, P(20, 620)),
  ];
  return { doc: d, dims: made.map((x) => b.addDim(x, [])) };
}

const dimsOf = (doc: CadDocument) => [...doc.entityIndex.values()].filter((e): e is DimensionEntity => e.type === 'DIMENSION');

describe('실제 측정값이 없는 치수(136차)', () => {
  it('정의점 셈이 치수 생성기 측정값과 같다(모든 종류)', () => {
    const { dims } = build();
    expect(dims).toHaveLength(11);
    for (const x of dims) {
      expect(Number.isFinite(x.measurement)).toBe(true);
      expect(dimGeomMeasurement({ ...x, measurement: NaN }), `${x.dimType} ${x.subtype ?? ''}`).toBeCloseTo(x.measurement, 9);
    }
    // 두 선 각도는 작은 쪽 각이 아니라 호 자리가 든 부채꼴, 세 점 각도는 호 자리 쪽(270°)
    expect(dims[6]!.measurement).toBeCloseTo(Math.atan2(40, -30), 12);
    expect(dims[7]!.measurement).toBeCloseTo(Math.PI - Math.atan2(40, -30), 12);
    expect(dims[5]!.measurement).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it('정렬 치수는 Z가 다른 원점도 평면 거리, 평행한 두 선 각도는 잴 수 없다', () => {
    const { dims } = build();
    expect(dimGeomMeasurement({ ...dims[1]!, defPoint2: P(0, 0, 1), measurement: NaN })).toBeCloseTo(50, 12);
    expect(dimGeomMeasurement({ ...dims[6]!, defPoint: P(-30, 400), measurement: NaN })).toBeNaN();
  });

  it('측정값이 없는 치수: 표시 측정값은 정의점으로 재고, R2000+ DWG에는 그 값을 쓴다(잴 수 없으면 0)', () => {
    const { doc, dims } = build();
    const want = new Map(dims.map((x) => [x.handle, x.measurement]));
    const live = dims.map((x) => doc.entityIndex.get(x.handle) as DimensionEntity);
    for (const x of live) x.measurement = NaN;
    for (const x of live) {
      expect(dimMeasurement(x)).toBeCloseTo(want.get(x.handle)!, 9);
      expect(dimDisplayText(doc, x).value).toBeCloseTo(want.get(x.handle)!, 9);
    }
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      const got = dimsOf(readDwg(writeDwg(doc, { version }).data));
      expect(got).toHaveLength(11);
      for (const r of got) expect(r.measurement, `${version} ${r.handle}`).toBeCloseTo(want.get(r.handle)!, 9);
    }
    // 평행한 두 선(잴 수 없음): NaN 비트가 아니라 0
    live[6]!.defPoint = P(-30, 400);
    const back = readDwg(writeDwg(doc, { version: 'AC1018' }).data);
    expect(dimsOf(back).find((x) => x.handle === live[6]!.handle)!.measurement).toBe(0);
  });

  const R14 = join(FIXTURES, 'samples', 'sample_AC1014.dwg');
  const R2000 = join(FIXTURES, 'samples', 'sample_AC1015.dwg');
  it.skipIf(!existsSync(R14) || !existsSync(R2000))('표본: R14 DWG 치수는 측정값 없음, 잰 값과 R2000으로 쓴 값은 AutoCAD가 같은 도면을 R2000으로 쓴 측정값과 같다', () => {
    const r14 = readDwg(new Uint8Array(readFileSync(R14)));
    const acad = new Map(dimsOf(readDwg(new Uint8Array(readFileSync(R2000)))).map((x) => [x.handle, x.measurement]));
    const got = dimsOf(r14);
    expect(got.length).toBeGreaterThan(5);
    for (const r of got) {
      expect(r.measurement, r.handle).toBeNaN();
      expect(dimMeasurement(r), r.handle).toBeCloseTo(acad.get(r.handle)!, 9);
    }
    const back = new Map(dimsOf(readDwg(writeDwg(r14, { version: 'AC1015' }).data)).map((x) => [x.handle, x.measurement]));
    for (const r of got) expect(back.get(r.handle), r.handle).toBeCloseTo(acad.get(r.handle)!, 9);
  });
});
