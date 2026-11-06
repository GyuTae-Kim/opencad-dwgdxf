/**
 * R2000~R2013 형식의 여러 단 MTEXT(단마다 따로 저장된 MTEXT + 첫 단의 ACAD 확장 자료): 한 묶음으로 고르고, 저장하면 원래 구조 그대로.
 * 자료는 AutoCAD가 쓴 배치(첫 단: ACAD_MTEXT_COLUMN_INFO_BEGIN … / ACAD_MTEXT_COLUMNS_BEGIN 1070 47 n, 1005 핸들 … / 정한 높이,
 * 다른 단: 정한 높이만, 단 삽입점은 단 폭 + 간격씩, 41은 전체 폭)를 따라 직접 만든 합성 문서다.
 */
import { describe, expect, it } from 'vitest';
import type { MTextEntity, XData } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { copyEntity } from '../../src/edit/geom/query';
import { affScale, affTranslate } from '../../src/edit/geom/math';
import { transformEntity } from '../../src/edit/geom/transform';
import {
  cachedMTextColumnSets,
  columnLayoutFits,
  columnWrapWidth,
  columnXDataItems,
  memberColumnWidths,
  expandByMTextColumns,
  mtextColumnLinks,
  mtextColumnSets,
  readColumnXData,
  relinkClonedColumns,
  relinkColumnCopies,
  stripMTextColumnLinks,
  withColumnXData,
} from '../../src/edit/util/mtextcols';

import { DH, INFO, columnDoc, links, mtext } from './mtextcols-fixture';

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

  it('단 정보·단 목록·정한 높이를 읽고, 같은 차례로 다시 쓴다', () => {
    const doc = columnDoc();
    const c = readColumnXData(doc.entityIndex.get('A0')!)!;
    expect(c.info).toEqual({ type: 2, count: 3, width: 20, gutter: 5, autoHeight: true, flowReversed: false, heights: [] });
    expect(c.links).toEqual({ count: 3, handles: ['A1', 'A2'] });
    expect(c.definedHeight).toBe(12);
    expect(columnXDataItems(c)).toEqual([...INFO, ...links('A1', 'A2'), ...DH]);
    expect(readColumnXData(doc.entityIndex.get('A1')!)).toEqual({ definedHeight: 12 });
    // 수동 높이 동적 단은 높이 목록(50)을 쓴다
    const manual = { info: { type: 2, count: 2, width: 20, gutter: 5, autoHeight: false, flowReversed: false, heights: [11, 0] } };
    expect(readColumnXData(mtext('B0', 0, '', [{ app: 'ACAD', items: columnXDataItems(manual) }]))).toEqual(manual);
    // 다른 ACAD 항목·앱은 그대로, 단 묶음은 처음 자리에
    const xd: XData[] = [{ app: 'ACAD', items: [{ code: 1000, value: 'K' }, ...INFO, { code: 1000, value: 'Z' }] }, { app: 'OTHER', items: [{ code: 1000, value: 'k' }] }];
    expect(withColumnXData(xd, null)).toEqual([{ app: 'ACAD', items: [{ code: 1000, value: 'K' }, { code: 1000, value: 'Z' }] }, xd[1]]);
    expect(withColumnXData(xd, manual)![0]!.items.slice(0, 2)).toEqual([{ code: 1000, value: 'K' }, { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_BEGIN' }]);
    expect(withColumnXData([{ app: 'ACAD', items: INFO }], null)).toBeUndefined();
  });

  it('지운 단은 묶음에서 빠지고, 다른 블록을 가리키는 연결은 묶지 않는다', () => {
    const doc = columnDoc();
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities = ms.entities.filter((e) => e.handle !== 'A2');
    doc.entityIndex.delete('A2');
    expect(expandByMTextColumns(doc, ['A1'])).toEqual(['A1', 'A0']);
    // 블록 안의 첫 단이 모형 공간의 단을 가리키면(옛 연결) 묶지 않는다
    const doc2 = columnDoc();
    const stray = mtext('B0', 0, 'x', [{ app: 'ACAD', items: [...INFO, ...links('A1', 'A2')] }]);
    doc2.blocks.get('*PAPER_SPACE')!.entities.push(stray);
    doc2.entityIndex.set('B0', stray);
    expect(mtextColumnSets(doc2).get('A1')).toEqual(['A0', 'A1', 'A2']);
    expect(mtextColumnSets(doc2).has('B0')).toBe(false);
  });

  it('DXF R2010·DWG R2010·R2013으로 저장해도 단 객체와 연결이 그대로 남는다', () => {
    const doc = columnDoc();
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1024' }).data), readDwg(writeDwg(doc, { version: 'AC1024' }).data), readDwg(writeDwg(doc, { version: 'AC1027' }).data)]) {
      expect(expandByMTextColumns(back, ['A1']).sort()).toEqual(['A0', 'A1', 'A2']);
      expect((back.entityIndex.get('A2') as MTextEntity).text).toBe('Line 7\\PLine 8\\PLine 9');
      expect(readColumnXData(back.entityIndex.get('A0')!)).toEqual(readColumnXData(doc.entityIndex.get('A0')!));
    }
  });

  it('한 단만 복사하면 원본 단을 가리키지 않는 보통 MTEXT가 된다(한 단짜리 단 정보는 그대로)', () => {
    const doc = columnDoc();
    const copy = copyEntity(doc.entityIndex.get('A0')!, affTranslate(0, 50), doc).add![0] as MTextEntity;
    expect(mtextColumnLinks(copy)).toEqual([]);
    expect(copy.xdata).toBeUndefined();
    expect(mtextColumnLinks(doc.entityIndex.get('A0')!)).toEqual(['A1', 'A2']);
    // 다른 단만 복사하면 정한 높이도 뗀다
    const m = copyEntity(doc.entityIndex.get('A1')!, affTranslate(0, 50), doc).add![0] as MTextEntity;
    expect(m.xdata).toBeUndefined();
    // 같은 편집에서 묶음 일부만 있으면 잇지 않는다
    copy.handle = 'C0';
    expect(relinkColumnCopies([copy])).toBe(0);
    const single = mtext('B0', 0, 'x', [{ app: 'ACAD', items: [...columnXDataItems({ info: { type: 2, count: 1, width: 20, gutter: 5, autoHeight: false, flowReversed: false, heights: [9] } }), { code: 1000, value: 'MTEXTBEGIN' }] }]);
    const n = single.xdata![0]!.items.length;
    stripMTextColumnLinks(single);
    expect(single.xdata![0]!.items.length).toBe(n);
    const cont = mtext('B1', 0, 'x', [{ app: 'ACAD', items: [...INFO, { code: 1000, value: 'MTEXTBEGIN' }] }, { app: 'OTHER', items: [{ code: 1000, value: 'k' }] }]);
    stripMTextColumnLinks(cont);
    expect(cont.xdata).toEqual([{ app: 'ACAD', items: [{ code: 1000, value: 'MTEXTBEGIN' }] }, { app: 'OTHER', items: [{ code: 1000, value: 'k' }] }]);
  });

  it('묶음째 같은 변환으로 복사하면 새 핸들끼리 다시 잇는다(배치가 어긋난 복사본은 잇지 않는다)', () => {
    const doc = columnDoc();
    const [a0, a1, a2] = ['A0', 'A1', 'A2'].map((h) => doc.entityIndex.get(h)!);
    const copies = [a0, a1, a2].map((e) => copyEntity(e, affTranslate(10, 40), doc).add![0]!);
    // 첫 번째 줄 복사본(행렬이 다른 것)은 다른 묶음이다
    const other = copyEntity(a1, affTranslate(10, 80), doc).add![0]!;
    ['C0', 'C1', 'C2'].forEach((h, i) => (copies[i]!.handle = h));
    other.handle = 'C9';
    expect(relinkColumnCopies([...copies, other])).toBe(1);
    expect(mtextColumnLinks(copies[0]!)).toEqual(['C1', 'C2']);
    expect(readColumnXData(copies[1]!)).toEqual({ definedHeight: 12 });
    expect(other.xdata).toBeUndefined();
    // 원본은 그대로
    expect(mtextColumnLinks(a0)).toEqual(['A1', 'A2']);
    // 다시 부르면 적어 둔 것이 없다
    expect(relinkColumnCopies(copies)).toBe(0);
    // 단 사이가 단 폭 + 간격이 아니면(읽을 수 있게 둔 대칭 등) 잇지 않는다
    expect(columnLayoutFits(copies[0] as MTextEntity, [copies[2] as MTextEntity, copies[1] as MTextEntity], readColumnXData(a0)!.info)).toBe(false);
  });

  it('축척하면 확장 자료의 단 폭·간격·정한 높이도 같은 배율이다', () => {
    const doc = columnDoc();
    const out = transformEntity(doc.entityIndex.get('A0')!, affScale(2, 2), doc, {}).replace![0] as MTextEntity;
    const c = readColumnXData(out)!;
    expect(c.info!.width).toBeCloseTo(40);
    expect(c.info!.gutter).toBeCloseTo(10);
    expect(c.definedHeight).toBeCloseTo(24);
    expect(c.links!.handles).toEqual(['A1', 'A2']);
    const m = transformEntity(doc.entityIndex.get('A1')!, affScale(2, 2), doc, {}).replace![0] as MTextEntity;
    expect(readColumnXData(m)!.definedHeight).toBeCloseTo(24);
  });

  it('그릴 때 첫 단·다른 단은 단 폭으로 줄을 나눈다(41은 전체 폭), 묶음이 아닌 MTEXT는 41 그대로', () => {
    const doc = columnDoc();
    const members = () => memberColumnWidths(doc);
    expect(members()).toEqual(new Map([['A1', 20], ['A2', 20]]));
    expect(['A0', 'A1', 'A2'].map((h) => columnWrapWidth(doc.entityIndex.get(h) as MTextEntity, members))).toEqual([20, 20, 20]);
    expect(columnWrapWidth(mtext('B0', 0, 'x'), members)).toBeUndefined();
    // 한 단짜리 단 정보는 41 그대로
    const one = mtext('B1', 0, 'x', [{ app: 'ACAD', items: columnXDataItems({ info: { type: 2, count: 1, width: 9, gutter: 5, autoHeight: false, flowReversed: false, heights: [0] } }) }]);
    expect(columnWrapWidth(one, members)).toBeUndefined();
    // 묶음 밖의 정한 높이만 있는 MTEXT도 41 그대로
    expect(columnWrapWidth(mtext('B2', 0, 'x', [{ app: 'ACAD', items: DH }]), members)).toBeUndefined();
  });

  it('원본을 복제해 새 핸들만 준 사본은 사본끼리 잇고, 일부만 있으면 연결을 뗀다', () => {
    const doc = columnDoc();
    const src = ['A0', 'A1', 'A2'];
    const clones = src.map((h) => structuredClone(doc.entityIndex.get(h)!));
    clones.forEach((c, i) => (c.handle = `D${i}`));
    expect(relinkClonedColumns(clones, src)).toBe(1);
    expect(mtextColumnLinks(clones[0]!)).toEqual(['D1', 'D2']);
    const part = [structuredClone(doc.entityIndex.get('A0')!)];
    part[0]!.handle = 'E0';
    expect(relinkClonedColumns(part, ['A0'])).toBe(0);
    expect(part[0]!.xdata).toBeUndefined();
  });
});
