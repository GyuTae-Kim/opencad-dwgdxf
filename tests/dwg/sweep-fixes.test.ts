/**
 * 실제 도면 훑기(읽기 → 장면 → DXF·DWG 쓰기 → 다시 읽기, ezdxf·AutoCAD 쌍 DXF 대조)에서 찾은 DWG 쪽 빈틈. 자료는 모두 직접 만든 합성 문서다.
 * - R2007 이전 DWG의 이름 \U+XXXX: DXF 리더처럼 풀어 둔다(전에는 DWG에서만 이스케이프 글자가 이름에 남아 다시 저장하면 이름이 바뀌었다)
 * - 문자 자료 플래그 0x02 = 맞춤점 (0, 0): 가운데·오른쪽 맞춤 문자가 제자리에 그려지고, 맞춤점 없는 문자를 원점으로 보내지 않는다
 * - 없는 블록을 가리키는 블록 참조: 빈 블록 정의를 만든다(빈 블록 핸들을 쓰지 않는다)
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, BlockDef, CadDocument, Entity, InsertEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

let seq = 0x7000;
const h = () => (seq++).toString(16).toUpperCase();
const base = (layer = '0') => ({ ...entityDefaults(), handle: h(), layer });
const ms = (d: CadDocument) => d.blocks.get(MODEL_SPACE)!.entities;
const text = (over: Partial<TextEntity>): TextEntity =>
  ({ ...base(), type: 'TEXT', insert: { x: 0, y: 0, z: 0 }, height: 2, text: 'A', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, ...over }) as TextEntity;

describe('R2007 이전 DWG의 이름 이스케이프', () => {
  /** 이름(도면층·블록·속성 태그)이 주어진 글로 적힌 문서 */
  function named(layer: string, block: string, tag: string): CadDocument {
    const doc = createNewDocument('metric');
    doc.codepage = 'ANSI_1252';
    doc.layers.set(layer.toUpperCase(), { name: layer, handle: h(), flags: 0, color: { aci: 3 }, off: false, frozen: false, locked: false, linetype: 'Continuous', lineweight: -3, plot: true, transparency: 255 });
    const rec = h();
    const blk: BlockDef = { name: block, handle: h(), recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags: 2, entities: [], endHandle: h(), layer: '0' };
    blk.entities.push({ ...base(layer), type: 'ATTDEF', insert: { x: 0, y: 0, z: 0 }, height: 2, text: '1', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag, prompt: 'p', attFlags: 0 } as Entity);
    doc.blocks.set(block.toUpperCase(), blk);
    doc.blockRecords.set(block.toUpperCase(), { name: block, handle: rec, flags: 0, insertUnits: 4, explodable: true, scalable: true });
    const att = { ...base(layer), type: 'ATTRIB', insert: { x: 5, y: 5, z: 0 }, height: 2, text: '7', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag, attFlags: 0 } as AttribEntity;
    ms(doc).push({ ...base(layer), type: 'INSERT', block, insert: { x: 5, y: 5, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [att] } as InsertEntity);
    return doc;
  }
  const check = (back: CadDocument) => {
    expect([...back.layers.values()].map((l) => l.name)).toContain('가나 층');
    expect(back.blocks.has('창문 ∅')).toBe(true);
    const ins = ms(back).find((e) => e.type === 'INSERT') as InsertEntity;
    expect(ins.block).toBe('창문 ∅');
    expect(ins.layer).toBe('가나 층');
    expect(ins.attribs[0]!.tag).toBe('번호');
    expect((back.blocks.get('창문 ∅')!.entities[0] as AttribEntity).tag).toBe('번호');
  };

  for (const v of ['AC1015', 'AC1018'] as const) {
    it(`${v}: 다른 프로그램이 \\U+XXXX로 적은 이름·태그를 원래 글자로 읽는다(DXF 리더와 같다)`, () => {
      // 코드 페이지 1252 문서에 이스케이프 글을 그대로 적은 파일 — AutoCAD가 코드 페이지 밖 글자를 저장하는 방식
      const doc = named('\\U+AC00\\U+B098 층', '\\U+CC3D\\U+BB38 \\U+2205', '\\U+BC88\\U+D638');
      const back = readDwg(writeDwg(doc, { version: v }).data);
      check(back);
      // 다시 DXF R2018로 써도 이름이 그대로다(전에는 \U+가 남은 이름이 DXF에서 풀려 다른 이름이 되었다)
      const dxf = readDxf(writeDxf(back, { version: 'AC1032' }).data);
      check(dxf);
    });
    it(`${v}: 코드 페이지 밖 글자가 든 이름은 저장하고 다시 읽어도 같다`, () => {
      check(readDwg(writeDwg(named('가나 층', '창문 ∅', '번호'), { version: v }).data));
    });
  }
});

describe('DWG 문자 맞춤점', () => {
  for (const v of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) {
    it(`${v}: 맞춤점 (0, 0)은 0x02로 줄여 쓰고 (0, 0)으로 읽는다, 맞춤점 없는 가운데 문자는 삽입점을 맞춤점으로 쓴다`, () => {
      const doc = createNewDocument('metric');
      const centered = text({ insert: { x: -1.125, y: -0.5, z: 0 }, alignPoint: { x: 0, y: 0, z: 0 }, halign: 1, valign: 2, text: '흰색' });
      const loose = text({ insert: { x: 30, y: 40, z: 0 }, halign: 2, valign: 0 });
      const left = text({ insert: { x: 7, y: 8, z: 0 } });
      const att = { ...text({ insert: { x: -2, y: -1, z: 0 }, alignPoint: { x: 0, y: 0, z: 0 }, halign: 1, valign: 2 }), type: 'ATTDEF', tag: 'T', prompt: '', attFlags: 0 } as unknown as Entity;
      ms(doc).push(centered, loose, left, att);
      const back = readDwg(writeDwg(doc, { version: v }).data);
      const get = (hh: string) => back.entityIndex.get(hh) as TextEntity;
      expect(get(centered.handle).alignPoint).toEqual({ x: 0, y: 0, z: 0 });
      expect(get(att.handle).alignPoint).toEqual({ x: 0, y: 0, z: 0 });
      // 전에는 맞춤점이 없으면 0x02를 써서 AutoCAD가 (0, 0)에 맞췄다
      expect(get(loose.handle).alignPoint).toEqual({ x: 30, y: 40, z: 0 });
      expect(get(left.handle).alignPoint).toBeUndefined();
      // DWG에서 읽은 가운데 문자를 DXF로 쓰면 11은 (0, 0)이다(전에는 삽입점을 써 문자가 옮겨졌다)
      const dxf = readDxf(writeDxf(back, { version: 'AC1032' }).data);
      expect((dxf.entityIndex.get(centered.handle) as TextEntity).alignPoint).toMatchObject({ x: 0, y: 0 });
    });
  }
});

describe('DWG 쓰기: 없는 블록을 가리키는 블록 참조', () => {
  it('빈 블록 정의를 만들어 참조가 이어진다', () => {
    const doc = createNewDocument('metric');
    const ins = { ...base(), type: 'INSERT', block: 'part', insert: { x: 100, y: 50, z: 0 }, scale: { x: 2, y: 2, z: 2 }, rotation: Math.PI / 2, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as InsertEntity;
    ms(doc).push(ins);
    for (const v of ['AC1015', 'AC1032'] as const) {
      const out = writeDwg(doc, { version: v });
      expect(out.warnings.map((w) => w.code)).toContain('block.missing');
      const back = readDwg(out.data);
      expect((back.entityIndex.get(ins.handle) as InsertEntity).block).toBe('part');
      expect(back.blocks.get('PART')?.entities).toEqual([]);
      expect(back.warnings).toEqual([]);
    }
  });
});
