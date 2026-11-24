/**
 * 167차: CHANGE 변경점으로 블록 참조를 옮기거나 돌릴 때 속성이 블록을 따라가는지.
 * Autodesk CHANGE 도움말(변경점 — 블록): 블록의 위치나 회전을 바꾼다. 새 위치를 주면 블록을 옮기고, Enter면 제자리에 둔다.
 * 속성은 블록 참조에 딸린 것이라(속성 정의 대화 상자 "위치 잠금 — 블록 참조 안에서 속성의 위치를 잠근다") 블록과 함께 옮기고 돈다
 * — 이 앱의 특성 팔레트(블록 위치·회전)·MOVE·ROTATE도 그렇다.
 * 전에는 속성의 삽입점만 옮겨 맞춘 속성(그리기 기준인 맞춤점)·여러 줄 속성(MTEXT 삽입점)이 제자리에 남았고,
 * 회전을 바꿔도 속성은 돌지 않았으며, 찍은 점(WCS)을 OCS 삽입점에 그대로 넣어 돌출 방향이 −Z인 블록은 거울상 자리로 갔다.
 * 맞추지 않은 한 줄 속성을 회전 없이 옮기는 것과 선 끝점 옮기기는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, Entity, InsertEntity, LineEntity, MTextEntity, TextEntity, Vec3 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { registerPropCommands } from '../../src/app/propcmds';
import { ocsToWcs } from '../../src/edit/geom/ocs';
import { NEG_Z, P, circle, line, mtext, text } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';

function harness() {
  const h = makeHarness((doc) => {
    doc.blocks.set('B', { name: 'B', handle: 'F001', recordHandle: 'F002', basePoint: P(0, 0), flags: 0, entities: [{ ...circle(0, 0, 1), handle: 'F003', owner: 'F002' }], endHandle: 'F004' });
    doc.blockRecords.set('B', { name: 'B', handle: 'F002', flags: 0, insertUnits: 0, explodable: true, scalable: true });
  });
  registerPropCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;

const attrib = (h: H, x: number, y: number, extra: Record<string, unknown> = {}): AttribEntity =>
  ({ ...(text(x, y, 'V', 1) as TextEntity), type: 'ATTRIB', handle: h.st.session.newHandle(), tag: 'T', attFlags: 0, ...extra }) as AttribEntity;

const addInsert = (h: H, at: Vec3, attribs: AttribEntity[], extra: Record<string, unknown> = {}): InsertEntity =>
  h.add({ ...entityDefaults(), type: 'INSERT', handle: '', block: 'B', insert: at, scale: P(1, 1, 1), rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs, ...extra } as Entity) as InsertEntity;

const blockOf = (h: H) => modelEntities(h.doc, 'INSERT')[0]!;
const near = (a: { x: number; y: number }, x: number, y: number) => Math.abs(a.x - x) < 1e-9 && Math.abs(a.y - y) < 1e-9;
/** 소수 9자리로 맞춘 좌표(−0은 0으로) */
const xy = (a: { x: number; y: number }) => [+a.x.toFixed(9) + 0, +a.y.toFixed(9) + 0];

describe('CHANGE 변경점의 블록 참조와 속성(167차)', () => {
  it('맞춘 속성의 맞춤점과 여러 줄 속성이 블록과 함께 옮겨진다', async () => {
    const h = harness();
    const ml = mtext(1, -2, 'L1\\PL2', 1) as MTextEntity;
    const b = addInsert(h, P(0, 0), [
      attrib(h, -1, 2, { halign: 1, alignPoint: P(0, 2) }),
      attrib(h, 1, -2, { tag: 'M', mtext: { ...ml, handle: '' } }),
    ]);
    await h.run('CHANGE', [{ sel: [b.handle] }, '10,5', '']);
    const r = blockOf(h);
    expect(xy(r.insert)).toEqual([10, 5]);
    // 가운데 맞춤 속성은 맞춤점에 그려진다 — 블록과 같이 (10,5)만큼
    expect(xy(r.attribs[0]!.alignPoint!)).toEqual([10, 7]);
    expect(xy(r.attribs[0]!.insert)).toEqual([9, 7]);
    // 여러 줄 속성은 MTEXT 삽입점에 그려진다
    expect(xy(r.attribs[1]!.mtext!.insert)).toEqual([11, 3]);
    expect(xy(r.attribs[1]!.insert)).toEqual([11, 3]);
    // 명령 취소 한 번으로 돌아온다
    h.st.session.undo();
    expect(xy(blockOf(h).attribs[0]!.alignPoint!)).toEqual([0, 2]);
    expect(xy(blockOf(h).attribs[1]!.mtext!.insert)).toEqual([1, -2]);
  });

  it('회전 각도를 바꾸면 속성도 새 삽입점 둘레로 같이 돈다', async () => {
    const h = harness();
    const b = addInsert(h, P(0, 0), [attrib(h, 2, 0)]);
    await h.run('CHANGE', [{ sel: [b.handle] }, '10,0', '90']);
    const r = blockOf(h);
    expect(xy(r.insert)).toEqual([10, 0]);
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 12);
    // 블록 X축으로 2 떨어진 속성은 돈 X축(+Y)으로 2 — (10,2), 속성 문자도 90°
    expect(xy(r.attribs[0]!.insert)).toEqual([10, 2]);
    expect(r.attribs[0]!.rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it('돌출 방향이 −Z인 블록은 삽입점이 찍은 점에 놓이고 속성도 따라간다', async () => {
    const h = harness();
    // OCS (−3,1) = WCS (3,1), 속성 OCS (−4,1) = WCS (4,1)
    const b = addInsert(h, P(-3, 1), [attrib(h, -4, 1, { extrusion: NEG_Z })], { extrusion: NEG_Z });
    await h.run('CHANGE', [{ sel: [b.handle] }, '10,5', '']);
    let r = blockOf(h);
    expect(xy(ocsToWcs(r.insert, NEG_Z))).toEqual([10, 5]);
    expect(xy(ocsToWcs(r.attribs[0]!.insert, NEG_Z))).toEqual([11, 5]);
    expect(r.extrusion).toEqual(NEG_Z);
    // 새 회전 각도 90(블록 OCS) — WCS에서 블록 X축은 (−1,0)에서 (0,1)로: 속성은 (10,4)
    await h.run('CHANGE', [{ sel: [b.handle] }, '10,5', '90']);
    r = blockOf(h);
    expect(xy(ocsToWcs(r.insert, NEG_Z))).toEqual([10, 5]);
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(xy(ocsToWcs(r.attribs[0]!.insert, NEG_Z))).toEqual([10, 4]);
    expect(r.attribs[0]!.rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it('여러 줄 속성의 방향 벡터(WCS)도 블록 회전만큼 돈다', async () => {
    const h = harness();
    const ml = mtext(3, 0, 'L1\\PL2', 1, { direction: P(1, 0) }) as MTextEntity;
    const b = addInsert(h, P(0, 0), [attrib(h, 3, 0, { tag: 'M', mtext: { ...ml, handle: '' } })]);
    await h.run('CHANGE', [{ sel: [b.handle] }, '0,0', '90']);
    const m = blockOf(h).attribs[0]!.mtext!;
    expect(xy(m.insert)).toEqual([0, 3]);
    expect(xy(m.direction!)).toEqual([0, 1]);
  });

  it('맞추지 않은 한 줄 속성을 회전 없이 옮기기와 선 끝점은 전과 같다', async () => {
    const h = harness();
    const b = addInsert(h, P(0, 0), [attrib(h, 2, 1)]);
    const l = h.add({ ...line(20, 0, 30, 0), handle: '' });
    await h.run('CHANGE', [{ sel: [b.handle] }, '5,5', '']);
    const r = blockOf(h);
    expect(r.insert).toEqual(P(5, 5));
    expect(r.rotation).toBe(0);
    expect(r.attribs[0]!.insert).toEqual(P(7, 6));
    expect(r.attribs[0]!.rotation).toBe(0);
    await h.run('CHANGE', [{ sel: [l.handle] }, '31,2']);
    const ln = modelEntities(h.doc, 'LINE')[0] as LineEntity;
    expect(near(ln.start, 20, 0) && near(ln.end, 31, 2)).toBe(true);
  });
});
