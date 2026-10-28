/**
 * 2D POLYLINE 정점 Z(7차 실제 도면 훑기 — 자료는 직접 만든 합성 문서): 고도와 다른 정점 Z를 그대로 둔다.
 * AutoCAD는 같은 도면을 DXF로 쓸 때 정점 Z를 그대로 적는다(고도 0, 정점 Z ≠ 0인 실물). 그릴 때는 고도를 쓴다.
 * 전에는 DXF 쓰기가 정점 Z를 고도로 덮고, DWG 리더가 0인 정점 Z를 고도로 바꿨다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { packPoly, polyVertices } from '../../src/core/polyverts';

let seq = 0x7c00;
const h = () => (seq++).toString(16).toUpperCase();
const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)!.entities;
const find = <T>(d: CadDocument, handle: string) => ms(d).find((e) => e.handle === handle) as T;
const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

describe('2D POLYLINE 정점 Z', () => {
  const poly = (elevation: number, z: number): PolylineEntity => ({
    ...entityDefaults(),
    handle: h(),
    layer: '0',
    type: 'POLYLINE',
    kind: '2d',
    flags: 0,
    elevation,
    ...packPoly([P(0, 0, z), P(10, 0, z), P(10, 10, z)].map((location) => ({ location, bulge: 0, startWidth: 0, endWidth: 0, flags: 0 }))),
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: 0,
    nCount: 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
  });

  it('고도와 다른 정점 Z를 DXF·DWG 왕복에서 그대로 둔다(AutoCAD도 그대로 적는다)', () => {
    const a = poly(0, -4.25);
    const b = poly(6, 0);
    const doc = createNewDocument('metric');
    ms(doc).push(a, b);
    const zs = (d: CadDocument, e: PolylineEntity) => polyVertices(find<PolylineEntity>(d, e.handle)).map((v) => v.location.z);
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDxf(writeDxf(doc, { version: 'AC1009' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1015' }).data)]) {
      expect(zs(back, a)).toEqual([-4.25, -4.25, -4.25]);
      expect(zs(back, b)).toEqual([0, 0, 0]);
      expect(find<PolylineEntity>(back, b.handle).elevation).toBe(6);
    }
  });
});
