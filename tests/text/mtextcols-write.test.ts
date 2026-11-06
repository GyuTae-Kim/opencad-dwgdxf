/**
 * 90차: 여러 단 MTEXT를 쓰기 버전에 맞게 — R2018은 단 묶음을 첫 단 자리의 한 객체로 합치고, R2013 이하는 한 객체를 단 객체로 나눈다.
 * 기대값은 AutoCAD가 같은 도면을 R2018과 R2007로 쓴 DXF 짝에서 본 규칙을 따른 합성 자료다:
 * 글은 문단 끝(\P)·단 나누기(\N) 뒤에서 나뉘고 그 기호는 앞 단 끝에 남는다(이어 붙이면 R2018 글), 단 객체 수는 줄이 든 단 수,
 * 다른 단은 단 폭 + 간격씩 오른쪽에 41 = 전체 폭, 정한 높이는 정적·자동 높이 단에만, 높이 목록은 수동 높이 단에만.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, MTextColumns, MTextEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { paragraphStarts, splitColumnText } from '../../src/io/mtextcols';
import { mtextColumnSets, readColumnXData } from '../../src/edit/util/mtextcols';
import { saveLosses } from '../../src/app/saveloss';
import { columnDoc, mtext } from './mtextcols-fixture';

const model = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities;
const mtexts = (doc: CadDocument) => model(doc).filter((e): e is MTextEntity => e.type === 'MTEXT');

/** R2018 꼴 여러 단 MTEXT 하나만 든 문서 */
function r2018Doc(text: string, columns: MTextColumns, rectHeight: number): CadDocument {
  const doc = createNewDocument('metric');
  const e = mtext('B0', 10, text, undefined, 100);
  e.columns = columns;
  e.rectHeight = rectHeight;
  e.width = 70;
  model(doc).push(e);
  return finalizeDocument(doc);
}

const dxf = (doc: CadDocument, version: 'AC1015' | 'AC1024' | 'AC1027' | 'AC1032') => readDxf(writeDxf(doc, { version }).data);
const dwg = (doc: CadDocument, version: 'AC1015' | 'AC1024' | 'AC1027' | 'AC1032') => readDwg(writeDwg(doc, { version }).data);

/** 첫 단과 다른 단(묶음 차례) */
function group(doc: CadDocument): MTextEntity[] {
  const sets = mtextColumnSets(doc);
  const head = mtexts(doc).find((e) => sets.get(e.handle)?.[0] === e.handle);
  return head ? sets.get(head.handle)!.map((h) => doc.entityIndex.get(h) as MTextEntity) : [];
}

const STATIC3: MTextColumns = { type: 1, count: 3, width: 20, gutter: 5, autoHeight: false, flowReversed: false, heights: [] };
const AUTO3: MTextColumns = { type: 2, count: 3, width: 20, gutter: 5, autoHeight: true, flowReversed: false, heights: [] };

describe('여러 단 MTEXT 쓰기(R2018 합치기·R2013 이하 나누기)', () => {
  it('R2013 이하 꼴 묶음을 R2018로 쓰면 첫 단 자리의 MTEXT 하나(이어 붙인 글, 단 자료)가 된다', () => {
    const doc = columnDoc();
    for (const back of [dxf(doc, 'AC1032'), dwg(doc, 'AC1032')]) {
      const ms = mtexts(back);
      expect(ms.map((e) => e.handle)).toEqual(['A0']);
      const e = ms[0]!;
      expect(e.text).toBe('Line 1\\PLine 2\\PLine 3\\PLine 4\\PLine 5\\PLine 6\\PLine 7\\PLine 8\\PLine 9');
      expect(e.columns).toEqual(AUTO3);
      expect(e.rectHeight).toBe(12);
      expect(e.width).toBe(70);
      expect(readColumnXData(e)).toBeNull();
      // 선은 그대로
      expect(model(back).some((x) => x.handle === 'A3')).toBe(true);
    }
    // 합친 다른 단 수만큼 저장 뒤 참고 알림(빠지는 것이 아니라 저장 전 확인에는 없다)
    for (const w of [writeDxf(doc, { version: 'AC1032' }).warnings, writeDwg(doc, { version: 'AC1032' }).warnings]) {
      expect(w.find((x) => x.code === 'mtext.columns_merged')?.count).toBe(2);
      expect(saveLosses(w)).toEqual([]);
    }
  });

  it('R2018 꼴 한 객체를 R2013 이하로 쓰면 단 객체로 나뉘고, 다시 R2018로 쓰면 처음 글·단 자료다', () => {
    const doc = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4\\PLine 5\\PLine 6\\PLine 7\\PLine 8\\PLine 9', AUTO3, 12);
    for (const [back, ver] of [
      [dxf(doc, 'AC1027'), 'dxf13'],
      [dxf(doc, 'AC1015'), 'dxf00'],
      [dwg(doc, 'AC1027'), 'dwg13'],
      [dwg(doc, 'AC1015'), 'dwg00'],
    ] as const) {
      const g = group(back);
      expect(g.map((e) => e.text), ver).toEqual(['Line 1\\PLine 2\\PLine 3\\P', 'Line 4\\PLine 5\\PLine 6\\P', 'Line 7\\PLine 8\\PLine 9']);
      expect(g[0]!.handle).toBe('B0');
      expect(g.map((e) => [e.insert.x, e.insert.y])).toEqual([
        [10, 100],
        [35, 100],
        [60, 100],
      ]);
      // 첫 단 41은 그대로, 다른 단 41은 전체 폭(3×20 + 2×5)
      expect(g.map((e) => e.width)).toEqual([70, 70, 70]);
      const c = readColumnXData(g[0]!)!;
      expect(c.info).toEqual(AUTO3);
      expect(c.links).toEqual({ count: 3, handles: [g[1]!.handle, g[2]!.handle] });
      expect(c.definedHeight).toBe(12);
      expect(readColumnXData(g[1]!)).toEqual({ definedHeight: 12 });
      expect(g[0]!.columns).toBeUndefined();
      const again = mtexts(dxf(back, 'AC1032'));
      expect(again.length).toBe(1);
      expect(again[0]!.text).toBe((doc.entityIndex.get('B0') as MTextEntity).text);
      expect(again[0]!.columns).toEqual(AUTO3);
      expect(again[0]!.rectHeight).toBe(12);
    }
  });

  it('단 나누기(\\N)는 앞 단 끝에 남고, 단보다 많은 나누기는 마지막 단에 남는다(정적 단)', () => {
    // 정적 3단, 정한 높이 7(줄 둘): AutoCAD 짝의 "Line 1\PLine 2\N\N\N\PLine 3\N\PLine 4" → 세 단
    const doc = r2018Doc('Line 1\\PLine 2\\N\\N\\N\\PLine 3\\N\\PLine 4', STATIC3, 7.0885);
    expect(group(dxf(doc, 'AC1024')).map((e) => e.text)).toEqual(['Line 1\\PLine 2\\N', '\\N', '\\N\\PLine 3\\N\\PLine 4']);
    const d2 = r2018Doc('Line 1\\PLine 2\\N\\PLine 3\\PLine 4', STATIC3, 7.0885);
    expect(group(dxf(d2, 'AC1024')).map((e) => e.text)).toEqual(['Line 1\\PLine 2\\N', '\\PLine 3\\P', 'Line 4']);
    // 정적 3단에 두 단만 차면 단 객체는 둘(단 수 76은 3)
    const d3 = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4', STATIC3, 7.0885);
    const g = group(dwg(d3, 'AC1027'));
    expect(g.map((e) => e.text)).toEqual(['Line 1\\PLine 2\\P', 'Line 3\\PLine 4']);
    expect(readColumnXData(g[0]!)!.info!.count).toBe(3);
    expect(readColumnXData(g[0]!)!.links!.count).toBe(2);
  });

  it('수동 높이 동적 단은 단마다 제 높이로 나뉘고(0은 끝없이) 높이 목록만 쓴다', () => {
    const manual: MTextColumns = { type: 2, count: 4, width: 21.7, gutter: 1.2, autoHeight: false, flowReversed: false, heights: [11.777, 3.794, 19.586, 0] };
    const doc = r2018Doc('Line 1\\PLine 2\\NLine 3\\PLine 4\\PLine 5\\NLine 6', manual, 0);
    const g = group(dxf(doc, 'AC1027'));
    expect(g.map((e) => e.text)).toEqual(['Line 1\\PLine 2\\N', 'Line 3\\P', 'Line 4\\PLine 5\\N', 'Line 6']);
    const c = readColumnXData(g[0]!)!;
    expect(c.info!.heights).toEqual(manual.heights);
    expect(c.definedHeight).toBeUndefined();
    // 수동 높이 단의 다른 단에는 확장 자료가 없다
    expect(g[1]!.xdata).toBeUndefined();
    const back = mtexts(dwg(dxf(doc, 'AC1027'), 'AC1032'));
    expect(back.length).toBe(1);
    expect(back[0]!.columns).toEqual(manual);
    expect(back[0]!.text).toBe('Line 1\\PLine 2\\NLine 3\\PLine 4\\PLine 5\\NLine 6');
    // 정한 높이가 0이 아니면 수동 높이 단도 첫 단과 다른 단에 정한 높이를 쓴다(AutoCAD 짝의 수동 높이 3단, 46 = 12)
    const m3: MTextColumns = { ...manual, count: 3, heights: [11.777, 3.794, 19.586] };
    const d2 = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4\\PLine 5\\PLine 6', m3, 12);
    const g2 = group(dwg(d2, 'AC1024'));
    expect(g2.map((e) => e.text)).toEqual(['Line 1\\PLine 2\\PLine 3\\P', 'Line 4\\P', 'Line 5\\PLine 6']);
    expect(g2.map((e) => readColumnXData(e)?.definedHeight)).toEqual([12, 12, 12]);
    expect(mtexts(dxf(dxf(d2, 'AC1015'), 'AC1032'))[0]!.rectHeight).toBe(12);
  });

  it('단 사이로 넘어가는 긴 문단은 시작한 단에 다 두고 다른 단은 빈 글이다', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const doc = r2018Doc(long, { ...AUTO3, count: 3 }, 12);
    const g = group(dxf(doc, 'AC1027'));
    expect(g.length).toBe(3);
    expect(g.map((e) => e.text)).toEqual([long, '', '']);
  });

  it('묶음 밖 서식 뒤나 묶음 { } 안에서는 나누지 않는다', () => {
    expect(paragraphStarts('a\\Pb{\\C1;c\\Pd}\\Pe').map((x) => x.cut)).toEqual([true, true, false, true]);
    expect(paragraphStarts('\\C1;a\\Pb').map((x) => x.cut)).toEqual([true, false]);
    expect(paragraphStarts('\\A1;a\\Pb\\S1/2;\\Pc').map((x) => x.cut)).toEqual([true, true, true]);
    expect(paragraphStarts('\\pxqc;a\\Pb').map((x) => x.cut)).toEqual([true, false]);
    // \U+·%%·\\ 같은 글자 코드는 문단을 나누지 않는다
    expect(paragraphStarts('a\\U+0041%%c\\\\P\\Pb').map((x) => x.start)).toEqual([0, 16]);
    const e = mtext('B0', 0, '\\C1;Line 1\\PLine 2\\PLine 3\\PLine 4', undefined);
    e.columns = STATIC3;
    e.rectHeight = 7.0885;
    expect(splitColumnText(e, undefined)).toEqual(['\\C1;Line 1\\PLine 2\\PLine 3\\PLine 4', '']);
  });

  it('한 단짜리 단 자료는 R2013 이하에서 단 정보 확장 자료로 쓰고, 다시 R2018로 쓰면 단 자료다', () => {
    const one: MTextColumns = { type: 2, count: 1, width: 70.258, gutter: 12.5, autoHeight: false, flowReversed: false, heights: [52.56] };
    const doc = r2018Doc('DYNAMIC COLUMNS', one, 0);
    const oldDoc = dwg(doc, 'AC1024');
    const old = mtexts(oldDoc);
    expect(old.length).toBe(1);
    expect(old[0]!.columns).toBeUndefined();
    expect(readColumnXData(old[0]!)).toEqual({ info: one });
    expect(mtexts(dxf(oldDoc, 'AC1032'))[0]!.columns).toEqual(one);
    // 한 단은 부착점·흐름과 상관없이 단 정보를 옮긴다(경고 없음)
    const mid = r2018Doc('DYNAMIC COLUMNS', one, 0);
    (mid.entityIndex.get('B0') as MTextEntity).attachment = 5;
    const w = writeDwg(mid, { version: 'AC1015' });
    expect(w.warnings.map((x) => x.code)).not.toContain('mtext.columns_dropped');
    expect(readColumnXData(mtexts(readDwg(w.data))[0]!)).toEqual({ info: one });
  });

  it('흐름 거꾸로·왼쪽 위가 아닌 부착점은 나누지 않고 단 정보를 빼고 경고한다', () => {
    const doc = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4', { ...STATIC3, flowReversed: true }, 7.0885);
    const w = writeDxf(doc, { version: 'AC1027' });
    expect(w.warnings.map((x) => x.code)).toContain('mtext.columns_dropped');
    // 저장 전 확인에 "남지만 바뀜"으로 나온다
    expect(saveLosses(w.warnings).map((x) => x.converted)).toEqual([true]);
    expect(mtexts(readDxf(w.data)).length).toBe(1);
    const d2 = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4', STATIC3, 7.0885);
    (d2.entityIndex.get('B0') as MTextEntity).attachment = 7;
    const w2 = writeDwg(d2, { version: 'AC1027' });
    expect(w2.warnings.map((x) => x.code)).toContain('mtext.columns_dropped');
    expect(mtexts(readDwg(w2.data)).length).toBe(1);
  });

  it('R2018로 읽은 단 자료는 R2018로 다시 써도 그대로다(자동 높이 단의 단 수도)', () => {
    const doc = r2018Doc('Line 1\\PLine 2\\PLine 3\\PLine 4', AUTO3, 12);
    for (const back of [dxf(doc, 'AC1032'), dwg(doc, 'AC1032')]) {
      const e = mtexts(back)[0]!;
      expect(e.columns).toEqual(AUTO3);
      expect(e.text).toBe('Line 1\\PLine 2\\PLine 3\\PLine 4');
    }
    const kinds = (d: CadDocument) => model(d).map((x: Entity) => x.type);
    expect(kinds(dxf(doc, 'AC1032'))).toEqual(['MTEXT']);
  });
});
