/**
 * 74차: 표를 원본 지우기로 대칭하면(제자리에서 바뀌는 표) 새로 만든 그림 블록이 옛 블록 이름을 물려받는다.
 * 전에는 대칭·기울임마다 새 *T 블록을 만들고 옛 블록이 아무 객체도 쓰지 않은 채 남았다(실제 도면 편집 훑기에서 4건).
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, tableKey, type MTextEntity, type TableEntity } from '../../src/core/model';
import { registerModifyCommands } from '../../src/app/modify';
import { createTable, setText } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

function harness() {
  const h = perCommandGroups(makeHarness());
  registerModifyCommands(h.app);
  const nh = () => h.st.session.newHandle();
  const ts = defaultTableStyle(true, 'S1');
  const saved = saveTableStyleOps(h.doc, nh, ts);
  h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
  let t = createTable({ cols: 2, colWidth: 40, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
  t = setText(t, 2, 0, '가');
  const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data: t, style: ts, styleHandle: saved.handle, insert: { x: 10, y: 0, z: 0 }, props: entityDefaults() });
  h.st.session.commit({ label: 'TABLE', ops: added.ops });
  const tb = (x: string) => h.doc.entityIndex.get(x) as TableEntity;
  const tables = () => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is TableEntity => e.type === 'ACAD_TABLE');
  /** 표 그림 블록의 문자 위치(x) */
  const textX = (x: string) =>
    h.doc.blocks
      .get(tableKey(tb(x).block))!
      .entities.filter((e): e is MTextEntity => e.type === 'MTEXT')
      .map((e) => Math.round(e.insert.x * 1000) / 1000);
  /** 아무 객체도 쓰지 않는 *T 블록 */
  const unusedT = () => {
    const used = new Set<string>();
    for (const b of h.doc.blocks.values())
      for (const e of b.entities) {
        const n = (e as { block?: unknown }).block;
        if (typeof n === 'string') used.add(tableKey(n));
      }
    return [...h.doc.blocks.keys()].filter((k) => /^\*T\d+$/.test(k) && !used.has(k));
  };
  /** 블록 밖 핸들 색인 수 */
  const stale = () => {
    const inBlocks = new Set<string>();
    for (const b of h.doc.blocks.values()) for (const e of b.entities) inBlocks.add(e.handle);
    return [...h.doc.entityIndex.keys()].filter((x) => !inBlocks.has(x)).length;
  };
  return { h, table: added.table.handle, tb, tables, textX, unusedT, stale };
}

describe('표 대칭과 그림 블록', () => {
  it('원본 지우기: 새 그림이 옛 블록 이름을 물려받고, 명령 취소로 옛 그림이 돌아온다', async () => {
    const { h, table, tb, textX, unusedT, stale } = harness();
    const block = tb(table).block;
    const blocks = h.doc.blocks.size;
    const x0 = textX(table);
    await runWith(h, 'MIRROR', [{ sel: [table] }, '0,0', '0,10', 'Y']);
    expect(tb(table).block).toBe(block);
    expect(textX(table)).not.toEqual(x0);
    expect([unusedT(), stale(), h.doc.blocks.size]).toEqual([[], 0, blocks]);
    // 블록 정의 작업이 바꾸기보다 먼저
    expect(h.st.session.undoTop()!.ops.map((o) => o.kind)).toEqual(['blockDef', 'modify']);
    h.st.session.undo();
    expect([tb(table).block, textX(table), unusedT(), stale(), h.doc.blocks.size]).toEqual([block, x0, [], 0, blocks]);
  });

  it('원본 남기기: 복사본만 새 블록을 쓰고 원본 블록은 그대로', async () => {
    const { h, table, tb, tables, textX, unusedT } = harness();
    const block = tb(table).block;
    const x0 = textX(table);
    await runWith(h, 'MIRROR', [{ sel: [table] }, '0,0', '0,10', '']);
    const copy = tables().find((t) => t.handle !== table)!;
    expect([tb(table).block, textX(table)]).toEqual([block, x0]);
    expect(tableKey(copy.block)).not.toBe(tableKey(block));
    expect(unusedT()).toEqual([]);
  });

  it('블록을 함께 쓰는 표가 있으면 대칭한 표만 새 블록을 쓴다', async () => {
    const { h, table, tb, tables, textX, unusedT } = harness();
    const block = tb(table).block;
    await runWith(h, 'COPY', [{ sel: [table] }, '0,0', '0,100', '']);
    const other = tables().find((t) => t.handle !== table)!.handle;
    // 평행 이동한 복사본은 원본 그림 블록을 함께 쓴다(copyEntity)
    expect(tableKey(tb(other).block)).toBe(tableKey(block));
    const x0 = textX(other);
    await runWith(h, 'MIRROR', [{ sel: [table] }, '0,0', '0,10', 'Y']);
    expect(tableKey(tb(table).block)).not.toBe(tableKey(block));
    expect([tb(other).block, textX(other), unusedT()]).toEqual([block, x0, []]);
  });
});
