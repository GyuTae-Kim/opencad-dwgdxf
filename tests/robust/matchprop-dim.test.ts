/**
 * 71차: MATCHPROP이 치수 스타일·재지정을 옮길 때(편집 명령 불변식을 치수 명령으로 넓히다 찾았다).
 * 전에는 overrides만 바꾸고 치수 블록을 다시 만들지 않아 대상 치수가 옛 그림(옛 글자 높이)으로 남았고,
 * 재지정의 DSTYLE 확장 자료는 그대로라 DWG로 저장하면(확장 자료를 그대로 쓴다) 옛 재지정이 되살아났다.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, tableKey, type DimensionEntity, type MTextEntity } from '../../src/core/model';
import { dimensionBlockOps } from '../../src/app/dimcmds';
import { registerEditCommands } from '../../src/app/editcmds';
import { createLinearDimension } from '../../src/edit/dim';
import { applyOverrides } from '../../src/edit/annot/override';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

const P = (x: number, y: number) => ({ x, y, z: 0 });

/** 치수 A(재지정 없음)와 B(글자 높이 DIMTXT 5 재지정) */
function harness() {
  const h = perCommandGroups(makeHarness());
  registerEditCommands(h.app);
  const mk = (y: number, ov?: Record<number, number>) => {
    let d = createLinearDimension(h.doc, P(0, y), P(100, y), P(50, y + 5), { rotation: 0 });
    if (ov) d = applyOverrides(d, ov);
    const ops = dimensionBlockOps(h.st, d, false);
    d.handle = h.st.session.newHandle();
    d.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'DIM', ops: [...ops, { kind: 'add', block: MODEL_SPACE, entity: d }] });
    return d.handle;
  };
  const a = mk(0);
  const b = mk(20, { 140: 5 });
  const dim = (x: string) => h.doc.entityIndex.get(x) as DimensionEntity;
  /** 치수 블록에 그린 글자 높이 */
  const drawn = (x: string) => (h.doc.blocks.get(tableKey(dim(x).block))!.entities.find((e) => e.type === 'MTEXT') as MTextEntity).height;
  const dstyle = (x: string) => JSON.stringify(dim(x).xdata ?? []).includes('DSTYLE');
  const match = (from: string, to: string) => runWith(h, 'MATCHPROP', [{ pick: from, at: [dim(from).textMid.x, dim(from).textMid.y] }, { sel: [to] }, '']);
  return { h, a, b, dim, drawn, dstyle, match };
}

describe('MATCHPROP으로 치수 스타일·재지정 옮기기', () => {
  it('재지정이 없는 치수로 맞추면 대상의 재지정·DSTYLE이 빠지고 치수 블록을 다시 그린다(명령 취소 포함)', async () => {
    const { h, a, b, dim, drawn, dstyle, match } = harness();
    expect([drawn(b), dim(b).overrides, dstyle(b)]).toEqual([5, { 140: 5 }, true]);
    const block = dim(b).block;
    await match(a, b);
    expect([dim(b).overrides, dstyle(b), drawn(b), dim(b).block]).toEqual([undefined, false, drawn(a), block]);
    // 블록 작업이 바꾸기보다 먼저
    expect(h.st.session.undoTop()!.ops.map((o) => o.kind)).toEqual(['blockDef', 'modify']);
    h.st.session.undo();
    expect([drawn(b), dim(b).overrides, dstyle(b)]).toEqual([5, { 140: 5 }, true]);
  });

  it('재지정을 옮기면 대상에도 DSTYLE 확장 자료와 그 그림이 생기고, DWG로 저장해도 남는다', async () => {
    const { h, a, b, dim, drawn, dstyle, match } = harness();
    await match(b, a);
    expect([dim(a).overrides, dstyle(a), drawn(a)]).toEqual([{ 140: 5 }, true, 5]);
    // DWG는 확장 자료를 그대로 쓴다: 다시 읽은 재지정이 같아야 한다
    const back = readDwg(writeDwg(h.doc, { version: 'AC1018' }).data);
    const ov = (x: string) => (back.entityIndex.get(x) as DimensionEntity).overrides;
    expect([ov(a), ov(b)]).toEqual([{ 140: 5 }, { 140: 5 }]);
  });

  it('다른 재지정을 없애도 DWG로 저장한 대상에 옛 재지정이 되살아나지 않는다', async () => {
    const { h, a, b, match } = harness();
    await match(a, b);
    const back = readDwg(writeDwg(h.doc, { version: 'AC1018' }).data);
    expect((back.entityIndex.get(b) as DimensionEntity).overrides).toBeUndefined();
  });
});
