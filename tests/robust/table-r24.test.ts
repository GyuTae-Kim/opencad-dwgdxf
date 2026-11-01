/**
 * 35차: DWG R2010+ 표의 행 × 열. 행·열 목록과 셀 목록이 따로라 목록만 늘린 파일은 파일 크기와 상관없이 칸을 만든다.
 * 고치기 전에는 AC1032 표에서 행·열을 800개로 늘리고 행마다 셀 0개로 두면 6,668바이트로 3.6초·힙 +971MB였고,
 * 2200개면 6,892바이트로 힙이 넘쳐 프로세스가 죽었다. 병합 3,000개 × 400행 400열은 2.5초였다.
 */
import { describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ m: 0, merges: 0, budget: 0 }));
// 쓰기만 바꿔 행·열 목록을 늘린 파일을 만든다(읽기는 그대로다)
vi.mock('../../src/io/dwg/tablemodel', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/io/dwg/tablemodel');
  return {
    ...mod,
    tableToR24: (...a: Parameters<typeof mod.tableToR24>) => {
      const t = mod.tableToR24(...a);
      if (cfg.m) {
        const c0 = t.content.columns[0]!;
        const r0 = t.content.rows[0]!;
        t.content.columns = Array.from({ length: cfg.m }, () => c0);
        t.content.rows = Array.from({ length: cfg.m }, () => ({ ...r0, cells: [] }));
        t.content.merges = Array.from({ length: cfg.merges }, () => [0, 0, cfg.m - 1, cfg.m - 1] as [number, number, number, number]);
      }
      return t;
    },
  };
});
vi.mock('../../src/core/limits', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/core/limits');
  return { ...mod, tableCellBudget: (n: number) => cfg.budget || mod.tableCellBudget(n) };
});

import { TABLE_CELL_LIMIT, TABLE_EMPTY_CELLS, TABLE_MERGE_RATIO } from '../../src/core/limits';
import { MODEL_SPACE, type TableEntity } from '../../src/core/model';
import { writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readCadFile } from '../../src/io/index';
import type { TTableR24 } from '../../src/io/dwg/tablecodec';
import { r24CellsInFile } from '../../src/io/dwg/tablemodel';
import { bytesOf, dxfText, table } from './corrupt35';

const T1 = ['0', 'BLOCK', '8', '0', '2', '*T1', '70', '1', '10', '0', '20', '0', '30', '0', '3', '*T1', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '5', '21', '0', '31', '0', '0', 'ENDBLK', '8', '0'];

/** 행·열 목록을 m개로 늘린 AC1032 파일 */
function bomb(m: number, merges = 0): Uint8Array {
  const doc = readDxf(bytesOf(dxfText([table(2, 2)], [T1])));
  cfg.m = m;
  cfg.merges = merges;
  try {
    return writeDwg(doc, { version: 'AC1032' }).data.slice();
  } finally {
    cfg.m = cfg.merges = 0;
  }
}

const tableOf = (doc: ReturnType<typeof readCadFile>) => doc.blocks.get(MODEL_SPACE)!.entities[0] as TableEntity;

describe('R2010+ 표 읽기', () => {
  for (const [m, merges] of [[800, 0], [2200, 0], [400, 3000]] as const) {
    it(`행·열 ${m}개, 셀 0개, 병합 ${merges}개는 칸을 만들지 않고 경고한다`, () => {
      const data = bomb(m, merges);
      expect(data.length).toBeLessThan(8000);
      const doc = readCadFile(data, 'x.dwg');
      const e = tableOf(doc);
      expect(e.type).toBe('ACAD_TABLE');
      expect([e.rows, e.columns]).toEqual([0, 0]);
      expect(e.raw).toBeUndefined();
      expect(e.cells).toBeUndefined();
      expect(doc.warnings.map((w) => w.code)).toContain('table.too_large');
    });
  }

  it('막은 표도 다시 저장된다', () => {
    const doc = readCadFile(bomb(2200), 'x.dwg');
    const dxf = writeDxf(doc, { version: 'AC1032' });
    expect(dxf.warnings.map((w) => w.code)).toContain('table.cells_dropped');
    expect(readCadFile(dxf.data, 'x.dxf').blocks.get(MODEL_SPACE)!.entities.length).toBe(1);
    expect(writeDwg(doc, { version: 'AC1032' }).warnings.map((w) => w.code)).toContain('dwg.write_table_as_insert');
  });

  it('셀이 있는 표는 그대로 읽는다', () => {
    const doc = readDxf(bytesOf(dxfText([table(2, 2)], [T1])));
    const back = readCadFile(writeDwg(doc, { version: 'AC1032' }).data.slice(), 'x.dwg');
    const e = tableOf(back);
    expect([e.rows, e.columns]).toEqual([2, 2]);
    expect(e.raw?.length).toBeGreaterThan(0);
    expect(back.warnings.map((w) => w.code)).not.toContain('table.too_large');
  });
});

describe('칸을 펼쳐도 되는지', () => {
  /** rows행 cols열, 행마다 셀 have개, 병합 목록 */
  const t = (rows: number, cols: number, have: number, merges: [number, number, number, number][] = []): TTableR24 =>
    ({ content: { rows: Array.from({ length: rows }, () => ({ cells: new Array(have) })), columns: new Array(cols), merges } }) as unknown as TTableR24;

  it('행마다 열 수만큼 셀이 있으면 한도까지 편다', () => {
    expect(r24CellsInFile(t(1000, 1000, 1000))).toBe(true);
    expect(TABLE_CELL_LIMIT).toBe(1000 * 1000);
    expect(r24CellsInFile(t(1000, 1001, 1001))).toBe(false);
  });

  it('없는 칸은 한도까지만 빈 칸으로 채운다', () => {
    const side = Math.sqrt(TABLE_EMPTY_CELLS);
    expect(side).toBe(32);
    expect(r24CellsInFile(t(side, side, 0))).toBe(true);
    expect(r24CellsInFile(t(side + 1, side, 0))).toBe(false);
    // 셀이 있는 칸은 세지 않는다
    expect(r24CellsInFile(t(side + 1, side, 1))).toBe(true);
  });

  it('행의 셀이 열보다 많아도 없는 칸을 메우지 못한다', () => {
    const x = t(40, 40, 0);
    x.content.rows[0]!.cells = new Array(2000) as never;
    expect(r24CellsInFile(x)).toBe(false);
  });

  it('병합 넓이 합은 칸 수의 몇 배까지만 푼다', () => {
    const cells = 10 * 10;
    const whole: [number, number, number, number] = [0, 0, 9, 9];
    const allowed = (TABLE_MERGE_RATIO * cells + TABLE_EMPTY_CELLS) / cells;
    expect(r24CellsInFile(t(10, 10, 10, Array.from({ length: Math.floor(allowed) }, () => whole)))).toBe(true);
    expect(r24CellsInFile(t(10, 10, 10, Array.from({ length: Math.floor(allowed) + 1 }, () => whole)))).toBe(false);
  });

  it('표 밖의 병합 범위는 표 안 넓이만 센다', () => {
    expect(r24CellsInFile(t(10, 10, 10, [[0, 0, 4000000000, 4000000000]]))).toBe(true);
    expect(r24CellsInFile(t(10, 10, 10, [[50, 50, 60, 60]]))).toBe(true);
  });
});

describe('문서 하나의 칸 수', () => {
  for (const version of ['AC1018', 'AC1032'] as const) {
    it(`${version}: 표마다 한도 안이어도 합이 예산을 넘으면 뒤 표는 칸을 만들지 않는다`, () => {
      const doc = readDxf(bytesOf(dxfText([table(2, 2, '2A'), table(2, 2, '2B'), table(2, 2, '2C')], [T1])));
      const data = writeDwg(doc, { version }).data.slice();
      cfg.budget = 9;
      try {
        const back = readCadFile(data, 'x.dwg');
        const sizes = back.blocks.get(MODEL_SPACE)!.entities.map((e) => (e as TableEntity).rows * (e as TableEntity).columns);
        expect(sizes).toEqual([4, 4, 0]);
        expect(back.warnings.find((w) => w.code === 'table.too_large')?.count).toBe(1);
      } finally {
        cfg.budget = 0;
      }
    });
  }
});
