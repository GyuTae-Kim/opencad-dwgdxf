// @vitest-environment jsdom
/**
 * 29차: 고른 표 셀의 바로 가기 메뉴, 셀 그립으로 행 높이·열 폭, 입력기(한글 등) 조합으로 고른 셀에 바로 입력.
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "About Modifying Tables": 셀을 고르면 셀 테두리 가운데에 그립, 셀 그립을 끌면 그 셀과 그 열·행이 커지거나 작아진다.
 *   셀을 고른 채 오른쪽 누르기 메뉴로 열·행을 넣거나 지우고 이웃 셀을 합친다.
 * - "To Resize Rows or Columns in a Table": 셀을 고르고 그립을 끌어 그 셀이 든 행·열 전체의 크기를 바꾼다.
 * - "To Add Rows or Columns to a Table": 셀을 고르고 오른쪽 누르기 → 행 위에·아래에, 열 왼쪽에·오른쪽에 삽입.
 * - "Table Cell Ribbon Contextual Tab": 행 삭제·열 삭제(고른 행·열), 셀 병합(모두·행별·열별), 셀 병합 해제.
 * 셀 내용 지우기(Delete)는 근거가 없어 하지 않았다 — Delete는 예전처럼(고른 객체가 없으면 아무것도 지우지 않는다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { CELL_SIDES, gripInsertShift, rangeRect, resizeByGrip, sideMid } from '../../src/app/tablecell';
import { cellOp } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellRect, createTable, deleteCols, deleteRows, insertCols, insertRows, mergeCells, setText, unmergeCells } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { tableFromEntity } from '../../src/edit/table/entity';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { settle } from '../polish/real-app';
import { registerModifyCommands } from '../../src/app/modify';
import * as F28 from './fixture28';
import { X0, Y0, box, key, setup, typeInto } from './fixture28';

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

const mev = (o: Partial<MouseEvent> = {}) => ({ clientX: 5, clientY: 5, shiftKey: false, ctrlKey: false, metaKey: false, button: 2, ...o }) as MouseEvent;
/** 도면 영역 오른쪽 클릭(앱의 onContext) */
const context = (h: H, p: Pt) => h.view.events.context!(p, p, mev());
/** 지금 뜬 메뉴의 줄(제목·단추·구분선) */
const menuRows = () => {
  const m = document.querySelector('.menu');
  return m ? [...m.children].map((x) => (x.tagName === 'HR' ? '—' : `${(x.textContent ?? '').trim()}${(x as HTMLButtonElement).disabled ? '(꺼짐)' : ''}`)) : null;
};
const clickMenu = (label: string) => {
  const b = [...document.querySelectorAll<HTMLButtonElement>('.menu button')].find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`메뉴에 ${label}이 없습니다: ${JSON.stringify(menuRows())}`);
  b.click();
};
const texts = (h: H) => h.data().cells.map((c) => c.text);

describe('고른 셀의 바로 가기 메뉴', () => {
  it('셀을 고른 채 오른쪽 클릭하면 셀 메뉴(행·열 넣기·지우기, 병합·풀기), 고른 셀이 없거나 객체를 골랐으면 예전 메뉴', () => {
    const h = setup();
    h.click(h.center(2, 2));
    context(h, h.center(2, 2));
    expect(menuRows()).toEqual([
      '셀 C3',
      '위에 행 삽입',
      '아래에 행 삽입',
      '행 삭제',
      '—',
      '왼쪽에 열 삽입',
      '오른쪽에 열 삽입',
      '열 삭제',
      '—',
      // 한 셀이면 병합 꺼짐, 병합이 없으면 풀기 꺼짐
      '셀 병합 ▸(꺼짐)',
      '셀 병합 해제(꺼짐)',
      // 30차 정렬(celldrag30·cellalign30 시험)
      '—',
      '정렬 ▸',
    ]);
    // 표 밖을 오른쪽 클릭해도 고른 셀의 메뉴(AutoCAD처럼 고른 것의 메뉴)
    context(h, { x: 500, y: 500 });
    expect(menuRows()![0]).toBe('셀 C3');
    // 병합 셀을 걸친 범위(B3 → Shift B4는 B3:C5로 넓어진다): 병합·풀기가 켜진다
    h.click(h.center(2, 1));
    h.click(h.center(3, 1), { shiftKey: true });
    context(h, h.center(2, 1));
    expect(menuRows()).toEqual(expect.arrayContaining(['셀 B3:C5', '셀 병합 ▸', '셀 병합 해제']));
    // 병합 셀 하나(B4:C5)는 한 셀이라 병합은 꺼지고 풀기는 켜진다
    h.click(h.center(4, 2));
    context(h, h.center(4, 2));
    expect(menuRows()).toEqual(expect.arrayContaining(['셀 B4', '셀 병합 ▸(꺼짐)', '셀 병합 해제']));
    // 제목 행(모든 열 병합)을 고르면 모든 열이라 열 삭제는 꺼짐, A1에서 Shift A5는 모든 행이라 행 삭제도 꺼짐
    h.click(h.center(0, 1));
    h.click(h.center(4, 0), { shiftKey: true });
    context(h, h.center(0, 1));
    expect(menuRows()).toEqual(expect.arrayContaining(['셀 A1:C5', '행 삭제(꺼짐)', '열 삭제(꺼짐)']));
    // 고른 셀이 없으면 예전 기본 메뉴, 객체를 골랐으면 편집 메뉴
    h.press('Escape');
    context(h, { x: 500, y: 500 });
    // (이 시험은 편집 명령을 등록하지 않아 명령 항목은 빠진다)
    expect(menuRows()).toEqual(expect.arrayContaining(['최근 입력 ▸(꺼짐)']));
    expect(menuRows()!.some((x) => x.startsWith('셀 '))).toBe(false);
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    expect(menuRows()).toEqual(expect.arrayContaining(['모두 선택 해제Esc']));
  });

  it('위에 행 삽입: 행 하나(그 셀 위), 고른 셀은 밀린 같은 셀, 명령 취소 한 번에 되돌림', () => {
    const h = setup();
    const t0 = h.data();
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('위에 행 삽입');
    expect(h.data()).toEqual(expect.objectContaining({ rows: t0.rows + 1, cells: insertRows(t0, 2, 1).cells }));
    expect(h.cur()).toEqual([3, 0, 3, 0]);
    expect(texts(h)[3 * 3]).toBe('가');
    expect(h.st.session.undoTop()?.label).toBe('위에 행 삽입');
    expect(h.out().at(-1)).toBe('위에 행 삽입: 표 6행 3열');
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('아래에 행·왼쪽·오른쪽에 열 삽입, 행·열 삭제 = TABLECELL과 같은 계산(cellOp), 끝나면 같은 셀이나 그 자리의 셀', () => {
    const h = setup();
    const t0 = h.data();
    const run = (r: number, c: number, label: string) => {
      h.click(h.center(r, c));
      context(h, h.center(r, c));
      clickMenu(label);
    };
    run(2, 2, '아래에 행 삽입');
    expect(h.data().cells.map((c) => c.text)).toEqual(insertRows(t0, 3, 1).cells.map((c) => c.text));
    expect(h.data().merges).toEqual(insertRows(t0, 3, 1).merges);
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    h.st.session.undo();
    run(2, 1, '왼쪽에 열 삽입');
    expect(h.data().colWidths).toEqual(insertCols(t0, 1, 1).colWidths);
    expect(h.data().merges).toEqual(insertCols(t0, 1, 1).merges);
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    h.st.session.undo();
    run(2, 1, '오른쪽에 열 삽입');
    expect(h.data().merges).toEqual(insertCols(t0, 2, 1).merges);
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    h.st.session.undo();
    // 행 삭제: A3을 지우면 그 자리(새 A3 = 예전 A4)
    run(2, 0, '행 삭제');
    expect(h.data().rows).toBe(t0.rows - 1);
    expect(h.data().merges).toEqual(deleteRows(t0, 2, 2)!.merges);
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    h.st.session.undo();
    // 병합 셀(B4:C5)의 열 삭제는 걸친 두 열(B·C)
    run(4, 2, '열 삭제');
    expect(h.data().cols).toBe(1);
    expect(h.data().colWidths).toEqual(deleteCols(t0, 1, 2)!.colWidths);
    expect(h.cur()).toEqual([3, 0, 3, 0]);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    // 메뉴의 계산은 TABLECELL의 계산과 같다
    const g = { r0: 3, c0: 1, r1: 4, c1: 2 };
    expect(cellOp(t0, g, 'rowBefore')).toEqual(insertRows(t0, 3, 1));
    expect(cellOp(t0, g, 'rowAfter')).toEqual(insertRows(t0, 5, 1));
    expect(cellOp(t0, g, 'unmerge')).toEqual(unmergeCells(t0, 3, 1));
    expect(cellOp(t0, { r0: 2, c0: 0, r1: 2, c1: 2 }, 'mergeRows')).toEqual(mergeCells(t0, 2, 0, 2, 2, 'rows'));
    expect(cellOp(t0, { r0: 0, c0: 0, r1: 4, c1: 2 }, 'deleteRows')).toBeNull();
    expect(cellOp(t0, { r0: 2, c0: 0, r1: 2, c1: 2 }, 'deleteCols')).toBeNull();
    expect(cellOp(t0, { r0: 2, c0: 0, r1: 2, c1: 0 }, 'mergeAll')).toBeNull();
    expect(cellOp(t0, { r0: 2, c0: 0, r1: 2, c1: 0 }, 'unmerge')).toBeNull();
  });

  it('셀 병합(모두·행별·열별)·병합 해제: 범위를 한 셀로, 고른 범위는 그대로, 한 번씩 명령 취소', () => {
    const h = setup();
    const t0 = h.data();
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('셀 병합 ▸');
    expect(menuRows()).toEqual(['셀 병합', '모두', '행별', '열별']);
    clickMenu('모두');
    expect(h.data().merges).toEqual(mergeCells(t0, 2, 0, 2, 2, 'all')!.merges);
    expect(h.cur()).toEqual([2, 0, 2, 2]);
    expect(h.cells.current()?.anchor).toEqual({ r: 2, c: 0 });
    expect(h.st.session.undoTop()?.label).toBe('셀 병합');
    context(h, h.center(2, 0));
    expect(menuRows()).toEqual(expect.arrayContaining(['셀 A3', '셀 병합 ▸(꺼짐)', '셀 병합 해제']));
    clickMenu('셀 병합 해제');
    expect(h.data()).toEqual(t0);
    expect(h.cur()).toEqual([2, 0, 2, 2]);
    h.st.session.undo();
    expect(h.data().merges).toEqual(mergeCells(t0, 2, 0, 2, 2, 'all')!.merges);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    // 열별: A3:A4
    h.click(h.center(2, 0));
    h.click(h.center(3, 0), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('셀 병합 ▸');
    clickMenu('열별');
    expect(h.data().merges).toEqual(mergeCells(t0, 2, 0, 3, 0, 'cols')!.merges);
  });

  it('위로 쌓는 표: 위에 행 삽입은 화면 위(번호 다음), 아래에 행 삽입은 화면 아래(번호 앞)', () => {
    const h = setup();
    const nh = () => h.st.session.newHandle();
    const up = defaultTableStyle(true, '위로');
    up.flow = 1;
    const saved = saveTableStyleOps(h.doc, nh, up);
    h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
    let t = createTable({ cols: 2, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, up);
    t = setText(t, 2, 0, '아래 자료');
    const at = { x: 400, y: 0 };
    const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data: t, style: up, styleHandle: saved.handle, insert: { ...at, z: 0 }, props: { ...entityDefaults() } });
    h.st.session.commit({ label: 'TABLE', ops: added.ops });
    const q = cellRect(t, 2, 0, 1);
    const c = { x: at.x + (q.x0 + q.x1) / 2, y: at.y + (q.y0 + q.y1) / 2 };
    const data = () => tableFromEntity(h.doc.entityIndex.get(added.table.handle) as TableEntity, h.doc)!.data;
    h.click(c);
    expect(h.cells.current()).toEqual(expect.objectContaining({ handle: added.table.handle, r0: 2, c0: 0 }));
    context(h, c);
    clickMenu('위에 행 삽입');
    expect(data().cells.map((x) => x.text)).toEqual(insertRows(t, 3, 1).cells.map((x) => x.text));
    expect(h.cells.current()).toEqual(expect.objectContaining({ r0: 2, c0: 0 }));
    h.st.session.undo();
    h.click(c);
    context(h, c);
    clickMenu('아래에 행 삽입');
    expect(data().cells.map((x) => x.text)).toEqual(insertRows(t, 2, 1).cells.map((x) => x.text));
    expect(h.cells.current()).toEqual(expect.objectContaining({ r0: 3, c0: 0 }));
  });

  it('잠긴 도면층의 표는 바꾸지 않는다(알림), 고른 셀 그대로', () => {
    const h = setup();
    const t0 = h.data();
    h.doc.layers.get('0')!.locked = true;
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    clickMenu('위에 행 삽입');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
    expect(h.cur()).toEqual([2, 0, 2, 0]);
  });

  it('Delete는 셀 내용을 지우지 않는다(근거 없음 — 예전처럼), 메뉴로 바꾼 표는 DXF R2018·DWG R2018·R2000 왕복도 같다', async () => {
    const h = setup();
    h.click(h.center(2, 0));
    h.press('Delete');
    await settle();
    expect(texts(h)[6]).toBe('가');
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    context(h, h.center(2, 0));
    clickMenu('오른쪽에 열 삽입');
    h.click(h.center(2, 0));
    h.click(h.center(3, 1), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('셀 병합 ▸');
    clickMenu('행별');
    const got = h.data();
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE');
      expect(tableFromEntity(te!, back)!.data, name).toEqual(got);
    }
  });
});

// ---------------------------------------------------------------------------
// 셀 그립
// ---------------------------------------------------------------------------

/** C3(x 90..130, y 76..83.5)의 그립: 오른쪽, 아래, 왼쪽, 위 */
const C3 = { x0: X0 + 80, x1: X0 + 120, y0: Y0 - 24, y1: Y0 - 16.5 };
const C3MID = { x: (C3.x0 + C3.x1) / 2, y: (C3.y0 + C3.y1) / 2 };

describe('셀 그립(순수 함수)', () => {
  it('범위 변의 가운데, 그 변 쪽 열 폭·행 높이만 바꾸고 삽입점 쪽 변이면 맞은편 변을 두려고 삽입점을 옮긴다', () => {
    const h = setup();
    const t = h.data();
    const g = { r0: 2, c0: 2, r1: 2, c1: 2 };
    const q = rangeRect(t, g, 0);
    expect(CELL_SIDES.map((s) => sideMid(q, s))).toEqual([
      { x: 120, y: -20.25 },
      { x: 100, y: -24 },
      { x: 80, y: -20.25 },
      { x: 100, y: -16.5 },
    ]);
    const right = resizeByGrip(t, h.ts, g, 'x1', { x: 130, y: -20 })!;
    expect(right.colWidths).toEqual([40, 40, 50]);
    expect(gripInsertShift(t, right, g, 'x1', 0)).toBeNull();
    const left = resizeByGrip(t, h.ts, g, 'x0', { x: 75, y: -20 })!;
    expect(left.colWidths).toEqual([40, 40, 45]);
    expect(gripInsertShift(t, left, g, 'x0', 0)).toEqual({ x: -5, y: 0 });
    const down = resizeByGrip(t, h.ts, g, 'y0', { x: 100, y: -30 })!;
    expect(down.rowHeights[2]).toBe(13.5);
    expect(down.baseRowHeights[2]).toBe(13.5);
    expect(gripInsertShift(t, down, g, 'y0', 0)).toBeNull();
    const top = resizeByGrip(t, h.ts, g, 'y1', { x: 100, y: -10 })!;
    expect(top.rowHeights[2]).toBe(14);
    expect(gripInsertShift(t, top, g, 'y1', 0)).toEqual({ x: 0, y: 6.5 });
    // 위로 쌓는 표: 아래 변이 삽입점 쪽
    expect(gripInsertShift(t, top, g, 'y0', 1)).toEqual({ x: 0, y: -6.5 });
    expect(gripInsertShift(t, top, g, 'y1', 1)).toBeNull();
    // 한 줄보다 낮게(위아래 여백 + 문자 높이)·좁게(좌우 여백 + 자료 문자 높이)는 줄지 않는다. 바뀌지 않으면 null
    expect(resizeByGrip(t, h.ts, g, 'y0', { x: 100, y: -20 })).toBeNull();
    expect(resizeByGrip(t, h.ts, g, 'x1', { x: 0, y: -20 })!.colWidths[2]).toBeCloseTo(2 * h.ts.hMargin + h.ts.cells.data.height, 12);
    expect(resizeByGrip(t, h.ts, g, 'x1', { x: 120, y: -20 })).toBeNull();
  });
});

describe('셀 그립(진짜 App)', () => {
  // 그립 편집은 GRIPEDIT(편집 명령 모음)가 한다
  const setup = () => {
    const h = F28.setup();
    registerModifyCommands(h.app);
    // 객체 스냅 끄기(이 시험의 가짜 고르기는 스냅할 객체를 주지 않는다)
    h.app.osnapOn = false;
    return h;
  };
  const grips = (h: H) => h.view.overlay.grips as Pt[];
  const pending = (h: H) => (h.app as unknown as { request: { kind: string } | null }).request;

  it('고른 셀의 네 변 가운데 그립(객체 그립과 같이 그린다), 고른 셀이 없거나 GRIPS 0·보기 모드면 없다', () => {
    const h = setup();
    h.click(C3MID);
    expect(grips(h)).toEqual([
      { x: C3.x1, y: C3MID.y },
      { x: C3MID.x, y: C3.y0 },
      { x: C3.x0, y: C3MID.y },
      { x: C3MID.x, y: C3.y1 },
    ]);
    h.press('Escape');
    expect(grips(h)).toEqual([]);
    h.click(C3MID);
    (h.app.settings as { grips: number }).grips = 0;
    h.app.refreshSelectionOverlay();
    expect(grips(h)).toEqual([]);
    // GRIPS 0이면 그립 자리를 눌러도 그립 편집이 아니다(격자선 가까이라 예전처럼 표 객체)
    h.click({ x: C3.x1 + 3, y: C3MID.y });
    expect(pending(h)).toBeNull();
    (h.app.settings as { grips: number }).grips = 2;
    h.click(C3MID);
    h.app.setViewOnly(true);
    expect(grips(h)).toEqual([]);
  });

  it('오른쪽 그립을 누르고 다른 점을 누르면 C열만 넓어지고(삽입점 그대로) 명령 취소 한 번, 끝나도 C3을 고른 채', async () => {
    const h = setup();
    const t0 = h.data();
    h.click(C3MID);
    // 그립 바깥 3(그립 고르기 거리 6 안)
    h.click({ x: C3.x1 + 3, y: C3MID.y });
    await settle();
    expect(h.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    expect(h.out()).toContain('** 신축 **');
    expect(h.view.overlay.hotGrip).toEqual({ x: C3.x1, y: C3MID.y });
    // 편집하는 동안에도 셀 강조
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    // 누른 자리(그립 + 3)에서 10 옮긴 자리: 그립 변도 10
    h.click({ x: C3.x1 + 13, y: C3MID.y + 2 });
    await settle();
    expect(h.data().colWidths).toEqual([40, 40, 50]);
    expect(h.data().rowHeights).toEqual(t0.rowHeights);
    expect(h.table().insert).toEqual({ x: X0, y: Y0, z: 0 });
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    expect(pending(h)).toBeNull();
    expect(h.st.session.undoTop()?.label).toBe('GRIPEDIT');
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('왼쪽 그립은 C열을 왼쪽으로 넓히고 C열 오른쪽 변은 그대로(삽입점이 옮겨진다), 위 그립은 3행을 위로 높이고 아래 변은 그대로', async () => {
    const h = setup();
    h.click(C3MID);
    h.click({ x: C3.x0, y: C3MID.y });
    await settle();
    h.click({ x: C3.x0 - 10, y: C3MID.y });
    await settle();
    expect(h.data().colWidths).toEqual([40, 40, 50]);
    expect(h.table().insert.x).toBeCloseTo(X0 - 10, 12);
    expect(h.table().insert.y).toBe(Y0);
    // C3(이제 x 80..130)의 위 그립(105, 83.5): 방금 셀을 누른 자리에서 4보다 먼 곳(두 번 누르기가 아니게)
    h.click(C3MID);
    const top = grips(h)[3]!;
    expect(top).toEqual({ x: C3MID.x - 5, y: C3.y1 });
    h.click({ x: top.x, y: top.y - 1 });
    await settle();
    h.click({ x: top.x, y: C3.y1 + 6.5 - 1 });
    await settle();
    expect(h.data().rowHeights[2]).toBeCloseTo(14, 12);
    expect(h.table().insert.y).toBeCloseTo(Y0 + 6.5, 12);
    // 3행 아래 변(76)은 그대로
    expect(h.table().insert.y - 9 - 7.5 - h.data().rowHeights[2]!).toBeCloseTo(C3.y0, 12);
    expect(h.cur()).toEqual([2, 2, 2, 2]);
  });

  it('누른 채 끌기(마우스)도 그립 편집, 아래 그립은 3행을 아래로 높인다. 한 줄보다 낮게 끌면 바뀌지 않는다', async () => {
    const h = setup();
    const t0 = h.data();
    h.click(C3MID);
    const ev = { pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, button: 0 } as PointerEvent;
    const a = { x: C3MID.x, y: C3.y0 };
    h.view.events.down!(a, a, ev);
    h.view.events.drag!(a, { x: a.x, y: a.y - 3 }, false, ev);
    await settle();
    expect(h.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    h.view.events.drag!(a, { x: a.x, y: a.y - 6 }, true, ev);
    await settle();
    expect(h.data().rowHeights[2]).toBeCloseTo(13.5, 12);
    expect(h.table().insert).toEqual({ x: X0, y: Y0, z: 0 });
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    const undo0 = h.st.session.undoTop();
    h.click(C3MID);
    // 아래 그립 바로 밖(방금 누른 셀 가운데에서 4보다 먼 곳)
    h.click({ x: a.x + 3, y: a.y - 0.5 });
    await settle();
    expect(h.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    h.click({ x: a.x, y: a.y + 4 });
    await settle();
    expect(h.data()).toEqual(t0);
    expect(h.st.session.undoTop()).toBe(undo0);
  });

  it('터치는 그립 고르기 거리가 두 배(12), 범위 안쪽은 범위 크기의 1/4까지만 그립 — 셀 가운데는 셀 누르기, Shift+누르기는 범위', async () => {
    const h = setup();
    h.click(C3MID);
    // 마우스로 그립에서 10 떨어진 표 밖: 그립이 아니라 셀 고르기가 풀린다
    h.click({ x: C3.x1 + 10, y: C3MID.y });
    expect(h.cur()).toBeNull();
    expect(pending(h)).toBeNull();
    // 빈 곳 누르기로 시작한 창 선택을 그만둔다
    h.app.cancel();
    h.click(C3MID);
    h.click({ x: C3.x1 + 10, y: C3MID.y }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)?.kind).toBe('point');
    h.app.cancel();
    await settle();
    // 고른 범위 안 오른쪽 변에서 5(그립 거리 12·셀 폭의 1/4 = 10 안): 그립. 같은 자리를 다시 누르면(두 번 톡) 그대로
    const t0 = h.data();
    const undo0 = h.st.session.undoTop();
    h.click({ x: C3.x1 - 5, y: C3MID.y }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)?.kind).toBe('point');
    h.click({ x: C3.x1 - 5, y: C3MID.y }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)).toBeNull();
    expect(h.data()).toEqual(t0);
    expect(h.st.session.undoTop()).toBe(undo0);
    // 위 그립에서 안쪽 2(셀 높이 7.5의 1/4 = 1.875보다 깊다): 셀 누르기(같은 셀) — 그립 편집이 아니다
    h.click(C3MID, { pointerType: 'touch' });
    h.click({ x: C3MID.x, y: C3.y1 - 2 }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)).toBeNull();
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    // Shift+누르기는 그립 자리여도 범위 넓히기(표 밖이라 셀은 그대로 — 그립 편집이 아니다)
    h.click({ x: C3MID.x, y: C3.y0 }, { shiftKey: true });
    await settle();
    expect(pending(h)).toBeNull();
  });

  it('그립으로 바꾼 표는 DXF R2018·DWG R2018·R2000 왕복도 같다(삽입점 포함)', async () => {
    const h = setup();
    h.click(C3MID);
    h.click({ x: C3.x0, y: C3MID.y });
    await settle();
    h.click({ x: C3.x0 - 7, y: C3MID.y });
    await settle();
    const got = h.data();
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!;
      expect(tableFromEntity(te, back)!.data, name).toEqual(got);
      expect(te.insert.x, name).toBeCloseTo(X0 - 7, 9);
      expect(te.insert.y, name).toBeCloseTo(Y0, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// 입력기 조합
// ---------------------------------------------------------------------------

describe('입력기(한글 등)의 첫 조합 키로 고른 셀에 바로 입력', () => {
  it('Process 키: 셀 편집기를 빈 내용으로 열고 초점을 옮긴다(키는 막지 않는다), 조합한 글자로 확인하면 그 셀, 명령 취소 한 번', async () => {
    const h = setup();
    const t0 = h.data();
    h.click(h.center(2, 0));
    const ev = new KeyboardEvent('keydown', { key: 'Process', cancelable: true });
    (h.app as unknown as { onKey(e: KeyboardEvent): void }).onKey(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A3');
    expect(document.activeElement).toBe(box());
    expect(box()!.textContent!.replace(/​/g, '')).toBe('');
    expect(h.cur()).toBeNull();
    typeInto('가');
    key('Enter', { ctrlKey: true });
    await settle();
    expect(texts(h)[6]).toBe('가');
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('조합 중인 키(isComposing)·명령행에 글이 있을 때는 예전처럼 편집기를 열지 않는다, Esc면 셀은 그대로', async () => {
    const h = setup();
    const t0 = h.data();
    h.click(h.center(2, 0));
    h.press('Process', { isComposing: true });
    expect(box()).toBeNull();
    h.cmd.input.value = 'L';
    h.press('Process');
    expect(box()).toBeNull();
    h.cmd.input.value = '';
    h.press('Process');
    expect(box()).not.toBeNull();
    key('Escape');
    await settle();
    expect(h.data()).toEqual(t0);
  });
});
