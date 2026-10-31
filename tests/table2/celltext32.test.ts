// @vitest-environment jsdom
/**
 * 32차: 셀마다의 문자 높이·문자 색 재지정(표 자료·확장 자료·DXF/DWG 셀 재지정·표 그림·행 높이 맞춤·MATCHCELL — 특성 팔레트는 cellpalette32.test).
 * 근거(우리말 요약):
 * - DXF 참조 TABLE: 셀 수준 재지정 140 문자 높이, 64 셀 내용 색, 재지정 플래그(R2007+ 91 / 그 전 177 — 0x08 내용 색, 0x20 문자 높이).
 * - AutoCAD 도움말 "About Table Styles"(Mac): 셀 스타일의 문자 특성은 문자 스타일·높이·색, 셀마다 스타일을 재지정할 수 있고 셀을 고르면 특성 창의 셀·내용 묶음에서
 *   문자 서식을 바꾼다. "To Change the Properties of Cells in a Table": 고른 셀의 값을 특성 팔레트에서 바꾼다.
 * - ActiveX 참조 Table 객체: SetCellTextHeight·SetCellContentColor(셀마다의 문자 높이·내용 색).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MTextEntity, RawTag, TableEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { rangeTextColor, rangeTextHeight } from '../../src/app/tablecell';
import { activeEditor } from '../../src/app/textedit/editor';
import {
  cellIndex,
  cellTextColor,
  cellTextHeight,
  createTable,
  fitRowHeights,
  mergeCells,
  setFill,
  setText,
  setTextColor,
  setTextHeight,
} from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { tableBlockEntities } from '../../src/edit/table/geometry';
import { applyTableData, decodeTableXData, encodeTableXData, rawTableCells, TABLE_APP, tableFromEntity } from '../../src/edit/table/entity';
import { newTableEntity } from '../../src/edit/table/build';
import { effectiveText, matchCellText } from '../../src/edit/editcmds2/table';
import { rawCellOverrides, tableCellsOut } from '../../src/io/tablecells';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

type H = ReturnType<typeof setup>;

/** 표 그림 블록의 셀 문자(MTEXT): 글, 높이, 색인 */
const blockTexts = (h: H): [string, number, number][] => {
  const b = h.doc.blocks.get(tableKey(h.table().block))!;
  return b.entities.filter((e): e is MTextEntity => e.type === 'MTEXT').map((e) => [e.text, e.height, e.color.aci]);
};

/** 셀마다 원본 태그(171부터 다음 171 전까지, 값 묶음 밖의 첫 값) */
function rawCells(raw: readonly RawTag[]): Map<number, string | number>[] {
  const start = raw.findIndex((t) => t.code === 100 && t.value === 'AcDbTable');
  const out: Map<number, string | number>[] = [];
  let inValue = false;
  for (let k = start + 1; k < raw.length; k++) {
    const t = raw[k]!;
    if (t.code === 100) break;
    if (t.code === 171) {
      out.push(new Map());
      inValue = false;
      continue;
    }
    if (t.code === 301) inValue = true;
    if (t.code === 304) inValue = false;
    if (out.length && !inValue && !out[out.length - 1]!.has(t.code)) out[out.length - 1]!.set(t.code, t.code === 7 ? String(t.value) : Number(t.value));
  }
  return out;
}

const tableOf = (bytes: Uint8Array, name: string) => {
  const back = readCadFile(bytes, name);
  return { back, te: back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')! };
};

describe('셀 문자 높이·문자 색 자료', () => {
  it('setTextHeight·setTextColor: 범위 재지정과 지우기(undefined), cellTextHeight·cellTextColor는 재지정이 없으면 행 종류의 셀 스타일', () => {
    const ts = defaultTableStyle(true);
    ts.cells.title.color = { aci: 2 };
    const t0 = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    expect([cellTextHeight(t0, ts, 0, 0), cellTextHeight(t0, ts, 2, 1)]).toEqual([6, 4.5]);
    expect([cellTextColor(t0, ts, 0, 0), cellTextColor(t0, ts, 2, 1)]).toEqual([{ aci: 2 }, { aci: 0 }]);
    const t1 = setTextHeight(t0, 2, 0, 3, 1, 8);
    expect(t1.cells.map((c) => c.height ?? '-')).toEqual(['-', '-', '-', '-', '-', '-', 8, 8, '-', 8, 8, '-']);
    // 원본은 그대로, 0 이하·숫자가 아닌 높이는 재지정을 지운다
    expect(t0.cells.every((c) => c.height === undefined)).toBe(true);
    expect(setTextHeight(t1, 2, 0, 2, 0, 0).cells[6]!.height).toBeUndefined();
    expect(setTextHeight(t1, 2, 0, 2, 0, NaN).cells[6]!.height).toBeUndefined();
    const t2 = setTextColor(t1, 1, 2, 2, 2, { aci: 30, rgb: 0x123456 });
    expect(cellTextColor(t2, ts, 1, 2)).toEqual({ aci: 30, rgb: 0x123456 });
    expect(cellTextColor(t2, ts, 2, 2)).toEqual({ aci: 30, rgb: 0x123456 });
    // ByLayer도 재지정이다
    const t3 = setTextColor(t2, 0, 0, 0, 0, { aci: 256 });
    expect(cellTextColor(t3, ts, 0, 0)).toEqual({ aci: 256 });
    const t4 = setTextColor(setTextHeight(t3, 0, 0, 3, 2, undefined), 0, 0, 3, 2, undefined);
    expect(t4.cells.every((c) => c.height === undefined && c.color === undefined)).toBe(true);
    expect(t4).toEqual(t0);
    // 범위의 값(병합 셀은 기준 셀만): 같으면 그 값, 섞였으면 null·mixed
    expect(rangeTextHeight(t1, ts, { r0: 2, c0: 0, r1: 3, c1: 1 })).toBe(8);
    expect(rangeTextHeight(t1, ts, { r0: 2, c0: 0, r1: 2, c1: 2 })).toBeNull();
    expect(rangeTextColor(t2, ts, { r0: 1, c0: 2, r1: 2, c1: 2 })).toEqual({ aci: 30, rgb: 0x123456 });
    expect(rangeTextColor(t2, ts, { r0: 2, c0: 1, r1: 2, c1: 2 })).toBe('mixed');
    const m = mergeCells(t1, 2, 1, 3, 2)!;
    // B3:C4 병합의 기준 셀 B3(8)만 본다
    expect(rangeTextHeight(m, ts, { r0: 2, c0: 1, r1: 3, c1: 2 })).toBe(8);
  });

  it('확장 자료: 채우기 뒤에 theight(시작·개수·높이)·tcolor(시작·개수·색인·트루컬러) 묶음, 재지정이 없으면 31차와 같은 확장 자료, 망가진 묶음은 버린다', () => {
    const ts = defaultTableStyle(true);
    const base = setFill(setText(createTable({ cols: 3, colWidth: 30, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts), 2, 0, '가'), 1, 0, 1, 2, { aci: 5 });
    let t = setTextHeight(base, 1, 0, 2, 2, 7.25);
    t = setTextHeight(t, 4, 2, 4, 2, 3);
    t = setTextColor(t, 2, 1, 2, 2, { aci: 1 });
    t = setTextColor(t, 3, 0, 3, 0, { aci: 30, rgb: 0xff7f00 });
    t = setTextColor(t, 4, 0, 4, 0, { aci: 0 });
    const x = encodeTableXData(t);
    const strs = x.items.filter((i) => i.code === 1000).map((i) => i.value);
    expect(strs.slice(-3)).toEqual(['fill', 'theight', 'tcolor']);
    const ah = x.items.findIndex((i) => i.code === 1000 && i.value === 'theight');
    const ac = x.items.findIndex((i) => i.code === 1000 && i.value === 'tcolor');
    // 높이 묶음: 번호 3~8(7.25)과 14(3) — 높이는 실수(1040)
    expect(x.items.slice(ah + 1, ac).map((i) => [i.code, i.value])).toEqual([
      [1071, 2],
      [1071, 3],
      [1071, 6],
      [1040, 7.25],
      [1071, 14],
      [1071, 1],
      [1040, 3],
    ]);
    expect(x.items.slice(ac + 1).map((i) => i.value)).toEqual([3, 7, 2, 1, -1, 9, 1, 30, 0xff7f00, 12, 1, 0, -1]);
    // 31차까지의 읽기는 모르는 묶음(theight)에서 멈춘다: 그 앞은 재지정이 없는 표의 확장 자료와 같다
    expect(x.items.slice(0, ah)).toEqual(encodeTableXData(base).items);
    const d = decodeTableXData(x)!;
    expect([...d.heights!]).toEqual([3, 4, 5, 6, 7, 8].map((i) => [i, 7.25]).concat([[14, 3]]));
    expect([...d.colors!]).toEqual([
      [7, { aci: 1 }],
      [8, { aci: 1 }],
      [9, { aci: 30, rgb: 0xff7f00 }],
      [12, { aci: 0 }],
    ]);
    expect(d.fills?.get(3)).toEqual({ aci: 5 });
    // 표 객체 ↔ 정의: 그대로 돌아온다
    const doc = createNewDocument('metric');
    expect(tableFromEntity(newTableEntity(t, { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' }), doc)!.data).toEqual(t);
    // 재지정이 없으면 묶음도 없다
    expect(encodeTableXData(base).items.some((i) => i.value === 'theight' || i.value === 'tcolor')).toBe(false);
    // 망가진 묶음: 표 밖 번호·0 이하 높이·범위 밖 색인은 버린다
    const head = x.items.slice(0, ah);
    const i = (v: number) => ({ code: 1071, value: v });
    const bad = {
      app: TABLE_APP,
      items: [...head, { code: 1000, value: 'theight' }, i(3), i(13), i(100), { code: 1040, value: 2 }, i(0), i(2), { code: 1040, value: -1 }, i(1), i(1), { code: 1040, value: 'x' }, { code: 1000, value: 'tcolor' }, i(2), i(0), i(1), i(300), i(-1), i(1), i(1), i(3), i(-1)],
    };
    const db = decodeTableXData(bad as never)!;
    expect([...db.heights!.keys()]).toEqual([13, 14]);
    expect([...db.colors!]).toEqual([[1, { aci: 3 }]]);
  });

  it('AutoCAD 원본 태그: 플래그 0x20과 140은 문자 높이, 0x08과 64는 문자 색, 플래그 없는 값·0 이하 높이·값 묶음 안은 보지 않는다', () => {
    const cell = (...tags: [number, string | number][]) => [{ code: 171, value: 1 }, ...tags.map(([code, value]) => ({ code, value }))];
    const raw: RawTag[] = [
      { code: 100, value: 'AcDbTable' },
      { code: 91, value: 3 },
      { code: 92, value: 2 },
      ...cell([91, 0x28], [64, 1], [140, 2.5]),
      ...cell([91, 0x20], [140, 7]),
      // 플래그에 0x08·0x20이 없으면 64·140은 재지정이 아니다
      ...cell([91, 0x01], [170, 5], [64, 3], [140, 9]),
      // 값 묶음 안의 91·140은 셀 재지정이 아니다
      ...cell([91, 0], [301, 'CELL_VALUE'], [91, 0x20], [140, 4], [304, 'ACVALUE_END']),
      ...cell([91, 0x28], [64, 256], [140, 0]),
      ...cell([91, 0x08], [64, 0]),
    ];
    const r = rawTableCells(raw);
    expect(r.count).toBe(6);
    expect([...r.heights]).toEqual([
      [0, 2.5],
      [1, 7],
    ]);
    expect([...r.colors]).toEqual([
      [0, { aci: 1 }],
      [4, { aci: 256 }],
      [5, { aci: 0 }],
    ]);
    // R2004: 177 플래그
    const old = rawTableCells([{ code: 100, value: 'AcDbTable' }, { code: 92, value: 1 }, ...cell([177, 0x28], [64, 4], [140, 1.25])]);
    expect([...old.heights, ...old.colors]).toEqual([
      [0, 1.25],
      [0, { aci: 4 }],
    ]);
    // io 쪽 판정(쓰기의 셀 배치)과 같은 값
    const io = rawCellOverrides(raw);
    expect([io[0]!.height, io[1]!.height, io[2]!.height]).toEqual([2.5, 7, undefined]);
    expect([io[0]!.color, io[2]!.color, io[4]!.color]).toEqual([{ aci: 1 }, undefined, { aci: 256 }]);
  });

  it('AutoCAD 표를 고쳐도 셀 문자 높이·색이 남고(31차까지는 고치면 셀 스타일 값으로 다시 그렸다), 행 높이는 그 높이에 맞춘다', () => {
    const doc = createNewDocument('metric');
    const ts = defaultTableStyle(true);
    const e = newTableEntity(createTable({ cols: 2, colWidth: 20, dataRows: 2, rowLines: 1, first: 'data', second: 'data' }, ts), { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' }) as TableEntity;
    e.cells = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }];
    e.xdata = undefined;
    e.raw = [
      { code: 100, value: 'AcDbTable' },
      { code: 91, value: 2 },
      { code: 92, value: 2 },
      { code: 171, value: 1 },
      { code: 91, value: 0x28 },
      { code: 64, value: 1 },
      { code: 140, value: 3 },
      { code: 171, value: 1 },
      { code: 91, value: 0 },
      { code: 171, value: 1 },
      { code: 91, value: 0x20 },
      { code: 140, value: 8 },
      { code: 171, value: 1 },
      { code: 91, value: 0x08 },
      { code: 64, value: 256 },
    ];
    const rt = tableFromEntity(e, doc)!;
    expect(rt.data.cells.map((c) => c.height ?? '-')).toEqual([3, '-', 8, '-']);
    expect(rt.data.cells.map((c) => c.color?.aci ?? '-')).toEqual([1, '-', '-', 256]);
    // 셀 문자를 고친 표 그림: 셀 문자 높이·색이 재지정대로(0행은 제목 행 — 셀 스타일 높이 6)
    expect(rt.data.rowKinds).toEqual(['title', 'data']);
    const next = setText(rt.data, 0, 1, 'B');
    const texts = tableBlockEntities(next, rt.style).filter((x): x is MTextEntity => x.type === 'MTEXT');
    expect(texts.map((m) => [m.text, m.height, m.color.aci])).toEqual([
      ['a', 3, 1],
      ['B', 6, 0],
      ['c', 8, 0],
      ['d', 4.5, 256],
    ]);
    // 행 높이 맞춤: 1행은 재지정 문자 높이 8 + 위아래 여백 3 = 11, 0행은 B(셀 스타일 6) + 3 = 9 — a(재지정 3)는 더 낮다
    const fitted = fitRowHeights(next, rt.style, (_text, height) => height);
    expect(fitted.rowHeights).toEqual([9, 11]);
    // 확장 자료로 옮겨 남고, 쓸 때의 셀 배치(셀 재지정 140·64)도 그 값
    const w = applyTableData(e, fitted, undefined);
    expect(w.raw).toBeUndefined();
    expect(tableFromEntity(w, doc)!.data).toEqual(fitted);
    const lay = tableCellsOut(w, doc);
    expect(lay.cells.map((c) => c.height)).toEqual([3, 6, 8, 4.5]);
    expect(lay.cells.map((c) => c.color?.aci)).toEqual([1, 0, 0, 256]);
  });

  it('표 그림: 병합 셀은 기준 셀의 문자 높이·색, 재지정이 없는 표는 셀 스타일 값 그대로이고 재지정을 넣었다 지우면 그림·확장 자료·셀 배치가 처음과 같다', () => {
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setText(setText(setText(t, 0, 0, '제목'), 2, 0, '가'), 3, 2, '나');
    const plain = t;
    t = mergeCells(t, 2, 0, 3, 1)!;
    t = setTextHeight(t, 2, 0, 2, 0, 9);
    t = setTextColor(t, 2, 0, 2, 0, { aci: 3 });
    // 덮인 셀(B3 등)에 재지정이 있어도 기준 셀의 값으로 그린다
    t = setTextHeight(t, 3, 1, 3, 1, 1);
    const mt = tableBlockEntities(t, ts).filter((x): x is MTextEntity => x.type === 'MTEXT');
    expect(mt.map((m) => [m.text, m.height, m.color.aci])).toEqual([
      ['제목', 6, 0],
      ['가', 9, 3],
      ['나', 4.5, 0],
    ]);
    // 재지정 없음 → 넣었다 지운 표: 같은 그림·확장 자료
    const cleared = setTextColor(setTextHeight(setTextHeight(setTextColor(plain, 0, 0, 3, 2, { aci: 1 }), 0, 0, 3, 2, 12), 0, 0, 3, 2, undefined), 0, 0, 3, 2, undefined);
    expect(cleared).toEqual(plain);
    expect(tableBlockEntities(cleared, ts)).toEqual(tableBlockEntities(plain, ts));
    expect(encodeTableXData(cleared)).toEqual(encodeTableXData(plain));
    const pm = tableBlockEntities(plain, ts).filter((x): x is MTextEntity => x.type === 'MTEXT');
    expect(pm.map((m) => [m.height, m.color])).toEqual([
      [6, ts.cells.title.color],
      [4.5, ts.cells.data.color],
      [4.5, ts.cells.data.color],
    ]);
  });

  it('셀 일치(MATCHCELL)의 문자 높이·색: 원본의 실제 값을 옮기고, 대상 행 셀 스타일과 같으면 재지정을 지운다', () => {
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setTextColor(setTextHeight(t, 2, 0, 2, 0, 10), 2, 0, 2, 0, { aci: 1 });
    const a = matchCellText(t, ts, { r: 2, c: 1 }, effectiveText(t, ts, 2, 0))!;
    expect([a.cells[cellIndex(a, 2, 1)]!.height, a.cells[cellIndex(a, 2, 1)]!.color]).toEqual([10, { aci: 1 }]);
    expect(matchCellText(a, ts, { r: 2, c: 1 }, { height: 10, color: { aci: 1 } })).toBeNull();
    // 데이터 셀 스타일과 같은 값(머리글 B2 — 4.5·ByBlock)을 옮기면 재지정을 지운다
    const b = matchCellText(a, ts, { r: 2, c: 1 }, effectiveText(a, ts, 1, 1))!;
    expect([b.cells[cellIndex(b, 2, 1)]!.height, b.cells[cellIndex(b, 2, 1)]!.color]).toEqual([undefined, undefined]);
    // 제목 A1(6) → 데이터 C3: 높이만 재지정
    const c = matchCellText(b, ts, { r: 2, c: 2 }, effectiveText(b, ts, 0, 0))!;
    expect([c.cells[cellIndex(c, 2, 2)]!.height, c.cells[cellIndex(c, 2, 2)]!.color]).toEqual([6, undefined]);
  });
});

describe('셀 문자 높이·문자 색 저장', () => {
  it('고른 셀에서 바꾼 문자 높이·색(트루컬러 포함)은 DXF R2004~R2018·DWG R2000~R2018 왕복에서 남고, 확장 자료를 지워도 셀 재지정(140·64)으로 돌아온다', () => {
    const h = setup();
    h.click(h.center(2, 0));
    expect(h.cells.edit('셀 문자 높이', (d, g) => setTextHeight(d, g.r0, g.c0, g.r1, g.c1, 6.5))).toBe(true);
    expect(h.cells.edit('셀 문자 색상', (d, g) => setTextColor(d, g.r0, g.c0, g.r1, g.c1, { aci: 1 }))).toBe(true);
    expect(blockTexts(h).find((x) => x[0] === '가')).toEqual(['가', 6.5, 1]);
    h.click(h.center(4, 0));
    expect(h.cells.edit('셀 문자 색상', (d, g) => setTextColor(d, g.r0, g.c0, g.r1, g.c1, { aci: 30, rgb: 0xff7f00 }))).toBe(true);
    const want = h.data();
    expect(want.cells.map((c) => c.height ?? '-')).toEqual(['-', '-', '-', '-', '-', '-', 6.5, '-', '-', '-', '-', '-', '-', '-', '-']);
    const targets: [string, Uint8Array][] = [
      ...(['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dxf`, writeDxf(h.doc, { version: v }).data]),
      ...(['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dwg`, writeDwg(h.doc, { version: v }).data]),
    ];
    for (const [name, bytes] of targets) {
      const { back, te } = tableOf(bytes, name);
      expect(tableFromEntity(te, back)!.data, name).toEqual(want);
      // 확장 자료를 모르는 프로그램이 보는 셀 재지정(DWG는 리더가 만든 원본 태그): 고친 셀은 그 값, 나머지는 셀 스타일 값
      const noX: TableEntity = { ...te, xdata: te.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
      const d = tableFromEntity(noX, back)!.data;
      expect([d.cells[6]!.height, d.cells[6]!.color?.aci], name).toEqual([6.5, 1]);
      expect(d.cells[12]!.color?.aci, name).toBe(30);
      expect(d.cells[7]!.height, name).toBe(4.5);
      expect(tableBlockEntities(d, tableFromEntity(noX, back)!.style).filter((x): x is MTextEntity => x.type === 'MTEXT').find((m) => m.text === '가')!.height, name).toBe(6.5);
    }
    // DXF 태그: 고친 셀은 플래그 0x08·0x20과 64 1, 140 6.5(나머지 셀은 셀 스타일 값)
    const raw = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const cells = rawCells(raw);
    expect(Number(cells[6]!.get(91)) & 0x28).toBe(0x28);
    expect([cells[6]!.get(64), cells[6]!.get(140)]).toEqual([1, 6.5]);
    expect([cells[7]!.get(64), cells[7]!.get(140)]).toEqual([0, 4.5]);
    const raw04 = readDxf(writeDxf(h.doc, { version: 'AC1018' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const c04 = rawCells(raw04);
    expect([Number(c04[6]!.get(177)) & 0x28, c04[6]!.get(64), c04[6]!.get(140)]).toEqual([0x28, 1, 6.5]);
  });

  it('재지정을 넣었다 지운 표는 재지정 없이 같은 횟수로 고친 표와 DXF·DWG 저장 바이트가 같다(재지정이 없는 표의 저장은 그대로)', () => {
    const files = (h: H) => [writeDxf(h.doc, { version: 'AC1032' }).data, writeDxf(h.doc, { version: 'AC1018' }).data, writeDwg(h.doc, { version: 'AC1032' }).data, writeDwg(h.doc, { version: 'AC1015' }).data];
    // 같은 표를 두 번 다시 그린다(핸들을 같은 수만큼 쓰게): 하나는 문자만 그대로 다시, 하나는 재지정을 넣었다 지운다
    const a = setup();
    a.click(a.center(2, 0));
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    const b = setup();
    b.click(b.center(2, 0));
    expect(b.cells.edit('셀 문자 높이', (d, g) => setTextColor(setTextHeight(d, g.r0, g.c0, g.r1, g.c1, 8), g.r0, g.c0, g.r1, g.c1, { aci: 3 }))).toBe(true);
    expect(b.data().cells[6]!.height).toBe(8);
    expect(b.cells.edit('셀 문자 높이', (d, g) => setTextColor(setTextHeight(d, g.r0, g.c0, g.r1, g.c1, undefined), g.r0, g.c0, g.r1, g.c1, undefined))).toBe(true);
    // 도면마다·쓸 때마다 다른 시각·GUID는 같게 둔다
    for (const d of [a.doc, b.doc]) {
      for (const k of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) d.header.set(k, 2461345.5);
      d.header.set('$FINGERPRINTGUID', '{00000000-0000-0000-0000-000000000001}');
      d.header.set('$VERSIONGUID', '{00000000-0000-0000-0000-000000000002}');
    }
    const fa = files(a);
    const fb = files(b);
    // DXF는 다른 첫 줄을 보인다
    const firstDiff = (x: Uint8Array, y: Uint8Array) => {
      const lx = new TextDecoder().decode(x).split('\n');
      const ly = new TextDecoder().decode(y).split('\n');
      const k = lx.findIndex((s, i) => s !== ly[i]);
      return k < 0 && lx.length === ly.length ? '' : `${k}: ${lx[k - 1]?.trim()} | ${lx[k]?.trim()} != ${ly[k]?.trim()}`;
    };
    expect(firstDiff(fa[0]!, fb[0]!)).toBe('');
    expect(firstDiff(fa[1]!, fb[1]!)).toBe('');
    for (let i = 0; i < fa.length; i++) expect(Buffer.from(fb[i]!).equals(Buffer.from(fa[i]!)), String(i)).toBe(true);
    expect(new TextDecoder().decode(fa[0]!)).not.toMatch(/theight|tcolor/);
  });
});
