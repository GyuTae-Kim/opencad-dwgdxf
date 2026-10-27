/**
 * DXF 문자열의 캐럿 표기(7차 실제 도면 훑기 — 자료는 직접 만든 합성 문서).
 * AutoCAD는 제어 문자를 ^J·^I로, 글자 ^를 "^ "로 적는다(같은 도면의 DWG에는 줄바꿈 글자 그대로 — 실물 짝으로 확인).
 * 리더가 풀고 쓰기가 다시 만들어 DXF ↔ DWG 왕복에서 문자가 같다. 공차 문자열도 줄바꿈 글자로 만든다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, MTextEntity, ToleranceEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { decodeCaret } from '../../src/io/dxf/records';
import { readDxf } from '../../src/io/dxf/reader';
import { caret } from '../../src/io/dxf/tagwriter';
import { textChunks } from '../../src/io/dxf/wentities';
import { writeDxf } from '../../src/io/dxf/writer';
import { buildToleranceText, emptySpec, parseToleranceText } from '../../src/edit/annot/tolerance';

let seq = 0x7a00;
const h = () => (seq++).toString(16).toUpperCase();
const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)!.entities;
const find = <T>(d: CadDocument, handle: string) => ms(d).find((e) => e.handle === handle) as T;
const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const dxfText = (d: CadDocument, version = 'AC1032') => new TextDecoder().decode(writeDxf(d, { version: version as never }).data);

function mtext(text: string): MTextEntity {
  return {
    ...entityDefaults(),
    handle: h(),
    layer: '0',
    type: 'MTEXT',
    insert: P(0, 0),
    height: 2.5,
    width: 50,
    attachment: 1,
    drawingDirection: 1,
    text,
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
  };
}

describe('캐럿 표기(^J, "^ ")', () => {
  it('decodeCaret·caret: 제어 문자와 ^의 짝, 그 밖의 ^는 그대로', () => {
    expect(decodeCaret('a^Jb^Ic^Md^ e')).toBe('a\nb\tc\rd^e');
    expect(decodeCaret('x^2 y^a z^')).toBe('x^2 y^a z^');
    expect(decodeCaret('^@^[^_')).toBe('\x00\x1b\x1f');
    for (const s of ['a\nb', 'x^2', '^J 글자', '\t^\n^ ', '끝^']) expect(decodeCaret(caret(s))).toBe(s);
    expect(caret('1^2\n')).toBe('1^ 2^J');
  });

  it('DXF로 쓰면 ^J·^I·"^ ", 다시 읽으면 줄바꿈·탭·^ 글자(DWG에서 읽은 것과 같다)', () => {
    const doc = createNewDocument('metric');
    const m = mtext('line one\nsecond\ttab \\S1^2; x^J');
    ms(doc).push(m);
    for (const v of ['AC1015', 'AC1032']) {
      const txt = dxfText(doc, v);
      expect(txt).toContain('^J');
      expect(txt).toContain('\\S1^ 2;');
      expect(txt).toContain('x^ J');
      const back = readDxf(writeDxf(doc, { version: v as never }).data);
      expect(find<MTextEntity>(back, m.handle).text, v).toBe(m.text);
    }
    // 이진 DXF도 같은 규칙
    const bin = readDxf(writeDxf(doc, { version: 'AC1032', binary: true }).data);
    expect(find<MTextEntity>(bin, m.handle).text).toBe(m.text);
    // DXF → DWG → DXF: DWG에는 글자 그대로 들어가고 다시 같은 문자
    const viaDxf = readDxf(writeDxf(doc, { version: 'AC1032' }).data);
    for (const v of ['AC1015', 'AC1032']) {
      const dwg = readDwg(writeDwg(viaDxf, { version: v as never }).data);
      expect(find<MTextEntity>(dwg, m.handle).text, v).toBe(m.text);
    }
  });

  it('긴 MTEXT 조각은 캐럿 표기를 두 글자로 세어 250자를 넘지 않는다', () => {
    const chunks = textChunks('\n'.repeat(300), true);
    expect(chunks.every((c) => caret(c).length <= 250)).toBe(true);
    expect(chunks.join('')).toBe('\n'.repeat(300));
  });

  it('공차 문자열은 줄바꿈 글자로 만들고(DWG에 ^J 글자가 들어가지 않게), 옛 ^J 표기도 읽는다', () => {
    const s = emptySpec();
    s.rows[0].sym = 'j';
    s.rows[0].tol1 = { dia: false, value: '0.1', mc: '' };
    s.datumId = 'A';
    const t = buildToleranceText(s);
    expect(t).toBe('{\\Fgdt;j}%%v0.1\n\nA');
    expect(parseToleranceText(t.replace(/\n/g, '^J')).datumId).toBe('A');
    const doc = createNewDocument('metric');
    const tol = { ...entityDefaults(), handle: h(), layer: '0', type: 'TOLERANCE', dimStyle: 'ISO-25', insert: P(0, 0), text: t, direction: P(1, 0) } as ToleranceEntity;
    ms(doc).push(tol);
    expect(dxfText(doc)).toContain('{\\Fgdt;j}%%v0.1^J^JA');
    expect(find<ToleranceEntity>(readDwg(writeDwg(doc, { version: 'AC1032' }).data), tol.handle).text).toBe(t);
    expect(find<ToleranceEntity>(readDxf(writeDxf(doc, { version: 'AC1032' }).data), tol.handle).text).toBe(t);
  });
});

