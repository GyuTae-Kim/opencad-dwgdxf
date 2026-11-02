/**
 * 43차: 객체 20만 개를 전체 선택해 옮기거나 되돌리면 화면이 몇 분씩 멈추던 결함.
 * 소유 블록 확인, 변경 적용, 더한 객체 지우기가 변경마다 블록 전체를 훑어 객체 수의 제곱이 되었다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { EditSession, applyOps } from '../../src/edit/session';

const line = (handle: string, x = 0): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x, y: 0, z: 0 }, end: { x: x + 1, y: 0, z: 0 } });

function docWith(n: number): { doc: CadDocument; s: EditSession; list: LineEntity[] } {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const list = doc.blocks.get(MODEL_SPACE)!.entities as LineEntity[];
  for (let i = 0; i < n; i++) {
    const e = line(`A${i}`, i);
    list.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  return { doc, s, list };
}

/** f가 블록을 훑는 호출(some·findIndex)을 몇 번 하는지 센다 */
function scans(f: () => void): number {
  const some = vi.spyOn(Array.prototype, 'some');
  const find = vi.spyOn(Array.prototype, 'findIndex');
  f();
  const n = some.mock.calls.length + find.mock.calls.length;
  vi.restoreAllMocks();
  return n;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('소유 블록', () => {
  it('자리가 맞으면 블록을 훑지 않는다', () => {
    const { s, list } = docWith(1000);
    let owners: (string | null)[] = [];
    const n = scans(() => {
      owners = list.map((e) => s.ownerOf(e.handle));
    });
    expect(n).toBe(0);
    expect(new Set(owners)).toEqual(new Set([MODEL_SPACE]));
  });

  it('앞 객체를 지워 자리가 밀려도 맞는 자리를 돌려준다', () => {
    const { s, list } = docWith(100);
    s.ownerOf(list[0]!.handle);
    s.commit({ label: 'E', ops: [{ kind: 'remove', block: MODEL_SPACE, entity: list[0]!, index: 0 }] });
    for (const e of list) expect(s.ownerIndex(e.handle)).toBe(list.indexOf(e));
  });

  it('지운 객체는 소유 블록이 없다', () => {
    const { s, list } = docWith(10);
    const gone = list[3]!;
    s.ownerOf(gone.handle);
    s.commit({ label: 'E', ops: [{ kind: 'remove', block: MODEL_SPACE, entity: gone, index: 3 }] });
    expect(s.ownerOf(gone.handle)).toBeNull();
    expect(s.ownerIndex(gone.handle)).toBe(-1);
  });

  it('밖에서 블록을 옮긴 객체도 찾는다', () => {
    const { doc, s, list } = docWith(10);
    const e = list[5]!;
    s.ownerOf(e.handle);
    list.splice(5, 1);
    doc.blocks.set('B', { name: 'B', handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [e] });
    expect(s.ownerOf(e.handle)).toBe('B');
    expect(s.ownerIndex(e.handle)).toBe(0);
  });
});

describe('많은 변경 적용', () => {
  const handles = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.map((e) => `${e.handle}:${(e as LineEntity).start.x}`);

  it('자리 표로 찾아도 하나씩 적용한 것과 같다', () => {
    const build = (): { doc: CadDocument; ops: EditOp[] } => {
      const { doc, list } = docWith(300);
      const ops: EditOp[] = [];
      const m = (i: number, after = line(list[i]!.handle, 1000 + i)): EditOp => ({ kind: 'modify', block: MODEL_SPACE, before: list[i]!, after });
      for (let i = 0; i < 100; i++) ops.push(m(i));
      // 맨 뒤에 더한 객체를 같은 묶음에서 바꾼다
      const added = line('N1', 5);
      ops.push({ kind: 'add', block: MODEL_SPACE, entity: added });
      ops.push({ kind: 'modify', block: MODEL_SPACE, before: added, after: line('N1', 6) });
      // 핸들이 바뀐 뒤 새 핸들로 찾는다
      const renamed = line('R1', 7);
      ops.push(m(120, renamed));
      ops.push({ kind: 'modify', block: MODEL_SPACE, before: renamed, after: line('R1', 8) });
      // 가운데를 지운 뒤 뒤쪽 객체를 바꾼다(표를 버려야 한다)
      ops.push({ kind: 'remove', block: MODEL_SPACE, entity: list[150]!, index: 150 });
      for (let i = 200; i < 220; i++) ops.push(m(i));
      // 맨 뒤를 지운 뒤 바꾼다
      ops.push({ kind: 'remove', block: MODEL_SPACE, entity: list[299]!, index: -1 });
      ops.push(m(298));
      // 가운데에 넣은 뒤 바꾼다
      ops.push({ kind: 'add', block: MODEL_SPACE, entity: line('N2', 9), index: 10 });
      for (let i = 250; i < 260; i++) ops.push(m(i));
      return { doc, ops };
    };
    const all = build();
    expect(all.ops.length).toBeGreaterThanOrEqual(64);
    applyOps(all.doc, all.ops);
    const each = build();
    for (const op of each.ops) applyOps(each.doc, [op]);
    expect(handles(all.doc)).toEqual(handles(each.doc));
  });

  it('많은 변경은 객체마다 블록을 훑지 않는다', () => {
    const { doc, list } = docWith(1000);
    const ops: EditOp[] = list.map((e, i) => ({ kind: 'modify', block: MODEL_SPACE, before: e, after: line(e.handle, 5000 + i) }));
    expect(scans(() => applyOps(doc, ops))).toBe(0);
    expect((doc.blocks.get(MODEL_SPACE)!.entities[999] as LineEntity).start.x).toBe(5999);
  });

  it('더하고 지우기가 찾기와 번갈아 와도 결과가 맞다', () => {
    const { doc, list } = docWith(200);
    const ops: EditOp[] = [];
    for (let i = 0; i < 80; i++) {
      ops.push({ kind: 'add', block: MODEL_SPACE, entity: line(`M${i}`, i), index: 0 });
      ops.push({ kind: 'modify', block: MODEL_SPACE, before: list[100 + i]!, after: line(list[100 + i]!.handle, 9000 + i) });
    }
    const last = list[179]!;
    applyOps(doc, ops);
    expect(doc.blocks.get(MODEL_SPACE)!.entities.length).toBe(280);
    expect((doc.blocks.get(MODEL_SPACE)!.entities[259] as LineEntity).start.x).toBe(9079);
    expect((doc.blocks.get(MODEL_SPACE)!.entities[259] as LineEntity).handle).toBe(last.handle);
  });

  it('뒤에서부터 지우고 되돌리면 원래 자리로 돌아온다', () => {
    const { doc, s, list } = docWith(100);
    const before = list.map((e) => e.handle);
    const ops: EditOp[] = list
      .filter((_, i) => i % 3 === 0)
      .map((e): EditOp => ({ kind: 'remove', block: MODEL_SPACE, entity: e, index: s.ownerIndex(e.handle) }))
      .reverse();
    s.commit({ label: 'E', ops });
    expect(list.length).toBe(66);
    s.undo();
    expect(doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle)).toEqual(before);
  });

  it('더한 객체를 되돌릴 때 앞에서부터 훑지 않는다', () => {
    const { doc, s } = docWith(1000);
    const ops: EditOp[] = Array.from({ length: 500 }, (_, i) => ({ kind: 'add', block: MODEL_SPACE, entity: line(`B${i}`, i) }));
    s.commit({ label: 'A', ops });
    expect(doc.blocks.get(MODEL_SPACE)!.entities.length).toBe(1500);
    expect(scans(() => s.undo())).toBe(0);
    expect(doc.blocks.get(MODEL_SPACE)!.entities.length).toBe(1000);
  });
});
