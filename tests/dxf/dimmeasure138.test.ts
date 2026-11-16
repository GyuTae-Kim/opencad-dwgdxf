/**
 * 측정값이 없는 치수의 DXF 42(138차): R2000 전 DWG·DXF에서 읽은 치수는 실제 측정값이 없다(NaN — 136차). AutoCAD는 R2000+ DXF에 42를 늘 적고,
 * 같은 도면을 AutoCAD가 R13·R14와 R2000~R2018 DXF로 쓴 공개 짝에서 R13·R14 치수를 정의점으로 잰 값이 그 42와 같다.
 * 전에는 이 앱의 R2000+ DXF 쓰기가 42를 뺐다(R2000+ DWG 쓰기는 136차부터 잰 값). R12 DXF에는 42 칸이 없다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import { createAlignedDimension, createAngular2LineDimension, createAngularDimension, createLinearDimension, createOrdinateDimension, createRadialDimension } from '../../src/edit/dim';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { FIXTURES } from '../oracle/ezdxf';
import { P, bench } from '../dimassoc/helpers';

function build(): { doc: CadDocument; dims: DimensionEntity[] } {
  const b = bench();
  const d = b.doc;
  const made = [
    createLinearDimension(d, P(0, 0), P(100, 30), P(50, 60), { rotation: Math.PI / 6 }),
    createAlignedDimension(d, P(0, 0), P(30, 40), P(10, 50)),
    createRadialDimension(d, P(200, 0), 25, Math.PI / 4),
    createAngularDimension(d, P(0, 200), P(50, 200), P(0, 250), P(-30, 170)),
    createAngular2LineDimension(d, P(0, 400), P(50, 400), P(0, 400), P(-30, 440), P(10, 420)),
    createOrdinateDimension(d, P(10, 5), P(15, 40)),
  ];
  return { doc: d, dims: made.map((x) => b.addDim(x, [])) };
}
const dimsOf = (doc: CadDocument) => [...doc.entityIndex.values()].filter((e): e is DimensionEntity => e.type === 'DIMENSION');

describe('측정값이 없는 치수의 DXF 42(138차)', () => {
  it('R2000+ DXF에는 정의점으로 잰 값, R12 DXF에는 없음, 잴 수 없으면 전처럼 뺀다', () => {
    const { doc, dims } = build();
    const want = new Map(dims.map((x) => [x.handle, x.measurement]));
    const live = dims.map((x) => doc.entityIndex.get(x.handle) as DimensionEntity);
    for (const x of live) x.measurement = NaN;
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      const got = dimsOf(readDxf(writeDxf(doc, { version }).data));
      expect(got).toHaveLength(6);
      for (const r of got) expect(r.measurement, `${version} ${r.handle}`).toBeCloseTo(want.get(r.handle)!, 9);
    }
    for (const r of dimsOf(readDxf(writeDxf(doc, { version: 'AC1009' }).data))) expect(r.measurement).toBeNaN();
    // 평행한 두 선(잴 수 없음)
    live[4]!.defPoint = P(-30, 400);
    const back = dimsOf(readDxf(writeDxf(doc, { version: 'AC1032' }).data));
    expect(back.find((x) => x.dimType === live[4]!.dimType && Number.isNaN(x.measurement))).toBeDefined();
    // 측정값이 있는 치수는 그 값 그대로
    live[0]!.measurement = 12.5;
    expect(dimsOf(readDxf(writeDxf(doc, { version: 'AC1015' }).data)).find((x) => x.handle === live[0]!.handle)!.measurement).toBe(12.5);
  });

  const R14 = join(FIXTURES, 'samples', 'sample_AC1014.dwg');
  const R2000 = join(FIXTURES, 'samples', 'sample_AC1015.dwg');
  it.skipIf(!existsSync(R14) || !existsSync(R2000))('표본: R14 DWG를 R2000 DXF로 쓴 42가 AutoCAD가 같은 도면을 R2000으로 쓴 측정값과 같다', () => {
    const r14 = readDwg(new Uint8Array(readFileSync(R14)));
    const acad = new Map(dimsOf(readDwg(new Uint8Array(readFileSync(R2000)))).map((x) => [x.handle, x.measurement]));
    const src = dimsOf(r14);
    expect(src.length).toBeGreaterThan(5);
    const back = new Map(dimsOf(readDxf(writeDxf(r14, { version: 'AC1015' }).data)).map((x) => [x.handle, x.measurement]));
    for (const r of src) {
      expect(r.measurement, r.handle).toBeNaN();
      expect(back.get(r.handle), r.handle).toBeCloseTo(acad.get(r.handle)!, 9);
    }
  });
});
