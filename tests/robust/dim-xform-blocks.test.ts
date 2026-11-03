/**
 * 69차: 치수를 옮기거나 복사할 때의 치수 블록(66차에 남긴 연관 도면 COPY·MOVE의 남은 몫을 재다 찾았다).
 * commitResults는 변환이 만든 치수 블록(*D)을 넣은 뒤 치수 생성기로 블록을 다시 만들었다. 그래서 옮기면 변환이 만든 블록이 쓰이지 않은 채 남고
 * (치수 1만 개를 옮길 때마다 *D 1만 개), 복사하면 생성기가 같은 이름으로 블록을 또 넣어 앞 블록의 객체가 핸들 색인에 남았다(치수 1만 개 복사에 9만 개).
 * 생성기가 못 다룬 치수를 옮기면 커널이 옮긴 블록 대신 옮기기 전 블록을 가리켰다.
 */
import { describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, tableKey, type CadDocument, type DimensionEntity, type Entity, type LineEntity } from '../../src/core/model';
import { dimensionBlockOps } from '../../src/app/dimcmds';
import { registerModifyCommands } from '../../src/app/modify';
import { createLinearDimension } from '../../src/edit/dim';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

const fail = vi.hoisted(() => ({ on: false, calls: 0 }));
// 생성기가 못 다루는 치수 흉내(앱 모듈은 서로 가져와서 dimcmds를 흉내 내면 commitResults에 닿지 않는다)
vi.mock('../../src/edit/dim/generate', async (orig) => {
  const m = await orig<typeof import('../../src/edit/dim/generate')>();
  return {
    ...m,
    generateDimensionGeometry: (...a: Parameters<typeof m.generateDimensionGeometry>) => {
      if (fail.on) {
        fail.calls++;
        throw new Error('생성기가 못 다루는 치수');
      }
      return m.generateDimensionGeometry(...a);
    },
  };
});

const P = (x: number, y: number) => ({ x, y, z: 0 });

/** 선형 치수 n개(치수마다 생성기 그림의 *D 블록) */
function harness(n: number) {
  const h = perCommandGroups(makeHarness());
  registerModifyCommands(h.app);
  for (let i = 0; i < n; i++) {
    const d = createLinearDimension(h.doc, P(0, i * 10), P(100, i * 10), P(50, i * 10 + 5), { rotation: 0 });
    const ops = dimensionBlockOps(h.st, d, false);
    d.handle = h.st.session.newHandle();
    d.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'DIM', ops: [...ops, { kind: 'add', block: MODEL_SPACE, entity: d }] });
  }
  return h;
}

const dimsOf = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');

/** 치수 블록 수, 아무 치수도 쓰지 않는 치수 블록 수, 어느 블록에도 없는 핸들 색인 항목 수 */
function audit(doc: CadDocument) {
  const inBlocks = new Set<string>();
  const used = new Set<string>();
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      inBlocks.add(e.handle);
      if (e.type === 'DIMENSION') used.add(tableKey(e.block));
    }
  const dBlocks = [...doc.blocks.keys()].filter((k) => /^\*D\d+$/.test(k));
  return { dBlocks: dBlocks.length, unused: dBlocks.filter((k) => !used.has(k)).length, stale: [...doc.entityIndex.keys()].filter((x) => !inBlocks.has(x)).length };
}

/** 치수 블록 안 선들의 가장 낮은 Y */
const lowY = (doc: CadDocument, d: DimensionEntity) =>
  Math.min(...doc.blocks.get(tableKey(d.block))!.entities.filter((e): e is LineEntity => e.type === 'LINE').flatMap((l) => [l.start.y, l.end.y]));

describe('치수를 옮기거나 복사할 때의 치수 블록', () => {
  it('MOVE: 치수 블록을 제자리에서 다시 만들고 쓰이지 않는 블록을 남기지 않는다', async () => {
    const h = harness(3);
    const before = dimsOf(h.doc).map((d) => [d.block, lowY(h.doc, d)] as const);
    await runWith(h, 'MOVE', [{ sel: dimsOf(h.doc).map((d) => d.handle) }, '0,0', '0,30']);
    expect(audit(h.doc)).toEqual({ dBlocks: 3, unused: 0, stale: 0 });
    dimsOf(h.doc).forEach((d, i) => {
      expect(d.block).toBe(before[i]![0]);
      expect(lowY(h.doc, d)).toBeCloseTo(before[i]![1] + 30, 9);
    });
    // 새 블록 없이 치수 블록 셋을 바꾸기만 한다
    const tx = h.st.session.undoTop()!;
    expect(tx.ops.filter((o) => o.kind === 'blockRecord')).toHaveLength(0);
    expect(tx.ops.filter((o) => o.kind === 'blockDef').map((o) => (o as { before: unknown }).before !== null)).toEqual([true, true, true]);
    h.st.session.undo();
    expect(audit(h.doc)).toEqual({ dBlocks: 3, unused: 0, stale: 0 });
  });

  it('COPY: 복사한 치수마다 블록 하나를 넣고, 덮인 블록의 객체를 핸들 색인에 남기지 않는다(되돌리기·다시 하기 포함)', async () => {
    const h = harness(3);
    const src = dimsOf(h.doc).map((d) => [d.handle, d.block, lowY(h.doc, d)] as const);
    await runWith(h, 'COPY', [{ sel: src.map(([x]) => x) }, '0,0', '0,30', '']);
    expect(audit(h.doc)).toEqual({ dBlocks: 6, unused: 0, stale: 0 });
    const tx = h.st.session.undoTop()!;
    expect(tx.ops.filter((o) => o.kind === 'blockDef')).toHaveLength(3);
    expect(new Set(tx.ops.filter((o) => o.kind === 'blockDef').map((o) => (o as { key: string }).key)).size).toBe(3);
    const copies = dimsOf(h.doc).filter((d) => !src.some(([x]) => x === d.handle));
    expect(copies).toHaveLength(3);
    copies.forEach((d, i) => {
      expect(src.map(([, b]) => b)).not.toContain(d.block);
      expect(lowY(h.doc, d)).toBeCloseTo(src[i]![2] + 30, 9);
    });
    // 원본 치수 블록은 그대로
    for (const [x, b, y] of src) {
      const d = h.doc.entityIndex.get(x) as DimensionEntity;
      expect(d.block).toBe(b);
      expect(lowY(h.doc, d)).toBeCloseTo(y, 9);
    }
    h.st.session.undo();
    expect(audit(h.doc)).toEqual({ dBlocks: 3, unused: 0, stale: 0 });
    h.st.session.redo();
    expect(audit(h.doc)).toEqual({ dBlocks: 6, unused: 0, stale: 0 });
  });

  it('생성기가 못 다룬 치수는 변환이 옮긴 블록을 쓴다(MOVE는 전에 옮기기 전 블록을 가리켰다)', async () => {
    const h = harness(2);
    const y0 = dimsOf(h.doc).map((d) => lowY(h.doc, d));
    fail.on = true;
    try {
      await runWith(h, 'MOVE', [{ sel: dimsOf(h.doc).map((d) => d.handle) }, '0,0', '0,30']);
      expect(fail.calls).toBe(2);
      dimsOf(h.doc).forEach((d, i) => expect(lowY(h.doc, d)).toBeCloseTo(y0[i]! + 30, 9));
      await runWith(h, 'COPY', [{ sel: dimsOf(h.doc).map((d) => d.handle) }, '0,0', '0,30', '']);
    } finally {
      fail.on = false;
    }
    const ys = dimsOf(h.doc).map((d) => lowY(h.doc, d));
    expect(ys).toHaveLength(4);
    for (const [i, y] of y0.entries()) {
      expect(ys[i]).toBeCloseTo(y + 30, 9);
      expect(ys[i + 2]).toBeCloseTo(y + 60, 9);
    }
    // 옮기기 전 블록은 쓰이지 않게 남는다(생성기가 못 다룰 때만 — 블록을 지우는 작업은 하지 않는다)
    const a = audit(h.doc);
    expect([a.stale, new Set(dimsOf(h.doc).map((d: Entity & { block: string }) => d.block)).size]).toEqual([0, 4]);
  });
});
