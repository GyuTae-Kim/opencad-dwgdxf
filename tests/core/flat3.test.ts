import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type LeaderEntity } from '../../src/core/model';
import { at3, count3, leaderCount, leaderVertices, pack3, unpack3 } from '../../src/core/flat3';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg/index';

describe('3D 점 평탄 좌표(지시선 정점)', () => {
  it('점들이 그대로 돌아온다(-0 포함)', () => {
    const pts = [
      { x: 0, y: -0, z: 1 },
      { x: 2.5, y: 3, z: -4 },
    ];
    const a = pack3(pts);
    expect(a).toEqual([0, -0, 1, 2.5, 3, -4]);
    expect(unpack3(a)).toEqual(pts);
    expect(Object.is(unpack3(a)[0]!.y, -0)).toBe(true);
    expect(count3(a)).toBe(2);
    expect(at3(a, 1)).toEqual(pts[1]);
    expect(unpack3([])).toEqual([]);
  });

  it('지시선 DXF·DWG(R2018·R2000) 왕복에서 정점이 그대로', () => {
    const doc = createNewDocument('metric');
    const blk = doc.blocks.get(MODEL_SPACE)!;
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: 10, y: 5, z: 0 },
    ];
    const e: LeaderEntity = {
      ...entityDefaults(),
      type: 'LEADER',
      handle: '1C0',
      layer: '0',
      owner: blk.recordHandle,
      dimStyle: 'Standard',
      verts: pack3(pts),
      arrowHead: true,
      pathType: 0,
      creation: 3,
      hooklineDirection: 0,
      hookline: false,
      textHeight: 0,
      textWidth: 0,
    };
    blk.entities.push(e);
    doc.entityIndex.set(e.handle, e);
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1015' }).data)]) {
      const l = [...back.entityIndex.values()].find((x): x is LeaderEntity => x.type === 'LEADER')!;
      expect(leaderCount(l)).toBe(3);
      expect(leaderVertices(l)).toEqual(pts);
    }
  });
});
