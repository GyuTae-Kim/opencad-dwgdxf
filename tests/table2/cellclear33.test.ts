// @vitest-environment jsdom
/**
 * 33차: 셀 재지정 지우기(셀 메뉴 "특성 재지정 제거", 표 메뉴 "모든 특성 재지정 제거").
 * 근거(우리말 요약):
 * - AutoCAD 도움말 "To Change the Properties of Cells in a Table": 셀을 고르고(Shift로 범위) 오른쪽 누르기 → Remove Property Overrides로 기본값으로 되돌린다.
 * - "About Table Styles"(Mac): 표를 고르고 Remove All Property Overrides로 표의 특성을 표 스타일로 되돌린다.
 * - ActiveX 참조 Table 객체: RemoveAllOverrides(셀 하나의 재지정 모두), ClearTableStyleOverrides(셀 재지정 모두).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellIndex, clearOverrides, hasCellOverrides, mergeCells, rangeHasOverrides, setAlign, setFill, setText, setTextColor, setTextHeight } from '../../src/edit/table/model';
import { TABLE_APP, tableFromEntity } from '../../src/edit/table/entity';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDwg } from '../../src/io/dwg/writer/index';
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
/** 셀마다 재지정이 있는지(정렬·채우기·문자 높이·문자 색) */
const marks = (h: H) => h.data().cells.map((c) => (hasCellOverrides(c) ? 'o' : '-')).join('');
/** A3:C3에 채우기·문자 높이·문자 색 재지정 */
const decorate = (h: H) =>
  h.cells.edit('셀 서식', (d, g) => setTextColor(setTextHeight(setFill(d, g.r0, g.c0, g.r1, g.c1, { aci: 4 }), g.r0, g.c0, g.r1, g.c1, 8), g.r0, g.c0, g.r1, g.c1, { aci: 1 }));
/** 도면마다·쓸 때마다 다른 시각·GUID를 같게 둔다 */
const fixHeader = (h: H) => {
  for (const k of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) h.doc.header.set(k, 2461345.5);
  h.doc.header.set('$FINGERPRINTGUID', '{00000000-0000-0000-0000-000000000001}');
  h.doc.header.set('$VERSIONGUID', '{00000000-0000-0000-0000-000000000002}');
};
const files = (h: H) => [writeDxf(h.doc, { version: 'AC1032' }).data, writeDxf(h.doc, { version: 'AC1018' }).data, writeDwg(h.doc, { version: 'AC1032' }).data, writeDwg(h.doc, { version: 'AC1015' }).data];

describe('셀 재지정 지우기 자료', () => {
  it('clearOverrides: 범위(덮인 셀 포함)의 정렬·채우기·문자 높이·문자 색 재지정만 지우고 문자·병합·크기는 그대로, 지울 것이 없으면 null', () => {
    const h = setup();
    let t = h.data();
    t = setTextColor(setTextHeight(setFill(t, 2, 0, 4, 2, null), 3, 0, 4, 2, 9), 4, 0, 4, 0, { aci: 256 });
    // B4:C5 병합 — 덮인 셀(C4·B5·C5)에도 재지정이 있다
    expect(t.merges).toEqual([
      { row: 0, col: 0, rows: 1, cols: 3 },
      { row: 3, col: 1, rows: 2, cols: 2 },
    ]);
    expect(hasCellOverrides(t.cells[cellIndex(t, 4, 2)])).toBe(true);
    expect(hasCellOverrides({ text: 'x' })).toBe(false);
    expect(hasCellOverrides({ text: '', fill: null })).toBe(true);
    const c = clearOverrides(t, 3, 0, 4, 2)!;
    expect(c.cells.map((x) => (hasCellOverrides(x) ? 'o' : '-')).join('')).toBe('-'.repeat(6) + 'ooo' + '------');
    // C3 정렬(9)은 범위 밖이라 그대로, 문자·병합·행 높이·열 폭도 그대로
    expect(c.cells[cellIndex(c, 2, 2)]).toEqual({ text: '', fill: null, align: 9 });
    expect(c.cells.map((x) => x.text)).toEqual(t.cells.map((x) => x.text));
    expect([c.merges, c.rowHeights, c.baseRowHeights, c.colWidths]).toEqual([t.merges, t.rowHeights, t.baseRowHeights, t.colWidths]);
    expect(rangeHasOverrides(c, 3, 0, 4, 2)).toBe(false);
    expect(clearOverrides(c, 3, 0, 4, 2)).toBeNull();
    // 원본은 그대로
    expect(rangeHasOverrides(t, 3, 0, 4, 2)).toBe(true);
    // 표 전체
    const all = clearOverrides(t, 0, 0, t.rows - 1, t.cols - 1)!;
    expect(all.cells.every((x) => !hasCellOverrides(x))).toBe(true);
    expect(clearOverrides(setText(all, 0, 0, '새 제목'), 0, 0, 4, 2)).toBeNull();
    expect(clearOverrides(mergeCells(all, 2, 0, 2, 1)!, 0, 0, 4, 2)).toBeNull();
  });
});

describe('셀 메뉴의 특성 재지정 제거', () => {
  it('고른 범위에 재지정이 있으면 켜지고 없으면 꺼짐, 고르면 그 범위의 재지정을 지워 셀 스타일 값으로(확정 한 번, 같은 범위를 고른 채, 명령 취소로 되돌림)', () => {
    const h = setup();
    // A3은 재지정 없음 → 꺼짐, C3은 정렬 재지정 → 켜짐
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    expect(menuRows()!.at(-1)).toBe('특성 재지정 제거(꺼짐)');
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    expect(decorate(h)).toBe(true);
    expect(marks(h)).toBe('------ooo------');
    // 채우기·문자 높이로 그림과 행 높이가 바뀌었다(문자 "가"가 있는 3행이 8 + 3 = 11)
    expect(h.data().rowHeights[2]).toBeCloseTo(11, 9);
    const before = h.data();
    // B3만 골라 지운다
    h.click(h.center(2, 1));
    context(h, h.center(2, 1));
    expect(menuRows()!.at(-1)).toBe('특성 재지정 제거');
    clickMenu('특성 재지정 제거');
    expect(marks(h)).toBe('------o-o------');
    expect(h.st.session.undoTop()?.label).toBe('특성 재지정 제거');
    expect(h.out().at(-1)).toBe('특성 재지정 제거: 표 5행 3열');
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    context(h, h.center(2, 1));
    expect(menuRows()!.at(-1)).toBe('특성 재지정 제거(꺼짐)');
    h.st.session.undo();
    expect(h.data()).toEqual(before);
    // A3:C3(C3의 정렬 9 포함)을 모두 지우면 행 높이도 셀 스타일 문자에 맞춰 7.5로 돌아온다
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('특성 재지정 제거');
    expect(marks(h)).toBe('-'.repeat(15));
    expect(h.data().rowHeights[2]).toBeCloseTo(7.5, 9);
    expect(h.cur()).toEqual([2, 0, 2, 2]);
  });

  it('잠긴 도면층의 표는 알리고 바꾸지 않는다', () => {
    const h = setup();
    h.click(h.center(2, 2));
    const t0 = h.data();
    h.doc.layers.get('0')!.locked = true;
    context(h, h.center(2, 2));
    clickMenu('특성 재지정 제거');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });

  it('재지정을 넣었다 지운 표는 재지정 없이 같은 횟수로 고친 표와 DXF·DWG 저장 바이트가 같다', () => {
    // a: 같은 횟수(두 번)로 다시 그리며 C3의 정렬만 지운다 / b: A3:C3에 문자 높이·색(재지정만 — 표 그림의 객체 수가 같아 새 핸들 수도 같다)을 넣었다가
    // 셀 메뉴로 모두 지운다(C3 정렬 포함)
    const a = setup();
    a.click(a.center(2, 0));
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    expect(a.cells.edit('셀 정렬', (d) => setAlign(d, 2, 2, 2, 2, 0))).toBe(true);
    const b = setup();
    b.click(b.center(2, 0));
    b.click(b.center(2, 2), { shiftKey: true });
    expect(b.cells.edit('셀 서식', (d, g) => setTextColor(setTextHeight(d, g.r0, g.c0, g.r1, g.c1, 8), g.r0, g.c0, g.r1, g.c1, { aci: 1 }))).toBe(true);
    context(b, b.center(2, 0));
    clickMenu('특성 재지정 제거');
    expect(b.data()).toEqual(a.data());
    fixHeader(a);
    fixHeader(b);
    const fa = files(a);
    const fb = files(b);
    const firstDiff = (x: Uint8Array, y: Uint8Array) => {
      const lx = new TextDecoder().decode(x).split('\n');
      const ly = new TextDecoder().decode(y).split('\n');
      const k = lx.findIndex((s, i) => s !== ly[i]);
      return k < 0 && lx.length === ly.length ? '' : `${k}: ${lx[k - 1]?.trim()} | ${lx[k]?.trim()} != ${ly[k]?.trim()}`;
    };
    expect(firstDiff(fa[0]!, fb[0]!)).toBe('');
    for (let i = 0; i < fa.length; i++) expect(Buffer.from(fb[i]!).equals(Buffer.from(fa[i]!)), String(i)).toBe(true);
  });
});

describe('표 메뉴의 모든 특성 재지정 제거', () => {
  it('표 하나를 고른 메뉴: 재지정이 있으면 켜지고, 고르면 모든 셀의 재지정을 지운다(확정 한 번, 표는 고른 채)', () => {
    const h = setup();
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    expect(menuRows()).toEqual(expect.arrayContaining(['열 폭 같게(꺼짐)', '행 높이 같게', '모든 특성 재지정 제거']));
    const t0 = h.data();
    clickMenu('모든 특성 재지정 제거');
    expect(marks(h)).toBe('-'.repeat(15));
    expect(h.data().cells[cellIndex(t0, 2, 2)]!.align).toBeUndefined();
    expect(h.st.session.undoTop()?.label).toBe('모든 특성 재지정 제거');
    expect(h.out().at(-1)).toBe('모든 특성 재지정 제거: 표 5행 3열');
    expect([...h.st.selection]).toEqual([h.handle]);
    context(h, { x: 500, y: 500 });
    expect(menuRows()).toEqual(expect.arrayContaining(['모든 특성 재지정 제거(꺼짐)']));
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('32차 위험 정리: 확장 자료를 지운 앱 표(모든 셀이 셀 스타일과 같은 140·64 재지정)도 모든 특성 재지정 제거로 재지정 없는 표가 된다', () => {
    const h = setup();
    const t0 = h.data();
    // 이 앱이 쓴 DXF의 원본 태그(모든 셀에 플래그 0x08·0x20과 셀 스타일 값의 64·140)를 붙이고 확장 자료를 뗀 표
    const raw = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const before = h.table();
    const after: TableEntity = { ...before, raw, xdata: before.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
    h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: tableKey(MODEL_SPACE), before, after }] });
    const t1 = h.data();
    expect(t1.cells.every((c) => c.height !== undefined && c.color !== undefined)).toBe(true);
    expect(t1.cells.map((c) => c.text)).toEqual(t0.cells.map((c) => c.text));
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('모든 특성 재지정 제거');
    const t2 = h.data();
    expect(t2.cells.every((c) => !hasCellOverrides(c))).toBe(true);
    // C3의 정렬 재지정도 지워져, 처음 표에서 C3 정렬만 지운 것과 같다
    expect(t2).toEqual(setAlign(t0, 2, 2, 2, 2, 0));
    expect(tableFromEntity(h.table(), h.doc)!.data.cells.every((c) => c.height === undefined && c.color === undefined)).toBe(true);
  });
});
