/**
 * 72차: MATCHPROP이 표 스타일을 옮길 때(71차 치수와 같은 결함 — 표는 익명 *T 블록으로 그린다).
 * 전에는 표 객체의 스타일 핸들만 바꾸고 그림 블록을 다시 만들지 않아, 대상 표가 옛 스타일의 그림(옛 글자 높이)으로 남았다.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, tableKey, type MTextEntity, type TableEntity } from '../../src/core/model';
import { registerEditCommands } from '../../src/app/editcmds';
import { createTable, setText } from '../../src/edit/table/model';
import { type TableStyle, defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

/** 자료 글자 높이 4.5(S1)·9(S2) 스타일의 표 A(S1)·B(S2, 도면층 L2·색 3) */
function harness() {
  const h = perCommandGroups(makeHarness());
  registerEditCommands(h.app);
  const nh = () => h.st.session.newHandle();
  const style = (name: string, height: number) => {
    const ts = defaultTableStyle(true, name);
    ts.cells.data.height = height;
    const saved = saveTableStyleOps(h.doc, nh, ts);
    h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
    return { ts, handle: saved.handle };
  };
  const s1 = style('S1', 4.5);
  const s2 = style('S2', 9);
  const table = (s: { ts: TableStyle; handle: string }, y: number, props = {}) => {
    let t = createTable({ cols: 2, colWidth: 40, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, s.ts);
    t = setText(t, 2, 0, '가');
    const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data: t, style: s.ts, styleHandle: s.handle, insert: { x: 0, y, z: 0 }, props: { ...entityDefaults(), ...props } });
    h.st.session.commit({ label: 'TABLE', ops: added.ops });
    return added.table.handle;
  };
  const a = table(s1, 0);
  const b = table(s2, 200, { layer: 'L2', color: { aci: 3 } });
  const tb = (x: string) => h.doc.entityIndex.get(x) as TableEntity;
  /** 표 그림 블록의 문자 높이(자료 셀 하나) */
  const drawn = (x: string) => h.doc.blocks.get(tableKey(tb(x).block))!.entities.filter((e) => e.type === 'MTEXT').map((e) => (e as MTextEntity).height);
  return { h, s1, s2, a, b, tb, drawn };
}

describe('MATCHPROP으로 표 스타일 옮기기', () => {
  it('표 그림 블록을 새 스타일로 다시 만들고, 공통 특성도 옮긴다(명령 취소 포함)', async () => {
    const { h, s1, s2, a, b, tb, drawn } = harness();
    expect([tb(b).tableStyle, drawn(b)]).toEqual([s2.handle, [9]]);
    const block = tb(b).block;
    await runWith(h, 'MATCHPROP', [{ pick: a, at: [0, 0] }, { sel: [b] }, '']);
    expect([tb(b).tableStyle, drawn(b), tb(b).block, tb(b).layer, tb(b).color]).toEqual([s1.handle, [4.5], block, tb(a).layer, tb(a).color]);
    // 그림 블록 작업이 바꾸기보다 먼저
    expect(h.st.session.undoTop()!.ops.map((o) => o.kind)).toEqual(['blockDef', 'modify']);
    h.st.session.undo();
    expect([tb(b).tableStyle, drawn(b), tb(b).layer]).toEqual([s2.handle, [9], 'L2']);
  });
});
