// @vitest-environment jsdom
/**
 * 31차: 고른 표 셀의 특성 팔레트(행 높이·열 폭·정렬·배경 채우기).
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - "To Change the Properties of Cells in a Table": 셀 안을 눌러 고르고(Shift로 범위) 특성 팔레트에서 바꿀 값을 눌러 새 값을 넣는다.
 * - "About Table Styles"(Mac): 셀을 고르면 특성 창에 셀·내용 묶음이 보이고 테두리·문자 서식·셀 크기를 바꾼다.
 * - "Table Cell Ribbon Contextual Tab": 셀의 정렬, 배경색(없음·색·색 선택).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLength } from '../../src/core/units';
import { activeEditor } from '../../src/app/textedit/editor';
import { Palette } from '../../src/app/ui/palettes';
import { commitTable, readPicked } from '../../src/app/tablecmds';
import { cellIndex } from '../../src/edit/table/model';
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

/** 진짜 특성 팔레트(특성 탭)를 열고 앱의 refreshPalette에 잇는다 */
function withPalette() {
  const h = setup();
  const host = document.createElement('div');
  document.body.append(host);
  const pal = new Palette(h.app, host);
  h.app.ui.refreshPalette = () => pal.refresh();
  pal.open('props');
  const body = () => pal.el.querySelector('.palette-body')!;
  const field = <T extends HTMLElement>(label: string) => body().querySelector<T>(`[aria-label="${label}"]`)!;
  const title = () => body().querySelector('.prop-title')?.textContent ?? null;
  const heading = () => body().querySelector('.prop-group h4')?.textContent ?? null;
  const set = (label: string, v: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(label);
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };
  const options = (label: string) => [...field<HTMLSelectElement>(label).options].map((o) => o.textContent);
  return { ...h, pal, body, field, title, heading, set, options };
}

describe('고른 셀의 특성 팔레트', () => {
  it('셀 하나: 표 셀 · 셀 C3, 행 높이·열 폭(표 좌표)·정렬·배경 채우기. 다른 셀을 고르면 그 셀로, 셀을 풀면 예전처럼', () => {
    const h = withPalette();
    expect(h.body().textContent).toContain('선택한 객체가 없습니다');
    h.click(h.center(2, 2));
    expect(h.title()).toBe('표 셀');
    expect(h.heading()).toBe('셀 C3');
    expect(h.field<HTMLInputElement>('행 높이').value).toBe(formatLength(7.5, h.st.units));
    expect(h.field<HTMLInputElement>('열 폭').value).toBe(formatLength(40, h.st.units));
    expect(h.field<HTMLSelectElement>('정렬').value).toBe('9');
    expect(h.field<HTMLSelectElement>('배경 채우기').value).toBe('none');
    expect(h.options('배경 채우기')).toEqual(['없음', '빨간색', '노란색', '초록색', '하늘색', '파란색', '선홍색', '흰색', '색 선택...']);
    // 다른 셀(병합 셀 B4:C5는 이름이 기준 셀)
    h.click(h.center(3, 1));
    expect(h.heading()).toBe('셀 B4');
    h.press('Escape');
    expect(h.title()).toBeNull();
    expect(h.body().textContent).toContain('선택한 객체가 없습니다');
    // 표 객체를 고르면 객체 특성(셀 묶음은 표 객체의 것)
    h.app.setSelection([h.handle]);
    h.pal.refresh();
    expect(h.title()).not.toBe('표 셀');
  });

  it('여러 셀: 값이 다르면 *여러 개*, 바꾸면 고른 범위 모두(행 높이는 준 높이도), 확정 한 번, 같은 셀을 고른 채', () => {
    const h = withPalette();
    // B3 → Shift B4: 병합 B4:C5를 덮어 B3:C5
    h.click(h.center(2, 1));
    h.click(h.center(3, 1), { shiftKey: true });
    expect(h.heading()).toBe('셀 B3:C5');
    expect(h.field<HTMLSelectElement>('정렬').value).toBe('');
    expect(h.options('정렬')[0]).toBe('*여러 개*');
    const t0 = h.data();
    h.set('행 높이', '12');
    const t = h.data();
    expect(t.rowHeights).toEqual([9, 7.5, 12, 12, 12]);
    expect(t.baseRowHeights).toEqual([9, 7.5, 12, 12, 12]);
    expect(h.st.session.undoTop()?.label).toBe('행 높이');
    expect(h.cur()).toEqual([2, 1, 4, 2]);
    expect(h.field<HTMLInputElement>('행 높이').value).toBe(formatLength(12, h.st.units));
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    // 열 폭이 다르면 *여러 개*(빈 칸), 넣으면 범위의 열 모두
    const p = readPicked(h.app, h.handle, null)!;
    commitTable(h.app, p, { ...p.data, colWidths: [40, 30, 50] }, 'TABLECELL');
    h.cells.select(h.handle, { r: 2, c: 1 }, { r: 3, c: 1 });
    expect(h.field<HTMLInputElement>('열 폭').value).toBe('');
    expect(h.field<HTMLInputElement>('열 폭').placeholder).toBe('*여러 개*');
    // 비운 채 확정해도 바뀌지 않는다
    h.set('열 폭', '');
    expect(h.data().colWidths).toEqual([40, 30, 50]);
    h.set('열 폭', '45');
    expect(h.data().colWidths).toEqual([40, 45, 45]);
    expect(h.st.session.undoTop()?.label).toBe('열 폭');
    // 정렬
    h.set('정렬', '4');
    const ta = h.data();
    for (let r = 2; r <= 4; r++) for (let c = 1; c <= 2; c++) expect(ta.cells[cellIndex(ta, r, c)]!.align, `${r},${c}`).toBe(4);
    expect(ta.cells[cellIndex(ta, 2, 0)]!.align).toBeUndefined();
    expect(h.st.session.undoTop()?.label).toBe('셀 정렬');
    expect(h.field<HTMLSelectElement>('정렬').value).toBe('4');
    // 같은 값을 다시 넣으면 단계가 늘지 않는다
    const top = h.st.session.undoTop();
    h.set('정렬', '4');
    h.set('열 폭', formatLength(45, h.st.units));
    expect(h.st.session.undoTop()).toBe(top);
  });

  it('배경 채우기: 색을 고르면 범위의 셀 재지정, 색 선택...은 색 대화상자, 지금 색이 일곱 색 밖이면 그 색을 보인다', async () => {
    const h = withPalette();
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    h.set('배경 채우기', 'aci:3');
    const t = h.data();
    expect([0, 1, 2].map((c) => t.cells[cellIndex(t, 2, c)]!.fill)).toEqual([{ aci: 3 }, { aci: 3 }, { aci: 3 }]);
    expect(h.st.session.undoTop()?.label).toBe('셀 배경 채우기');
    expect(h.field<HTMLSelectElement>('배경 채우기').value).toBe('aci:3');
    h.set('배경 채우기', 'pick');
    await settle();
    const dlg = document.querySelector('.dialog')!;
    const aci = dlg.querySelector<HTMLInputElement>('input[aria-label="색인 번호"]')!;
    aci.value = '30';
    aci.dispatchEvent(new Event('change'));
    dlg.querySelector<HTMLButtonElement>('footer .btn.primary')!.click();
    await settle();
    expect(h.data().cells[cellIndex(h.data(), 2, 1)]!.fill).toEqual({ aci: 30 });
    expect(h.field<HTMLSelectElement>('배경 채우기').value).toBe('cur');
    expect(h.options('배경 채우기')).toContain('색상 30');
    // 없음
    h.set('배경 채우기', 'none');
    expect(h.data().cells[cellIndex(h.data(), 2, 1)]!.fill).toBeNull();
  });

  it('행 높이를 문자보다 낮게 넣으면 문자에 맞춰 다시 늘어나고(TABLECELL 행 높이와 같다), 같은 값을 다시 넣어도 단계가 늘지 않는다', () => {
    const h = withPalette();
    // A3에는 문자 "가"(자료 문자 높이 4.5 + 위아래 여백 3)
    h.click(h.center(2, 0));
    h.set('행 높이', '3');
    expect(h.data().baseRowHeights[2]).toBe(3);
    expect(h.data().rowHeights[2]).toBeCloseTo(7.5, 9);
    expect(h.field<HTMLInputElement>('행 높이').value).toBe(formatLength(7.5, h.st.units));
    const top = h.st.session.undoTop();
    expect(top?.label).toBe('행 높이');
    h.set('행 높이', '3');
    expect(h.st.session.undoTop()).toBe(top);
  });

  it('잘못된 값은 알리고 바꾸지 않는다, 잠긴 도면층도 알리고 바꾸지 않는다', () => {
    const h = withPalette();
    h.click(h.center(2, 0));
    const t0 = h.data();
    h.set('행 높이', '-1');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('0보다 큰 값을 입력하십시오.');
    expect(h.field<HTMLInputElement>('행 높이').value).toBe(formatLength(7.5, h.st.units));
    h.set('열 폭', '가');
    expect(h.data()).toEqual(t0);
    h.doc.layers.get('0')!.locked = true;
    h.set('행 높이', '20');
    h.set('배경 채우기', 'aci:1');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });
});
