/**
 * 글꼴 대체: GDT 글꼴(gdt.shx)을 불러오지 않아도 공차 기호, 세로 문자 스타일.
 * DXF STYLE의 70(1 쉐이프 파일, 4 세로 문자)도 읽는다(전에는 0으로 읽어 DXF에서는 세로 문자를 그리지 못했다).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TextStyle } from '../../src/core/model';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { FIXTURES } from '../oracle/ezdxf';
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

describe('DXF STYLE 70', () => {
  const STYLE = (h: string, name: string, flags: number, font: string) => ['0', 'STYLE', '5', h, '100', 'AcDbSymbolTableRecord', '100', 'AcDbTextStyleTableRecord', '2', name, '70', String(flags), '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', font, '4', ''];
  const dxf = (styles: string[][]) =>
    ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'STYLE', '5', '3', '70', String(styles.length), ...styles.flat(), '0', 'ENDTAB', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
  const read = (styles: string[][]) => readDxf(new TextEncoder().encode(dxf(styles)));
  it('세로 문자(4)와 쉐이프 파일(1)을 읽고, 이름 없는 쉐이프 파일 둘을 따로 둔다', () => {
    const doc = read([STYLE('11', 'Standard', 0, 'txt'), STYLE('12', 'VERT', 4, 'txt.shx'), STYLE('13', '', 1, 'ltypeshp.shx'), STYLE('14', '', 1, 'other.shx')]);
    expect(doc.textStyles.get('VERT')!.flags).toBe(4);
    const shapes = [...doc.textStyles.values()].filter((s) => !s.name);
    expect(shapes.map((s) => [s.font, s.flags])).toEqual([
      ['ltypeshp.shx', 1],
      ['other.shx', 1],
    ]);
    // 다시 써도 70이 남는다
    const back = readDxf(writeDxf(doc, { version: 'AC1032' }).data);
    expect(back.textStyles.get('VERT')!.flags).toBe(4);
    expect([...back.textStyles.values()].filter((s) => !s.name).map((s) => s.flags)).toEqual([1, 1]);
  });
  it('핸들이 없는(R12 같은) 이름 없는 쉐이프 파일이 같은 글꼴이어도 둘 다 남는다', () => {
    const noHandle = (font: string) => STYLE('', '', 1, font).filter((_, i, a) => !(a[i] === '5' && i % 2 === 0) && !(i > 0 && a[i - 1] === '5' && i % 2 === 1));
    const doc = read([noHandle('a.shx'), noHandle('a.shx')]);
    expect([...doc.textStyles.values()].filter((s) => !s.name).length).toBe(2);
  });
  it('세로 문자 스타일의 DXF 문자를 세로로 놓는다', () => {
    const doc = read([STYLE('12', 'VERT', 4, 'txt.shx')]);
    const lay = new TextEngine(null).layoutText({ text: 'AB', insert: { x: 0, y: 0 }, height: 2, rotation: (3 * Math.PI) / 2, widthFactor: 1, oblique: 0, generation: 0, halign: 0, valign: 0, style: doc.textStyles.get('VERT') });
    expect(lay.glyphs[0]!.m[5]).toBeGreaterThan(lay.glyphs[1]!.m[5]);
    for (const g of lay.glyphs) expect(g.m[1]).toBe(0);
  });
  const MADE = join(FIXTURES, 'accore/made');
  it.skipIf(!existsSync(join(MADE, 'E4_vertical_variants.r2018.dxf')))('AutoCAD 세로 문자 도면: DXF와 DWG의 스타일 70이 같다', () => {
    const a = readDxf(new Uint8Array(readFileSync(join(MADE, 'E4_vertical_variants.r2018.dxf'))));
    const b = readDwg(new Uint8Array(readFileSync(join(MADE, 'E4_vertical_variants.r2018.dwg'))));
    expect(a.textStyles.get('E4VERT')!.flags).toBe(4);
    for (const [k, s] of b.textStyles) expect(a.textStyles.get(k)?.flags, k).toBe(s.flags);
  });
});
