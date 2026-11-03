/**
 * 62차: 블록 소유 목록(R2004+)이 같은 도형을 되풀이해 가리키는 DWG.
 * 고치기 전에는 되풀이마다 폴리선 정점을 다시 모으고 같은 객체를 블록에 다시 넣어, 정점 6,000개 폴리선을 6,000번 가리킨 DWG 95KB가
 * 읽기 1.7초·장면 2.9초·선분 3,599만 개였다. 속성 블록 참조는 되풀이마다 속성이 다시 붙어 되풀이 수의 제곱만큼 그렸다.
 * 파일은 쓰기의 블록 레코드에서 모형 공간 목록만 되풀이해 만든다(객체는 한 번만 쓴다).
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type AttribEntity, type BlockDef, type CadDocument, type Entity, type InsertEntity, type PolylineEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { packPoly, polyCount } from '../../src/core/polyverts';
import { readDwg } from '../../src/io/dwg';
import { writeDwg } from '../../src/io/dwg/writer';
import type { PBlock } from '../../src/io/dwg/writer/context';
import { TableWriter } from '../../src/io/dwg/writer/tables';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { within2s } from './timed';

/** 모형 공간의 첫 도형을 소유 목록에 times번 적은 R2004 DWG */
function repeatedDwg(doc: CadDocument, times: number): Uint8Array {
  const orig = TableWriter.prototype.blockHeader;
  const model = doc.blocks.get(MODEL_SPACE);
  TableWriter.prototype.blockHeader = function (this: TableWriter, pb: PBlock) {
    if (pb.def !== model) return orig.call(this, pb);
    const ents = pb.ents;
    pb.ents = Array.from({ length: times }, () => ents[0]!);
    try {
      return orig.call(this, pb);
    } finally {
      pb.ents = ents;
    }
  };
  try {
    return writeDwg(doc, { version: 'AC1018' }).data;
  } finally {
    TableWriter.prototype.blockHeader = orig;
  }
}

const ms = (doc: CadDocument): Entity[] => doc.blocks.get(MODEL_SPACE)!.entities;
const segs = (doc: CadDocument) => buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) }).list.chunks.reduce((a, c) => a + c.segCount, 0);

describe('같은 도형을 되풀이해 가리키는 블록 목록', () => {
  it('폴리선은 한 번만 넣고 알린다', () => {
    const doc = createNewDocument('metric');
    const verts = Array.from({ length: 2000 }, (_, i) => ({ location: { x: i, y: (i * 7) % 5, z: 0 }, bulge: 0, startWidth: 0, endWidth: 0, flags: 0 }));
    ms(doc).push({ ...entityDefaults(), type: 'POLYLINE', handle: '', kind: '2d', flags: 0, elevation: 0, defaultStartWidth: 0, defaultEndWidth: 0, mCount: 0, nCount: 0, mDensity: 0, nDensity: 0, smoothType: 0, ...packPoly(verts) } as PolylineEntity);
    const data = repeatedDwg(doc, 2000);
    const back = within2s(() => readDwg(data));
    expect(ms(back)).toHaveLength(1);
    expect(polyCount(ms(back)[0] as PolylineEntity)).toBe(2000);
    expect(back.warnings.find((w) => w.code === 'dwg.repeated_entities')?.detail).toEqual({ count: 1999 });
    // 예전에는 같은 객체 2,000개라 선분 400만 개
    expect(within2s(() => segs(back))).toBe(1999);
  });

  it('속성 블록 참조는 속성을 되풀이 수만큼 다시 붙이지 않는다', () => {
    const doc = createNewDocument('metric');
    const base = { ...entityDefaults(), handle: '' };
    const text = { insert: { x: 0, y: 0, z: 0 }, height: 2, text: '1', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag: 'N', attFlags: 0 };
    const blk: BlockDef = { name: 'B', handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 2, entities: [{ ...base, type: 'ATTDEF', ...text, prompt: 'p' } as Entity] };
    doc.blocks.set('B', blk);
    doc.blockRecords.set('B', { name: 'B', handle: '', flags: 0, insertUnits: 4, explodable: true, scalable: true });
    const att = { ...base, type: 'ATTRIB', ...text, text: '7' } as AttribEntity;
    ms(doc).push({ ...base, type: 'INSERT', block: 'B', insert: { x: 5, y: 5, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [att] } as InsertEntity);
    const back = readDwg(repeatedDwg(doc, 300));
    expect(ms(back)).toHaveLength(1);
    const ins = ms(back)[0] as InsertEntity;
    expect(ins.attribs.map((a) => a.text)).toEqual(['7']);
    expect(back.warnings.find((w) => w.code === 'dwg.repeated_entities')?.detail).toEqual({ count: 299 });
  });

  it('되풀이가 없으면 경고도 없다', () => {
    const doc = createNewDocument('metric');
    ms(doc).push({ ...entityDefaults(), handle: '', type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as Entity);
    const back = readDwg(repeatedDwg(doc, 1));
    expect(ms(back)).toHaveLength(1);
    expect(back.warnings.map((w) => w.code)).not.toContain('dwg.repeated_entities');
  });
});
