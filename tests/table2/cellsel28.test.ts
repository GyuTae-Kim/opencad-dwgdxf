// @vitest-environment jsdom
/**
 * 28차: 표 셀 고르기, 표를 넣은 뒤 첫 셀 제자리 편집.
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "About Modifying Tables": 셀 안을 눌러 고르고 다른 셀을 누르면 옮겨 간다. 고른 셀을 두 번 누르면 고치고, 강조된 채 입력하면 내용을 바꾼다.
 *   Shift를 누른 채 다른 셀을 누르면 두 셀과 그 사이를 모두 고른다. 표 자체는 격자선을 눌러 고른다.
 * - "About Adding Text and Blocks to Tables": 표를 만들면 첫 셀이 강조되어 바로 입력한다. 다음 셀로는 Tab이나 화살표.
 * - "To Change the Appearance of Cell Borders": Esc로 고른 것을 푼다.
 * 고르기는 도면을 바꾸지 않고, 고른 셀에 친 내용은 예전 setText 결과와 같아 DXF·DWG 왕복도 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { cellRange, stepCell, tableCellSelection } from '../../src/app/tablecell';
import { activeEditor } from '../../src/app/textedit/editor';
import { getText, setText } from '../../src/edit/table/model';
import { tableFromEntity } from '../../src/edit/table/entity';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { settle } from '../polish/real-app';
import { X0, box, key, setup, typeInto } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

describe('범위와 화살표(순수 함수)', () => {
  it('범위는 걸친 병합 셀을 모두 덮도록 넓힌다', () => {
    const h = setup();
    const t = h.data();
    expect(cellRange(t, { r: 2, c: 0 }, { r: 3, c: 1 })).toEqual({ r0: 2, c0: 0, r1: 4, c1: 2 });
    expect(cellRange(t, { r: 4, c: 2 }, { r: 2, c: 2 })).toEqual({ r0: 2, c0: 1, r1: 4, c1: 2 });
    // 제목 행(모든 열 병합)을 걸치면 모든 열
    expect(cellRange(t, { r: 1, c: 1 }, { r: 0, c: 1 })).toEqual({ r0: 0, c0: 0, r1: 1, c1: 2 });
    expect(cellRange(t, { r: 2, c: 1 }, { r: 2, c: 1 })).toEqual({ r0: 2, c0: 1, r1: 2, c1: 1 });
  });

  it('화살표는 그 방향의 이웃 셀 하나(병합 셀은 한 칸, 표 끝이면 없음, 위로 쌓는 표는 위아래가 반대)', () => {
    const h = setup();
    const t = h.data();
    expect(stepCell(t, { r: 2, c: 0 }, 'right')).toEqual({ r: 2, c: 1 });
    expect(stepCell(t, { r: 2, c: 1 }, 'down')).toEqual({ r: 3, c: 1 });
    expect(stepCell(t, { r: 3, c: 1 }, 'down')).toBeNull();
    expect(stepCell(t, { r: 3, c: 1 }, 'right')).toBeNull();
    expect(stepCell(t, { r: 3, c: 1 }, 'left')).toEqual({ r: 3, c: 0 });
    expect(stepCell(t, { r: 4, c: 0 }, 'right')).toEqual({ r: 3, c: 1 });
    expect(stepCell(t, { r: 1, c: 2 }, 'up')).toEqual({ r: 0, c: 0 });
    expect(stepCell(t, { r: 0, c: 0 }, 'up')).toBeNull();
    expect(stepCell(t, { r: 0, c: 0 }, 'down')).toEqual({ r: 1, c: 0 });
    expect(stepCell(t, { r: 2, c: 0 }, 'left')).toBeNull();
    expect(stepCell(t, { r: 2, c: 0 }, 'up', 1)).toEqual({ r: 3, c: 0 });
    expect(stepCell(t, { r: 2, c: 0 }, 'down', 1)).toEqual({ r: 1, c: 0 });
  });
});

describe('셀 고르기(진짜 App)', () => {
  it('셀 안을 누르면 그 셀을 고르고(표 객체는 고르지 않는다) 실선 강조, 다른 셀을 누르면 옮겨 간다', () => {
    const h = setup();
    h.app.setSelection([h.line({ x: 300, y: 300 }, { x: 310, y: 300 })]);
    h.click(h.center(2, 0));
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    expect(h.st.selection.size).toBe(0);
    const cells = h.view.overlay.cells as { segs: number[]; tris?: number[] }[];
    expect(cells).toHaveLength(1);
    // A3: x 10..50, y 100-16.5-7.5 .. 100-16.5
    const xs = cells[0]!.segs.filter((_, i) => i % 2 === 0);
    const ys = cells[0]!.segs.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(10, 9);
    expect(Math.max(...xs)).toBeCloseTo(50, 9);
    expect(Math.max(...ys)).toBeCloseTo(100 - 16.5, 9);
    expect(Math.min(...ys)).toBeCloseTo(100 - 24, 9);
    expect(cells[0]!.tris).toHaveLength(12);
    h.click(h.center(1, 2));
    expect(h.cur()).toEqual([1, 2, 1, 2]);
    // 병합 셀은 기준 셀
    h.click(h.center(4, 2));
    expect(h.cells.current()?.anchor).toEqual({ r: 3, c: 1 });
    expect(h.cur()).toEqual([3, 1, 4, 2]);
  });

  it('격자선 가까이는 예전처럼 표 객체, 표 위에 그린 선은 그 선, 표 밖을 누르면 셀 고르기가 풀린다', () => {
    const h = setup();
    h.click(h.center(2, 1));
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    // B3 왼쪽 격자선에서 1 안쪽(고르기 허용 거리 5, 셀 높이 7.5의 1/4보다 가깝다)
    h.click({ x: X0 + 40 + 1, y: h.center(2, 1).y });
    expect(h.cur()).toBeNull();
    expect([...h.st.selection]).toEqual([h.handle]);
    const c = h.center(3, 0);
    const l = h.line({ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y });
    h.click(c);
    expect(h.cur()).toBeNull();
    expect([...h.st.selection]).toContain(l);
    h.app.clearSelection();
    h.click(h.center(2, 2));
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    h.click({ x: 500, y: 500 });
    expect(h.cur()).toBeNull();
    expect(h.view.overlay.cells).toEqual([]);
    h.app.cancel();
  });

  it('Shift+누르기는 범위(병합 셀까지 넓힘), 고른 셀이 없으면 그 셀 하나', () => {
    const h = setup();
    h.click(h.center(2, 0), { shiftKey: true });
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    h.click(h.center(3, 1), { shiftKey: true });
    expect(h.cur()).toEqual([2, 0, 4, 2]);
    expect(h.cells.current()?.anchor).toEqual({ r: 2, c: 0 });
    h.click(h.center(1, 1));
    expect(h.cur()).toEqual([1, 1, 1, 1]);
  });

  it('화살표·Tab으로 옮기고 Esc로 풀며, 명령행에 친 글이 있으면 키를 보지 않는다', () => {
    const h = setup();
    h.click(h.center(2, 0));
    h.press('ArrowRight');
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    h.press('ArrowDown');
    expect(h.cur()).toEqual([3, 1, 4, 2]);
    h.press('ArrowDown');
    expect(h.cur()).toEqual([3, 1, 4, 2]);
    h.press('ArrowLeft');
    expect(h.cur()).toEqual([3, 0, 3, 0]);
    h.press('ArrowUp');
    h.press('Tab');
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    h.press('Tab', { shiftKey: true });
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    // 범위에서 화살표는 기준 셀에서 한 칸(범위를 접는다)
    h.click(h.center(4, 0), { shiftKey: true });
    expect(h.cur()).toEqual([2, 0, 4, 0]);
    h.press('ArrowRight');
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    // 마지막 셀의 Tab은 그대로(새 행은 도움말에 없다)
    h.click(h.center(4, 0));
    h.press('Tab');
    expect(h.cur()).toEqual([4, 0, 4, 0]);
    h.cmd.input.value = 'L';
    h.press('ArrowRight');
    expect(h.cur()).toEqual([4, 0, 4, 0]);
    h.cmd.input.value = '';
    h.press('Escape');
    expect(h.cur()).toBeNull();
    expect(h.view.overlay.cells).toEqual([]);
  });

  it('명령을 시작하거나 객체를 고르면 풀리고, 투명 명령(ZOOM 같은)은 그대로', async () => {
    const h = setup();
    h.app.register({ name: 'NOP', title: 'NOP', run: async () => undefined });
    h.app.register({ name: 'TZ', title: 'TZ', transparent: true, run: async () => undefined });
    h.click(h.center(2, 0));
    await h.app.run('TZ');
    expect(h.cur()).toEqual([2, 0, 2, 0]);
    await h.app.run('NOP');
    expect(h.cur()).toBeNull();
    h.click(h.center(2, 0));
    h.app.setSelection([h.handle]);
    expect(h.cur()).toBeNull();
    // 표가 지워지면(명령 취소 등) 고른 셀도 없다
    h.app.clearSelection();
    h.click(h.center(2, 0));
    const list = h.doc.blocks.get(MODEL_SPACE)!.entities;
    h.st.session.commit({ label: 'ERASE', ops: [{ kind: 'remove', block: MODEL_SPACE, entity: h.table(), index: list.indexOf(h.table()) }] });
    expect(h.cells.active()).toBe(false);
    expect(h.cells.overlay()).toEqual([]);
  });

  it('고른 셀에 글자를 치면 그 셀 내용을 그 글자로 바꾸며 제자리 편집기, 확인은 명령 취소 한 단계·Esc는 그대로', async () => {
    const h = setup();
    const before = structuredClone(h.data());
    h.click(h.center(2, 0));
    h.press('Z');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A3');
    expect(box()!.textContent!.replace(/​/g, '')).toBe('Z');
    expect(h.cur()).toBeNull();
    key('Enter', { ctrlKey: true });
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('Z');
    h.st.session.undo();
    expect(h.data()).toEqual(before);
    // 친 글자 그대로 확인(더 고치지 않아도 내용을 바꾼다), 여러 글자, 중괄호·역슬래시는 문자 그대로
    h.click(h.center(2, 1));
    h.press('{');
    await settle();
    typeInto('{a\\b}');
    key('Tab');
    await settle();
    expect(getText(h.data(), 2, 1)).toBe('\\{a\\\\b\\}');
    key('Escape');
    await settle();
    // Esc면 고른 셀 내용은 그대로
    h.click(h.center(2, 0));
    h.press('Q');
    await settle();
    key('Escape');
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('가');
    // Space·Ctrl 글자는 셀 편집기를 열지 않는다
    h.click(h.center(2, 0));
    h.press(' ');
    h.press('a', { ctrlKey: true });
    await settle();
    expect(box()).toBeNull();
  });

  it('고른 셀을 두 번 누르면 그 셀 제자리 편집기(셀 고르기는 풀린다)', async () => {
    const h = setup();
    h.click(h.center(2, 2));
    h.view.events.dblclick!(h.center(2, 2), h.center(2, 2), {} as MouseEvent);
    await settle();
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — C3');
    expect(h.cur()).toBeNull();
  });

  it('고르기·화살표는 도면을 바꾸지 않는다(객체·명령 취소 목록 같음), 고른 셀 입력 결과 = setText 결과이고 DXF R2018·DWG R2018·R2000 왕복도 같다', async () => {
    const h = setup();
    const snap = () => JSON.stringify(h.doc.blocks.get(MODEL_SPACE)!.entities);
    const ents0 = snap();
    const undo0 = h.st.session.undoTop();
    h.click(h.center(2, 0));
    h.press('ArrowRight');
    h.click(h.center(4, 2), { shiftKey: true });
    h.press('Escape');
    expect(snap()).toBe(ents0);
    expect(h.st.session.undoTop()).toBe(undo0);
    const want = setText(setText(h.data(), 3, 0, '일'), 3, 1, '이\\P줄');
    h.click(h.center(3, 0));
    h.press('일');
    await settle();
    key('Tab');
    await settle();
    const b = box()!;
    b.replaceChildren(...['이', '줄'].map((t) => Object.assign(document.createElement('p'), { className: 'te-p', textContent: t })));
    b.dispatchEvent(new InputEvent('input', { bubbles: true }));
    key('Enter', { ctrlKey: true });
    await settle();
    const got = h.data();
    expect(got.cells.map((c) => c.text)).toEqual(want.cells.map((c) => c.text));
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

  it('보기 모드(휴대폰 보기)에서는 셀을 고르지 않는다', () => {
    const h = setup();
    h.app.setViewOnly(true);
    h.click(h.center(2, 0));
    expect(h.cur()).toBeNull();
    expect(tableCellSelection(h.app)).toBe(h.cells);
  });
});

describe('TABLE 뒤 첫 셀 제자리 편집', () => {
  it('표를 놓으면 첫 셀(A1) 편집기, Tab으로 다음 셀, 넣은 표와 입력은 명령 취소 한 번', async () => {
    const h = setup();
    const n0 = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'ACAD_TABLE').length;
    const done = h.app.run('TABLE');
    await settle();
    // 테이블 삽입 대화상자: 열 2, 데이터 행 1
    const set = (label: string, v: string) => {
      const i = [...document.querySelectorAll('.dialog input')].find((x) => x.getAttribute('aria-label') === label) as HTMLInputElement;
      i.value = v;
    };
    set('열', '2');
    set('데이터 행', '1');
    (document.querySelector('.dialog footer .btn.primary') as HTMLElement).click();
    await settle();
    h.app.submitInput('200,0');
    await settle();
    expect(document.querySelectorAll('.dialog').length).toBe(0);
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A1');
    typeInto('제목');
    key('Tab');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A2');
    typeInto('머리');
    key('Enter', { ctrlKey: true });
    await settle();
    await done;
    const tabs = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is TableEntity => e.type === 'ACAD_TABLE');
    expect(tabs.length).toBe(n0 + 1);
    const t = tableFromEntity(tabs.at(-1)!, h.doc)!.data;
    expect([getText(t, 0, 0), getText(t, 1, 0), getText(t, 1, 1)]).toEqual(['제목', '머리', '']);
    expect(h.st.session.undoTop()?.label).toBe('TABLE');
    h.st.session.undo();
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'ACAD_TABLE').length).toBe(n0);
  });

  it('첫 셀에서 바로 Esc면 빈 표 그대로(예전 대화상자 취소와 같다)', async () => {
    const h = setup();
    const done = h.app.run('TABLE');
    await settle();
    (document.querySelector('.dialog footer .btn.primary') as HTMLElement).click();
    await settle();
    h.app.submitInput('200,0');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A1');
    key('Escape');
    await settle();
    await done;
    const t = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is TableEntity => e.type === 'ACAD_TABLE').at(-1)!;
    expect(tableFromEntity(t, h.doc)!.data.cells.every((c) => !c.text)).toBe(true);
    expect(h.st.session.undoTop()?.label).toBe('TABLE');
  });
});
