/**
 * R2000~R2013 형식의 여러 단 MTEXT(단마다 따로 저장된 MTEXT + 첫 단의 ACAD 확장 자료): 한 묶음으로 고르고, 저장하면 원래 구조 그대로.
 * 자료는 AutoCAD의 확장 자료 배치(ACAD_MTEXT_COLUMN_INFO_BEGIN … / ACAD_MTEXT_COLUMNS_BEGIN 1070 47 n, 1005 핸들 …)를 따라 직접 만든 합성 문서다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, MTextEntity, XData } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { copyEntity } from '../../src/edit/geom/query';
import { affTranslate } from '../../src/edit/geom/math';
import { cachedMTextColumnSets, expandByMTextColumns, mtextColumnLinks, mtextColumnSets, stripMTextColumnLinks } from '../../src/edit/util/mtextcols';

const info = (count: number): XData['items'] => [
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_BEGIN' },
  { code: 1070, value: 75 },
  { code: 1070, value: 1 },
  { code: 1070, value: 79 },
  { code: 1070, value: 0 },
  { code: 1070, value: 76 },
  { code: 1070, value: count },
  { code: 1070, value: 78 },
  { code: 1070, value: 0 },
  { code: 1070, value: 48 },
  { code: 1040, value: 12.5 },
  { code: 1070, value: 49 },
  { code: 1040, value: 5 },
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_END' },
];

function mtext(handle: string, x: number, text: string, xdata: XData[]): MTextEntity {
  return {
    ...entityDefaults(),
    handle,
    layer: '0',
    type: 'MTEXT',
    insert: { x, y: 0, z: 0 },
    height: 2.5,
    width: 12.5,
    rectHeight: 10,
    attachment: 1,
    drawingDirection: 5,
    text,
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
    xdata,
  };
}

/** 세 단 MTEXT(A0 첫 단, A1·A2 다음 단)와 선 하나 */
function columnDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const ms = doc.blocks.get(MODEL_SPACE)!.entities;
  ms.push(
    mtext('A0', 0, 'one two', [{ app: 'ACAD', items: [...info(3), { code: 1000, value: 'ACAD_MTEXT_COLUMNS_BEGIN' }, { code: 1070, value: 47 }, { code: 1070, value: 3 }, { code: 1005, value: 'A1' }, { code: 1005, value: 'A2' }, { code: 1000, value: 'ACAD_MTEXT_COLUMNS_END' }] }]),
    mtext('A1', 17.5, 'three four', [{ app: 'ACAD', items: info(3) }]),
    mtext('A2', 35, 'five six', [{ app: 'ACAD', items: info(3) }]),
    { ...entityDefaults(), handle: 'A3', layer: '0', type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } } as Entity,
  );
  return finalizeDocument(doc);
}

describe('여러 단 MTEXT 묶음', () => {
  it('첫 단의 확장 자료로 묶음을 찾고, 어느 단을 골라도 모든 단을 고른다', () => {
    const doc = columnDoc();
    expect(mtextColumnLinks(doc.entityIndex.get('A0')!)).toEqual(['A1', 'A2']);
    expect(mtextColumnLinks(doc.entityIndex.get('A1')!)).toEqual([]);
    const sets = mtextColumnSets(doc);
    expect(sets.get('A2')).toEqual(['A0', 'A1', 'A2']);
    expect(expandByMTextColumns(doc, ['A2'])).toEqual(['A2', 'A0', 'A1']);
    expect(expandByMTextColumns(doc, ['A3'])).toEqual(['A3']);
    expect(expandByMTextColumns(doc, ['a1', 'A3']).sort()).toEqual(['A0', 'A2', 'A3', 'a1']);
    // 편집 세대가 같으면 다시 찾지 않는다
    expect(cachedMTextColumnSets(doc, 1)).toBe(cachedMTextColumnSets(doc, 1));
  });

  it('지운 단은 묶음에서 빠진다', () => {
    const doc = columnDoc();
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities = ms.entities.filter((e) => e.handle !== 'A2');
    doc.entityIndex.delete('A2');
    expect(expandByMTextColumns(doc, ['A1'])).toEqual(['A1', 'A0']);
  });

  it('DXF R2010·DWG R2010·R2013으로 저장해도 단 객체와 연결이 그대로 남는다', () => {
    const doc = columnDoc();
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1024' }).data), readDwg(writeDwg(doc, { version: 'AC1024' }).data), readDwg(writeDwg(doc, { version: 'AC1027' }).data)]) {
      expect(expandByMTextColumns(back, ['A1']).sort()).toEqual(['A0', 'A1', 'A2']);
      expect((back.entityIndex.get('A2') as MTextEntity).text).toBe('five six');
    }
  });

  it('복사본은 원본 단을 가리키지 않는 보통 MTEXT가 된다(한 단짜리 단 정보는 그대로)', () => {
    const doc = columnDoc();
    const copy = copyEntity(doc.entityIndex.get('A0')!, affTranslate(0, 50), doc).add![0] as MTextEntity;
    expect(mtextColumnLinks(copy)).toEqual([]);
    expect(copy.xdata).toBeUndefined();
    expect(mtextColumnLinks(doc.entityIndex.get('A0')!)).toEqual(['A1', 'A2']);
    const single = mtext('B0', 0, 'x', [{ app: 'ACAD', items: [...info(1), { code: 1000, value: 'MTEXTBEGIN' }] }]);
    stripMTextColumnLinks(single);
    expect(single.xdata![0]!.items.length).toBe(info(1).length + 1);
    const cont = mtext('B1', 0, 'x', [{ app: 'ACAD', items: [...info(3), { code: 1000, value: 'MTEXTBEGIN' }] }, { app: 'OTHER', items: [{ code: 1000, value: 'k' }] }]);
    stripMTextColumnLinks(cont);
    expect(cont.xdata).toEqual([{ app: 'ACAD', items: [{ code: 1000, value: 'MTEXTBEGIN' }] }, { app: 'OTHER', items: [{ code: 1000, value: 'k' }] }]);
  });
});
