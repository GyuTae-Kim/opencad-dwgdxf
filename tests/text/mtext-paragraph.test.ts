/**
 * MTEXT 문단 서식: 탭 정지 여러 개와 가운데·오른쪽 탭(\pxt4,c8,r12;), 줄 간격(\psm·\pse), 문단 앞·뒤 간격(\psb·\psa),
 * 양쪽 정렬(\pqj), 단 나누기(\N, 단 높이가 없어도). 전에는 첫 탭만 읽고 나머지는 무시했다.
 */
import { describe, expect, it } from 'vitest';
import { parseMText } from '../../src/text/mtext';
import { TextEngine, type TextLayout } from '../../src/text/layout';

const eng = new TextEngine(null);
const lay = (text: string, extra: Partial<Parameters<TextEngine['layoutMText']>[0]> = {}) =>
  eng.layoutMText({ text, height: 1, width: 0, attachment: 1, lineSpacingStyle: 1, lineSpacingFactor: 1, ...extra });
/** 글자(ch)마다 [x, y] — 같은 글자가 여럿이면 차례로 */
const at = (l: TextLayout, ch: string) => l.glyphs.filter((g) => g.geom.ch === ch).map((g) => [g.m[4], g.m[5]] as [number, number]);

describe('문단 서식 해석', () => {
  it('탭 정지 목록(끝까지)과 종류, 위치 차례로', () => {
    const [p] = parseMText('\\pxt4,c8,r12;A', { baseHeight: 1 });
    expect(p!.tabs).toEqual([4, 8, 12]);
    expect(p!.tabTypes).toEqual(['l', 'c', 'r']);
    const [q] = parseMText('\\pxi-1,l2,t12,4;A', { baseHeight: 1 });
    expect(q!.indentFirst).toBe(-1);
    expect(q!.indentLeft).toBe(2);
    expect(q!.tabs).toEqual([4, 12]);
  });
  it('간격과 줄 간격, 다음 문단도 이어받는다', () => {
    const ps = parseMText('\\pxsb1,sa2,sm1.5;A\\PB', { baseHeight: 1 });
    expect(ps[0]!.spaceBefore).toBe(1);
    expect(ps[0]!.spaceAfter).toBe(2);
    expect(ps[0]!.lineSpacing).toEqual({ kind: 'multiple', value: 1.5 });
    expect(ps[1]!.lineSpacing).toEqual({ kind: 'multiple', value: 1.5 });
    expect(parseMText('\\pxse3;A', { baseHeight: 1 })[0]!.lineSpacing).toEqual({ kind: 'exact', value: 3 });
  });
});

describe('문단 서식 배치', () => {
  it('왼쪽·가운데·오른쪽 탭', () => {
    // 탭 문자(MTEXT에서는 ^I나 실제 탭)로 A는 4, BB는 10, CCC는 20에
    const left = lay('\\pxt4,10,20;\tA\tBB\tCCC');
    const [b1, b2] = at(left, 'B');
    const [c1, c2] = at(left, 'C');
    expect(b1![0]).toBeCloseTo(10, 6);
    expect(c1![0]).toBeCloseTo(20, 6);
    const advB = b2![0] - b1![0];
    const advC = c2![0] - c1![0];
    expect(at(left, 'A')[0]![0]).toBeCloseTo(4, 6);
    const mixed = lay('\\pxt4,c10,r20;\tA\tBB\tCCC');
    // "BB"의 가운데가 10, "CCC"의 끝이 20
    expect(at(mixed, 'B')[0]![0]).toBeCloseTo(10 - advB, 6);
    expect(at(mixed, 'C')[0]![0]).toBeCloseTo(20 - 3 * advC, 6);
  });
  it('줄 간격 배수·정확히, 문단 앞·뒤 간격', () => {
    const dy = (l: TextLayout) => at(l, 'A')[0]![1] - at(l, 'B')[0]![1];
    const base = dy(lay('A\\PB'));
    expect(base).toBeCloseTo(1.667, 3);
    expect(dy(lay('\\pxsm2;A\\PB'))).toBeCloseTo(2 * base, 6);
    expect(dy(lay('\\pxse4;A\\PB'))).toBeCloseTo(4, 6);
    expect(dy(lay('\\pxsa3;A\\P\\pxsa0,sb0.5;B'))).toBeCloseTo(base + 3 + 0.5, 6);
  });
  it('양쪽 정렬: 마지막 줄이 아닌 줄은 상자 폭까지 늘린다', () => {
    const text = 'AA BB CC DD EE FF GG';
    const plain = lay(text, { width: 9 });
    const just = lay(`\\pqj;${text}`, { width: 9 });
    const lastOnFirstLine = (l: TextLayout) => {
      const y0 = l.glyphs[0]!.m[5];
      return Math.max(...l.glyphs.filter((g) => Math.abs(g.m[5] - y0) < 1e-9).map((g) => g.m[4]));
    };
    expect(lastOnFirstLine(just)).toBeGreaterThan(lastOnFirstLine(plain) + 0.1);
    // 마지막 줄은 그대로(왼쪽)
    expect(at(just, 'G')[0]![0]).toBeCloseTo(at(plain, 'G')[0]![0], 6);
  });
  it('단 나누기(\\N)는 단 높이가 없어도 다음 단으로', () => {
    const l = lay('A\\PB\\NC', { width: 10, columns: { count: 2, width: 10, gutter: 2, heights: [] } });
    const [a] = at(l, 'A');
    const [c] = at(l, 'C');
    expect(c![0]).toBeCloseTo(a![0] + 12, 6);
    expect(c![1]).toBeCloseTo(a![1], 6);
  });
});
