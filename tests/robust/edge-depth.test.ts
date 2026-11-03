/**
 * 64차: 모서리(TRIM·EXTEND)의 블록 깊이와 펼침 몫 안내.
 * 고치기 전에는 모서리가 블록을 네 겹까지만 들어가서, 블록을 다섯 겹 넘게 넣은 정상 도면에서 깊은 블록 안 객체가 자르기·연장 모서리가 되지 않았다.
 * 59차에 펼침 몫을 넣어 일은 몫이 묶으므로 깊이는 재귀 깊이만 막는다. 몫을 넘어 펼치지 못한 블록 참조는 명령줄에 알린다.
 */
import { describe, expect, it } from 'vitest';
import { EDGE_DEPTH_LIMIT, expandBudget } from '../../src/core/limits';
import { MODEL_SPACE, entityDefaults, type CadDocument, type Entity, type InsertEntity, type LineEntity } from '../../src/core/model';
import { registerModifyCommands } from '../../src/app/modify';
import { edgeBox, edgePieces } from '../../src/edit/geom/edges';
import { trimEntity } from '../../src/edit/geom/trim';
import { detectBoundary } from '../../src/edit/hatch/boundary';
import { MSG } from '../../src/edit/geom/types';
import { readDxf } from '../../src/io/dxf/reader';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';
import { line } from '../edit/make';
import { BLOCK_B, bytesOf, dxfText, insertOf, minsert, nestedBlocks } from './corrupt35';
import { beforeHang } from './timed';

const insert = (block: string, x = 0, y = 0): InsertEntity =>
  ({ ...entityDefaults(), handle: '', type: 'INSERT', block, insert: { x, y, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] }) as InsertEntity;

/** 블록 N0 → N1 → … → N{depth}를 하나씩 넣고 맨 아래에 (0,0)-(1,0) 선. fan개씩 넣으면 단마다 x = 0..fan-1로 옮긴다 */
function nestInto(doc: CadDocument, depth: number, fan = 1): void {
  for (let d = 0; d <= depth; d++) {
    const entities: Entity[] = d < depth ? Array.from({ length: fan }, (_, k) => insert(`N${d + 1}`, k)) : [{ ...line(0, 0, 1, 0), handle: '' }];
    doc.blocks.set(`N${d}`, { name: `N${d}`, handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities });
  }
}

function harness(depth: number, fan = 1) {
  const h = perCommandGroups(makeHarness((doc) => nestInto(doc, depth, fan)));
  registerModifyCommands(h.app);
  return h;
}

describe('모서리의 블록 깊이', () => {
  it('블록을 깊이 한도까지 넣은 도면의 선도 모서리와 모서리 상자가 된다(전에는 네 겹까지)', () => {
    const doc = readDxf(bytesOf(dxfText([insertOf('N0')], nestedBlocks(EDGE_DEPTH_LIMIT, 1))));
    const top = doc.blocks.get(MODEL_SPACE)!.entities[0]!;
    const pcs = edgePieces(top, doc);
    expect(pcs).toHaveLength(1);
    expect(pcs[0]).toMatchObject({ k: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    expect(edgeBox(top, doc)).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 0 });
    // 한도보다 한 겹 깊으면 내지 않는다(자기 자신을 넣은 블록의 재귀를 막는 깊이)
    const deeper = readDxf(bytesOf(dxfText([insertOf('N0')], nestedBlocks(EDGE_DEPTH_LIMIT + 1, 1))));
    expect(edgePieces(deeper.blocks.get(MODEL_SPACE)!.entities[0]!, deeper)).toEqual([]);
  });

  it('TRIM이 블록을 여섯 겹 넣은 선으로 자른다', async () => {
    const h = harness(6);
    const cut = h.add(insert('N0'));
    const v = h.add({ ...line(0.5, -1, 0.5, 1), handle: '' });
    await runWith(h, 'TRIM', ['O', 'S', { sel: [cut.handle] }, { pick: v.handle, at: [0.5, 0.5] }, '']);
    const l = h.doc.entityIndex.get(v.handle) as LineEntity;
    expect([l.start.y, l.end.y].sort((a, b) => a - b)).toEqual([-1, 0]);
    expect(h.printed).not.toContain(MSG.blockEdgesCut);
  });

  it('자기 자신을 넣은 블록도 몫 안에서 끝난다', () => {
    const blk = ['0', 'BLOCK', '8', '0', '2', 'A', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'A', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0'];
    for (let i = 0; i < 20; i++) blk.push('0', 'INSERT', '8', '0', '2', 'A', '10', String(i), '20', '0', '30', '0');
    blk.push('0', 'ENDBLK', '8', '0');
    const doc = readDxf(bytesOf(dxfText([insertOf('A')], [blk])));
    const top = doc.blocks.get(MODEL_SPACE)!.entities[0]!;
    const b = expandBudget(doc.entityIndex.size);
    beforeHang(() => edgePieces(top, doc, 0, b));
    expect(b.cut).toBe(true);
    expect(beforeHang(() => edgeBox(top, doc))).not.toBeNull();
  });
});

describe('펼침 몫을 넘은 모서리', () => {
  it('자르기에 넘긴 몫은 모든 모서리가 함께 쓰고 잘렸는지 알려 준다', () => {
    const doc = readDxf(bytesOf(dxfText([insertOf('N0', '1A'), insertOf('N0', '2A')], nestedBlocks(3, 40))));
    const [a, b] = doc.blocks.get(MODEL_SPACE)!.entities as InsertEntity[];
    const target: Entity = { ...line(0.5, -1, 0.5, 1), handle: 'T' };
    // 블록 참조 하나가 펼치는 일은 40 + 40^2 + 2 × 40^3 = 12만 9,640이라 몫(25만 + 객체 수) 안이고, 둘이 함께 쓰면 넘는다
    const one = expandBudget(doc.entityIndex.size);
    trimEntity(target, [a!], { x: 0.5, y: 0.5 }, { doc, budget: one });
    expect(one.cut).toBe(false);
    const both = expandBudget(doc.entityIndex.size);
    trimEntity(target, [a!, b!], { x: 0.5, y: 0.5 }, { doc, budget: both });
    expect(both.cut).toBe(true);
  });

  it('TRIM은 몫을 넘으면 명령줄에 한 번 알린다', async () => {
    // 1000 × 1000 다중 삽입은 펼치기 전에 몫을 넘는다
    const h = harness(0);
    const cut = h.add({ ...insert('N0'), rowCount: 1000, columnCount: 1000, rowSpacing: 2, columnSpacing: 2 } as InsertEntity);
    const v = h.add({ ...line(0.5, -1, 0.5, 1), handle: '' });
    const w = h.add({ ...line(0.25, -1, 0.25, 1), handle: '' });
    await runWith(h, 'TRIM', ['O', 'S', { sel: [cut.handle] }, { pick: v.handle, at: [0.5, 0.5] }, { pick: w.handle, at: [0.25, 0.5] }, '']);
    expect(h.printed.filter((t) => t === MSG.blockEdgesCut)).toHaveLength(1);
  });

  it('해치 경계 찾기도 몫을 넘으면 알린다', () => {
    const square = (x0: number, y0: number, x1: number, y1: number) => [line(x0, y0, x1, y0), line(x1, y0, x1, y1), line(x1, y1, x0, y1), line(x0, y1, x0, y0)].map((l, i) => ({ ...l, handle: `5${i}` }));
    const doc = readDxf(bytesOf(dxfText([minsert(1000, 1000)], [BLOCK_B])));
    const ents = [...doc.blocks.get(MODEL_SPACE)!.entities, ...square(-10, -10, -5, -5)];
    let cut = 0;
    const res = detectBoundary(doc, ents, { x: -7, y: -7 }, { onCut: () => cut++ });
    expect(cut).toBe(1);
    expect(res?.paths).toHaveLength(1);
    // 몫 안이면 부르지 않는다
    let none = 0;
    detectBoundary(doc, square(-10, -10, -5, -5), { x: -7, y: -7 }, { onCut: () => none++ });
    expect(none).toBe(0);
  });
});
