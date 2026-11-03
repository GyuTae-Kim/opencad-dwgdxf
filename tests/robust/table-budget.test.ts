/**
 * 63차: DWG 문서 하나의 표 칸 예산.
 * 고치기 전에는 표마다 빈 칸(셀 자료 없이 행·열 목록으로 만드는 칸)이 한도 1,024개 안이면 표를 늘리는 만큼 칸을 만들어
 * 표 1,000개(DWG 24KB)가 7.1초·힙 +881MiB였고, 빈 칸이 많아 풀지 않은 표도 문서 칸 예산(`or.tableCells`)을 써서 뒤쪽의 정상 표가 셀 없는 표가 됐다.
 * 파일은 쓰기의 R2010+ 표 자료만 바꿔 만든다(table-r24.test.ts와 같은 방법).
 */
import { describe, expect, it, vi } from 'vitest';

/** 쓰는 표마다 차례로: 0 = 그대로, m > 0 = 행·열 m개에 셀 없음, m < 0 = 행·열 |m|개에 셀 모두 */
const cfg = vi.hoisted(() => ({ sizes: [] as number[], at: 0 }));
vi.mock('../../src/io/dwg/tablemodel', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/io/dwg/tablemodel');
  return {
    ...mod,
    tableToR24: (...a: Parameters<typeof mod.tableToR24>) => {
      const t = mod.tableToR24(...a);
      const m = cfg.sizes[cfg.at++] ?? 0;
      if (m) {
        const n = Math.abs(m);
        const c0 = t.content.columns[0]!;
        const r0 = t.content.rows[0]!;
        t.content.columns = Array.from({ length: n }, () => c0);
        t.content.rows = Array.from({ length: n }, () => ({ ...r0, cells: m < 0 ? Array.from({ length: n }, () => r0.cells[0]!) : [] }));
        t.content.merges = [];
      }
      return t;
    },
  };
});

import { TABLE_EMPTY_CELLS, TABLE_EMPTY_CELLS_DOC } from '../../src/core/limits';
import { MODEL_SPACE, type CadDocument, type TableEntity } from '../../src/core/model';
import { writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { readCadFile } from '../../src/io/index';
import { bytesOf, dxfText, table } from './corrupt35';
import { beforeHang } from './timed';

const T1 = ['0', 'BLOCK', '8', '0', '2', '*T1', '70', '1', '10', '0', '20', '0', '30', '0', '3', '*T1', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '5', '21', '0', '31', '0', '0', 'ENDBLK', '8', '0'];

/** 표마다 sizes의 크기로 쓴 AC1032를 다시 읽는다 */
function readBack(sizes: number[]): CadDocument {
  const doc = readDxf(bytesOf(dxfText(sizes.map((_, i) => table(2, 2, (0x1000 + i).toString(16).toUpperCase())), [T1])));
  cfg.sizes = sizes;
  cfg.at = 0;
  let data: Uint8Array;
  try {
    data = writeDwg(doc, { version: 'AC1032' }).data.slice();
  } finally {
    cfg.sizes = [];
  }
  return readCadFile(data, 'x.dwg');
}
const tables = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities as TableEntity[];
const unpacked = (doc: CadDocument) => tables(doc).map((t) => !!t.raw);
const tooLarge = (doc: CadDocument) => doc.warnings.find((w) => w.code === 'table.too_large')?.count ?? 0;

describe('문서 하나의 빈 칸 예산', () => {
  it('빈 칸이 예산을 넘는 표부터는 셀 없는 표로 두고 알린다', () => {
    const per = TABLE_EMPTY_CELLS;
    const side = Math.sqrt(per);
    const fit = TABLE_EMPTY_CELLS_DOC / per;
    const doc = beforeHang(() => readBack(Array.from({ length: fit + 36 }, () => side)));
    expect(unpacked(doc)).toEqual([...Array.from({ length: fit }, () => true), ...Array.from({ length: 36 }, () => false)]);
    expect(tables(doc).reduce((a, t) => a + (t.cells?.length ?? 0), 0)).toBe(TABLE_EMPTY_CELLS_DOC);
    expect(tooLarge(doc)).toBe(36);
  });

  it('셀 자료가 있는 칸은 빈 칸 예산을 쓰지 않는다', () => {
    const fit = TABLE_EMPTY_CELLS_DOC / TABLE_EMPTY_CELLS;
    const doc = readBack(Array.from({ length: fit + 36 }, () => -32));
    expect(unpacked(doc).every(Boolean)).toBe(true);
    expect(tooLarge(doc)).toBe(0);
  });
});

it('풀지 않은 표는 문서 칸 예산을 쓰지 않는다', () => {
  // 빈 칸이 표 하나의 한도를 넘어 풀지 않는 100만 칸 표 둘 뒤의 정상 표
  const doc = readBack([1000, 1000, 0]);
  expect(unpacked(doc)).toEqual([false, false, true]);
  expect(tables(doc)[2]!.cells?.length).toBe(4);
  expect(tooLarge(doc)).toBe(2);
});
