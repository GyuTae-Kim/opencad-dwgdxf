/**
 * 42차: 객체·정점·선택 수를 따라가는 배열을 push(...items)로 붙이면 요소가 많을 때 RangeError로 죽던 결함.
 * 잰 한도는 메인 스레드 약 12만 개, 작업자 약 6.3만 개이고, 오류가 "메모리가 모자람"으로 안내되어 원인이 가려졌다.
 */
import { describe, expect, it } from 'vitest';
import { maxOf, minOf, pushAll } from '../../src/core/arrays';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { mergeResults } from '../../src/edit/geom/types';
import type { EditOp } from '../../src/edit/session';
import { EditSession } from '../../src/edit/session';
import { renameOps } from '../../src/edit/util/rename';
import { triangulateLoops } from '../../src/render/hatch';

/** 메인 스레드 한도보다 많은 수 */
const N = 200_000;

describe('배열 함수', () => {
  it('pushAll은 인자 한도 없이 순서대로 붙인다', () => {
    const items = Array.from({ length: N }, (_, i) => i);
    const to = [-1];
    pushAll(to, items);
    expect(to.length).toBe(N + 1);
    expect([to[0], to[1], to[N]]).toEqual([-1, 0, N - 1]);
  });

  it('자기 자신을 붙여도 끝난다', () => {
    const a = [1, 2, 3];
    pushAll(a, a);
    expect(a).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('minOf·maxOf는 Math.min·Math.max와 같다', () => {
    for (const a of [[], [1], [3, -1, 2], [1, NaN, 2], [Infinity, -Infinity], [0, -0], [-0, 0]]) {
      expect(Object.is(minOf(a), Math.min(...a)), String(a)).toBe(true);
      expect(Object.is(maxOf(a), Math.max(...a)), String(a)).toBe(true);
    }
  });

  it('minOf·maxOf는 인자 한도가 없다', () => {
    const xs = Array.from({ length: N }, (_, i) => i - 5);
    expect([minOf(xs), maxOf(xs)]).toEqual([-5, N - 6]);
  });
});

describe('큰 선택', () => {
  const line = (handle: string): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } });

  it('편집 결과를 합친다', () => {
    const add = Array.from({ length: N }, () => line(''));
    const remove = add.map((_, i) => String(i));
    const out = mergeResults([{ add, remove }, { add: add.slice(0, 1) }]);
    expect([out.add?.length, out.remove?.length]).toEqual([N + 1, N]);
  });

  it('같은 묶음의 큰 편집을 잇달아 넣고 되돌린다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const ops = (): EditOp[] => Array.from({ length: N }, () => ({ kind: 'add', block: MODEL_SPACE, entity: line(s.newHandle()) }));
    const before = doc.blocks.get(MODEL_SPACE)!.entities.length;
    s.commit({ label: 'A', ops: ops(), group: 7 });
    s.commit({ label: 'B', ops: ops(), group: 7 });
    expect(doc.blocks.get(MODEL_SPACE)!.entities.length).toBe(before + 2 * N);
    expect(s.opsInGroup(7)).toBe(2 * N);
  });

  // 109차: 이름 바꾸기가 객체 바꾸기 목록을 push(...)로 붙여, 객체 42만 개 실도면에서 많이 쓰인 도면층의 -RENAME이 스택 넘침으로 죽었다
  it('객체가 많이 쓰는 도면층·선종류 이름도 바꾸고 되돌린다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    doc.layers.set('BIG', { ...doc.layers.get('0')!, name: 'BIG', handle: s.newHandle() });
    doc.linetypes.set('DASH', { ...doc.linetypes.get('CONTINUOUS')!, name: 'DASH', handle: s.newHandle() });
    s.commit({ label: 'A', ops: Array.from({ length: N }, () => ({ kind: 'add' as const, block: MODEL_SPACE, entity: { ...line(s.newHandle()), layer: 'BIG', linetype: 'DASH' } })) });
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    s.commit({ label: 'RENAME', ops: renameOps(doc, 'layer', 'BIG', 'HUGE', s.scanHints()) });
    s.commit({ label: 'RENAME', ops: renameOps(doc, 'linetype', 'DASH', 'DASH2', s.scanHints()) });
    expect([list.length, list.at(-1)!.layer, list.at(-1)!.linetype, doc.layers.has('HUGE')]).toEqual([N, 'HUGE', 'DASH2', true]);
    s.undo();
    s.undo();
    expect([list.at(-1)!.layer, list.at(-1)!.linetype, doc.layers.has('BIG')]).toEqual(['BIG', 'DASH', true]);
  });
});

describe('큰 객체', () => {
  const ring = (n: number, r: number): number[] => {
    const a: number[] = [];
    for (let i = 0; i < n; i++) a.push(Math.cos((i * 2 * Math.PI) / n) * r, Math.sin((i * 2 * Math.PI) / n) * r);
    return a;
  };

  it('해치 구멍의 정점이 많아도 삼각분할한다', () => {
    const tris = triangulateLoops([ring(4, 100), ring(70_000, 10)]);
    let area = 0;
    for (let i = 0; i + 5 < tris.length; i += 6) {
      area += Math.abs((tris[i + 2]! - tris[i]!) * (tris[i + 5]! - tris[i + 1]!) - (tris[i + 4]! - tris[i]!) * (tris[i + 3]! - tris[i + 1]!)) / 2;
    }
    expect(area).toBeCloseTo(20_000 - Math.PI * 100, 1);
  });
});
