/**
 * 리더가 함께 쓰는 얼린 점(96차): 블록 참조 축척 (1, 1, 1)과 여러 줄 문자 방향 (1, 0, 0)은 객체마다 점을 만들지 않고 얼린 점 하나를 쓴다.
 * 큰 지도 도면(블록 참조 수십만 개)의 문서 힙을 줄인다. 값은 그대로이고, 편집은 언제나 새 점을 넣으므로 얼린 점을 고치지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, InsertEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { SHARED_UNIT_SCALE, SHARED_X_DIRECTION, entityDefaults, shareUnitScale, shareXDirection } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { transformEntity } from '../../src/edit/geom/transform';
import { explodeEntity } from '../../src/edit/geom/explode';
import { affMirror, affRotate, affScale, affTranslate } from '../../src/edit/geom/math';
import { cloneEntity } from '../../src/edit/session';
import { DocAssembler, type DocPart, sendDocument } from '../../src/worker/doctransfer';

const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 블록 하나와 그 참조 여럿, 여러 줄 문자 여럿이 든 문서 */
function makeDoc(): { doc: CadDocument; unit: string[]; other: string[]; xdir: string[]; ydir: string[] } {
  const doc = createNewDocument('metric');
  let seq = 0x7d00;
  const h = () => (seq++).toString(16).toUpperCase();
  const base = () => ({ ...entityDefaults(), handle: h() });
  const rec = h();
  doc.blocks.set('B', { name: 'B', handle: h(), recordHandle: rec, basePoint: P(0, 0), flags: 0, entities: [{ ...base(), type: 'LINE', start: P(0, 0), end: P(1, 2) } as Entity], endHandle: h(), layer: '0' });
  doc.blockRecords.set('B', { name: 'B', handle: rec, flags: 0, insertUnits: 0, explodable: true, scalable: true });
  const ms = doc.blocks.get('*MODEL_SPACE')!.entities;
  const ins = (x: number, scale: Vec3): InsertEntity => ({ ...base(), type: 'INSERT', block: 'B', insert: P(x, 1), scale, rotation: 0.25, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] });
  const mt = (x: number, direction: Vec3): MTextEntity => ({
    ...base(),
    type: 'MTEXT',
    insert: P(x, 20),
    height: 2.5,
    width: 0,
    attachment: 1,
    drawingDirection: 1,
    text: '가나다',
    style: 'Standard',
    direction,
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
  });
  const unit = [ins(0, P(1, 1, 1)), ins(10, P(1, 1, 1)), ins(20, P(1, 1, 1))];
  const other = [ins(30, P(2, 2, 2)), ins(40, P(1, 1, -1)), ins(50, P(1, 0.5, 1))];
  const xdir = [mt(0, P(1, 0, 0)), mt(10, P(1, 0, 0))];
  const ydir = [mt(20, P(0, 1, 0)), mt(30, P(0.6, 0.8, 0))];
  ms.push(...unit, ...other, ...xdir, ...ydir);
  const hs = (l: Entity[]) => l.map((e) => e.handle);
  return { doc, unit: hs(unit), other: hs(other), xdir: hs(xdir), ydir: hs(ydir) };
}

const byHandle = (doc: CadDocument, handle: string) => doc.blocks.get('*MODEL_SPACE')!.entities.find((e) => e.handle === handle)!;

describe('함께 쓰는 얼린 점(96차)', () => {
  it('꼭 같은 값일 때만 얼린 점을 돌려준다', () => {
    expect(Object.isFrozen(SHARED_UNIT_SCALE)).toBe(true);
    expect(Object.isFrozen(SHARED_X_DIRECTION)).toBe(true);
    expect(shareUnitScale(P(1, 1, 1))).toBe(SHARED_UNIT_SCALE);
    for (const s of [P(1, 1, -1), P(1, 1, 1 + 1e-15), P(2, 2, 2)]) expect(shareUnitScale(s)).toBe(s);
    expect(shareXDirection(P(1, 0, 0))).toBe(SHARED_X_DIRECTION);
    // -0은 다시 쓸 때 바이트가 다를 수 있어 함께 쓰지 않는다
    for (const d of [P(1, -0, 0), P(1, 0, -0), P(0, 1, 0), P(1, 1e-17, 0)]) expect(shareXDirection(d)).toBe(d);
  });

  it('DXF·DWG를 읽으면 축척 1·방향 X는 얼린 점 하나를 함께 쓰고, 다른 값은 제 점이다', () => {
    const m = makeDoc();
    const backs: [string, CadDocument][] = [
      ['dxf2018', readDxf(writeDxf(m.doc, { version: 'AC1032' }).data)],
      ['dxf2000', readDxf(writeDxf(m.doc, { version: 'AC1015' }).data)],
      ['dwg2018', readDwg(writeDwg(m.doc, { version: 'AC1032' }).data)],
      ['dwg2000', readDwg(writeDwg(m.doc, { version: 'AC1015' }).data)],
    ];
    for (const [name, back] of backs) {
      for (const h of m.unit) expect(byHandle(back, h), name).toMatchObject({ scale: { x: 1, y: 1, z: 1 } });
      for (const h of m.unit) expect((byHandle(back, h) as InsertEntity).scale, name).toBe(SHARED_UNIT_SCALE);
      for (const h of m.other) {
        const s = (byHandle(back, h) as InsertEntity).scale;
        expect(s, name).not.toBe(SHARED_UNIT_SCALE);
        expect(s, name).toEqual((byHandle(m.doc, h) as InsertEntity).scale);
      }
      for (const h of m.xdir) expect((byHandle(back, h) as MTextEntity).direction, name).toBe(SHARED_X_DIRECTION);
      for (const h of m.ydir) {
        const d = (byHandle(back, h) as MTextEntity).direction!;
        expect(d, name).not.toBe(SHARED_X_DIRECTION);
        expect(d.x, name).toBeCloseTo((byHandle(m.doc, h) as MTextEntity).direction!.x, 12);
      }
    }
  });

  it('R12 DXF의 블록 참조도 축척 1이면 얼린 점을 쓴다', () => {
    const m = makeDoc();
    const back = readDxf(writeDxf(m.doc, { version: 'AC1009' }).data);
    for (const h of m.unit) expect((byHandle(back, h) as InsertEntity).scale).toBe(SHARED_UNIT_SCALE);
  });

  it('옮기기·돌리기·축척·대칭·분해·복제가 얼린 점을 고치지 않고 새 점을 넣는다', () => {
    const m = makeDoc();
    const doc = readDwg(writeDwg(m.doc, { version: 'AC1032' }).data);
    const ins = byHandle(doc, m.unit[0]!) as InsertEntity;
    const mt = byHandle(doc, m.xdir[0]!) as MTextEntity;
    expect(ins.scale).toBe(SHARED_UNIT_SCALE);
    for (const mat of [affTranslate(5, -3), affRotate(0.7, { x: 1, y: 2 }), affScale(2.5, 2.5, { x: 3, y: 4 }), affScale(2, 3), affMirror({ x: 0, y: 0 }, { x: 0, y: 1 })]) {
      for (const e of [ins, mt]) {
        const r = transformEntity(e, mat, doc).replace![0]!;
        expect(r).not.toBe(e);
      }
      const r = transformEntity(ins, mat, doc).replace![0] as InsertEntity;
      expect(r.scale).not.toBe(SHARED_UNIT_SCALE);
    }
    const mirrored = transformEntity(ins, affMirror({ x: 0, y: 0 }, { x: 0, y: 1 }), doc).replace![0] as InsertEntity;
    expect(Math.abs(mirrored.scale.x)).toBeCloseTo(1, 12);
    expect(explodeEntity(ins, doc).add!.length).toBe(1);
    const c = cloneEntity(ins);
    expect(c.scale).toEqual(SHARED_UNIT_SCALE);
    expect(c.scale).not.toBe(SHARED_UNIT_SCALE);
    c.scale.x = 3;
    expect(SHARED_UNIT_SCALE).toEqual({ x: 1, y: 1, z: 1 });
    expect(SHARED_X_DIRECTION).toEqual({ x: 1, y: 0, z: 0 });
    // 얼린 점을 고치려 하면 오류가 난다(조용히 다른 객체까지 바뀌지 않는다)
    expect(() => {
      (ins.scale as { x: number }).x = 2;
    }).toThrow(TypeError);
  });

  it('메인으로 보내면 한 묶음 안의 블록 참조가 점 하나(얼리지 않은 사본)를 함께 쓰고 값은 같다', () => {
    const m = makeDoc();
    const doc = readDwg(writeDwg(m.doc, { version: 'AC1032' }).data);
    let asm: DocAssembler | null = null;
    sendDocument(
      doc,
      (d, streamed) => {
        asm = new DocAssembler(structuredClone(d), structuredClone(streamed));
      },
      (p: DocPart, t) => asm!.add(structuredClone(p, { transfer: t })),
      undefined,
      { minEntities: 4, batch: 100 },
    );
    const main = asm!.doc;
    expect(main).toStrictEqual(structuredClone(doc));
    const scales = m.unit.map((h) => (byHandle(main, h) as InsertEntity).scale);
    expect(scales[0]).toEqual({ x: 1, y: 1, z: 1 });
    expect(Object.isFrozen(scales[0])).toBe(false);
    for (const s of scales) expect(s).toBe(scales[0]);
    const dirs = m.xdir.map((h) => (byHandle(main, h) as MTextEntity).direction);
    expect(dirs[1]).toBe(dirs[0]);
  });
});
