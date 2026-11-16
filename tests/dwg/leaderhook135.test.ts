/**
 * DWG LEADER 걸이선 — 공차 주석(135차). DWG에는 걸이선 점이 없고 AutoCAD가 그릴 때(DXF로 쓸 때도) 덧붙인다.
 * 글 주석(creation 0)만 넣던 것을 공차 주석(creation 1)에도 넣는다. 근거: 같은 도면을 AutoCAD가 R2010 DWG와 DXF로 쓴 짝 —
 * 공차 주석 지시선(마지막 선분 45°)의 DXF에 75 = 1과 끝점에서 DIMASZ만큼 수평으로 떨어진 걸이선 점이 있다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LeaderEntity, ToleranceEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { pack3, unpack3 } from '../../src/core/flat3';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

const P = (x: number, y: number) => ({ x, y, z: 0 });

function doc0(): CadDocument {
  const doc = createNewDocument('imperial');
  const ds = [...doc.dimStyles.values()][0]!.name;
  const add = (e: Entity) => {
    doc.blocks.get(MODEL_SPACE)!.entities.push(e);
    doc.entityIndex.set(e.handle, e);
  };
  const tol = { ...entityDefaults(), type: 'TOLERANCE', handle: 'E1', dimStyle: ds, insert: P(10, 0), text: '{\\Fgdt;j}%%v0.1', direction: { x: 1, y: 0, z: 0 } } as ToleranceEntity;
  add(tol as Entity);
  const leader = (handle: string, pts: { x: number; y: number; z: number }[], creation: number): LeaderEntity =>
    ({
      ...entityDefaults(),
      type: 'LEADER',
      handle,
      dimStyle: ds,
      verts: pack3(pts),
      arrowHead: true,
      pathType: 0,
      creation,
      hooklineDirection: 0,
      hookline: false,
      textHeight: 0,
      textWidth: 0,
      annotation: creation === 3 ? undefined : 'E1',
    }) as LeaderEntity;
  // 마지막 선분 45° → 걸이선, 수평 → 없음, 주석 없음(creation 3) → 없음
  add(leader('A1', [P(0, 0), P(5, 5), P(10, 0)], 1) as Entity);
  add(leader('A2', [P(0, 0), P(5, 5), P(10, 5)], 1) as Entity);
  add(leader('A3', [P(0, 0), P(5, 5), P(10, 0)], 3) as Entity);
  return doc;
}

const L = (doc: CadDocument, h: string) => doc.entityIndex.get(h) as LeaderEntity;

describe('DWG LEADER 걸이선 — 공차 주석', () => {
  for (const version of ['AC1015', 'AC1024', 'AC1032'] as const) {
    it(`${version}: 마지막 선분이 15°보다 기운 공차 지시선에 DIMASZ 길이의 걸이선 점을 넣는다`, () => {
      const doc = readDwg(writeDwg(doc0(), { version }).data);
      const ds = doc.dimStyles.get([...doc.dimStyles.keys()][0]!)!;
      const asz = Number(ds.vars.DIMASZ ?? 0.18) * (Number(ds.vars.DIMSCALE ?? 1) || 1);
      const l1 = L(doc, 'A1');
      expect(l1.hookline).toBe(true);
      const v = unpack3(l1.verts);
      expect(v.length).toBe(4);
      expect(v[2]!.x).toBeCloseTo(10 - asz, 9);
      expect(v[2]!.y).toBeCloseTo(0, 9);
      expect(v[3]).toEqual(P(10, 0));
      expect(L(doc, 'A2').hookline).toBe(false);
      expect(unpack3(L(doc, 'A2').verts).length).toBe(3);
      expect(L(doc, 'A3').hookline).toBe(false);
      expect(unpack3(L(doc, 'A3').verts).length).toBe(3);
      // DWG로 다시 쓰면 걸이선 점을 빼고 쓰고, 읽으면 같은 점
      const again = readDwg(writeDwg(doc, { version }).data);
      expect(unpack3(L(again, 'A1').verts)).toEqual(v);
      // DXF에는 AutoCAD처럼 75 = 1과 걸이선 점을 쓴다
      const dxf = readDxf(writeDxf(doc, { version }).data);
      expect(L(dxf, 'A1').hookline).toBe(true);
      expect(unpack3(L(dxf, 'A1').verts).length).toBe(4);
    });
  }
});
