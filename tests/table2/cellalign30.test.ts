// @vitest-environment jsdom
/**
 * 30차: 고른 셀 메뉴의 정렬, 고른 표 메뉴의 열 폭 같게·행 높이 같게.
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "Table Cell Ribbon Contextual Tab"(셀을 고르면 뜨는 탭)의 셀 스타일 패널 정렬: 셀 내용을 셀의 위·아래 테두리에 대해 위·가운데·아래,
 *   왼쪽·오른쪽 테두리에 대해 왼쪽·가운데·오른쪽으로 맞춘다. "About Modifying Tables": 셀을 고른 채 오른쪽 누르기 메뉴로도 바꾼다.
 * - "To Resize Rows or Columns in a Table": 표를 눌러 고르고 오른쪽 누르기 → 열 크기 같게·행 크기 같게.
 *   "Table Visor"(Mac): 모든 열을 표의 폭으로, 모든 행을 표의 높이로 나눠 같게 한다(고른 셀 범위만 같게 하는 것은 도움말에 없다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { rangeAlign } from '../../src/app/tablecell';
import { commitTable, readPicked } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellIndex, setAlign, sizeEqually } from '../../src/edit/table/model';
import { tableFromEntity } from '../../src/edit/table/entity';
import { writeDxf } from '../../src/io/dxf/writer';
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
const aligns = (h: H) => h.data().cells.map((c) => c.align ?? 0);
const pev = { pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, button: 0, clientX: 0, clientY: 0 } as PointerEvent;
/** 마우스로 a에서 b까지 끌어 셀 범위 고르기 */
const dragCells = (h: H, a: Pt, b: Pt) => {
  h.view.events.down!(a, a, pev);
  h.view.events.drag!(a, b, true, pev);
};
const NINE = ['맨 위 왼쪽', '맨 위 중심', '맨 위 오른쪽', '중간 왼쪽', '중간 중심', '중간 오른쪽', '맨 아래 왼쪽', '맨 아래 중심', '맨 아래 오른쪽'];

describe('셀 메뉴의 정렬', () => {
  it('정렬 ▸ 아래 아홉 가지(위·중간·아래 × 왼쪽·중심·오른쪽), 고른 셀이 모두 그 정렬이면 ✓', () => {
    const h = setup();
    // C3은 오른쪽 아래 재지정
    h.click(h.center(2, 2));
    context(h, h.center(2, 2));
    clickMenu('정렬 ▸');
    expect(menuRows()).toEqual(['정렬', ...NINE.map((l) => (l === '맨 아래 오른쪽' ? `${l}✓` : l))]);
    // B3은 자료 셀 스타일(맨 위 중심)
    h.click(h.center(2, 1));
    context(h, h.center(2, 1));
    clickMenu('정렬 ▸');
    expect(menuRows()!.filter((x) => x.endsWith('✓'))).toEqual(['맨 위 중심✓']);
    // B3:C3은 섞여 ✓ 없음
    h.click(h.center(2, 2), { shiftKey: true });
    context(h, h.center(2, 1));
    clickMenu('정렬 ▸');
    expect(menuRows()!.some((x) => x.endsWith('✓'))).toBe(false);
  });

  it('고른 범위(끌어서 고른 A3:B4 — B4:C5 병합을 덮어 A3:C5)의 셀 정렬을 바꾼다, 명령 취소 한 번, 이미 모두 그 정렬이면 바꾸지 않는다', () => {
    const h = setup();
    const t0 = h.data();
    dragCells(h, h.center(2, 0), h.center(3, 1));
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    context(h, h.center(2, 0));
    clickMenu('정렬 ▸');
    clickMenu('중간 왼쪽');
    const t = h.data();
    for (let r = 2; r <= 4; r++) for (let c = 0; c <= 2; c++) expect(t.cells[cellIndex(t, r, c)]!.align, `${r},${c}`).toBe(4);
    // 범위 밖은 그대로
    expect(aligns(h).slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(rangeAlign(t, h.ts, { r0: 2, c0: 0, r1: 4, c1: 2 })).toBe(4);
    expect(h.st.session.undoTop()?.label).toBe('셀 정렬');
    expect(h.out().at(-1)).toBe('셀 정렬: 표 5행 3열');
    // 끝나도 같은 범위를 고른 채
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    // 같은 정렬을 다시 고르면 명령 취소 단계가 늘지 않는다
    const top = h.st.session.undoTop();
    context(h, h.center(2, 0));
    clickMenu('정렬 ▸');
    clickMenu('중간 왼쪽');
    expect(h.st.session.undoTop()).toBe(top);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('잠긴 도면층의 표는 바꾸지 않는다(알림)', () => {
    const h = setup();
    const t0 = h.data();
    h.doc.layers.get('0')!.locked = true;
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('정렬 ▸');
    clickMenu('맨 아래 중심');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });

  it('메뉴로 바꾼 정렬은 DXF R2018·DWG R2018·R2000 왕복에서 남는다', () => {
    const h = setup();
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('정렬 ▸');
    clickMenu('맨 아래 오른쪽');
    h.click(h.center(1, 1));
    context(h, h.center(1, 1));
    clickMenu('정렬 ▸');
    // 머리글 행(셀 스타일 중간 중심)의 B2를 중간 오른쪽으로
    clickMenu('중간 오른쪽');
    h.click(h.center(3, 0));
    context(h, h.center(3, 0));
    clickMenu('정렬 ▸');
    clickMenu('맨 위 오른쪽');
    const got = h.data();
    expect(got.cells[cellIndex(got, 2, 0)]!.align).toBe(9);
    expect(got.cells[cellIndex(got, 1, 1)]!.align).toBe(6);
    expect(got.cells[cellIndex(got, 3, 0)]!.align).toBe(3);
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!;
      expect(tableFromEntity(te, back)!.data, name).toEqual(got);
    }
  });
});

describe('고른 표 메뉴의 열 폭 같게·행 높이 같게', () => {
  it('계산: 열은 표의 폭, 행은 표의 높이를 나눠 같게(합은 그대로), 이미 같으면 null', () => {
    const h = setup();
    const t = { ...h.data(), colWidths: [30, 40, 50] };
    const c = sizeEqually(t, 'cols')!;
    expect(c.colWidths).toEqual([40, 40, 40]);
    expect(c.rowHeights).toEqual(t.rowHeights);
    expect(sizeEqually(c, 'cols')).toBeNull();
    const r = sizeEqually(h.data(), 'rows')!;
    // 9 + 7.5 × 4 = 39 → 7.8씩
    for (const v of r.rowHeights) expect(v).toBeCloseTo(7.8, 12);
    for (const v of r.baseRowHeights) expect(v).toBeCloseTo(7.8, 12);
    expect(r.colWidths).toEqual(h.data().colWidths);
    expect(sizeEqually(r, 'rows')).toBeNull();
    // 정렬 재지정은 그대로
    expect(sizeEqually(setAlign(t, 0, 0, 0, 0, 7), 'cols')!.cells[0]!.align).toBe(7);
  });

  it('표 하나를 고른 편집 메뉴에 열 폭 같게(이미 같으면 꺼짐)·행 높이 같게, 고르면 명령 취소 한 번에 되돌림, 표는 고른 채', () => {
    const h = setup();
    const t0 = h.data();
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    expect(menuRows()).toEqual(expect.arrayContaining(['열 폭 같게(꺼짐)', '행 높이 같게']));
    clickMenu('행 높이 같게');
    const t = h.data();
    // 제목 행은 문자(제목 문자 높이 6 + 위아래 여백)에 맞춰 9로 다시 늘어나고 나머지는 7.8
    expect(t.rowHeights[0]).toBeCloseTo(9, 12);
    for (let r = 1; r < t.rows; r++) expect(t.rowHeights[r], String(r)).toBeCloseTo(7.8, 12);
    expect(t.colWidths).toEqual(t0.colWidths);
    expect(t.cells).toEqual(t0.cells);
    expect(h.st.session.undoTop()?.label).toBe('행 높이 같게');
    expect(h.out().at(-1)).toBe('행 높이 같게: 표 5행 3열');
    expect([...h.st.selection]).toEqual([h.handle]);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    // 열 폭을 다르게 한 뒤 열 폭 같게: 표의 폭(120) 그대로 40씩
    const p = readPicked(h.app, h.handle, null)!;
    commitTable(h.app, p, { ...p.data, colWidths: [20, 40, 60] }, 'TABLECELL');
    const t1 = h.data();
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('열 폭 같게');
    expect(h.data().colWidths).toEqual([40, 40, 40]);
    expect(h.st.session.undoTop()?.label).toBe('열 폭 같게');
    h.st.session.undo();
    expect(h.data()).toEqual(t1);
  });

  it('표가 아니거나 둘 이상 골랐거나 아무것도 고르지 않았으면 항목이 없다, 잠긴 도면층은 바꾸지 않는다', () => {
    const h = setup();
    const line = h.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    const has = () => (menuRows() ?? []).some((x) => x.startsWith('열 폭 같게') || x.startsWith('행 높이 같게'));
    context(h, { x: 500, y: 500 });
    expect(has()).toBe(false);
    h.app.setSelection([line]);
    context(h, { x: 500, y: 500 });
    expect(has()).toBe(false);
    h.app.setSelection([line, h.handle]);
    context(h, { x: 500, y: 500 });
    expect(has()).toBe(false);
    const t0 = h.data();
    h.doc.layers.get('0')!.locked = true;
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('행 높이 같게');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });

  it('같게 한 표는 DXF R2018·DWG R2018·R2000 왕복도 같다', () => {
    const h = setup();
    const p = readPicked(h.app, h.handle, null)!;
    commitTable(h.app, p, { ...p.data, colWidths: [20, 35, 65] }, 'TABLECELL');
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('열 폭 같게');
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('행 높이 같게');
    const got = h.data();
    expect(got.colWidths).toEqual([40, 40, 40]);
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!;
      const d = tableFromEntity(te, back)!.data;
      expect(d.colWidths, name).toEqual(got.colWidths);
      for (let r = 0; r < got.rows; r++) expect(d.rowHeights[r], `${name} ${r}`).toBeCloseTo(got.rowHeights[r]!, 9);
    }
  });
});
