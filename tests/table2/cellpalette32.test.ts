// @vitest-environment jsdom
/**
 * 32차: 고른 표 셀의 특성 팔레트 — 내용 묶음(문자 높이·문자 색상).
 * 근거(우리말 요약):
 * - AutoCAD 도움말 "About Table Styles"(Mac): 셀 스타일의 문자 특성은 문자 스타일·높이·색이고, 셀마다 스타일을 재지정할 수 있으며,
 *   셀을 고르면 특성 창의 셀·내용 묶음에서 문자 서식을 바꾼다. "To Change the Properties of Cells in a Table": 고른 셀의 값을 특성 팔레트에서 바꾼다.
 * - ActiveX 참조 Table 객체: SetCellTextHeight·SetCellContentColor(셀마다의 문자 높이·내용 색).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MTextEntity } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { formatLength } from '../../src/core/units';
import { cellTextPlace } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { Palette } from '../../src/app/ui/palettes';
import { cellIndex } from '../../src/edit/table/model';
import { tableFromEntity } from '../../src/edit/table/entity';
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

/** 진짜 특성 팔레트(특성 탭)를 열고 앱의 refreshPalette에 잇는다(cellpalette31.test와 같다) */
function withPalette() {
  const h = setup();
  const host = document.createElement('div');
  document.body.append(host);
  const pal = new Palette(h.app, host);
  h.app.ui.refreshPalette = () => pal.refresh();
  pal.open('props');
  const body = () => pal.el.querySelector('.palette-body')!;
  const field = <T extends HTMLElement>(label: string) => body().querySelector<T>(`[aria-label="${label}"]`)!;
  const headings = () => [...body().querySelectorAll('.prop-group h4')].map((x) => x.textContent);
  const set = (label: string, v: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(label);
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };
  const options = (label: string) => [...field<HTMLSelectElement>(label).options].map((o) => o.textContent);
  /** 표 그림 블록의 셀 문자(MTEXT): 글, 높이, 색인 */
  const blockTexts = (): [string, number, number][] => {
    const b = h.doc.blocks.get(tableKey(h.table().block))!;
    return b.entities.filter((e): e is MTextEntity => e.type === 'MTEXT').map((e) => [e.text, e.height, e.color.aci]);
  };
  return { ...h, pal, body, field, headings, set, options, blockTexts };
}

describe('고른 셀의 특성 팔레트 — 내용(문자 높이·문자 색상)', () => {
  const COLORS = ['ByBlock', 'ByLayer', '빨간색', '노란색', '초록색', '하늘색', '파란색', '선홍색', '흰색', '색 선택...'];

  it('셀 하나: 셀 묶음 아래 내용 묶음, 문자 높이(표 좌표)·문자 색상(셀 스타일 값), 범위의 값이 다르면 *여러 개*', () => {
    const h = withPalette();
    h.click(h.center(2, 0));
    expect(h.headings()).toEqual(['셀 A3', '내용']);
    expect(h.field<HTMLInputElement>('문자 높이').value).toBe(formatLength(4.5, h.st.units));
    expect(h.field<HTMLSelectElement>('문자 색상').value).toBe('aci:0');
    expect(h.options('문자 색상')).toEqual(COLORS);
    // 제목 셀(병합 A1:C1)은 제목 셀 스타일의 높이
    h.click(h.center(0, 1));
    expect(h.headings()[0]).toBe('셀 A1');
    expect(h.field<HTMLInputElement>('문자 높이').value).toBe(formatLength(6, h.st.units));
    // 제목·머리글 범위: 높이가 달라 *여러 개*(빈 칸), 색은 같다
    h.click(h.center(1, 0), { shiftKey: true });
    expect(h.field<HTMLInputElement>('문자 높이').value).toBe('');
    expect(h.field<HTMLInputElement>('문자 높이').placeholder).toBe('*여러 개*');
    expect(h.field<HTMLSelectElement>('문자 색상').value).toBe('aci:0');
  });

  it('문자 높이: 고른 범위의 셀마다 재지정, 표 그림의 문자와 행 높이(준 높이는 그대로)가 따라오고, 확정 한 번·같은 값은 단계 없음·명령 취소로 처음', () => {
    const h = withPalette();
    const t0 = h.data();
    // A3:C3 — A3에 문자 "가"
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    h.set('문자 높이', '10');
    const t = h.data();
    expect([0, 1, 2].map((c) => t.cells[cellIndex(t, 2, c)]!.height)).toEqual([10, 10, 10]);
    expect(t.cells[cellIndex(t, 3, 0)]!.height).toBeUndefined();
    // 문자 높이 10 + 위아래 여백 3
    expect(t.rowHeights[2]).toBeCloseTo(13, 9);
    expect(t.baseRowHeights[2]).toBe(7.5);
    expect(h.blockTexts().find((x) => x[0] === '가')).toEqual(['가', 10, 0]);
    expect(h.st.session.undoTop()?.label).toBe('셀 문자 높이');
    expect(h.out().at(-1)).toBe('셀 문자 높이: 표 5행 3열');
    expect(h.cur()).toEqual([2, 0, 2, 2]);
    expect(h.field<HTMLInputElement>('문자 높이').value).toBe(formatLength(10, h.st.units));
    // 셀 편집기도 그 높이(표 그림의 셀 문자와 같은 자리·크기)
    const p = cellTextPlace(h.table(), t, tableFromEntity(h.table(), h.doc)!.style, 2, 0);
    expect(p.height).toBe(10);
    const top = h.st.session.undoTop();
    h.set('문자 높이', '10');
    expect(h.st.session.undoTop()).toBe(top);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    expect(h.blockTexts().find((x) => x[0] === '가')).toEqual(['가', 4.5, 0]);
  });

  it('문자 색상: 일곱 색·ByLayer·색 선택...(색 대화상자), 지금 색이 목록 밖이면 그 색, 표 그림의 셀 문자 색', async () => {
    const h = withPalette();
    h.click(h.center(2, 0));
    h.set('문자 색상', 'aci:1');
    expect(h.data().cells[cellIndex(h.data(), 2, 0)]!.color).toEqual({ aci: 1 });
    expect(h.blockTexts().find((x) => x[0] === '가')).toEqual(['가', 4.5, 1]);
    expect(h.st.session.undoTop()?.label).toBe('셀 문자 색상');
    expect(h.field<HTMLSelectElement>('문자 색상').value).toBe('aci:1');
    h.set('문자 색상', 'aci:256');
    expect(h.data().cells[cellIndex(h.data(), 2, 0)]!.color).toEqual({ aci: 256 });
    h.set('문자 색상', 'pick');
    await settle();
    const dlg = document.querySelector('.dialog')!;
    const aci = dlg.querySelector<HTMLInputElement>('input[aria-label="색인 번호"]')!;
    aci.value = '30';
    aci.dispatchEvent(new Event('change'));
    dlg.querySelector<HTMLButtonElement>('footer .btn.primary')!.click();
    await settle();
    expect(h.data().cells[cellIndex(h.data(), 2, 0)]!.color).toEqual({ aci: 30 });
    expect(h.field<HTMLSelectElement>('문자 색상').value).toBe('cur');
    expect(h.options('문자 색상')).toContain('색상 30');
    // A3:B3은 색이 달라 *여러 개*
    h.click(h.center(2, 1), { shiftKey: true });
    expect(h.field<HTMLSelectElement>('문자 색상').value).toBe('');
    expect(h.options('문자 색상')[0]).toBe('*여러 개*');
  });

  it('잘못된 높이는 알리고 원래 값으로, 잠긴 도면층은 알리고 바꾸지 않는다', () => {
    const h = withPalette();
    h.click(h.center(2, 0));
    const t0 = h.data();
    h.set('문자 높이', '0');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('0보다 큰 값을 입력하십시오.');
    expect(h.field<HTMLInputElement>('문자 높이').value).toBe(formatLength(4.5, h.st.units));
    h.doc.layers.get('0')!.locked = true;
    h.set('문자 높이', '8');
    h.set('문자 색상', 'aci:2');
    expect(h.data()).toEqual(t0);
    expect(h.out().at(-1)).toBe('객체가 잠긴 도면층에 있습니다.');
  });
});
