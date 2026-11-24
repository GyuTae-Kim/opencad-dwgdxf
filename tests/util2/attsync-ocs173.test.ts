/**
 * 173차: ATTSYNC(·BATTMAN 동기화·ATTREDEF)·BLOCKREPLACE가 돌출 방향이 −Z인 블록 참조의 속성을 다시 만들 때,
 * 삽입점·맞춤점은 참조 OCS로 셈하면서 속성의 돌출 방향은 정의(+Z) 그대로 두어 속성이 X 거울상 자리로 가던 것.
 * DXF 참조서: INSERT 10과 ATTRIB 10·11은 각자의 210(돌출 방향) OCS 좌표다. 같은 앱의 EXPLODE(123차)는 정의의 ATTDEF를
 * 참조 변환(평면 사상 포함)으로 보이므로, 다시 만든 속성은 그 자리(평면도 글자 상자)에 있어야 한다. +Z 참조는 전과 같은 값.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, Entity, InsertEntity, MTextEntity, Vec2, Vec3 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { buildAttribs, replaceBlockOps, syncAllOps, syncedInsert } from '../../src/edit/util/blockutil';
import { explodeEntity } from '../../src/edit/geom/explode';
import { textOutline } from '../../src/edit/geom/textjust';
import { ocsToWcs } from '../../src/edit/geom/ocs';
import { addBlock, attdef, insert, line, put, setup } from './helpers';

const NEG_Z: Vec3 = { x: 0, y: 0, z: -1 };

function near(a: { x: number; y: number }, b: { x: number; y: number }, tol = 1e-9): void {
  expect(Math.abs(a.x - b.x), `x ${a.x} ≠ ${b.x}`).toBeLessThan(tol);
  expect(Math.abs(a.y - b.y), `y ${a.y} ≠ ${b.y}`).toBeLessThan(tol);
}

/** 속성 삽입점·맞춤점의 WCS 평면도 자리 */
const wcs = (p: Vec3, e: Entity): Vec2 => {
  const w = ocsToWcs(p, e.extrusion);
  return { x: w.x, y: w.y };
};

/** 두 꼭짓점 묶음이 (순서와 관계없이) 같은 점들인지 */
function samePoints(a: readonly Vec2[] | null, b: readonly Vec2[] | null): void {
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(a!.length).toBe(b!.length);
  for (const p of a!) expect(b!.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9), `(${p.x}, ${p.y})`).toBe(true);
}

/** 블록 B: 선, 왼쪽 맞춤 속성 NO(정의 (2,1)), 가운데 맞춤 속성 C(맞춤점 (0,−3)) */
function blockB() {
  const { doc, h } = setup();
  const def = addBlock(doc, h, 'B', [line(h(), 0, 0, 10, 0), attdef(h(), 'NO', '7', 2, 1), { ...attdef(h(), 'C', '9', -1, -3), halign: 1, alignPoint: { x: 0, y: -3, z: 0 } }]);
  return { doc, h, def };
}

/** AutoCAD가 쓰는 꼴의 −Z 참조 속성: 참조 OCS 좌표 + 참조와 같은 돌출 방향 */
function negZInsert(h: () => string): InsertEntity {
  // OCS (−3,1) = WCS (3,1)
  const ins = insert(h(), 'B', -3, 1, { extrusion: { ...NEG_Z } });
  ins.attribs = [
    { ...attdef(h(), 'NO', '7', -1, 2), type: 'ATTRIB', owner: ins.handle, extrusion: { ...NEG_Z } },
    { ...attdef(h(), 'C', '9', -4, -2), type: 'ATTRIB', owner: ins.handle, halign: 1, alignPoint: { x: -3, y: -2, z: 0 }, extrusion: { ...NEG_Z } },
  ];
  return ins;
}

describe('−Z 블록 참조의 속성 다시 만들기(173차)', () => {
  it('ATTSYNC: 정의를 바꾸지 않은 −Z 참조의 속성은 보이는 자리·방향 그대로다', () => {
    const { h, def } = blockB();
    const ins = negZInsert(h);
    const after = syncedInsert(def, ins, h)?.attribs ?? ins.attribs;
    expect(after.map((a) => a.tag)).toEqual(['NO', 'C']);
    for (const a of after) {
      const was = ins.attribs.find((b) => b.tag === a.tag)!;
      near(wcs(a.insert, a), wcs(was.insert, was));
      if (was.alignPoint) near(wcs(a.alignPoint!, a), wcs(was.alignPoint, was));
      expect(a.extrusion?.z, a.tag).toBeLessThan(0);
      expect(a.rotation).toBe(was.rotation);
    }
    // 손셈: NO는 WCS (1,2), C의 맞춤점은 WCS (3,−2)
    near(wcs(after[0]!.insert, after[0]!), { x: 1, y: 2 });
    near(wcs(after[1]!.alignPoint!, after[1]!), { x: 3, y: -2 });
  });

  it('ATTSYNC: 정의에서 옮기고 더한 속성은 −Z 참조를 EXPLODE했을 때 정의가 보이는 자리에 놓인다', () => {
    const { doc, h, def } = blockB();
    const ins = negZInsert(h);
    put(doc, ins);
    // NO를 (4,0)으로 옮기고 SIZE를 (0,3)에 더한다
    def.entities = [def.entities[0]!, { ...(def.entities[1] as AttribEntity), insert: { x: 4, y: 0, z: 0 } }, def.entities[2]!, attdef(h(), 'SIZE', 'DN50', 0, 3)];
    const r = syncAllOps(doc, 'B', h);
    expect(r.ops).toHaveLength(1);
    const out = (r.ops[0] as { after: InsertEntity }).after;
    expect(out.attribs.map((a) => [a.tag, a.text])).toEqual([
      ['NO', '7'],
      ['C', '9'],
      ['SIZE', 'DN50'],
    ]);
    // 손셈: NO OCS (1,1) = WCS (−1,1), SIZE OCS (−3,4) = WCS (3,4)
    near(wcs(out.attribs[0]!.insert, out.attribs[0]!), { x: -1, y: 1 });
    near(wcs(out.attribs[2]!.insert, out.attribs[2]!), { x: 3, y: 4 });
    const defs = explodeEntity(out, doc, false, 'definitions').add!.filter((e): e is AttribEntity => e.type === 'ATTDEF');
    expect(defs.map((d) => d.tag).sort()).toEqual(['C', 'NO', 'SIZE']);
    for (const a of out.attribs) {
      const d = defs.find((x) => x.tag === a.tag)!;
      near(wcs(a.insert, a), wcs(d.insert, d));
      samePoints(textOutline(a, doc), textOutline(d, doc));
    }
  });

  it('+Z 참조는 전과 같은 값이다(돌출 방향을 새로 적지 않는다)', () => {
    const { doc, h, def } = blockB();
    for (const ext of [undefined, { x: 0, y: 0, z: 1 }]) {
      const ins = insert(h(), 'B', 100, 50, { scale: { x: 2, y: 2, z: 1 }, extrusion: ext });
      ins.attribs = buildAttribs(def, ins, new Map([['NO', '5']]), h);
      expect(ins.attribs.map((a) => [a.tag, a.insert.x, a.insert.y, a.alignPoint?.x ?? null, a.alignPoint?.y ?? null, a.height, a.extrusion])).toEqual([
        ['NO', 104, 52, null, null, 5, undefined],
        ['C', 98, 44, 100, 44, 5, undefined],
      ]);
      put(doc, ins);
    }
    def.entities = [def.entities[0]!, { ...(def.entities[1] as AttribEntity), insert: { x: 4, y: 0, z: 0 } }, def.entities[2]!];
    const r = syncAllOps(doc, 'B', h);
    expect(r.ops).toHaveLength(2);
    for (const op of r.ops) {
      const a = (op as { after: InsertEntity }).after.attribs[0]!;
      expect([a.tag, a.text, a.insert, a.extrusion]).toEqual(['NO', '5', { x: 108, y: 50, z: 0 }, undefined]);
    }
  });

  it('BLOCKREPLACE: −Z 참조를 다른 블록으로 바꾸면 새 속성도 참조 평면에 놓인다', () => {
    const { doc, h } = blockB();
    addBlock(doc, h, 'B2', [line(h(), 0, 0, 5, 0), attdef(h(), 'X', 'x1', 1, 0)]);
    const ins = negZInsert(h);
    put(doc, ins);
    const r = replaceBlockOps(doc, 'B', 'B2', h);
    expect(r.count).toBe(1);
    const a = (r.ops[0] as { after: InsertEntity }).after.attribs[0]!;
    expect(a.tag).toBe('X');
    // 손셈: 정의 (1,0) → 참조 OCS (−2,1) = WCS (2,1)
    near(wcs(a.insert, a), { x: 2, y: 1 });
    expect(a.extrusion?.z).toBeLessThan(0);
  });

  it('여러 줄 속성: MTEXT 삽입점(WCS)과 글줄 방향이 −Z 참조 평면을 따른다', () => {
    const { doc, h } = setup();
    const mt: MTextEntity = {
      ...entityDefaults(),
      type: 'MTEXT',
      handle: '',
      insert: { x: 2, y: 1, z: 0 },
      height: 2.5,
      width: 0,
      attachment: 1,
      drawingDirection: 1,
      text: 'AB',
      style: 'Standard',
      rotation: 0,
      lineSpacingStyle: 1,
      lineSpacingFactor: 1,
      backgroundFlags: 0,
      backgroundScale: 1.5,
    };
    const def = addBlock(doc, h, 'M', [{ ...attdef(h(), 'NOTE', 'AB', 2, 1), mtext: mt }]);
    const ins = insert(h(), 'M', -3, 1, { extrusion: { ...NEG_Z } });
    const [a] = buildAttribs(def, ins, new Map(), h);
    // 한 줄 꼴 삽입점: 참조 OCS (−1,2) = WCS (1,2)
    near(wcs(a!.insert, a!), { x: 1, y: 2 });
    const m = a!.mtext!;
    near(m.insert, { x: 1, y: 2 });
    expect(m.extrusion?.z).toBeLessThan(0);
    // 글줄은 WCS −X 쪽으로(한 줄 꼴 −Z 속성의 글자와 같은 쪽): 왼쪽 위 부착점의 글자 상자는 삽입점(x 1)에서 왼쪽으로 뻗는다
    const xs = textOutline(m, doc)!.map((p) => p.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.max(...xs)).toBeGreaterThan(0.5);
    expect(Math.min(...xs)).toBeLessThan(0);
    // 같은 정의를 +Z 참조로: 전과 같은 값(WCS = OCS)
    const [b] = buildAttribs(def, insert(h(), 'M', 3, 1), new Map(), h);
    expect([b!.insert, b!.extrusion, b!.mtext!.insert, b!.mtext!.extrusion]).toEqual([{ x: 5, y: 2, z: 0 }, undefined, { x: 5, y: 2, z: 0 }, undefined]);
  });
});
