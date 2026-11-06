/**
 * 90차: 여러 단 MTEXT 묶음 그립(위치·단 폭·단 간격·단 높이). AutoCAD 도움말("To Adjust Columns Using Grips")처럼 그립으로 단을 바꾸고,
 * R2000~R2013 꼴 묶음은 첫 단 자리의 한 객체(R2018 꼴 단 자료)로 합쳐 글이 단 사이로 흐른다. 위치 그립은 묶음째 옮긴다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, MTextColumns, MTextEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { mtextColumnSets } from '../../src/edit/util/mtextcols';
import { columnGripMove, columnGripPoints, columnTarget } from '../../src/edit/util/mtextcolgrip';
import { TextEngine } from '../../src/text/layout';
import { columnDoc, mtext } from './mtextcols-fixture';

const AUTO3: MTextColumns = { type: 2, count: 3, width: 20, gutter: 5, autoHeight: true, flowReversed: false, heights: [] };

function r2018Doc(columns: MTextColumns, rectHeight: number, text = 'Line 1\\PLine 2\\PLine 3\\PLine 4\\PLine 5\\PLine 6'): CadDocument {
  const doc = createNewDocument('metric');
  const e = mtext('B0', 10, text, undefined, 100);
  e.columns = columns;
  e.rectHeight = rectHeight;
  doc.blocks.get(MODEL_SPACE)!.entities.push(e);
  return finalizeDocument(doc);
}

const ids = (doc: CadDocument, h: string) => columnGripPoints(columnTarget(doc, doc.entityIndex.get(h)!, mtextColumnSets(doc))!).map((g) => `${g.id}@${g.point.x},${g.point.y}`);

describe('여러 단 MTEXT 묶음 그립', () => {
  it('R2018 꼴 한 객체: 첫 단 위 오른쪽이 단 폭, 둘째 단 위 왼쪽이 간격, 첫 단 아래가 높이(수동 높이는 단마다)', () => {
    expect(ids(r2018Doc(AUTO3, 12), 'B0')).toEqual(['col:ins@10,100', 'col:w@30,100', 'col:g@35,100', 'col:h@20,88']);
    const manual = r2018Doc({ ...AUTO3, autoHeight: false, count: 2, heights: [11, 0] }, 0);
    expect(ids(manual, 'B0')).toEqual(['col:ins@10,100', 'col:w@30,100', 'col:g@35,100', 'col:h0@20,89']);
    // 한 단, 흐름 거꾸로, 왼쪽 위가 아닌 부착점은 묶음 그립이 없다
    expect(columnTarget(r2018Doc({ ...AUTO3, count: 1 }, 12), r2018Doc({ ...AUTO3, count: 1 }, 12).entityIndex.get('B0')!)).toBeNull();
    const rev = r2018Doc({ ...AUTO3, flowReversed: true }, 12);
    expect(columnTarget(rev, rev.entityIndex.get('B0')!)).toBeNull();
    const mid = r2018Doc(AUTO3, 12);
    (mid.entityIndex.get('B0') as MTextEntity).attachment = 5;
    expect(columnTarget(mid, mid.entityIndex.get('B0')!)).toBeNull();
  });

  it('단 폭·간격·높이 그립을 끌면 단 자료가 바뀌고, 자동 높이 동적 단은 글이 드는 만큼 단 수가 바뀐다', () => {
    const doc = r2018Doc(AUTO3, 12);
    const t = columnTarget(doc, doc.entityIndex.get('B0')!)!;
    const w = columnGripMove(doc, t, 'col:w', { x: 40, y: 103 }).replace![0] as MTextEntity;
    expect(w.handle).toBe('B0');
    expect(w.columns!.width).toBe(30);
    const g = columnGripMove(doc, t, 'col:g', { x: 38, y: 90 }).replace![0] as MTextEntity;
    expect(g.columns!.gutter).toBeCloseTo(8);
    // 높이 12 → 줄 셋씩 두 단. 높이를 7로 줄이면 줄 둘씩 세 단
    const h = columnGripMove(doc, t, 'col:h', { x: 20, y: 93 }).replace![0] as MTextEntity;
    expect(h.rectHeight).toBe(7);
    expect(h.columns!.count).toBe(3);
    const h2 = columnGripMove(doc, t, 'col:h', { x: 20, y: 80 }).replace![0] as MTextEntity;
    expect(h2.columns!.count).toBe(2);
    expect(columnGripMove(doc, t, 'col:w', { x: 5, y: 100 }).message).toBeTruthy();
    expect(columnGripMove(doc, t, 'col:g', { x: 25, y: 100 }).message).toBeTruthy();
    // 수동 높이: 그 단 높이만
    const m = r2018Doc({ ...AUTO3, autoHeight: false, count: 2, heights: [11, 0] }, 0);
    const tm = columnTarget(m, m.entityIndex.get('B0')!)!;
    const r = columnGripMove(m, tm, 'col:h0', { x: 20, y: 95 }).replace![0] as MTextEntity;
    expect(r.columns!.heights).toEqual([5, 0]);
    expect(r.columns!.count).toBe(2);
  });

  it('R2000~R2013 꼴 묶음: 어느 단을 골라도 첫 단이 그립을 갖고, 끌면 첫 단 자리의 한 객체로 합친다', () => {
    const doc = columnDoc();
    const sets = mtextColumnSets(doc);
    const t = columnTarget(doc, doc.entityIndex.get('A2')!, sets)!;
    expect(t.head.handle).toBe('A0');
    expect(t.members.map((m) => m.handle)).toEqual(['A1', 'A2']);
    expect(columnGripPoints(t).map((g) => g.id)).toEqual(['col:ins', 'col:w', 'col:g', 'col:h']);
    const res = columnGripMove(doc, t, 'col:w', { x: 30, y: 0 }, new TextEngine(null));
    expect(res.remove).toEqual(['A1', 'A2']);
    const e = res.replace![0] as MTextEntity;
    expect(e.handle).toBe('A0');
    expect(e.text).toBe('Line 1\\PLine 2\\PLine 3\\PLine 4\\PLine 5\\PLine 6\\PLine 7\\PLine 8\\PLine 9');
    expect(e.columns).toEqual({ ...AUTO3, width: 30 });
    expect(e.xdata).toBeUndefined();
    // 위치 그립은 묶음째 옮기고 묶음은 그대로
    const mv = columnGripMove(doc, t, 'col:ins', { x: 5, y: -10 });
    expect(mv.replace!.map((x) => [x.handle, (x as MTextEntity).insert.x, (x as MTextEntity).insert.y])).toEqual([
      ['A0', 5, -10],
      ['A1', 30, -10],
      ['A2', 55, -10],
    ]);
    expect(mv.remove).toBeUndefined();
  });

  it('그립으로 합친 객체를 R2013 DXF로 쓰면 다시 단 객체로 나뉜다', () => {
    const doc = columnDoc();
    const t = columnTarget(doc, doc.entityIndex.get('A0')!, mtextColumnSets(doc))!;
    const e = columnGripMove(doc, t, 'col:h', { x: 10, y: -7 }).replace![0] as MTextEntity;
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities = ms.entities.filter((x) => x.handle !== 'A1' && x.handle !== 'A2').map((x) => (x.handle === 'A0' ? e : x));
    doc.entityIndex.delete('A1');
    doc.entityIndex.delete('A2');
    doc.entityIndex.set('A0', e);
    const back = readDxf(writeDxf(doc, { version: 'AC1027' }).data);
    const g = mtextColumnSets(back).get('A0')!;
    expect(g.length).toBe(e.columns!.count);
    expect(g.map((h) => (back.entityIndex.get(h) as MTextEntity).text).join('')).toBe(e.text);
  });
});
