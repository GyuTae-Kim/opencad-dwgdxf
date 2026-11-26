/**
 * 휴대폰 보기 모드의 도면층 시트는 켜고 끄기만(246차): 보기 모드는 그립·두 번 눌러 고치기·메뉴를 열지 않는데(README 휴대폰 보기 절),
 * 같은 도면층 팔레트(보이는 칸만 CSS로 숨김)를 쓰는 시트에서는 행 길게 누르기(안드로이드 contextmenu)가 이름 바꾸기·지우기 메뉴를,
 * 이름·행 두 번 누르기가 이름 고치기·현재 도면층 바꾸기를, 색 견본이 색 고르기를 열었고 시트 아래 안내도 데스크톱 글이었다.
 * 편집 화면(데스크톱·휴대폰 편집)의 팔레트는 그대로다. F1 도움말 조작 표 「터치」에는 길게 누르기(정밀 조준) 한 칸을 더한다.
 * 진짜 App·Palette, 화면·명령행·엔진·글꼴·메뉴·색 고르기는 가짜(viewmode-round4.test.ts·cellpalette31.test.ts와 같은 틀).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../src/app/ui/dom';
import { showMenu } from '../../src/app/ui/dom';
import { pickColor } from '../../src/app/ui/colorpick';
import { Palette } from '../../src/app/ui/palettes';
import { currentLayer } from '../../src/app/layers';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));
vi.mock('../../src/app/ui/colorpick', async (orig) => ({ ...(await orig<object>()), pickColor: vi.fn(async () => null) }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  dom.window.localStorage.clear();
  vi.mocked(showMenu).mockClear();
  vi.mocked(pickColor).mockClear();
});

const EDIT_HINT = '행을 두 번 누르면 현재 도면층이 되고, 이름을 두 번 누르면 이름을 바꿉니다. 오른쪽 클릭으로 더 많은 기능을 씁니다.';
const VIEW_HINT = '도면층 켜고 끄기';

/** 도면층 0(현재)·A, 진짜 도면층 팔레트를 앱의 refreshPalette에 잇는다(셸처럼) */
function setup() {
  const h = makeApp((doc) => {
    doc.layers.set('A', { ...structuredClone(doc.layers.get('0')!), name: 'A', handle: 'A0' });
  });
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const pal = new Palette(h.app, root);
  h.app.ui.refreshPalette = () => pal.refresh();
  /** 그 도면층의 행(팔레트가 다시 그리면 새 요소라 그때마다 찾는다) */
  const row = (name: string) => [...pal.el.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td.layer-name')?.textContent === name) as HTMLTableRowElement;
  const fire = (el: Element, type: string) => {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    el.dispatchEvent(e);
    return e;
  };
  /** 시트 아래 안내(팔레트 몸의 마지막 줄) */
  const hint = () => pal.el.querySelector('.palette-body')!.lastElementChild!.textContent;
  return { ...h, pal, row, fire, hint };
}

describe('보기 모드 도면층 시트는 켜고 끄기만(246차)', () => {
  it('보기 모드: 길게 누르기·오른쪽 클릭 메뉴, 이름·행 두 번 누르기, 색 고르기를 열지 않고 안내는 켜고 끄기 — 켜기 단추는 그대로', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    h.pal.open('layers');
    // 행 길게 누르기(안드로이드는 contextmenu): 메뉴가 없고 브라우저 메뉴도 뜨지 않는다
    const menu = h.fire(h.row('A'), 'contextmenu');
    expect(showMenu).not.toHaveBeenCalled();
    expect(menu.defaultPrevented).toBe(true);
    // 이름 두 번 누르기: 이름 고치기 칸이 없다
    h.fire(h.row('A').querySelector('td.layer-name')!, 'dblclick');
    expect(h.pal.el.querySelector('input.cell-input')).toBeNull();
    // 행 두 번 누르기: 현재 도면층(숨긴 칸)을 바꾸지 않는다
    h.fire(h.row('A').lastElementChild!, 'dblclick');
    expect(currentLayer(h.app)).toBe('0');
    // 색 견본: 색 고르기를 열지 않는다
    (h.row('A').children[4]!.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(pickColor).not.toHaveBeenCalled();
    // 도면을 고친 것이 없다(이름·현재 도면층·색 — 명령 취소 목록이 비어 있음)
    expect(h.st.session.undoTop()).toBeNull();
    // 시트 아래 안내는 보기 모드의 일(켜고 끄기)
    expect(h.hint()).toBe(VIEW_HINT);
    // 켜기 단추는 그대로 켜고 끈다
    (h.row('A').children[1]!.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(h.doc.layers.get('A')!.off).toBe(true);
    expect(h.st.session.undoTop()?.label).toBe('LAYER');
  });

  it('그대로인 갈래: 편집 화면의 메뉴·색 고르기·현재 도면층·이름 고치기·데스크톱 안내', async () => {
    const h = setup();
    h.pal.open('layers');
    expect(h.hint()).toBe(EDIT_HINT);
    const menu = h.fire(h.row('A'), 'contextmenu');
    expect(menu.defaultPrevented).toBe(true);
    expect(showMenu).toHaveBeenCalledTimes(1);
    const labels = (vi.mocked(showMenu).mock.calls[0]![2] as MenuItem[]).map((m) => m.label ?? '');
    expect(labels).toEqual(expect.arrayContaining(['현재 도면층으로', '이름 바꾸기', '색 바꾸기', '이 도면층만 켜기', '도면층 지우기']));
    (h.row('A').children[4]!.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(pickColor).toHaveBeenCalledTimes(1);
    h.fire(h.row('A').lastElementChild!, 'dblclick');
    expect(currentLayer(h.app)).toBe('A');
    // 이름 두 번 누르기: 그 칸이 이름 고치기 칸이 된다
    const name = h.row('A').querySelector('td.layer-name')!;
    h.fire(name, 'dblclick');
    expect(name.querySelector('input.cell-input')).not.toBeNull();
  });

  it('시트를 연 채 모드를 바꾸면 안내가 그 모드 것이고, 편집 화면으로 돌아오면 메뉴가 다시 열린다', async () => {
    const h = setup();
    h.pal.open('layers');
    expect(h.hint()).toBe(EDIT_HINT);
    h.app.setViewOnly(true);
    await settle();
    expect(h.hint()).toBe(VIEW_HINT);
    h.fire(h.row('A'), 'contextmenu');
    expect(showMenu).not.toHaveBeenCalled();
    h.app.setViewOnly(false);
    await settle();
    expect(h.hint()).toBe(EDIT_HINT);
    h.fire(h.row('A'), 'contextmenu');
    expect(showMenu).toHaveBeenCalledTimes(1);
  });
});

describe('F1 도움말 조작 표 「터치」(246차 · 276차)', () => {
  // 276차: 길게 누르기는 보기 모드와 명령이 점·객체를 물을 때만 정밀 조준이다(app.ts aimEnabled). 편집 화면 명령 밖은 안드로이드가 보내는
  // contextmenu로 바로 가기 메뉴(onContext)이고 iOS는 톡이라, 「길게 누르기 = 정밀 조준」만 적은 글이 넓었다. 도움말은 보기 모드에도 보인다
  it('길게 누르기(정밀 조준·그 밖에는 안드로이드 바로 가기 메뉴) 한 칸, 네 언어 사전에 있다', () => {
    const row = '한 손가락 = 이동, 두 손가락 = 확대·축소, 탭 = 선택, 길게 누르기 = 정밀 조준(보기 모드와 명령이 점·객체를 물을 때 — 그 밖에는 안드로이드 바로 가기 메뉴)';
    expect(readFileSync(new URL('../../src/editor.ts', import.meta.url), 'utf8')).toContain(`['터치', '${row}']`);
    for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
      const t = translate(row, lang);
      expect(t, lang).not.toBe(row);
      expect(t, lang).not.toMatch(/[가-힣]/);
      // 「탭」은 손가락 누르기(Tab 키가 아님)
      expect(t, lang).not.toMatch(/Tab/);
    }
    expect(translate(row, 'en')).toContain('press and hold');
    // 옛 줄(「길게 누르기 = 정밀 조준」으로 끝남)은 소스·사전에 남지 않는다
    const old = '한 손가락 = 이동, 두 손가락 = 확대·축소, 탭 = 선택, 길게 누르기 = 정밀 조준';
    expect(readFileSync(new URL('../../src/editor.ts', import.meta.url), 'utf8')).not.toContain(`'${old}'`);
    for (const lang of ['en', 'de', 'ja', 'zh-CN']) {
      const t = translate(row, lang);
      expect(t, lang).toContain('Android');
      expect(readFileSync(new URL(`../../site/locales/${lang}.json`, import.meta.url), 'utf8'), lang).not.toContain(`"${old}"`);
    }
  });
});
