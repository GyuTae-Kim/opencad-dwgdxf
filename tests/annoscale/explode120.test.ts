/**
 * 120차: EXPLODE한 주석 객체(Autodesk EXPLODE 도움말 — 주석 객체는 지금 축척 표현을 분해하고 그 결과는 주석이 아니다,
 * 다른 축척 표현은 버린다). 전에는 MTEXT의 TEXT가 주석 표지를 물려받아 확정 고리가 지금 축척 레코드를 붙였고(주석으로 남음),
 * 치수 그림·주석 아닌 MTEXT의 문자는 표지 없이 주석 문자 스타일이라 고리가 새 주석 문자로 보아 축척 배율만큼 키웠다.
 */
import { describe, expect, it } from 'vitest';
import type { BlockDef, DimensionEntity, Entity, LineEntity, MLeaderEntity, MTextEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { commitOwn, installAnnoHooks, setCannoscale } from '../../src/app/annoscale-core';
import { registerModifyCommands } from '../../src/app/modify';
import {
  ScaleIndex,
  addScales,
  annoState,
  annotativeFlag,
  explodeView,
  plainExplodedParts,
  regenerateDimension,
  withAnnotativeFlag,
} from '../../src/edit/annoscale';
import { createLinearDimension } from '../../src/edit/dim/create';
import { explodeEntity } from '../../src/edit/geom/explode';
import type { EditOp } from '../../src/edit/session';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { envOf, insert, mtext, text } from './helpers';
import { annotate, mleader } from './ctxfix';

/** 묶음 번호 감싸기(perCommandGroups)는 쓰지 않는다 — 감싼 commit이 새 변경 객체를 만들어 이 모듈의 변경(commitOwn)을 고리가 다시 다룬다 */
function harness() {
  const h = makeHarness((doc) => void Object.assign(doc, createNewDocument('metric')));
  installAnnoHooks(h.app);
  registerModifyCommands(h.app);
  h.doc.textStyles.set('ANNOTATIVE', { ...h.doc.textStyles.get('STANDARD')!, name: 'Annotative', handle: 'FFF1', xdata: withAnnotativeFlag(undefined, true) });
  return h;
}
type H = ReturnType<typeof harness>;

const model = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities;
const explode = (h: H, hs: string[]) => runWith(h, 'EXPLODE', [{ sel: hs }]);
/** 확정 고리가 만든 객체 레코드 수 */
const records = (h: H) => [...h.doc.objects.values()].filter((o) => /CONTEXTDATA_CLASS$/.test(o.type)).length;

describe('EXPLODE한 주석 객체는 지금 축척 표현의 주석 아닌 객체가 된다', () => {
  it('주석 MTEXT → 주석이 아닌 TEXT(표지 {1, 0}), 높이는 보이는 축척의 높이, 다른 축척 표현은 버린다', async () => {
    const h = harness();
    setCannoscale(h.app, h.st, '1:20', 1);
    const m = h.add({ ...mtext(0, 0, 2.5), style: 'Annotative', text: 'AB\\PCD' }) as MTextEntity;
    expect(m.height).toBeCloseTo(50);
    const a = addScales(envOf(h.doc, h.st.session), m, ['1:50']);
    h.st.session.commit({ label: 'X', ops: [...a.ops, ...(a.entity !== m ? [{ kind: 'modify' as const, block: MODEL_SPACE, before: m, after: a.entity }] : [])] });
    expect(annoState(h.doc, h.doc.entityIndex.get(m.handle)!)?.scales).toEqual(['1:20', '1:50']);
    const before = records(h);
    await explode(h, [m.handle]);
    const ts = model(h).filter((e) => e.type === 'TEXT') as TextEntity[];
    expect(ts.map((t) => t.text)).toEqual(['AB', 'CD']);
    for (const t of ts) {
      expect(annoState(h.doc, t)).toBeNull();
      expect(annotativeFlag(t.xdata)).toBe(false);
      expect(t.xdict).toBeUndefined();
      expect(t.height).toBeCloseTo(50);
    }
    // 새 TEXT에 레코드가 붙지 않았다(MTEXT의 두 레코드는 원본과 함께 남아 명령 취소로 돌아온다)
    expect(records(h)).toBe(before);
    h.st.session.undo();
    expect(model(h).map((e) => e.type)).toEqual(['MTEXT']);
    expect(annoState(h.doc, model(h)[0]!)?.scales).toEqual(['1:20', '1:50']);
  });

  it('CANNOSCALE을 바꾼 뒤 분해하면 그 축척(1:50)의 높이로 남는다', async () => {
    const h = harness();
    setCannoscale(h.app, h.st, '1:20', 1);
    const m = h.add({ ...mtext(0, 0, 2.5), style: 'Annotative' }) as MTextEntity;
    const a = addScales(envOf(h.doc, h.st.session), m, ['1:50']);
    h.st.session.commit({ label: 'X', ops: [...a.ops, ...(a.entity !== m ? [{ kind: 'modify' as const, block: MODEL_SPACE, before: m, after: a.entity }] : [])] });
    setCannoscale(h.app, h.st, '1:50', 2);
    await explode(h, [m.handle]);
    const t = model(h).find((e) => e.type === 'TEXT') as TextEntity;
    expect(t.height).toBeCloseTo(125);
    expect(annoState(h.doc, t)).toBeNull();
  });

  it('explodeView: 지원하는 다른 축척(활성 뷰포트 등)이면 그 표현, 지원하지 않거나 주석이 아니면 객체 그대로', () => {
    const h = harness();
    setCannoscale(h.app, h.st, '1:20', 1);
    const m = h.add({ ...mtext(0, 0, 2.5), style: 'Annotative' }) as MTextEntity;
    const a = addScales(envOf(h.doc, h.st.session), m, ['1:50']);
    h.st.session.commit({ label: 'X', ops: [...a.ops, ...(a.entity !== m ? [{ kind: 'modify' as const, block: MODEL_SPACE, before: m, after: a.entity }] : [])] });
    const cur = h.doc.entityIndex.get(m.handle) as MTextEntity;
    const idx = new ScaleIndex(h.doc);
    expect((explodeView(h.doc, cur, '1:50', idx) as MTextEntity).height).toBeCloseTo(125);
    expect(explodeView(h.doc, cur, '1:20', idx)).toBe(cur);
    expect(explodeView(h.doc, cur, '1:100', idx)).toBe(cur);
    const plain = h.add(text(0, 0, 3)) as TextEntity;
    expect(explodeView(h.doc, plain, '1:50', idx)).toBe(plain);
    // 표현을 분해한 TEXT 높이
    const parts = explodeEntity(explodeView(h.doc, cur, '1:50', idx), h.doc).add as TextEntity[];
    expect(parts[0]!.height).toBeCloseTo(125);
    expect(annotativeFlag(parts[0]!.xdata)).toBe(false);
  });

  it('주석 치수 → 그림 문자(주석 문자 스타일, 표지 없음)는 그린 높이 그대로 주석이 아니다(전에는 고리가 배율만큼 다시 키웠다)', async () => {
    const h = harness();
    const std = h.doc.dimStyles.get('STANDARD') ?? [...h.doc.dimStyles.values()][0]!;
    h.doc.dimStyles.set('ANNO', { ...std, name: 'Anno', handle: 'FFF2', vars: { ...std.vars, DIMTXSTY: 'Annotative', DIMTXT: 2.5 }, xdata: withAnnotativeFlag(undefined, true) });
    setCannoscale(h.app, h.st, '1:5', 1);
    const d0 = createLinearDimension(h.doc, { x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 50, y: 20, z: 0 }, { style: 'Anno' });
    const ops: EditOp[] = [];
    const withBlock = regenerateDimension(envOf(h.doc, h.st.session), d0, null, ops);
    withBlock.handle = h.st.session.newHandle();
    withBlock.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'DIM', ops: [...ops, { kind: 'add', block: MODEL_SPACE, entity: withBlock }] });
    const d = h.doc.entityIndex.get(withBlock.handle) as DimensionEntity;
    expect(annoState(h.doc, d)?.scales).toEqual(['1:5']);
    const drawn = h.doc.blocks.get(tableKey(d.block))!.entities.find((e) => e.type === 'MTEXT') as MTextEntity;
    expect(drawn.style).toBe('Annotative');
    expect(drawn.height).toBeCloseTo(12.5);
    await explode(h, [d.handle]);
    const mt = model(h).find((e) => e.type === 'MTEXT') as MTextEntity;
    expect(mt.height).toBeCloseTo(12.5);
    expect(annoState(h.doc, mt)).toBeNull();
    expect(annotativeFlag(mt.xdata)).toBe(false);
    expect(model(h).some((e) => e.type === 'DIMENSION')).toBe(false);
  });

  it('주석 다중 지시선(주석 문자 스타일) → MTEXT는 지금 축척의 문자 높이 그대로 주석이 아니다', async () => {
    const h = harness();
    setCannoscale(h.app, h.st, '1:20', 1);
    const m: MLeaderEntity = { ...mleader(), textStyleHandle: 'FFF1', handle: h.st.session.newHandle(), owner: h.doc.blocks.get(MODEL_SPACE)!.recordHandle };
    commitOwn(h.st, 'TEST', [{ kind: 'add', block: MODEL_SPACE, entity: m }]);
    annotate(h.doc, h.st.session, h.doc.entityIndex.get(m.handle)!, ['1:20']);
    const am = h.doc.entityIndex.get(m.handle) as MLeaderEntity;
    expect([annoState(h.doc, am)?.scales, am.context.textHeight]).toEqual([['1:20'], 80]);
    await explode(h, [m.handle]);
    const mt = model(h).find((e) => e.type === 'MTEXT') as MTextEntity;
    expect([mt.style, mt.height, annoState(h.doc, mt), annotativeFlag(mt.xdata)]).toEqual(['Annotative', 80, null, false]);
    expect(model(h).some((e) => e.type === 'MULTILEADER')).toBe(false);
  });

  it('주석이 아닌 MTEXT(주석 문자 스타일, 표지 없음 — AutoCAD가 쓴 꼴)를 분해해도 TEXT 크기가 그대로이고 주석이 아니다', async () => {
    const h = harness();
    setCannoscale(h.app, h.st, '1:20', 1);
    const m: MTextEntity = { ...mtext(0, 0, 2.5), style: 'Annotative', handle: h.st.session.newHandle(), owner: h.doc.blocks.get(MODEL_SPACE)!.recordHandle };
    commitOwn(h.st, 'TEST', [{ kind: 'add', block: MODEL_SPACE, entity: m }]);
    expect(annoState(h.doc, h.doc.entityIndex.get(m.handle)!)).toBeNull();
    await explode(h, [m.handle]);
    const t = model(h).find((e) => e.type === 'TEXT') as TextEntity;
    expect(t.height).toBeCloseTo(2.5);
    expect(annoState(h.doc, t)).toBeNull();
  });

  it('주석 블록 참조 → 지금 축척 표현(그 축척의 블록 축척)으로 내용을 옮긴다', async () => {
    const h = harness();
    const tag = text(0, 0, 2, 'Standard', 'T');
    tag.handle = 'F110';
    const def: BlockDef = { name: 'TAG', handle: 'F100', recordHandle: 'F101', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [tag, { type: 'LINE', ...entityDefaults(), handle: 'F111', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity] };
    h.doc.blocks.set('TAG', def);
    h.doc.blockRecords.set('TAG', { name: 'TAG', handle: 'F101', flags: 0, insertUnits: 0, explodable: true, scalable: true, xdata: withAnnotativeFlag(undefined, true) });
    setCannoscale(h.app, h.st, '1:10', 1);
    const b = h.add(insert('TAG', 0, 0));
    expect((b as { scale: { x: number } }).scale.x).toBeCloseTo(10);
    const a = addScales(envOf(h.doc, h.st.session), b, ['1:20']);
    h.st.session.commit({ label: 'X', ops: [...a.ops, ...(a.entity !== b ? [{ kind: 'modify' as const, block: MODEL_SPACE, before: b, after: a.entity }] : [])] });
    // 다른 축척(활성 뷰포트의 1:20)이면 블록 축척 20의 내용
    const parts = explodeEntity(explodeView(h.doc, h.doc.entityIndex.get(b.handle)!, '1:20', new ScaleIndex(h.doc)), h.doc).add!;
    const t = parts.find((e) => e.type === 'TEXT') as TextEntity;
    const l = parts.find((e) => e.type === 'LINE') as LineEntity;
    expect([t.height, l.end.x]).toEqual([expect.closeTo(40), expect.closeTo(20)]);
    await explode(h, [b.handle]);
    const t2 = model(h).find((e) => e.type === 'TEXT') as TextEntity;
    expect(t2.height).toBeCloseTo(20);
    expect(annoState(h.doc, t2)).toBeNull();
    expect(model(h).some((e) => e.type === 'INSERT')).toBe(false);
  });
});

describe('plainExplodedParts', () => {
  it('주석 원본: 문자는 {1, 0}, 이어받은 표지는 뺀다(선), 다중 지시선은 293 = 0. 주석이 아닌 원본은 주석 스타일의 표지 없는 문자만', () => {
    const doc = createNewDocument('metric');
    doc.textStyles.set('ANNOTATIVE', { ...doc.textStyles.get('STANDARD')!, name: 'Annotative', handle: 'FFF1', xdata: withAnnotativeFlag(undefined, true) });
    const on = withAnnotativeFlag([{ app: 'OTHER', items: [{ code: 1000, value: 'x' }] }], true);
    const ln = { type: 'LINE', ...entityDefaults(), start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, xdata: on } as LineEntity;
    const mt = { ...mtext(0, 0, 1), style: 'Annotative' };
    const plainStyle = { ...text(0, 0, 1), xdata: on };
    const ml = { type: 'MULTILEADER', ...entityDefaults(), props: { 293: 1 } } as unknown as MLeaderEntity;
    plainExplodedParts(doc, [ln, mt, plainStyle, ml] as Entity[], true);
    expect(ln.xdata).toEqual([{ app: 'OTHER', items: [{ code: 1000, value: 'x' }] }]);
    expect([annotativeFlag(mt.xdata), annotativeFlag(plainStyle.xdata)]).toEqual([false, false]);
    expect(ml.props?.[293]).toBe(0);
    // 주석이 아닌 원본: 주석 스타일의 표지 없는 문자만 {1, 0}, 표준 스타일 문자·선은 그대로
    const ln2 = { ...ln, xdata: on };
    const mt2 = { ...mtext(0, 0, 1), style: 'Annotative' };
    const t2 = text(0, 0, 1);
    // 주석이 아닌 블록 안의 주석 문자(표지 1)는 주석으로 남는다
    const t3 = { ...text(0, 0, 1), xdata: on };
    plainExplodedParts(doc, [ln2, mt2, t2, t3] as Entity[], false);
    expect([annotativeFlag(ln2.xdata), annotativeFlag(mt2.xdata), t2.xdata, annotativeFlag(t3.xdata)]).toEqual([true, false, undefined, true]);
  });
});
