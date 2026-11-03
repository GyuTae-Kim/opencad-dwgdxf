/**
 * 메인의 객체 상자를 묶은 형식(BoxList)으로 두고, 고르기(Picker)가 형식 배열 격자로 후보를 찾는다.
 * 상자마다 객체를 만들면 290만 객체 도면(킬 시 지도)에서 메인 힙이 한계를 넘어 탭이 꺼졌다.
 * 여기서는 예전 방식(상자 배열을 모두 훑기)과 결과가 같은지 본다.
 */
import { describe, expect, it } from 'vitest';
import { createNewDocument } from '../../src/core/newdoc';
import { BoxList, type EntityBox, packBoxes, unpackBoxes } from '../../src/render/displaylist';
import { Picker } from '../../src/app/pick';
import { TextEngine } from '../../src/text/layout';

/** 같은 씨앗이면 같은 상자들 */
function boxes(n: number, seed = 7): EntityBox[] {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const out: EntityBox[] = [];
  for (let i = 0; i < n; i++) {
    const x = rnd() * 1000;
    const y = rnd() * 600;
    const w = rnd() < 0.02 ? rnd() * 900 : rnd() * 8;
    const h = rnd() * 8;
    const b: EntityBox = { handle: (0x100 + i).toString(16).toUpperCase(), minX: x, minY: y, maxX: x + w, maxY: y + h };
    if (i % 3 === 0) b.seg = [i, 2];
    if (i % 5 === 0) {
      b.chunk = i % 4;
      b.glyphs = [i, i + 1];
    }
    out.push(b);
  }
  return out;
}

describe('BoxList', () => {
  it('상자를 꺼내면 unpackBoxes와 같고, 핸들로 찾기는 같은 핸들이면 뒤 상자를 준다', () => {
    const list = boxes(500);
    list.push({ ...list[10]!, minX: -5 });
    const p = packBoxes(list);
    const bl = new BoxList(p);
    expect(bl.length).toBe(501);
    expect([...bl]).toEqual(unpackBoxes(p));
    expect(bl.handle(499)).toBe(list[499]!.handle);
    expect(bl.indexOf(list[10]!.handle)).toBe(500);
    expect(bl.indexOf(list[11]!.handle)).toBe(11);
    expect(bl.indexOf('NOPE')).toBe(-1);
    expect(bl.filter((b) => b.minX < 0).map((b) => b.handle)).toEqual([list[10]!.handle]);
  });

  it('줄바꿈이 든 핸들(handleList)과 빈 목록도 다룬다', () => {
    const bl = BoxList.from([
      { handle: 'A\nB', minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { handle: 'C', minX: 2, minY: 2, maxX: 3, maxY: 3 },
    ]);
    expect(bl.handle(0)).toBe('A\nB');
    expect(bl.indexOf('C')).toBe(1);
    const empty = BoxList.from([]);
    expect(empty.length).toBe(0);
    expect(empty.indexOf('A')).toBe(-1);
    expect([...empty]).toEqual([]);
  });
});

describe('Picker의 격자 후보가 모두 훑기와 같다', () => {
  const doc = createNewDocument('metric');
  const list = boxes(3000, 11);
  const pk = new Picker(doc, list, new TextEngine(null), '*Model_Space');
  pk.exclude.add(list[42]!.handle);
  const brute = (x: number, y: number, tol: number) =>
    list.filter((b) => b.minX - tol <= x && b.maxX + tol >= x && b.minY - tol <= y && b.maxY + tol >= y && !pk.exclude.has(b.handle)).map((b) => b.handle);

  it('점 근처 후보(작은 허용 거리는 격자, 큰 허용 거리는 모두 훑기)', () => {
    for (const [x, y, tol] of [
      [10, 10, 2],
      [500, 300, 5],
      [999, 599, 1],
      [list[42]!.minX, list[42]!.minY, 0.5],
      [500, 300, 400],
      [-50, -50, 3],
    ] as const) {
      expect(new Set(pk.candidates(x, y, tol).map((b) => b.handle))).toEqual(new Set(brute(x, y, tol)));
    }
  });

  it('창·사각형 겹침과 상자 찾기', () => {
    const r: [number, number, number, number] = [100, 100, 300, 250];
    const over = list.filter((b) => !(b.maxX < r[0] || b.minX > r[2] || b.maxY < r[1] || b.minY > r[3]) && !pk.exclude.has(b.handle)).map((b) => b.handle);
    expect(pk.overlapping(r)).toEqual(over);
    const inside = list.filter((b) => b.minX >= r[0] && b.maxX <= r[2] && b.minY >= r[1] && b.maxY <= r[3] && !pk.exclude.has(b.handle)).map((b) => b.handle);
    expect(pk.select(r, false)).toEqual(inside);
    expect(pk.box(list[7]!.handle)).toEqual(list[7]);
    expect(pk.box(list[42]!.handle)).toBeUndefined();
  });

  it('편집으로 생긴 상자(extra)는 후보 끝에 붙는다', () => {
    const extra: EntityBox = { handle: 'NEW', minX: 10, minY: 10, maxX: 11, maxY: 11 };
    pk.extra = [extra];
    const c = pk.candidates(10.5, 10.5, 1);
    expect(c[c.length - 1]).toBe(extra);
    expect(pk.overlapping([0, 0, 20, 20])).toContain('NEW');
    pk.extra = [];
  });
});
