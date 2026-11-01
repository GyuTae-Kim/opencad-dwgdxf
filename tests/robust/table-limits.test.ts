/**
 * 35차: 표의 행·열·병합과 표 확장 자료의 개수 값.
 * 고치기 전에는 행 × 열 60000 × 60000인 표를 누르거나 저장하면 힙이 넘쳐 프로세스가 죽었고, 확장 자료의 값 하나도 같았다.
 */
import { describe, expect, it } from 'vitest';
import { TABLE_CELL_LIMIT } from '../../src/core/limits';
import { MODEL_SPACE, type InsertEntity, type TableEntity, type XData, type XDataItem } from '../../src/core/model';
import { TABLE_APP, decodeTableXData, encodeTableXData, isEditableTable, rawTableCells, tableFromEntity } from '../../src/edit/table/entity';
import type { TableData } from '../../src/edit/table/model';
import { writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readCadFile } from '../../src/io/index';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { BLOCK_B, bytesOf, dxfText, table, tableMerge, tableXdataInsert } from './corrupt35';

const within2s = <T>(f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  expect(performance.now() - t0).toBeLessThan(2000);
  return r;
};

const T1 = ['0', 'BLOCK', '8', '0', '2', '*T1', '70', '1', '10', '0', '20', '0', '30', '0', '3', '*T1', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '5', '21', '0', '31', '0', '0', 'ENDBLK', '8', '0'];

const xdata = (group: string, values: number[], size: [number, number] = [2, 2]): XData => {
  const items: XDataItem[] = [
    { code: 1000, value: 'OPENCAD_TABLE 1' },
    { code: 1000, value: 'size' },
    { code: 1071, value: size[0] },
    { code: 1071, value: size[1] },
    { code: 1000, value: group },
    ...values.map((v) => ({ code: 1071, value: v }) as XDataItem),
  ];
  return { app: TABLE_APP, items };
};

describe('행 × 열이 한도를 넘는 표', () => {
  it('읽을 때 셀 없는 표로 두고 경고한다(그림 블록은 그린다)', () => {
    const doc = within2s(() => readDxf(bytesOf(dxfText([table(60000, 60000)], [T1]))));
    expect(doc.warnings.map((w) => w.code)).toContain('table.too_large');
    const e = doc.entityIndex.get('2A') as TableEntity;
    expect([e.rows, e.columns]).toEqual([0, 0]);
    expect(within2s(() => tableFromEntity(e, doc))).toBeNull();
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(s.list.chunks.reduce((a, c) => a + c.segCount, 0)).toBe(1);
  });

  it('DXF·DWG로 다시 저장해도 터지지 않고 다시 열린다', () => {
    const doc = readDxf(bytesOf(dxfText([table(60000, 60000)], [T1])));
    const dxf = within2s(() => writeDxf(doc, { version: 'AC1032' }));
    expect(readCadFile(dxf.data, 'x.dxf').blocks.get(MODEL_SPACE)!.entities.length).toBe(1);
    const dwg = within2s(() => writeDwg(doc, { version: 'AC1032' }));
    expect(readCadFile(dwg.data.slice(), 'x.dwg').blocks.get(MODEL_SPACE)!.entities.length).toBe(1);
  });

  it('한도 그대로인 표는 표로 남는다', () => {
    const doc = readDxf(bytesOf(dxfText([table(1000, 1000)], [T1])));
    expect(1000 * 1000).toBe(TABLE_CELL_LIMIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain('table.too_large');
    expect((doc.entityIndex.get('2A') as TableEntity).rows).toBe(1000);
  });
});

describe('표 병합', () => {
  it('표 밖으로 나가는 병합 폭·높이는 칸을 세지 않는다', () => {
    const doc = readDxf(bytesOf(dxfText([tableMerge(2, 2, 30000, 30000)], [T1])));
    const e = doc.entityIndex.get('2B') as TableEntity;
    const rt = within2s(() => tableFromEntity(e, doc));
    expect(rt?.data.cells.length).toBe(4);
    expect(rt?.data.merges).toEqual([]);
  });

  it('표 안의 병합과 겹치는 병합은 예전처럼 푼다', () => {
    const raw = [
      { code: 100, value: 'AcDbTable' },
      { code: 91, value: 2 },
      { code: 92, value: 2 },
      { code: 171, value: 1 },
      { code: 175, value: 2 },
      { code: 176, value: 1 },
      { code: 171, value: 1 },
      { code: 175, value: 1 },
      { code: 176, value: 2 },
      { code: 171, value: 1 },
      { code: 171, value: 1 },
    ];
    expect(rawTableCells(raw).merges).toEqual([{ row: 0, col: 0, rows: 1, cols: 2 }]);
  });
});

describe('표 확장 자료', () => {
  it('개수 값 하나로 수억 칸을 잡지 않는다', () => {
    const doc = readDxf(bytesOf(dxfText([tableXdataInsert(2, 2, 'rowh', [500000000, 1, 1])], [BLOCK_B])));
    expect(within2s(() => isEditableTable(doc.entityIndex.get('3A') as InsertEntity))).toBe(false);
    for (const g of ['rowh', 'baseh', 'colw', 'kinds', 'merge', 'align']) {
      const d = within2s(() => decodeTableXData(xdata(g, [500000000, 1, 1])));
      expect(d).not.toBeNull();
    }
    expect(within2s(() => decodeTableXData(xdata('text', [1, 0, 2000000000])))?.texts?.size).toBe(1);
  });

  it('표 크기가 한도를 넘으면 표로 다루지 않는다', () => {
    expect(within2s(() => decodeTableXData(xdata('fill', [1, 0, 1600000000, 1, -1], [40000, 40000])))).toBeNull();
    expect(decodeTableXData(xdata('fill', [1, 0, 1, 1, -1], [1000, 1000]))?.fills?.size).toBe(1);
  });

  it('겹치는 묶음을 되풀이해도 셀 수만큼만 돈다', () => {
    const runs = Array.from({ length: 20000 }, () => [0, TABLE_CELL_LIMIT, 1, -1]).flat();
    const d = within2s(() => decodeTableXData(xdata('fill', [20000, ...runs], [1000, 1000])));
    expect(d?.fills?.size).toBe(TABLE_CELL_LIMIT);
  });

  it('앱이 쓴 표 자료는 그대로 읽는다', () => {
    const t: TableData = {
      rows: 2,
      cols: 2,
      rowHeights: [5, 6],
      baseRowHeights: [5, 6],
      colWidths: [7, 8],
      rowKinds: ['title', 'data'],
      merges: [{ row: 0, col: 0, rows: 1, cols: 2 }],
      cells: [{ text: 'a', align: 2, fill: { aci: 3 }, height: 1.5, color: { aci: 4 }, lock: 1 }, { text: 'b' }, { text: 'c' }, { text: 'd', fill: null }],
    };
    const d = decodeTableXData(encodeTableXData(t))!;
    expect([d.rows, d.cols]).toEqual([2, 2]);
    expect(d.rowHeights).toEqual([5, 6]);
    expect(d.colWidths).toEqual([7, 8]);
    expect(d.rowKinds).toEqual(['title', 'data']);
    expect(d.merges).toEqual(t.merges);
    expect(d.texts?.get(3)).toBe('d');
    expect(d.fills?.get(0)).toEqual({ aci: 3 });
    expect(d.fills?.get(3)).toBeNull();
    expect(d.heights?.get(0)).toBe(1.5);
    expect(d.colors?.get(0)).toEqual({ aci: 4 });
    expect(d.locks?.get(0)).toBe(1);
  });
});
