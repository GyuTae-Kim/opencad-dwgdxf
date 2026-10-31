// @vitest-environment jsdom
/**
 * 31차: 셀 배경 채우기(표 자료·확장 자료·DXF/DWG 셀 재지정·표 그림·셀 메뉴).
 * 근거:
 * - AutoCAD 도움말 "Table Cell Ribbon Contextual Tab"(셀을 고르면 뜨는 탭)의 셀 스타일 패널 Table Cell Background Color: 채우기 색을 정한다 —
 *   없음, 색, 또는 색 선택 대화상자.
 * - DXF 참조 TABLE: 셀 재지정 63 셀 내용의 배경(채우기) 색, 283 채우기 색 켜기 여부, 재지정 플래그(R2007+ 91 / 그 전 177).
 *   셀의 283은 이 저장소의 표본 DXF·*T 블록으로 확인한 대로 "채우지 않음"(채울 때 0, 채우지 않음 재지정이면 1)으로 읽고 쓴다(DWG 셀의 fill none과 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entity, FaceEntity, RawTag, TableEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { rangeFill } from '../../src/app/tablecell';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellFill, cellIndex, cellRect, createTable, mergeCells, sameFill, setFill, setText } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { tableBlockEntities } from '../../src/edit/table/geometry';
import { applyTableData, decodeTableXData, encodeTableXData, rawTableCells, TABLE_APP, tableFromEntity } from '../../src/edit/table/entity';
import { newTableEntity } from '../../src/edit/table/build';
import { updateTableOps } from '../../src/edit/table/ops';
import { effectiveFill, matchCellFill } from '../../src/edit/editcmds2/table';
import { rawCellOverrides, tableCellsOut } from '../../src/io/tablecells';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { settle } from '../polish/real-app';
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
type Pt = { x: number; y: number };

const mev = () => ({ clientX: 5, clientY: 5, shiftKey: false, ctrlKey: false, metaKey: false, button: 2 }) as MouseEvent;
const context = (h: H, p: Pt) => h.view.events.context!(p, p, mev());
const menuRows = () => {
  const m = document.querySelector('.menu');
  return m ? [...m.children].map((x) => (x.tagName === 'HR' ? '—' : `${(x.textContent ?? '').trim()}${(x as HTMLButtonElement).disabled ? '(꺼짐)' : ''}`)) : null;
};
const clickMenu = (label: string) => {
  const b = [...document.querySelectorAll<HTMLButtonElement>('.menu button')].find((x) => (x.textContent ?? '').trim().replace(/✓$/, '') === label);
  if (!b) throw new Error(`메뉴에 ${label}이 없습니다: ${JSON.stringify(menuRows())}`);
  b.click();
};
const pev = { pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, button: 0, clientX: 0, clientY: 0 } as PointerEvent;
const dragCells = (h: H, a: Pt, b: Pt) => {
  h.view.events.down!(a, a, pev);
  h.view.events.drag!(a, b, true, pev);
};
/** 셀 메뉴의 배경 채우기 ▸에서 고른다 */
const fillVia = (h: H, at: Pt, label: string) => {
  context(h, at);
  clickMenu('배경 채우기 ▸');
  clickMenu(label);
};
/** 표 그림 블록의 채우기(SOLID) 색인 목록 */
const blockFills = (h: H): number[] => {
  const b = h.doc.blocks.get(tableKey(h.table().block))!;
  return b.entities.filter((e): e is SolidEntity => e.type === 'SOLID').map((e) => e.color.aci);
};
type SolidEntity = FaceEntity & { type: 'SOLID' };
const fills = (h: H) => h.data().cells.map((c) => (c.fill === undefined ? '-' : c.fill === null ? 'none' : c.fill.aci));

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

describe('셀 배경 채우기 자료', () => {
  it('setFill: 색·채우지 않음(null)·재지정 지우기(undefined), cellFill은 재지정 없으면 행 종류의 셀 스타일', () => {
    const ts = defaultTableStyle(true);
    ts.cells.header.fill = { aci: 8 };
    const t0 = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    expect(cellFill(t0, ts, 1, 0)).toEqual({ aci: 8 });
    expect(cellFill(t0, ts, 2, 0)).toBeNull();
    const t1 = setFill(t0, 2, 0, 3, 1, { aci: 3 });
    expect(t1.cells.map((c) => c.fill?.aci ?? '-')).toEqual(['-', '-', '-', '-', '-', '-', 3, 3, '-', 3, 3, '-']);
    // 원본은 그대로
    expect(t0.cells.every((c) => c.fill === undefined)).toBe(true);
    // 셀 스타일에 채우기가 있어도 null은 채우지 않는다
    const t2 = setFill(t1, 1, 2, 1, 2, null);
    expect(cellFill(t2, ts, 1, 2)).toBeNull();
    expect(cellFill(t2, ts, 1, 1)).toEqual({ aci: 8 });
    // undefined는 재지정을 지운다(셀 스타일로)
    const t3 = setFill(t2, 1, 2, 2, 0, undefined);
    expect(t3.cells[cellIndex(t3, 1, 2)]!.fill).toBeUndefined();
    expect(cellFill(t3, ts, 1, 2)).toEqual({ aci: 8 });
    expect(t3.cells[cellIndex(t3, 2, 0)]!.fill).toBeUndefined();
    // 같은 채우기
    expect(sameFill(null, undefined)).toBe(true);
    expect(sameFill({ aci: 3 }, { aci: 3 })).toBe(true);
    expect(sameFill({ aci: 3, rgb: 0x00ff00 }, { aci: 3 })).toBe(false);
    expect(sameFill({ aci: 3 }, null)).toBe(false);
    // 범위의 채우기(병합 셀은 기준 셀만): 같으면 그 값, 섞였으면 mixed
    expect(rangeFill(t1, ts, { r0: 2, c0: 0, r1: 3, c1: 1 })).toEqual({ aci: 3 });
    expect(rangeFill(t1, ts, { r0: 2, c0: 0, r1: 3, c1: 2 })).toBe('mixed');
    expect(rangeFill(t1, ts, { r0: 1, c0: 0, r1: 1, c1: 2 })).toEqual({ aci: 8 });
    expect(rangeFill(t0, ts, { r0: 2, c0: 0, r1: 3, c1: 2 })).toBeNull();
  });

  it('확장 자료: 이어진 같은 채우기는 한 묶음(시작·개수·색인·트루컬러), 채우지 않음은 −1, 맨 끝 묶음, 표 밖 번호는 버린다', () => {
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setText(t, 2, 0, '가');
    // 머리글 행 전체와 다음 행 전체: 번호 3~8이 한 묶음
    t = setFill(t, 1, 0, 2, 2, { aci: 5 });
    t = setFill(t, 3, 1, 3, 1, null);
    t = setFill(t, 4, 0, 4, 1, { aci: 30, rgb: 0x123456 });
    const x = encodeTableXData(t);
    const strs = x.items.filter((i) => i.code === 1000).map((i) => i.value);
    expect(strs.at(-1)).toBe('fill');
    const at = x.items.findIndex((i) => i.code === 1000 && i.value === 'fill');
    expect(x.items.slice(at + 1).map((i) => i.value)).toEqual([3, 3, 6, 5, -1, 10, 1, -1, -1, 12, 2, 30, 0x123456]);
    const d = decodeTableXData(x)!;
    expect(d.texts?.get(6)).toBe('가');
    expect([...d.fills!]).toEqual([
      [3, { aci: 5 }],
      [4, { aci: 5 }],
      [5, { aci: 5 }],
      [6, { aci: 5 }],
      [7, { aci: 5 }],
      [8, { aci: 5 }],
      [10, null],
      [12, { aci: 30, rgb: 0x123456 }],
      [13, { aci: 30, rgb: 0x123456 }],
    ]);
    // 표 객체 ↔ 정의: 그대로 돌아온다
    const doc = createNewDocument('metric');
    const e = newTableEntity(t, { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' });
    expect(tableFromEntity(e, doc)!.data).toEqual(t);
    // 채우기가 없으면 묶음도 없다(30차까지와 같은 확장 자료)
    const plain = encodeTableXData(createTable({ cols: 2, colWidth: 30, dataRows: 1, rowLines: 1, first: 'data', second: 'data' }, ts));
    expect(plain.items.some((i) => i.value === 'fill')).toBe(false);
    // 망가진 묶음(표 밖 번호·큰 개수)은 표 안만
    const bad = { app: TABLE_APP, items: [...x.items.slice(0, at + 1), { code: 1071, value: 1 }, { code: 1071, value: 13 }, { code: 1071, value: 1000000 }, { code: 1071, value: 2 }, { code: 1071, value: -1 }] };
    expect([...decodeTableXData(bad)!.fills!.keys()]).toEqual([13, 14]);
  });

  it('AutoCAD 원본 태그의 셀 채우기: 플래그 4와 63(283 0)은 그 색, 플래그 2와 283 1은 채우지 않음, 플래그 없는 63·값 묶음 안은 보지 않는다', () => {
    const cell = (...tags: [number, string | number][]) => [{ code: 171, value: 1 }, ...tags.map(([code, value]) => ({ code, value }))];
    const raw: RawTag[] = [
      { code: 100, value: 'AcDbTable' },
      { code: 91, value: 2 },
      { code: 92, value: 2 },
      // R2007+: 91 재지정 플래그
      ...cell([91, 6], [63, 3], [283, 0]),
      ...cell([91, 2], [283, 1]),
      // 플래그에 4가 없으면 63은 재지정이 아니다
      ...cell([91, 0], [63, 5]),
      // 값 묶음 안의 91·63은 셀 재지정이 아니다
      ...cell([91, 0], [301, 'CELL_VALUE'], [91, 6], [63, 1], [304, 'ACVALUE_END']),
    ];
    const r = rawTableCells(raw);
    expect(r.count).toBe(4);
    expect([...r.fills]).toEqual([
      [0, { aci: 3 }],
      [1, null],
    ]);
    // R2004: 177 플래그
    const old = rawTableCells([{ code: 100, value: 'AcDbTable' }, { code: 92, value: 1 }, ...cell([177, 6], [63, 140], [283, 0])]);
    expect([...old.fills]).toEqual([[0, { aci: 140 }]]);
    // io 쪽 판정과 같다
    expect(rawCellOverrides(raw).map((o) => o.fill)).toEqual([{ aci: 3 }, null, undefined, undefined]);
    expect(rawCellOverrides(raw)[1]!.fillNone).toBe(true);
  });

  it('AutoCAD 표를 고쳐도 셀 채우기가 남는다(30차까지는 고치면 표 그림을 셀 스타일 채우기로만 다시 그려 셀 채우기가 사라졌다)', () => {
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
      { code: 91, value: 6 },
      { code: 63, value: 2 },
      { code: 283, value: 0 },
      { code: 171, value: 1 },
      { code: 91, value: 0 },
      { code: 171, value: 1 },
      { code: 91, value: 0 },
      { code: 171, value: 1 },
      { code: 91, value: 6 },
      { code: 63, value: 4 },
      { code: 283, value: 0 },
    ];
    const rt = tableFromEntity(e, doc)!;
    expect(rt.data.cells.map((c) => c.fill?.aci ?? '-')).toEqual([2, '-', '-', 4]);
    // 셀 문자를 고친 표 그림: 채우기 둘이 격자선·문자보다 먼저(아래)
    const next = setText(rt.data, 0, 1, 'B');
    const ents = tableBlockEntities(next, rt.style);
    const solids = ents.filter((x): x is SolidEntity => x.type === 'SOLID');
    expect(solids.map((s) => s.color.aci)).toEqual([2, 4]);
    expect(ents.findIndex((x) => x.type === 'LINE')).toBeGreaterThan(ents.lastIndexOf(solids[1] as Entity));
    // 확장 자료로 옮겨 남는다
    const w = applyTableData(e, next, undefined);
    expect(w.raw).toBeUndefined();
    expect(tableFromEntity(w, doc)!.data.cells.map((c) => c.fill?.aci ?? '-')).toEqual([2, '-', '-', 4]);
    // 고친 표를 쓸 때의 셀 배치(셀 재지정 63)
    expect(tableCellsOut(w, doc).cells.map((c) => c.fill?.aci ?? null)).toEqual([2, null, null, 4]);
  });

  it('셀 일치(MATCHCELL)의 채우기: 원본의 실제 채우기를 옮기고, 대상 행 셀 스타일과 같으면 재지정을 지운다', () => {
    const ts = defaultTableStyle(true);
    ts.cells.header.fill = { aci: 8 };
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setFill(t, 2, 0, 2, 0, { aci: 1 });
    // 데이터 A3(빨강) → 데이터 B3: 재지정 빨강
    const a = matchCellFill(t, ts, { r: 2, c: 1 }, effectiveFill(t, ts, 2, 0))!;
    expect(a.cells[cellIndex(a, 2, 1)]!.fill).toEqual({ aci: 1 });
    expect(matchCellFill(a, ts, { r: 2, c: 1 }, { aci: 1 })).toBeNull();
    // 머리글 B2(셀 스타일 8) → 데이터 B3: 재지정 8 / 데이터 C3(채우지 않음) → 머리글 C2: 채우지 않음 재지정
    expect(matchCellFill(a, ts, { r: 2, c: 1 }, effectiveFill(a, ts, 1, 1))!.cells[cellIndex(a, 2, 1)]!.fill).toEqual({ aci: 8 });
    const b = matchCellFill(a, ts, { r: 1, c: 2 }, effectiveFill(a, ts, 2, 2))!;
    expect(b.cells[cellIndex(b, 1, 2)]!.fill).toBeNull();
    // 데이터 셀 스타일과 같은 값(채우지 않음)을 옮기면 재지정을 지운다
    const c = matchCellFill(a, ts, { r: 2, c: 1 }, null)!;
    expect(c.cells[cellIndex(c, 2, 1)]!.fill).toBeUndefined();
    expect(matchCellFill(c, ts, { r: 2, c: 1 }, null)).toBeNull();
  });

  it('표 그림: 셀 재지정 채우기는 그 셀(병합 셀은 병합 범위) 크기의 SOLID, null은 셀 스타일 채우기를 끈다', () => {
    const ts = defaultTableStyle(true);
    ts.cells.header.fill = { aci: 8 };
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = mergeCells(t, 2, 0, 3, 1)!;
    t = setFill(t, 2, 0, 2, 0, { aci: 1 });
    t = setFill(t, 1, 1, 1, 1, null);
    const solids = tableBlockEntities(t, ts).filter((x): x is SolidEntity => x.type === 'SOLID');
    // 머리글 A2·C2(셀 스타일 8), 병합 A3:B4(재지정 1). 덮인 셀(B3 등)과 B2(채우지 않음)는 없다
    expect(solids.map((s) => s.color.aci)).toEqual([8, 8, 1]);
    const q = cellRect(t, 2, 0, ts.flow);
    const s = solids[2]!;
    expect([s.points[0], s.points[3]].map((p) => [p.x, p.y])).toEqual([
      [q.x0, q.y0],
      [q.x1, q.y1],
    ]);
    expect(q.x1 - q.x0).toBe(60);
  });
});

describe('셀 메뉴의 배경 채우기', () => {
  const ITEMS = ['없음', '빨간색', '노란색', '초록색', '하늘색', '파란색', '선홍색', '흰색', '색 선택...'];

  it('배경 채우기 ▸ 아래 없음·일곱 색·색 선택..., 고른 셀이 모두 그 채우기면 ✓(섞였으면 없음)', () => {
    const h = setup();
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('배경 채우기 ▸');
    expect(menuRows()).toEqual(['배경 채우기', ...ITEMS.map((l) => (l === '없음' ? `${l}✓` : l))]);
    fillVia(h, h.center(2, 0), '하늘색');
    context(h, h.center(2, 0));
    clickMenu('배경 채우기 ▸');
    expect(menuRows()!.filter((x) => x.endsWith('✓'))).toEqual(['하늘색✓']);
    // A3:B3은 섞여 ✓ 없음
    h.click(h.center(2, 1), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('배경 채우기 ▸');
    expect(menuRows()!.some((x) => x.endsWith('✓'))).toBe(false);
  });

  it('끌어서 고른 범위(A3:B4 — B4:C5 병합을 덮어 A3:C5)를 채운다, 표 그림에 채우기, 명령 취소 한 번, 같은 채우기면 단계가 늘지 않는다', () => {
    const h = setup();
    const t0 = h.data();
    expect(blockFills(h)).toEqual([]);
    dragCells(h, h.center(2, 0), h.center(3, 1));
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    fillVia(h, h.center(2, 0), '노란색');
    expect(fills(h)).toEqual([...Array(6).fill('-'), ...Array(9).fill(2)]);
    // 기준 셀마다 하나(A3·B3·C3·A4·B4(병합)·A5)
    expect(blockFills(h)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(h.st.session.undoTop()?.label).toBe('셀 배경 채우기');
    expect(h.out().at(-1)).toBe('셀 배경 채우기: 표 5행 3열');
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    const top = h.st.session.undoTop();
    fillVia(h, h.center(2, 0), '노란색');
    expect(h.st.session.undoTop()).toBe(top);
    // 없음: 재지정(채우지 않음)으로 남고 그림의 채우기는 사라진다
    fillVia(h, h.center(2, 0), '없음');
    expect(fills(h).slice(6)).toEqual(Array(9).fill('none'));
    expect(blockFills(h)).toEqual([]);
    h.st.session.undo();
    expect(blockFills(h)).toHaveLength(6);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    expect(blockFills(h)).toEqual([]);
  });

  it('색 선택...: 색 대화상자에서 고른 색(색인 30), 취소하면 그대로', async () => {
    const h = setup();
    h.click(h.center(1, 1));
    const t0 = h.data();
    fillVia(h, h.center(1, 1), '색 선택...');
    await settle();
    let dlg = document.querySelector('.dialog')!;
    expect(dlg).toBeTruthy();
    [...dlg.querySelectorAll<HTMLButtonElement>('footer .btn')].find((b) => b.textContent === '취소')!.click();
    await settle();
    expect(h.data()).toEqual(t0);
    fillVia(h, h.center(1, 1), '색 선택...');
    await settle();
    dlg = document.querySelector('.dialog')!;
    const aci = dlg.querySelector<HTMLInputElement>('input[aria-label="색인 번호"]')!;
    aci.value = '30';
    aci.dispatchEvent(new Event('change'));
    dlg.querySelector<HTMLButtonElement>('footer .btn.primary')!.click();
    await settle();
    expect(h.data().cells[cellIndex(h.data(), 1, 1)]!.fill).toEqual({ aci: 30 });
    expect(blockFills(h)).toEqual([30]);
    expect(h.cur()).toEqual([1, 1, 1, 1]);
  });

  it('잠긴 도면층의 표는 바꾸지 않는다(알림)', () => {
    const h = setup();
    const t0 = h.data();
    h.doc.layers.get('0')!.locked = true;
    h.click(h.center(2, 0));
    fillVia(h, h.center(2, 0), '빨간색');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });

  it('메뉴로 바꾼 채우기(색·채우지 않음·트루컬러)는 DXF R2018·DWG R2018·R2000 왕복에서 남고, 셀 재지정(63·283)으로도 쓴다', () => {
    const h = setup();
    h.click(h.center(2, 0));
    fillVia(h, h.center(2, 0), '빨간색');
    h.click(h.center(1, 2));
    fillVia(h, h.center(1, 2), '없음');
    h.click(h.center(3, 1));
    // 트루컬러는 확장 자료에 그대로(DXF 셀 재지정 63은 가까운 색인)
    expect(h.cells.edit('셀 배경 채우기', (d, g) => setFill(d, g.r0, g.c0, g.r1, g.c1, { aci: 30, rgb: 0xff7f00 }))).toBe(true);
    const got = h.data();
    expect(fills(h)).toEqual(['-', '-', '-', '-', '-', '-', 1, '-', '-', '-', 30, 30, '-', 30, 30]);
    // 앞의 "없음"은 셀 스타일도 채우지 않아 바뀐 것이 없다(재지정을 만들지 않는다)
    expect(got.cells[cellIndex(got, 1, 2)]!.fill).toBeUndefined();
    h.click(h.center(1, 2));
    expect(h.cells.edit('셀 배경 채우기', (d, g) => setFill(d, g.r0, g.c0, g.r1, g.c1, null))).toBe(true);
    const want = h.data();
    expect(want.cells[cellIndex(want, 1, 2)]!.fill).toBeNull();
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!;
      expect(tableFromEntity(te, back)!.data, name).toEqual(want);
      // 확장 자료를 모르는 프로그램이 보는 셀 재지정(DWG는 리더가 만든 원본 태그)
      const rf = rawTableCells(te.raw).fills;
      expect(rf.get(6), name).toEqual({ aci: 1 });
      expect(rf.get(10)?.aci, name).toBe(30);
      expect(rf.has(7), name).toBe(false);
    }
    // DXF 태그: 채운 셀은 플래그 2·4와 63, 283 0 / 채우지 않음 재지정은 플래그 2와 283 1
    const raw = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const cells = rawCells(raw);
    expect(Number(cells[6]!.get(91)) & 6).toBe(6);
    expect([cells[6]!.get(63), cells[6]!.get(283)]).toEqual([1, 0]);
    expect(Number(cells[5]!.get(91)) & 6).toBe(2);
    expect([cells[5]!.has(63), cells[5]!.get(283)]).toEqual([false, 1]);
    expect(cells[7]!.has(283)).toBe(false);
    // R2004 DXF(177)
    const raw04 = readDxf(writeDxf(h.doc, { version: 'AC1018' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const c04 = rawCells(raw04);
    expect([Number(c04[6]!.get(177)) & 6, c04[6]!.get(63), c04[6]!.get(283)]).toEqual([6, 1, 0]);
  });

  it('모든 쓰기 판(DXF R2004~R2018, DWG R2000~R2018): 확장 자료로 같은 표, 확장 자료를 지워도 셀 재지정으로 채우기가 돌아온다', () => {
    const h = setup();
    h.click(h.center(1, 0));
    h.click(h.center(1, 2), { shiftKey: true });
    fillVia(h, h.center(1, 0), '초록색');
    h.click(h.center(4, 0));
    fillVia(h, h.center(4, 0), '선홍색');
    const want = h.data();
    const targets: [string, Uint8Array][] = [
      ...(['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dxf`, writeDxf(h.doc, { version: v }).data]),
      ...(['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dwg`, writeDwg(h.doc, { version: v }).data]),
    ];
    for (const [name, bytes] of targets) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!;
      expect(tableFromEntity(te, back)!.data, name).toEqual(want);
      const noX: TableEntity = { ...te, xdata: te.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
      const d = tableFromEntity(noX, back)!.data;
      expect(d.cells.map((c) => c.fill?.aci ?? '-'), name).toEqual(['-', '-', '-', 3, 3, 3, '-', '-', '-', '-', '-', '-', 6, '-', '-']);
    }
  });

  it('행·열을 넣거나 지워도 채우기는 그 셀을 따라간다, 다시 고쳐도(updateTableOps) 남는다', () => {
    const h = setup();
    h.click(h.center(2, 0));
    fillVia(h, h.center(2, 0), '파란색');
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('위에 행 삽입');
    const t = h.data();
    expect(t.cells[cellIndex(t, 3, 0)]!.fill).toEqual({ aci: 5 });
    expect(t.cells[cellIndex(t, 2, 0)]!.fill).toBeUndefined();
    // 스타일을 다시 그려도(TABLESTYLE 수정과 같은 updateTableOps) 남는다
    const rt = tableFromEntity(h.table(), h.doc)!;
    const up = updateTableOps(h.doc, () => h.st.session.newHandle(), h.table(), MODEL_SPACE, rt.data, rt.style, rt.styleEntry?.handle);
    h.st.session.commit({ label: 'TABLESTYLE', ops: up.ops });
    expect(blockFills(h)).toEqual([5]);
  });
});
