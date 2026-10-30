// @vitest-environment jsdom
/**
 * 27차: 표 셀 제자리 편집. 근거(AutoCAD 도움말 "About Adding Text and Blocks to Tables", 우리말 요약): 셀을 두 번 눌러 그 셀의 문자를 고치고,
 * 다음 셀로는 Tab으로 가며 셀 안의 화살표는 커서를 옮긴다. 줄이 늘면 그 행의 높이가 늘어난다. TABLEDIT — 셀을 골라 그 자리에서 입력한다.
 * 편집기 자리는 표 그림의 셀 MTEXT와 같고, 고친 결과는 예전 대화상자(setText → commitTable)와 같은 표 자료라 DXF·DWG 왕복도 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MTextEntity, TableEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { cellTextPlace, editTableAt, editTableCellAt, registerTableEditCommands, tabCell } from '../../src/app/tablecmds';
import { registerTextCommands } from '../../src/app/textedit/commands';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellIndex, cellRect, createTable, getText, mergeCells, setAlign, setText } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { tableBlockEntities } from '../../src/edit/table/geometry';
import { tableFromEntity } from '../../src/edit/table/entity';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

const DEG = Math.PI / 180;

/** 3열 표(제목·머리글·자료 3행), B4:C5 병합. 삽입점 (10, 100), 방향 rot */
function setup(rot = 0) {
  const h = makeApp();
  registerTableEditCommands(h.app);
  registerTextCommands(h.app);
  // 시험의 가짜 글꼴로는 배치하지 못한다: 줄 수만 대략(행 높이 맞춤)
  h.app.text.layoutMText = ((p: { height: number; text: string }) => {
    const lines = p.text.split('\\P').length;
    return { glyphs: [], lines: [], minX: 0, minY: -p.height - (lines - 1) * p.height * (5 / 3), maxX: p.text.length * p.height, maxY: 0 };
  }) as never;
  const nh = () => h.st.session.newHandle();
  const ts = defaultTableStyle(true, '공정표');
  ts.hMargin = 1;
  const saved = saveTableStyleOps(h.doc, nh, ts);
  h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
  let t = createTable({ cols: 3, colWidth: 40, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts);
  t = setText(t, 0, 0, '공정 일정');
  t = setText(t, 2, 0, '가');
  t = mergeCells(t, 3, 1, 4, 2)!;
  t = setAlign(t, 2, 2, 2, 2, 9);
  const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data: t, style: ts, styleHandle: saved.handle, insert: { x: 10, y: 100, z: 0 }, rotation: rot, props: { ...entityDefaults() } });
  h.st.session.commit({ label: 'TABLE', ops: added.ops });
  const handle = added.table.handle;
  const table = () => h.doc.entityIndex.get(handle) as TableEntity;
  const data = () => tableFromEntity(table(), h.doc)!.data;
  return { ...h, handle, table, data, ts };
}

const box = () => document.querySelector('.te-box') as HTMLElement | null;
/** 열린 편집기의 글을 바꾸고 입력 이벤트 */
function typeInto(t: string): void {
  const b = box()!;
  const span = b.querySelector('.te-r');
  if (span) span.firstChild!.nodeValue = t;
  else b.firstElementChild!.replaceChildren(document.createTextNode(t));
  b.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
function key(k: string, opt: KeyboardEventInit = {}): void {
  box()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opt }));
}
/** 셀 (r, c) 가운데의 도면 점(돌지 않은 표, 삽입점 (10, 100)) */
const center = (h: ReturnType<typeof setup>, r: number, c: number) => {
  const q = cellRect(h.data(), r, c, h.ts.flow);
  return { x: 10 + (q.x0 + q.x1) / 2, y: 100 + (q.y0 + q.y1) / 2 };
};

describe('셀 문자 자리와 Tab 차례(순수 함수)', () => {
  it('편집기 자리는 표 그림의 셀 MTEXT와 같은 부착점·폭·높이(돌린 표는 표 방향)', () => {
    for (const rot of [0, 30 * DEG]) {
      const h = setup(rot);
      const e = h.table();
      const t = setText(h.data(), 2, 2, '오른쪽 아래');
      const rt = tableFromEntity(e, h.doc)!;
      const mts = tableBlockEntities(t, rt.style).filter((x): x is MTextEntity => x.type === 'MTEXT');
      const mt = mts.find((m) => m.text === '오른쪽 아래')!;
      const pl = cellTextPlace(e, t, rt.style, 2, 2);
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      expect(pl.at.x).toBeCloseTo(10 + mt.insert.x * c - mt.insert.y * s, 9);
      expect(pl.at.y).toBeCloseTo(100 + mt.insert.x * s + mt.insert.y * c, 9);
      expect(pl.attachment).toBe(9);
      expect(pl.width).toBeCloseTo(mt.width, 12);
      expect(pl.height).toBe(mt.height);
      expect(pl.textStyle).toBe(mt.style);
      expect(pl.rotation).toBeCloseTo(rot, 12);
    }
  });

  it('Tab은 왼쪽에서 오른쪽·위에서 아래, 병합 셀은 한 칸, 끝이면 없음', () => {
    const h = setup();
    const t = h.data();
    // 0행은 제목(모든 열 병합)
    expect(tabCell(t, 0, 0, false)).toEqual({ r: 1, c: 0 });
    expect(tabCell(t, 0, 2, true)).toBeNull();
    expect(tabCell(t, 1, 2, false)).toEqual({ r: 2, c: 0 });
    expect(tabCell(t, 3, 0, false)).toEqual({ r: 3, c: 1 });
    expect(tabCell(t, 3, 1, false)).toEqual({ r: 4, c: 0 });
    // 병합에 덮인 셀(C5)은 병합 셀(B4)의 차례
    expect(tabCell(t, 4, 2, true)).toEqual({ r: 3, c: 0 });
    expect(tabCell(t, 4, 0, true)).toEqual({ r: 3, c: 1 });
    expect(tabCell(t, 4, 0, false)).toBeNull();
  });
});

describe('두 번 누르기: 셀 자리의 제자리 편집기', () => {
  it('셀 안을 두 번 누르면 그 셀 편집기, Tab으로 다음 셀, Ctrl+Enter로 끝 — 명령 취소 한 단계로 둘 다 되돌린다', async () => {
    const h = setup();
    const before = structuredClone(h.data());
    // A3(2행 0열) 가운데
    void editTableAt(h.app, h.handle, center(h, 2, 0));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A3');
    expect(box()!.textContent).toBe('가');
    // 셀 문자는 표 스타일을 따르므로 문자 스타일·높이 칸이 없다
    expect(document.querySelector('.te-bar [aria-label="문자 스타일"]')).toBeNull();
    typeInto('첫째');
    key('Tab');
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('첫째');
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    typeInto('둘째');
    key('Enter', { ctrlKey: true });
    await settle();
    expect(box()).toBeNull();
    expect(getText(h.data(), 2, 1)).toBe('둘째');
    h.st.session.undo();
    expect(h.data()).toEqual(before);
  });

  it('Shift+Tab은 이전 셀, 마지막 셀의 Tab은 확인하고 끝', async () => {
    const h = setup();
    void editTableAt(h.app, h.handle, { x: 300, y: -1000 });
    await settle();
    expect(box()).toBeNull(); // 셀 밖: 표 전체 대화상자
    expect(document.querySelectorAll('.dialog textarea').length).toBeGreaterThan(5);
    document.querySelectorAll('.dialog footer .btn').forEach((b) => (b.textContent === '취소' ? (b as HTMLElement).click() : null));
    await settle();
    void editTableAt(h.app, h.handle, center(h, 4, 0));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A5');
    key('Tab', { shiftKey: true });
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B4');
    key('Tab');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A5');
    typeInto('끝 셀');
    key('Tab');
    await settle();
    expect(box()).toBeNull();
    expect(getText(h.data(), 4, 0)).toBe('끝 셀');
  });

  it('Esc는 지금 셀만 버리고 끝(앞에서 Tab으로 확인한 셀은 남는다)', async () => {
    const h = setup();
    void editTableAt(h.app, h.handle, center(h, 1, 0));
    await settle();
    typeInto('머리');
    key('Tab');
    await settle();
    typeInto('버릴 글');
    key('Escape');
    await settle();
    expect(box()).toBeNull();
    expect(getText(h.data(), 1, 0)).toBe('머리');
    expect(getText(h.data(), 1, 1)).toBe('');
  });

  it('여러 줄이면 그 행이 높아지고, 고치지 않은 셀은 표를 바꾸지 않는다', async () => {
    const h = setup();
    const top = h.st.session.undoTop();
    const h0 = h.data().rowHeights[2]!;
    void editTableAt(h.app, h.handle, center(h, 2, 0));
    await settle();
    key('Tab');
    await settle();
    key('Escape');
    await settle();
    expect(h.st.session.undoTop()).toBe(top);
    void editTableAt(h.app, h.handle, center(h, 2, 0));
    await settle();
    // 문단 셋(\P 둘)
    const b = box()!;
    b.replaceChildren(...['하나', '둘', '셋'].map((t) => Object.assign(document.createElement('p'), { className: 'te-p', textContent: t })));
    b.dispatchEvent(new InputEvent('input', { bubbles: true }));
    key('Enter', { ctrlKey: true });
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('하나\\P둘\\P셋');
    expect(h.data().rowHeights[2]!).toBeGreaterThan(h0);
  });

  it('도구 모음의 "모든 셀"은 지금 셀을 확인하고 표 전체 셀 대화상자', async () => {
    const h = setup();
    void editTableAt(h.app, h.handle, center(h, 2, 0));
    await settle();
    typeInto('먼저');
    const all = [...document.querySelectorAll('.te-bar button')].find((b) => b.textContent === '모든 셀') as HTMLButtonElement;
    expect(all).toBeTruthy();
    all.click();
    await settle();
    expect(box()).toBeNull();
    expect(getText(h.data(), 2, 0)).toBe('먼저');
    const tas = document.querySelectorAll('.dialog textarea');
    expect(tas.length).toBeGreaterThan(5);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('셀 A3');
    document.querySelectorAll('.dialog footer .btn').forEach((x) => (x.textContent === '취소' ? (x as HTMLElement).click() : null));
    await settle();
  });

  it('객체가 잡히지 않은 빈 셀 안을 두 번 누르면(editTableCellAt) 그 셀, 표 밖이나 꺼진 도면층의 표는 아무것도 않는다', async () => {
    const h = setup();
    expect(await editTableCellAt(h.app, { x: 300, y: 300 })).toBe(false);
    void editTableCellAt(h.app, center(h, 2, 1));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    expect([...h.st.selection]).toEqual([h.handle]);
    key('Escape');
    await settle();
    h.doc.layers.get('0')!.off = true;
    expect(await editTableCellAt(h.app, center(h, 2, 1))).toBe(false);
    expect(box()).toBeNull();
  });

  it('잠긴 도면층의 표는 열지 않는다', async () => {
    const h = setup();
    h.doc.layers.get('0')!.locked = true;
    await editTableAt(h.app, h.handle, center(h, 2, 0));
    expect(box()).toBeNull();
    expect(h.out().some((t) => t.includes('잠긴 도면층'))).toBe(true);
  });
});

describe('저장 결과는 예전 대화상자 편집과 같다', () => {
  it('제자리 편집 뒤 표 자료 = setText로 고친 표 자료, DXF R2018·DWG R2018·R2000 왕복도 같다', async () => {
    const h = setup();
    const want = setText(setText(h.data(), 2, 0, '첫째'), 2, 1, '둘째\\P줄');
    void editTableAt(h.app, h.handle, center(h, 2, 0));
    await settle();
    typeInto('첫째');
    key('Tab');
    await settle();
    const b = box()!;
    b.replaceChildren(...['둘째', '줄'].map((t) => Object.assign(document.createElement('p'), { className: 'te-p', textContent: t })));
    b.dispatchEvent(new InputEvent('input', { bubbles: true }));
    key('Enter', { ctrlKey: true });
    await settle();
    const got = h.data();
    expect(got.cells.map((c) => c.text)).toEqual(want.cells.map((c) => c.text));
    expect(got.cells[cellIndex(got, 2, 2)]!.align).toBe(9);
    for (const [name, bytes] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(h.doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(bytes, name);
      const te = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE');
      expect(te, name).toBeDefined();
      expect(tableFromEntity(te!, back)!.data, name).toEqual(got);
    }
  });
});
