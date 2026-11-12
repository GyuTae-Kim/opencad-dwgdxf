/**
 * 120차: MATCHPROP의 주석 특성(Autodesk 특성 설정 대화 상자 — 문자·치수·다중 지시선은 스타일과 함께 주석 특성을 대상에 옮긴다).
 * 전에는 스타일·높이만 옮기고 주석 여부는 그대로라, 주석 문자를 원본으로 보통 문자에 맞추면 높이만 모형 높이(1:20이면 용지 높이의
 * 20배)가 된 보통 문자가 됐다. 이제 주석 여부가 다르면 대상도 원본처럼 주석이 되거나(그 공간의 주석 축척 — ANNOUPDATE와 같은 크기)
 * 주석이 아니게 된다(특성 팔레트처럼 용지 크기로 돌린 뒤 특성을 옮긴다).
 */
import { describe, expect, it } from 'vitest';
import type { DimensionEntity, Entity, MLeaderEntity, MTextEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { commitOwn, installAnnoHooks, setCannoscale } from '../../src/app/annoscale-core';
import { registerEditCommands, setMatchSettings, MATCH_SETTINGS } from '../../src/app/editcmds';
import { annoState, annotativeFlag, contextRecords, regenerateDimension, withAnnotativeFlag } from '../../src/edit/annoscale';
import { createLinearDimension } from '../../src/edit/dim/create';
import type { EditOp } from '../../src/edit/session';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { mtext, text } from './helpers';
import { annotate, mleader } from './ctxfix';

/** 묶음 번호 감싸기(perCommandGroups)는 쓰지 않는다 — 감싼 commit이 새 변경 객체를 만들어 이 모듈의 변경(commitOwn)을 고리가 다시 다룬다 */
function harness() {
  const h = makeHarness((doc) => void Object.assign(doc, createNewDocument('metric')));
  installAnnoHooks(h.app);
  registerEditCommands(h.app);
  setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key)));
  h.doc.textStyles.set('ANNOTATIVE', { ...h.doc.textStyles.get('STANDARD')!, name: 'Annotative', handle: 'FFF1', xdata: withAnnotativeFlag(undefined, true) });
  setCannoscale(h.app, h.st, '1:20', 1);
  return h;
}
type H = ReturnType<typeof harness>;

/** 고리를 거치지 않고 넣는다(주석이 아닌 객체를 주석 스타일로 두려고 — AutoCAD가 쓴 꼴) */
function put<T extends Entity>(h: H, e: T): T {
  e.handle = h.st.session.newHandle();
  e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  commitOwn(h.st, 'TEST', [{ kind: 'add', block: MODEL_SPACE, entity: e }]);
  return h.doc.entityIndex.get(e.handle) as T;
}
const get = <T extends Entity>(h: H, x: string) => h.doc.entityIndex.get(x) as T;
const match = (h: H, from: string, to: string[]) => runWith(h, 'MATCHPROP', [{ pick: from, at: [0, 0] }, { sel: to }, '']);
const recs = (h: H, x: string) => contextRecords(h.doc, get(h, x)).length;

describe('MATCHPROP이 문자·치수·다중 지시선의 주석 특성을 옮긴다', () => {
  it('주석 TEXT → 보통 TEXT: 대상이 그 공간 축척(1:20)의 주석 TEXT, 높이는 원본 높이(같은 종류), 명령 취소 한 번', async () => {
    const h = harness();
    const src = h.add({ ...text(0, 0, 2.5, 'Annotative'), text: 'S' });
    expect((src as TextEntity).height).toBeCloseTo(50);
    const dst = put(h, text(0, 20, 3));
    await match(h, src.handle, [dst.handle]);
    const d = get<TextEntity>(h, dst.handle);
    expect([d.style, d.height, annoState(h.doc, d)?.scales, annotativeFlag(d.xdata), recs(h, dst.handle)]).toEqual(['Annotative', expect.closeTo(50), ['1:20'], true, 1]);
    h.st.session.undo();
    const u = get<TextEntity>(h, dst.handle);
    expect([u.style, u.height, annoState(h.doc, u), u.xdict]).toEqual(['Standard', 3, null, undefined]);
  });

  it('주석 MTEXT → 보통 TEXT(다른 종류 — 높이는 옮기지 않는다): 스타일 높이 0이면 크기 그대로, 고정 높이면 용지 높이 × 배율', async () => {
    const h = harness();
    const src = h.add({ ...mtext(0, 0, 2.5), style: 'Annotative' });
    const dst = put(h, text(0, 20, 3));
    await match(h, src.handle, [dst.handle]);
    expect([get<TextEntity>(h, dst.handle).height, annoState(h.doc, get(h, dst.handle))?.scales]).toEqual([expect.closeTo(3), ['1:20']]);
    // 스타일 고정 높이 2.5(ANNOUPDATE와 같은 길)
    h.doc.textStyles.set('ANNOTATIVE', { ...h.doc.textStyles.get('ANNOTATIVE')!, height: 2.5 });
    const dst2 = put(h, text(0, 40, 3));
    await match(h, src.handle, [dst2.handle]);
    expect(get<TextEntity>(h, dst2.handle).height).toBeCloseTo(50);
  });

  it('보통 문자 → 주석 문자: 대상이 주석이 아니게 되고(표지 {1, 0}, 레코드 지움) 같은 종류면 원본 높이, 다른 종류면 용지 높이', async () => {
    const h = harness();
    const t1 = h.add(text(0, 0, 2.5, 'Annotative'));
    const t2 = h.add({ ...text(0, 20, 2.5, 'Annotative'), text: 'T2' });
    expect(recs(h, t1.handle)).toBe(1);
    const plainT = put(h, text(0, 40, 3));
    const plainM = put(h, mtext(0, 60, 3));
    await match(h, plainT.handle, [t1.handle]);
    const a = get<TextEntity>(h, t1.handle);
    expect([a.style, a.height, annoState(h.doc, a), annotativeFlag(a.xdata), recs(h, t1.handle)]).toEqual(['Standard', 3, null, false, 0]);
    await match(h, plainM.handle, [t2.handle]);
    const b = get<TextEntity>(h, t2.handle);
    expect([b.style, b.height, annoState(h.doc, b)]).toEqual(['Standard', expect.closeTo(2.5), null]);
  });

  it('설정(S)에서 문자를 끄면 주석 특성도 옮기지 않는다', async () => {
    const h = harness();
    setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key).filter((k) => k !== 'text')));
    const src = h.add(text(0, 0, 2.5, 'Annotative'));
    const dst = put(h, text(0, 20, 3));
    await match(h, src.handle, [dst.handle]);
    expect(annoState(h.doc, get(h, dst.handle))).toBeNull();
    setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key)));
  });

  it('치수: 주석 치수 → 보통 치수는 DIMSCALE = 배율로 다시 그린 주석 치수, 반대는 레코드를 지우고 원본 스타일로 다시 그린다', async () => {
    const h = harness();
    const std = h.doc.dimStyles.get('STANDARD') ?? [...h.doc.dimStyles.values()][0]!;
    h.doc.dimStyles.set('ANNO', { ...std, name: 'Anno', handle: 'FFF2', vars: { ...std.vars, DIMTXT: 2.5 }, xdata: withAnnotativeFlag(undefined, true) });
    const mk = (y: number, style: string): DimensionEntity => {
      const d0 = createLinearDimension(h.doc, { x: 0, y, z: 0 }, { x: 100, y, z: 0 }, { x: 50, y: y + 10, z: 0 }, { style });
      const ops: EditOp[] = [];
      const d = regenerateDimension({ doc: h.doc, alloc: () => h.st.session.newHandle(), idx: undefined as never }, d0, null, ops);
      d.handle = h.st.session.newHandle();
      d.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
      h.st.session.commit({ label: 'DIM', ops: [...ops, { kind: 'add', block: MODEL_SPACE, entity: d }] });
      return h.doc.entityIndex.get(d.handle) as DimensionEntity;
    };
    const drawn = (x: string) => (h.doc.blocks.get(tableKey(get<DimensionEntity>(h, x).block))!.entities.find((e) => e.type === 'MTEXT') as MTextEntity).height;
    const a = mk(0, 'Anno');
    const p = mk(100, 'Standard');
    expect([annoState(h.doc, a)?.scales, drawn(a.handle)]).toEqual([['1:20'], expect.closeTo(50)]);
    await match(h, a.handle, [p.handle]);
    const p2 = get<DimensionEntity>(h, p.handle);
    expect([p2.dimStyle, annoState(h.doc, p2)?.scales, p2.overrides?.[40], drawn(p.handle)]).toEqual(['Anno', ['1:20'], 20, expect.closeTo(50)]);
    // 반대: 보통 치수(새로) → 주석 치수 a
    const q = mk(200, 'Standard');
    const qDrawn = drawn(q.handle);
    await match(h, q.handle, [a.handle]);
    const a2 = get<DimensionEntity>(h, a.handle);
    expect([a2.dimStyle, annoState(h.doc, a2), recs(h, a.handle), a2.overrides?.[40], drawn(a.handle)]).toEqual(['Standard', null, 0, undefined, expect.closeTo(qDrawn)]);
  });

  it('다중 지시선: 주석 다중 지시선 → 보통 다중 지시선은 전체 축척 = 배율의 주석 다중 지시선, 반대는 용지 크기로', async () => {
    const h = harness();
    const m1 = put(h, mleader());
    annotate(h.doc, h.st.session, m1, ['1:20']);
    const am = get<MLeaderEntity>(h, m1.handle);
    expect([am.context.scale, am.context.textHeight]).toEqual([20, 80]);
    const m2 = put(h, { ...mleader(), context: { ...mleader().context, scale: 2, textHeight: 8, arrowSize: 8 } });
    await match(h, m1.handle, [m2.handle]);
    const b = get<MLeaderEntity>(h, m2.handle);
    expect([annoState(h.doc, b)?.scales, b.context.scale, b.context.textHeight, b.props?.[293]]).toEqual([['1:20'], expect.closeTo(20), expect.closeTo(80), 1]);
    const m3 = put(h, mleader());
    await match(h, m3.handle, [m1.handle]);
    const c = get<MLeaderEntity>(h, m1.handle);
    expect([annoState(h.doc, c), c.context.scale, c.context.textHeight, c.props?.[293]]).toEqual([null, expect.closeTo(1), expect.closeTo(4), 0]);
  });
});
