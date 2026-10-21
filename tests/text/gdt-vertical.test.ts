/** 글꼴 대체: GDT 글꼴(gdt.shx)을 불러오지 않아도 공차 기호, 세로 문자 스타일 */
import { describe, expect, it } from 'vitest';
import type { TextStyle } from '../../src/core/model';
import { TextEngine } from '../../src/text/layout';
import { gdtFace, strokeFace } from '../../src/text/fonts';

describe('글꼴', () => {
  it('GDT 글꼴(gdt.shx)을 불러오지 않아도 소문자는 공차 기호로', () => {
    const t = new TextEngine(null);
    const style = { name: 'GDT', font: 'gdt.shx', bigFont: '', height: 0, widthFactor: 1, oblique: 0, generation: 0, lastHeight: 2.5, flags: 0, handle: 'S1' } as unknown as TextStyle;
    const lay = t.layoutText({ text: 'jnA', insert: { x: 0, y: 0 }, height: 2.5, rotation: 0, widthFactor: 1, oblique: 0, generation: 0, halign: 0, valign: 0, style });
    expect(lay.glyphs[0]!.geom).toBe(gdtFace.glyph(0x6a));
    expect(lay.glyphs[1]!.geom).toBe(gdtFace.glyph(0x6e));
    expect(lay.glyphs[2]!.geom).toBe(strokeFace.glyph(0x41));
  });
  it('세로 문자 스타일: 글자를 아래로 쌓는다', () => {
    const t = new TextEngine(null);
    const style = { name: 'V', font: 'txt', bigFont: '', height: 0, widthFactor: 1, oblique: 0, generation: 0, lastHeight: 2.5, flags: 4, handle: 'S2' } as unknown as TextStyle;
    const lay = t.layoutText({ text: 'ABC', insert: { x: 0, y: 0 }, height: 2, rotation: (3 * Math.PI) / 2, widthFactor: 1, oblique: 0, generation: 0, halign: 0, valign: 0, style });
    const ys = lay.glyphs.map((g) => g.m[5]);
    expect(ys[0]!).toBeGreaterThan(ys[1]!);
    expect(ys[1]!).toBeGreaterThan(ys[2]!);
    for (const g of lay.glyphs) expect(g.m[1]).toBe(0);
  });
});
