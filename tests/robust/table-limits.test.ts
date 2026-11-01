/**
 * 35차: 표의 행·열·병합과 표 확장 자료의 개수 값.
 * 고치기 전에는 행 × 열 60000 × 60000인 표를 누르거나 저장하면 힙이 넘쳐 프로세스가 죽었고, 확장 자료의 값 하나도 같았다.
 */
import { describe, expect, it, vi } from 'vitest';
import { saveLosses } from '../../src/app/saveloss';
import { finalizeDocument } from '../../src/core/finalize';
import { TABLE_CELL_LIMIT, TABLE_EMPTY_CELLS, TABLE_MERGE_RATIO, tableSizeOk } from '../../src/core/limits';
import { MODEL_SPACE, type InsertEntity, type RawTag, type TableEntity, type XData, type XDataItem } from '../../src/core/model';
import { TABLE_APP, decodeTableXData, encodeTableXData, isEditableTable, rawTableCells, tableFromEntity } from '../../src/edit/table/entity';
import type { TableData } from '../../src/edit/table/model';
import { writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readCadFile } from '../../src/io/index';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { BLOCK_B, bytesOf, dxfText, table, tableMerge, tableXdataInsert } from './corrupt35';
import { beforeHang, within2s } from './timed';

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
    for (const version of ['AC1018', 'AC1032'] as const) {
      const dxf = within2s(() => writeDxf(doc, { version }));
      const back = readCadFile(dxf.data, 'x.dxf');
      expect(back.blocks.get(MODEL_SPACE)!.entities.length).toBe(1);
      const t = back.blocks.get(MODEL_SPACE)!.entities[0] as TableEntity;
      expect(t.rows * t.columns).toBeLessThanOrEqual(TABLE_CELL_LIMIT);
    }
    const dwg = within2s(() => writeDwg(doc, { version: 'AC1032' }));
    expect(readCadFile(dwg.data.slice(), 'x.dwg').blocks.get(MODEL_SPACE)!.entities.length).toBe(1);
  });

  it('한도 그대로인 표는 표로 남는다', () => {
    const doc = readDxf(bytesOf(dxfText([table(1000, 1000)], [T1])));
    expect(1000 * 1000).toBe(TABLE_CELL_LIMIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain('table.too_large');
    expect((doc.entityIndex.get('2A') as TableEntity).rows).toBe(1000);
  });

  it('행이나 열이 0이어도 다른 쪽을 따로 본다', () => {
    expect(tableSizeOk(1000, 1000)).toBe(true);
    expect(tableSizeOk(1000, 1001)).toBe(false);
    expect(tableSizeOk(TABLE_CELL_LIMIT, 1)).toBe(true);
    expect(tableSizeOk(TABLE_CELL_LIMIT, 0)).toBe(true);
    expect(tableSizeOk(TABLE_CELL_LIMIT + 1, 0)).toBe(false);
    expect(tableSizeOk(0, TABLE_CELL_LIMIT + 1)).toBe(false);
    expect(tableSizeOk(-(TABLE_CELL_LIMIT + 1), 0)).toBe(false);
    const big = ['0', 'ACAD_TABLE', '5', '2A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockReference', '2', '*T1', '10', '0', '20', '0', '30', '0', '100', 'AcDbTable', '91', '200000000', '92', '0'];
    const doc = readDxf(bytesOf(dxfText([big], [T1])));
    expect(doc.warnings.map((w) => w.code)).toContain('table.too_large');
    expect((doc.entityIndex.get('2A') as TableEntity).rows).toBe(0);
    // 고치기 전: writeDxf가 행 수만큼 배열을 잡다 RangeError
    expect(writeDxf(doc, { version: 'AC1032' }).data.length).toBeGreaterThan(0);
    expect(decodeTableXData(xdata('rowh', [1, 1], [200000000, 0]))).toBeNull();
  });
});

describe('파일에 없는 칸의 문서 예산', () => {
  /** 셀 태그가 칸마다 있는 표 */
  const filled = (rows: number, cols: number, h: string, cells = rows * cols): string[] => {
    const out = ['0', 'ACAD_TABLE', '5', h, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockReference', '2', '*T1', '10', '0', '20', '0', '30', '0', '100', 'AcDbTable', '91', String(rows), '92', String(cols)];
    for (let i = 0; i < rows; i++) out.push('141', '5');
    for (let i = 0; i < cols; i++) out.push('142', '10');
    for (let i = 0; i < cells; i++) out.push('171', '1', '1', i % 2 ? '' : `c${i}`);
    return out;
  };
  const tooLarge = (doc: ReturnType<typeof readDxf>) => doc.warnings.find((w) => w.code === 'table.too_large')?.count ?? 0;
  const sizes = (doc: ReturnType<typeof readDxf>) => doc.blocks.get(MODEL_SPACE)!.entities.map((e) => (e as TableEntity).rows * (e as TableEntity).columns);

  it('크기만 있는 표는 첫 표만 남고 넘긴 표부터 셀 없는 표가 된다', () => {
    const doc = readDxf(bytesOf(dxfText([table(1000, 1000, '2A'), table(1000, 1000, '2B'), table(1000, 1000, '2C')], [T1])));
    expect(sizes(doc)).toEqual([TABLE_CELL_LIMIT, 0, 0]);
    expect(tooLarge(doc)).toBe(2);
    expect(tableFromEntity(doc.entityIndex.get('2B') as TableEntity, doc)).toBeNull();
    expect((doc.entityIndex.get('2B') as TableEntity).raw?.length).toBeGreaterThan(0);
  });

  it('합이 예산과 같으면 모두 남고 한 칸 넘으면 그 표가 빠진다', () => {
    const fit = readDxf(bytesOf(dxfText([table(1000, 999, '2A'), table(500, 2, '2B')], [T1])));
    expect(sizes(fit)).toEqual([999_000, 1000]);
    expect(tooLarge(fit)).toBe(0);
    const over = readDxf(bytesOf(dxfText([table(1000, 999, '2A'), table(500, 2, '2B'), table(1, 1, '2C')], [T1])));
    expect(sizes(over)).toEqual([999_000, 1000, 0]);
  });

  it('파일에 셀이 있는 표는 예산에 걸리지 않는다', () => {
    const doc = readDxf(bytesOf(dxfText([table(1000, 1000, '2A'), filled(20, 10, '2B'), filled(3, 3, '2C')], [T1])));
    expect(sizes(doc)).toEqual([TABLE_CELL_LIMIT, 200, 9]);
    expect(tooLarge(doc)).toBe(0);
    expect((doc.entityIndex.get('2B') as TableEntity).cells?.length).toBe(200);
  });

  it('셀이 일부만 있는 표는 없는 칸만 센다', () => {
    // 앞 표가 99만 9천 칸을 써서 남은 예산은 1,000칸이다
    const fit = readDxf(bytesOf(dxfText([table(999, 1000, '2A'), filled(40, 50, '2B', 1000)], [T1])));
    expect(sizes(fit)).toEqual([999_000, 2000]);
    const over = readDxf(bytesOf(dxfText([table(999, 1000, '2A'), filled(40, 50, '2B', 999)], [T1])));
    expect(sizes(over)).toEqual([999_000, 0]);
  });

  describe('앱 표 자료', () => {
    /** 크기와 행 높이·열 폭만 있는 참조 */
    const sizeOnly = (rows: number, cols: number, h: string): string[] => [
      '0', 'INSERT', '5', h, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockReference', '2', 'B', '10', '0', '20', '0', '30', '0',
      '1001', 'OPENCAD_TABLE', '1000', 'OPENCAD_TABLE 1', '1000', 'size', '1071', String(rows), '1071', String(cols),
      '1000', 'rowh', '1071', '1', '1040', '5', '1000', 'colw', '1071', '1', '1040', '10',
    ];

    it('크기만 있는 표 자료도 같은 예산으로 표에서 뺀다', () => {
      const doc = readDxf(bytesOf(dxfText([sizeOnly(1000, 1000, '3A'), sizeOnly(1000, 1000, '3B'), sizeOnly(1000, 1000, '3C')], [BLOCK_B])));
      const [a, b, c] = ['3A', '3B', '3C'].map((h) => doc.entityIndex.get(h) as InsertEntity);
      expect(isEditableTable(a)).toBe(true);
      expect([isEditableTable(b), isEditableTable(c)]).toEqual([false, false]);
      expect(tableFromEntity(b!, doc)).toBeNull();
      expect(tooLarge(doc)).toBe(2);
      // 저장할 자료는 그대로 있고 표식은 나가지 않는다
      expect(b!.xdata?.length).toBe(1);
      const out = new TextDecoder().decode(writeDxf(doc, { version: 'AC1018' }).data);
      expect(out.split('OPENCAD_TABLE 1').length - 1).toBe(3);
      expect(out).not.toContain('tableTooLarge');
    });

    it('표와 표 자료가 예산을 함께 쓴다', () => {
      const doc = readDxf(bytesOf(dxfText([table(1000, 1000, '2A'), sizeOnly(100, 100, '3A')], [T1, BLOCK_B])));
      expect(isEditableTable(doc.entityIndex.get('3A'))).toBe(false);
    });

    it('앱이 만든 빈 표는 표로 남는다', () => {
      const doc = readDxf(bytesOf(dxfText([sizeOnly(200, 30, '3A')], [BLOCK_B])));
      const e = doc.entityIndex.get('3A') as InsertEntity;
      expect(isEditableTable(e)).toBe(true);
      expect(tableFromEntity(e, doc)?.data.cells.length).toBe(6000);
      expect(tooLarge(doc)).toBe(0);
    });

    it('셀 묶음을 쓴 항목이 많은 표 자료는 그만큼 예산을 덜 쓴다', () => {
      const text: XDataItem[] = [];
      for (let i = 0; i < 4000; i++) text.push({ code: 1071, value: i }, { code: 1071, value: 1 }, { code: 1000, value: 'x' });
      const doc = readDxf(bytesOf(dxfText([table(1000, 1000, '2A'), sizeOnly(100, 100, '3A')], [T1, BLOCK_B])));
      const e = doc.entityIndex.get('3A') as InsertEntity;
      // 읽은 뒤 자료를 채워 다시 마무리한다
      e.tableTooLarge = undefined;
      e.xdata![0]!.items.push({ code: 1000, value: 'text' }, { code: 1071, value: 4000 }, ...text, ...Array.from({ length: 6000 }, () => ({ code: 1071, value: 0 }) as XDataItem));
      finalizeDocument(doc);
      expect(e.tableTooLarge).toBeUndefined();
    });
  });
});

describe('한도를 넘는 표의 저장', () => {
  const big = () => readDxf(bytesOf(dxfText([table(60000, 60000)], [T1])));

  it('다른 형식 계열로 쓰면 셀이 빠진다고 알리고 모델 값은 그대로 둔다', () => {
    const doc = big();
    const e = doc.entityIndex.get('2A') as TableEntity;
    const tags = e.raw!.length;
    for (const version of ['AC1021', 'AC1024', 'AC1027', 'AC1032'] as const) {
      const out = writeDxf(doc, { version });
      const w = out.warnings.find((x) => x.code === 'table.cells_dropped');
      expect(w, version).toBeDefined();
      // 저장 확인창에 나온다
      const l = saveLosses(out.warnings).find((x) => x.message === w!.message)!;
      expect(l.converted).toBe(false);
      expect(l.count).toBe(1);
    }
    expect(e.raw!.length).toBe(tags);
    expect(e.rawVersion).toBe('AC1018');
  });

  it('같은 형식 계열이면 원본 태그로 남아 경고하지 않는다', () => {
    const out = writeDxf(big(), { version: 'AC1018' });
    expect(out.warnings.map((w) => w.code)).not.toContain('table.cells_dropped');
    expect(new TextDecoder().decode(out.data)).toContain('60000');
  });

  it('DWG로 쓰면 블록 참조로 바뀐 것을 저장 확인창에 알린다', () => {
    const out = writeDwg(big(), { version: 'AC1032' });
    const w = out.warnings.find((x) => x.code === 'dwg.write_table_as_insert')!;
    expect(saveLosses(out.warnings).find((x) => x.message === w.message)?.converted).toBe(true);
  });

  it('셀이 있는 표는 다른 계열로 써도 이 경고가 없다', () => {
    const doc = readDxf(bytesOf(dxfText([table(2, 2)], [T1])));
    expect(writeDxf(doc, { version: 'AC1032' }).warnings.map((w) => w.code)).not.toContain('table.cells_dropped');
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

  /** 표 태그: 셀마다 [폭, 높이] */
  const merged = (rows: number, cols: number, spans: [number, number][]): RawTag[] => {
    const raw: RawTag[] = [{ code: 100, value: 'AcDbTable' }, { code: 91, value: rows }, { code: 92, value: cols }];
    for (const [w, h] of spans) raw.push({ code: 171, value: 1 }, { code: 175, value: w }, { code: 176, value: h });
    return raw;
  };
  /** 병합을 푸는 동안 칸을 들여다본 수 */
  const lookups = (raw: RawTag[]) => {
    const has = vi.spyOn(Set.prototype, 'has');
    try {
      const r = rawTableCells(raw);
      return { merges: r.merges.length, n: has.mock.calls.length };
    } finally {
      has.mockRestore();
    }
  };

  it('겹치는 병합은 칸을 만들기 전에 첫 충돌에서 멈춘다', () => {
    // 모두 첫 칸에서 시작한다: 고치기 전에는 병합마다 10만 칸을 만들었다
    const spans = Array.from({ length: 300 }, (_, c): [number, number] => [100 - c % 50, 1000]);
    const { merges, n } = lookups(merged(1000, 100, spans));
    expect(merges).toBe(1);
    // 첫 병합 10만 칸의 빈 칸 + 뒤 병합은 첫 칸 하나씩 + 셀마다 태그 세 개를 읽으며 본 수
    expect(n).toBeLessThanOrEqual(100_000 + 300 + 900);
  });

  it('줄 끝에서야 겹치는 병합이 되풀이되어도 칸 수의 몇 배만 훑는다', () => {
    const cols = 100;
    const rows = 100;
    // 첫 줄 끝의 병합이 마지막 열을 차지하고, 뒤 줄마다 칸이 그 열까지 옆으로 병합된다
    const spans: [number, number][] = [];
    for (let i = 0; i < rows * cols; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      spans.push(r === 0 ? (c === cols - 1 ? [1, rows] : [1, 1]) : [cols - c, 1]);
    }
    const { n } = lookups(merged(rows, cols, spans));
    // 셀마다 태그를 읽으며 본 수를 빼면 표 넓이의 몇 배 안쪽이다(예산이 없으면 50만 번)
    expect(n).toBeLessThanOrEqual(TABLE_MERGE_RATIO * rows * cols + TABLE_EMPTY_CELLS + 3 * rows * cols);
  });

  it('겹치지 않는 병합은 표를 가득 채워도 모두 남는다', () => {
    const spans: [number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 8; c += 2) spans.push([2, 2], [1, 1]);
      for (let c = 0; c < 8; c++) spans.push([1, 1]);
    }
    expect(lookups(merged(8, 8, spans)).merges).toBe(16);
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
    const d = beforeHang(() => decodeTableXData(xdata('fill', [20000, ...runs], [1000, 1000])));
    expect(d?.fills?.size).toBe(TABLE_CELL_LIMIT);
  });

  it('작은 입력: 셀 묶음이 돈 횟수는 셀 수를 넘지 않는다', () => {
    const runs = Array.from({ length: 50 }, () => [0, 1000, 1, -1]).flat();
    const x = xdata('fill', [50, ...runs], [100, 10]);
    const set = vi.spyOn(Map.prototype, 'set');
    try {
      const d = decodeTableXData(x);
      expect(d?.fills?.size).toBe(1000);
      // 셀 1000번 + 묶음 이름마다의 자리 기록 두어 번 + 범위마다 남은 수 기록
      expect(set.mock.calls.length).toBeLessThanOrEqual(1000 + 4 + 50);
    } finally {
      set.mockRestore();
    }
  });

  it('같은 종류의 묶음을 되풀이해도 종류별 합이 셀 수를 넘지 않는다', () => {
    // 표 100칸 뒤에 fill 묶음 20개: 고치기 전에는 묶음마다 100칸씩 돌았다
    const items: XDataItem[] = [{ code: 1000, value: 'OPENCAD_TABLE 1' }, { code: 1000, value: 'size' }, { code: 1071, value: 10 }, { code: 1071, value: 10 }];
    for (let g = 0; g < 20; g++) items.push({ code: 1000, value: 'fill' }, { code: 1071, value: 1 }, { code: 1071, value: 0 }, { code: 1071, value: 100 }, { code: 1071, value: 1 }, { code: 1071, value: -1 });
    const set = vi.spyOn(Map.prototype, 'set');
    try {
      decodeTableXData({ app: TABLE_APP, items });
      // 셀 100번 + 묶음마다 자리 기록과 남은 수 기록
      expect(set.mock.calls.length).toBeLessThanOrEqual(100 + 21 + 20);
    } finally {
      set.mockRestore();
    }
  });

  it('종류가 다르면 묶음마다 표 전체를 쓸 수 있다', () => {
    const items: XDataItem[] = [{ code: 1000, value: 'OPENCAD_TABLE 1' }, { code: 1000, value: 'size' }, { code: 1071, value: 10 }, { code: 1071, value: 10 }];
    items.push({ code: 1000, value: 'fill' }, { code: 1071, value: 1 }, { code: 1071, value: 0 }, { code: 1071, value: 100 }, { code: 1071, value: 1 }, { code: 1071, value: -1 });
    items.push({ code: 1000, value: 'theight' }, { code: 1071, value: 1 }, { code: 1071, value: 0 }, { code: 1071, value: 100 }, { code: 1040, value: 2.5 });
    const d = decodeTableXData({ app: TABLE_APP, items });
    expect(d?.fills?.size).toBe(100);
    expect(d?.heights?.size).toBe(100);
  });

  it('표인지 물을 때는 셀 묶음을 펼치지 않는다', () => {
    const x = xdata('fill', [1, 0, TABLE_CELL_LIMIT, 1, -1], [1000, 1000]);
    x.items.splice(4, 0, { code: 1000, value: 'rowh' }, { code: 1071, value: 1 }, { code: 1040, value: 5 }, { code: 1000, value: 'colw' }, { code: 1071, value: 1 }, { code: 1040, value: 10 });
    const e = { type: 'INSERT', xdata: [x] } as unknown as InsertEntity;
    const set = vi.spyOn(Map.prototype, 'set');
    try {
      expect(isEditableTable(e)).toBe(true);
      // 묶음마다 자리 기록뿐이다(고치기 전 100만 번)
      expect(set.mock.calls.length).toBeLessThan(20);
    } finally {
      set.mockRestore();
    }
    expect(decodeTableXData(x)?.fills?.size).toBe(TABLE_CELL_LIMIT);
    expect(decodeTableXData(x, true)?.fills?.size).toBe(0);
  });

  describe('병합', () => {
    const merged = (merges: number[][], size: [number, number] = [10, 10]) => decodeTableXData(xdata('merge', [merges.length, ...merges.flat()], size))!;

    it('겹치는 병합은 앞의 것만 남긴다', () => {
      expect(merged([[0, 0, 2, 2], [1, 1, 2, 2], [5, 5, 1, 2]]).merges).toEqual([{ row: 0, col: 0, rows: 2, cols: 2 }, { row: 5, col: 5, rows: 1, cols: 2 }]);
    });

    it('표 전체를 덮는 병합을 되풀이해도 칸 수의 몇 배만 훑는다', () => {
      const has = vi.spyOn(Set.prototype, 'has');
      const add = vi.spyOn(Set.prototype, 'add');
      try {
        const d = merged(Array.from({ length: 300 }, () => [0, 0, 100, 100]), [100, 100]);
        expect(d.merges.length).toBe(1);
        expect(has.mock.calls.length + add.mock.calls.length).toBeLessThanOrEqual(2 * 100 * 100 + 300);
      } finally {
        has.mockRestore();
        add.mockRestore();
      }
    });

    it('표 밖이나 음수인 병합은 버린다', () => {
      expect(merged([[9, 9, 2, 2], [-1, 0, 2, 2], [0, 0, 0, 3], [0, 0, 1, 11]]).merges).toEqual([]);
    });

    it('겹치지 않는 병합은 표를 가득 채워도 모두 남는다', () => {
      const all: number[][] = [];
      for (let r = 0; r < 10; r += 2) for (let c = 0; c < 10; c += 2) all.push([r, c, 2, 2]);
      expect(merged(all).merges.length).toBe(25);
    });

    it('표인지 물을 때는 병합을 거르지 않는다', () => {
      const has = vi.spyOn(Set.prototype, 'has');
      try {
        decodeTableXData(xdata('merge', [1, 0, 0, 100, 100], [100, 100]), true);
        expect(has.mock.calls.length).toBe(0);
      } finally {
        has.mockRestore();
      }
    });
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
