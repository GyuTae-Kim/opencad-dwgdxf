import { describe, expect, it } from 'vitest';
import type { PolylineEntity, PolyVertex } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import {
  PolyAccum,
  packPoly,
  polyCount,
  polyDrawnBulgeVerts,
  polyHas,
  polyIsFaceRecord,
  polyMapLocs,
  polyVertex,
  polyVertices,
  setPolyVertex,
  setPolyVertices,
  unboxPoly,
} from '../../src/core/polyverts';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg/index';
import { createNewDocument } from '../../src/core/newdoc';
import { cloneEntity } from '../../src/edit/session';

const V = (x: number, y: number, z = 0, extra: Partial<PolyVertex> = {}): PolyVertex => ({ location: { x, y, z }, bulge: 0, startWidth: 0, endWidth: 0, flags: 0, ...extra });

function poly(kind: PolylineEntity['kind'], flags: number, vs: PolyVertex[], handle: string): PolylineEntity {
  return {
    ...entityDefaults(),
    type: 'POLYLINE',
    handle,
    layer: '0',
    kind,
    flags,
    ...packPoly(vs),
    elevation: 0,
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: kind === 'mesh' ? 2 : 0,
    nCount: kind === 'mesh' ? 2 : 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
  };
}

describe('POLYLINE 정점 평탄 좌표', () => {
  it('풀어 쓴 정점과 평탄 자료가 서로 같다(볼록·폭·플래그·접선·면 번호, -0 포함)', () => {
    const vs: PolyVertex[] = [
      V(0, 0, 1, { bulge: -0, startWidth: 1, endWidth: 2, flags: 2, tangent: 0.5 }),
      V(1.5, -2, 1, { bulge: 0.25 }),
      V(3, 4, -0, { flags: 1, tangent: Number.NaN }),
      V(0, 0, 0, { flags: 128, faceIndices: [] }),
      V(0, 0, 0, { flags: 128, faceIndices: [1, -2, 3] }),
    ];
    const p = packPoly(vs);
    expect(p.verts).toEqual([0, 0, 1, 1.5, -2, 1, 3, 4, -0, 0, 0, 0, 0, 0, 0]);
    expect(Object.is(p.verts[8], -0)).toBe(true);
    expect(Object.is(p.bulges![0], -0)).toBe(true);
    expect(p.widths).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.vflags).toEqual([2, 0, 1, 128, 128]);
    expect(p.tangents).toEqual([0.5, null, Number.NaN, null, null]);
    expect(p.faceRecs).toEqual([null, null, null, [], [1, -2, 3]]);
    const back = polyVertices(p);
    expect(back).toEqual(vs);
    expect(Object.is(back[0]!.bulge, -0)).toBe(true);
    expect(polyIsFaceRecord(p, 3)).toBe(true);
    expect(polyIsFaceRecord(p, 2)).toBe(false);
    // 하나씩 받아 만든 자료도 같다(읽기)
    const acc = new PolyAccum();
    for (const v of vs) acc.add(v.location.x, v.location.y, v.location.z, v.bulge, v.startWidth, v.endWidth, v.flags, v.tangent, v.faceIndices);
    expect(acc.finish()).toEqual(p);
  });

  it('값이 없는 배열은 두지 않는다(+0 볼록·폭, 0 플래그, 접선·면 번호 없음)', () => {
    const p = packPoly([V(0, 0), V(1, 0), V(1, 1)]);
    expect(p).toEqual({ verts: [0, 0, 0, 1, 0, 0, 1, 1, 0], bulges: undefined, widths: undefined, vflags: undefined, tangents: undefined, faceRecs: undefined });
    const acc = new PolyAccum();
    acc.add(0, 0, 0, 0, 0, 0, 0);
    expect(acc.finish()).toEqual({ verts: [0, 0, 0], bulges: undefined, widths: undefined, vflags: undefined, tangents: undefined, faceRecs: undefined });
    expect(polyCount(p)).toBe(3);
    expect(polyHas(p, 2)).toBe(true);
    expect(polyHas(p, 3)).toBe(false);
    expect(polyHas(p, 1.5)).toBe(false);
    expect(polyHas(p, -1)).toBe(false);
  });

  it('고친 사본: 정점 하나·위치만 바꾸기, 틀 정점(16) 빼기, 구조화 복제 뒤 다시 담기', () => {
    const e = poly('2d', 4, [V(0, 0, 0, { flags: 8, bulge: 0.5 }), V(5, 0, 0, { flags: 16 }), V(10, 0, 0, { flags: 8 })], 'A');
    const r = { ...e };
    setPolyVertex(r, 0, { bulge: 0 });
    expect(r.bulges).toBeUndefined();
    expect(e.bulges).toEqual([0.5, 0, 0]);
    expect(polyDrawnBulgeVerts(e)).toEqual([
      { x: 0, y: 0, bulge: 0.5 },
      { x: 10, y: 0, bulge: 0 },
    ]);
    const moved = { ...e, ...polyMapLocs(e, (p) => ({ ...p, y: p.y + 1 })) };
    expect(polyVertices(moved).map((v) => v.location.y)).toEqual([1, 1, 1]);
    expect(moved.vflags).toEqual(e.vflags);
    expect(moved.vflags).not.toBe(e.vflags);
    const c = cloneEntity(e);
    expect(c.verts).toEqual(e.verts);
    expect(c.verts).not.toBe(e.verts);
    unboxPoly(c, e);
    expect(polyVertices(c)).toEqual(polyVertices(e));
    setPolyVertices(c, []);
    expect(c.verts).toEqual([]);
    expect(polyVertex(e, 1).flags).toBe(16);
  });

  it('DXF·DWG 왕복: 2D(볼록·폭·접선), 3D, 다각형 메시, 폴리페이스의 정점이 그대로', () => {
    const doc = createNewDocument('metric');
    const blk = doc.blocks.get(MODEL_SPACE)!;
    const ms = blk.entities;
    const list = [
      poly('2d', 2, [V(0, 0, 0, { bulge: 0.3, startWidth: 1, endWidth: 0.5, flags: 2, tangent: 1.25 }), V(10, 0, 0, { flags: 1 }), V(10, 10)], '1A0'),
      poly('3d', 8, [V(0, 0, 1, { flags: 32 }), V(5, 5, 2, { flags: 32 }), V(9, 1, -3, { flags: 32 })], '1A1'),
      poly('mesh', 16, [V(0, 0, 0, { flags: 64 }), V(0, 1, 0, { flags: 64 }), V(1, 0, 1, { flags: 64 }), V(1, 1, 1, { flags: 64 })], '1A2'),
      poly('polyface', 64, [V(0, 0, 0, { flags: 192 }), V(1, 0, 0, { flags: 192 }), V(0, 1, 0, { flags: 192 }), V(0, 0, 0, { flags: 128, faceIndices: [1, 2, -3] })], '1A3'),
    ];
    for (const p of list) {
      p.owner = blk.recordHandle;
      ms.push(p);
      doc.entityIndex.set(p.handle, p);
    }
    const backs = [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDxf(writeDxf(doc, { version: 'AC1009' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1015' }).data)];
    for (const back of backs) {
      const got = [...back.entityIndex.values()].filter((e): e is PolylineEntity => e.type === 'POLYLINE');
      expect(got.length).toBe(4);
      for (const src of list) {
        const b = got.find((g) => g.kind === src.kind)!;
        const bv = polyVertices(b);
        const sv = polyVertices(src);
        expect(bv.map((v) => [v.location, v.bulge, v.startWidth, v.endWidth, v.faceIndices ?? null])).toEqual(sv.map((v) => [v.location, v.bulge, v.startWidth, v.endWidth, v.faceIndices ?? null]));
        if (src.kind === '2d') {
          expect(bv[0]!.tangent).toBeCloseTo(1.25, 12);
          expect(bv.map((v) => v.flags)).toEqual([2, 1, 0]);
        }
      }
    }
  });
});
