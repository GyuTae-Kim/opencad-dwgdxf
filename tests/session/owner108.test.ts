/**
 * 108차: 소유 블록 기억(빠른 길)을 핸들 수 표(edit/ownermemo.ts) 하나로 — 명령 처음 소유 블록을 찾을 때 Map 둘에 모든 객체를 넣지 않는다.
 * - 핸들 열쇠: 정규형 16진(8자까지)만 수로, 나머지(소문자·앞 0·9자 이상·FFFFFFFF·빈 글자)는 Map으로. 'A'와 '0A'는 다른 핸들이다
 * - 표 만들기는 블록 차례·블록 안 차례로 넣고, 핸들이 겹치거나 빈 핸들이 둘 이상이면 null(옛 길) — 102차 판정과 같다
 * - 늘어나는 넣기(put)도 모두 찾고, 자리를 주지 않으면 기억한 자리를 그대로 둔다
 * - 세션: 빠른 길은 명령 취소·다시·단계 취소 뒤에도 표를 다시 만들지 않고 답은 블록을 훑은 답과 같다. 옛 길은 전처럼 다시 만든다
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlockDef, CadDocument, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { EditSession, ownerBlockKey } from '../../src/edit/session';
import { OwnerMemo, handleSlotKey } from '../../src/edit/ownermemo';

const line = (handle: string, x = 0): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x, y: 0, z: 0 }, end: { x: x + 1, y: 0, z: 0 } });
const blockDef = (name: string, entities: Entity[]): BlockDef => ({ name, handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities });

function docOf(spaces: Record<string, string[]>): CadDocument {
  const doc = createNewDocument('metric');
  for (const [k, hs] of Object.entries(spaces)) {
    if (!doc.blocks.has(k)) doc.blocks.set(k, blockDef(k, []));
    const list = doc.blocks.get(k)!.entities;
    hs.forEach((h, i) => {
      const e = line(h, i);
      list.push(e);
      if (h) doc.entityIndex.set(h, e);
    });
  }
  return doc;
}

/** 블록을 훑은 답(소유 블록 키와 처음 자리) */
const scan = (doc: CadDocument, h: string): [string | null, number] => {
  const k = ownerBlockKey(doc, h);
  return [k, k ? doc.blocks.get(k)!.entities.findIndex((e) => e.handle === h) : -1];
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('핸들 열쇠(108차)', () => {
  it('정규형 16진 8자까지만 수(값 + 1), 나머지는 0', () => {
    expect(handleSlotKey('0')).toBe(1);
    expect(handleSlotKey('A')).toBe(11);
    expect(handleSlotKey('1F')).toBe(32);
    expect(handleSlotKey('FFFFFFFE')).toBe(0xffffffff);
    expect(handleSlotKey('7FFFFFFF')).toBe(0x80000000);
    for (const h of ['', '0A', '00', 'a', '1f', 'G', ':', '@', '/', 'FFFFFFFF', '100000000', ' A', 'A '])
      expect(handleSlotKey(h), h).toBe(0);
    expect(handleSlotKey(undefined as unknown as string)).toBe(0);
  });
});

describe('핸들 수 표(OwnerMemo)', () => {
  it('정규형·정규형 아닌 핸들이 섞여도 블록·자리를 모두 찾고, A와 0A는 다른 핸들이다', () => {
    const doc = docOf({ [MODEL_SPACE]: ['A', '0A', '1F', 'ab', '123456789', 'FFFFFFFF', 'FFFFFFFE'], B1: ['10', '011', 'ZZ'] });
    const memo = OwnerMemo.build(doc)!;
    expect(memo).not.toBeNull();
    expect(memo.size).toBe(10);
    for (const [k, b] of doc.blocks)
      b.entities.forEach((e, i) => {
        expect(memo.get(e.handle), e.handle).toBe(true);
        expect([memo.block, memo.at]).toEqual([k, i]);
      });
    expect(memo.get('B')).toBe(false);
    expect(memo.get('00A')).toBe(false);
  });

  it('핸들이 겹치거나(정규형·아닌 것 모두, 블록 안·블록 사이) 빈 핸들이 둘 이상이면 null, 빈 핸들 하나는 괜찮다', () => {
    expect(OwnerMemo.build(docOf({ [MODEL_SPACE]: ['A', 'B', 'A'] }))).toBeNull();
    expect(OwnerMemo.build(docOf({ [MODEL_SPACE]: ['A', 'B'], B1: ['B'] }))).toBeNull();
    expect(OwnerMemo.build(docOf({ [MODEL_SPACE]: ['0A', 'x'], B1: ['0A'] }))).toBeNull();
    expect(OwnerMemo.build(docOf({ [MODEL_SPACE]: ['A', '', 'B', ''] }))).toBeNull();
    const one = OwnerMemo.build(docOf({ [MODEL_SPACE]: ['A', '', 'B'] }))!;
    expect(one.size).toBe(2);
    expect(one.get('B') && [one.block, one.at]).toEqual([MODEL_SPACE, 2]);
  });

  it('넣기가 표를 늘려도 모두 찾고, 자리를 주지 않으면 기억한 자리를 그대로 둔다(없으면 -1)', () => {
    const memo = OwnerMemo.build(docOf({ [MODEL_SPACE]: ['1', '2'] }))!;
    for (let i = 0; i < 5000; i++) memo.put((0x100 + i).toString(16).toUpperCase(), i % 2 ? 'B1' : 'B2', i);
    memo.put('x1', 'B3', 7);
    expect(memo.size).toBe(5003);
    for (let i = 0; i < 5000; i++) {
      expect(memo.get((0x100 + i).toString(16).toUpperCase())).toBe(true);
      expect([memo.block, memo.at]).toEqual([i % 2 ? 'B1' : 'B2', i]);
    }
    memo.put('2', 'B9');
    expect(memo.get('2') && [memo.block, memo.at]).toEqual(['B9', 1]);
    memo.put('NEW', 'B9');
    memo.put('FFFFF', 'B9');
    expect(memo.get('NEW') && [memo.block, memo.at]).toEqual(['B9', -1]);
    expect(memo.get('FFFFF') && [memo.block, memo.at]).toEqual(['B9', -1]);
    memo.put('x1', 'B4');
    expect(memo.get('x1') && [memo.block, memo.at]).toEqual(['B4', 7]);
    expect(memo.get('1') && [memo.block, memo.at]).toEqual([MODEL_SPACE, 0]);
  });
});

describe('세션의 소유 블록 기억(108차)', () => {
  const big = (n: number) => {
    const hs: string[] = [];
    for (let i = 0; i < n; i++) hs.push((0x400 + i).toString(16).toUpperCase());
    return docOf({ [MODEL_SPACE]: hs, B1: ['x1', 'X2', '3'] });
  };

  it('빠른 길: 명령 취소·다시·단계 취소 뒤에도 표를 다시 만들지 않고, 답은 블록을 훑은 답과 같다', () => {
    const doc = big(3000);
    const s = new EditSession(doc, () => {});
    const list = () => doc.blocks.get(MODEL_SPACE)!.entities;
    const builds = vi.spyOn(s as unknown as { buildOwners(): void }, 'buildOwners');
    expect(s.ownerOf(list()[10]!.handle)).toBe(MODEL_SPACE);
    // MOVE 꼴(같은 핸들 바꾸기) → ERASE 꼴(뒤에서부터 지우기) → 끝에 넣기
    const mv: EditOp[] = list()
      .filter((_, i) => i % 7 === 0)
      .map((e) => ({ kind: 'modify', block: MODEL_SPACE, before: e, after: line(e.handle, 50) }));
    s.commit({ label: 'MOVE', ops: mv, group: 1 });
    const er: EditOp[] = [];
    for (let i = list().length - 1; i >= 0; i -= 5) er.push({ kind: 'remove', block: MODEL_SPACE, entity: list()[i]!, index: i });
    s.commit({ label: 'ERASE', ops: er, group: 2 });
    s.commit({ label: 'ADD', ops: [0, 1, 2].map((j) => ({ kind: 'add', block: MODEL_SPACE, entity: line(`9${j}00`, j) }) as EditOp), group: 3 });
    const check = () => {
      for (const b of doc.blocks.values())
        for (const e of b.entities) {
          const k = s.ownerOf(e.handle);
          expect([k, s.ownerIndex(e.handle)], e.handle).toEqual(scan(doc, e.handle));
        }
      for (const op of er) expect(s.ownerOf((op as { entity: Entity }).entity.handle)).toBe(scan(doc, (op as { entity: Entity }).entity.handle)[0]);
    };
    s.undoLastStep(3, 2);
    check();
    s.undo();
    check();
    s.undo();
    check();
    s.undo();
    check();
    s.redo();
    s.redo();
    check();
    expect(builds).toHaveBeenCalledTimes(1);
  });

  it('명령 취소 뒤 MOVE 확정의 자리 짐작도 지금 자리다', () => {
    const doc = big(500);
    const s = new EditSession(doc, () => {});
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    const er: EditOp[] = [];
    for (let i = list.length - 1; i >= 0; i -= 3) er.push({ kind: 'remove', block: MODEL_SPACE, entity: list[i]!, index: s.ownerIndex(list[i]!.handle) });
    s.commit({ label: 'ERASE', ops: er });
    s.undo();
    for (let i = 0; i < list.length; i += 11) {
      const h = list[i]!.handle;
      expect(s.ownerOf(h)).toBe(MODEL_SPACE);
      expect(s.slotHint(h)).toBe(i);
    }
  });

  it('옛 길(처음부터 핸들이 겹친 문서)은 전처럼 명령 취소·다시 뒤 표를 다시 만든다', () => {
    const doc = docOf({ [MODEL_SPACE]: ['A', 'B', 'C', 'A'], B1: ['D'] });
    const s = new EditSession(doc, () => {});
    const builds = vi.spyOn(s as unknown as { buildOwners(): void }, 'buildOwners');
    expect(s.ownerOf('B')).toBe(MODEL_SPACE);
    expect(s.slotHint('B')).toBeUndefined();
    const e = doc.blocks.get(MODEL_SPACE)!.entities[2]!;
    s.commit({ label: 'MOVE', ops: [{ kind: 'modify', block: MODEL_SPACE, before: e, after: line('C', 9) }] });
    s.undo();
    expect(s.ownerOf('C')).toBe(MODEL_SPACE);
    s.redo();
    expect(s.ownerOf('D')).toBe('B1');
    expect(builds).toHaveBeenCalledTimes(3);
  });
});
