/**
 * DWG 도형 선가중치 번호 28(135차): 번호 표(0~23 굵기, 29 ByLayer, 30 ByBlock, 31 기본값)에 없는 28을 AutoCAD는 ByLayer로 본다.
 * 근거: 같은 도면을 AutoCAD가 DWG와 DXF로 쓴 공개 짝 — DWG 번호가 28인 도형 31개(R2013·R2018 두 도면)는 DXF에 370이 없다(ByLayer).
 * 전에는 표에 없는 번호라 기본값(-3)으로 읽었다. 도면층 표의 번호는 바꾸지 않는다.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { entityLineweightFromIndex, lineweightFromIndex } from '../../src/io/dwg/lineweight';

// 쓰기에서 굵기 2.11 mm(번호 23)를 번호 28로 바꿔 써서 AutoCAD가 쓴 번호 28 도형을 만든다
const cfg = vi.hoisted(() => ({ raw28: false }));
vi.mock('../../src/io/dwg/writer/util', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/io/dwg/writer/util');
  return { ...mod, lwIndex: (v: number) => (cfg.raw28 && v === 211 ? 28 : mod.lwIndex(v)) };
});

function lineDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const l0 = doc.layers.get('0')!;
  doc.layers.set('LW', { ...l0, name: 'LW', handle: '', lineweight: 211 });
  const lines: [string, string, number][] = [
    ['A1', '0', 211],
    ['A2', '0', 50],
    ['A3', '0', -3],
    ['A4', '0', -1],
  ];
  for (const [handle, layer, lineweight] of lines) {
    const e = { ...entityDefaults(), type: 'LINE', handle, layer, lineweight, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set(handle, e as Entity);
  }
  return doc;
}

const lw = (doc: CadDocument, h: string) => (doc.entityIndex.get(h) as Entity).lineweight;

describe('DWG 도형 선가중치 번호 28', () => {
  it('번호 → 1/100 mm: 도형은 28을 ByLayer로, 도면층·나머지 번호는 그대로', () => {
    expect(entityLineweightFromIndex(28)).toBe(-1);
    expect(entityLineweightFromIndex(29)).toBe(-1);
    expect(entityLineweightFromIndex(30)).toBe(-2);
    expect(entityLineweightFromIndex(31)).toBe(-3);
    expect(entityLineweightFromIndex(0)).toBe(0);
    expect(entityLineweightFromIndex(23)).toBe(211);
    expect(lineweightFromIndex(28)).toBe(-3);
  });

  for (const version of ['AC1018', 'AC1032'] as const) {
    it(`${version}: 번호 28로 쓴 도형을 ByLayer로 읽고, 다시 쓰면 ByLayer 번호(29)로 쓴다`, () => {
      cfg.raw28 = true;
      let doc: CadDocument;
      try {
        doc = readDwg(writeDwg(lineDoc(), { version }).data);
      } finally {
        cfg.raw28 = false;
      }
      expect(lw(doc, 'A1')).toBe(-1);
      expect(lw(doc, 'A2')).toBe(50);
      expect(lw(doc, 'A3')).toBe(-3);
      expect(lw(doc, 'A4')).toBe(-1);
      // 도면층 표의 번호 28은 전처럼 기본값
      expect(doc.layers.get('LW')!.lineweight).toBe(-3);
      const again = readDwg(writeDwg(doc, { version }).data);
      expect(lw(again, 'A1')).toBe(-1);
      expect(lw(again, 'A3')).toBe(-3);
    });
  }
});
