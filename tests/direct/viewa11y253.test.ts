/**
 * 휴대폰 보기의 더 보기 메뉴 단추와 시트 탭이 상태를 알리는 것(253차 — WCAG 2.2 4.1.2 이름·역할·값).
 * (1) 더 보기(아이콘만)는 메뉴를 연다고 알리지 않았다 — 데스크톱 상태 막대 「⋯」(aria-haspopup="menu")과 같은 값을 두고,
 *     표 셀 「도구 더 보기」처럼 열림 상태(aria-expanded)를 메뉴가 열리고 닫힐 때마다 맞춘다.
 * (2) 시트 탭(특성·도면층·치수·찾기 — 데스크톱 오른쪽 팔레트와 같은 코드)은 role=tab뿐이라 어느 탭을 골랐는지 알리지 않았다 —
 *     리본 탭 꼴(aria-selected·aria-controls, 몸은 tabpanel·고른 탭 이름)로 맞춘다. 보이는 화면(class active)·Tab 차례는 그대로.
 * 진짜 App·MobileView·Palette와 진짜 메뉴(showMenu), 화면·명령행·엔진·글꼴·토스트는 가짜(viewmode-round4·viewlayers246 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { closeMenu, showMenu } from '../../src/app/ui/dom';
import { MobileView } from '../../src/app/ui/mobileview';
import { Palette } from '../../src/app/ui/palettes';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 메뉴는 진짜(열고 닫힐 때의 상태를 본다), 토스트만 가짜
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // showMenu가 연 곳(document.activeElement instanceof HTMLElement)을 본다
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
});
afterAll(() => {
  closeMenu();
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  closeMenu();
  dom.window.localStorage.clear();
});

describe('더 보기 단추는 메뉴를 연다고 알리고 열림 상태를 알린다(253차)', () => {
  it('aria-haspopup="menu"(데스크톱 「⋯」과 같은 값), aria-expanded는 열면 true — Esc·항목 고르기·바깥 누르기·다른 메뉴로 닫히면 false', async () => {
    const h = makeApp();
    registerCommands(h.app);
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const opened: string[] = [];
    const mv = new MobileView(h.app, { openPalette: (t) => opened.push(t), closePalette() {}, modeChanged() {} }, root);
    root.append(mv.bar, mv.card);
    // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewa11y252 꼴)
    await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
    mv.apply(true);
    await settle();
    const more = mv.bar.lastElementChild as HTMLButtonElement;
    expect(more.classList.contains('vb-more')).toBe(true);
    // 이름·제목 풍선은 그대로(252차)
    expect(more.getAttribute('aria-label')).toBe('더 보기: 좌표·찾기·참조 파일·보기 링크');
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    const menu = () => document.querySelector<HTMLElement>('.menu[role="menu"]');
    const items = () => [...menu()!.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
    /** 단추를 누르고, 메뉴의 바깥 누르기 지켜보기가 붙을 때까지 기다린다 */
    const open = async () => {
      more.click();
      await settle();
      expect(menu()).not.toBeNull();
      expect(more.getAttribute('aria-expanded')).toBe('true');
    };

    // Esc로 닫기
    await open();
    expect(items()).toHaveLength(4);
    menu()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    // 항목 고르기(문자 찾기 — 시트를 연다)
    await open();
    items().find((b) => b.textContent?.includes('문자 찾기'))!.click();
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(opened).toEqual(['find']);

    // 바깥 누르기
    await open();
    document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    // 다른 메뉴가 열리면(그 메뉴가 이 메뉴를 닫는다) false, 다시 열면 true
    await open();
    showMenu(0, 0, [{ label: '다른 메뉴', run() {} }]);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(menu()!.textContent).toContain('문자 찾기');
    closeMenu();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    h.app.cmd.watchers.clear();
  });
});

describe('시트 탭은 고른 탭을 알린다 — 리본 탭 꼴(253차)', () => {
  it('보기 모드 시트: aria-selected는 고른 탭 하나, 탭 ↔ 몸(tabpanel) 이음 — 보이는 표시·Tab 차례 그대로, 데스크톱 팔레트도 같은 코드', () => {
    const h = makeApp();
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const pal = new Palette(h.app, root);
    h.app.ui.refreshPalette = () => pal.refresh();
    const tabs = () => [...pal.el.querySelectorAll<HTMLButtonElement>('.palette-tabs > button')];
    const selected = () => tabs().map((b) => b.getAttribute('aria-selected'));
    const body = pal.el.querySelector<HTMLElement>('.palette-body')!;

    h.app.setViewOnly(true);
    pal.open('layers');
    expect(pal.el.querySelector('.palette-tabs')!.getAttribute('role')).toBe('tablist');
    expect(tabs().map((b) => b.textContent)).toEqual(['특성', '도면층', '치수', '찾기']);
    expect(tabs().every((b) => b.getAttribute('role') === 'tab')).toBe(true);
    expect(selected()).toEqual(['false', 'true', 'false', 'false']);
    // 보이는 표시는 그대로(class active 하나), Tab 차례도 그대로(tabindex를 두지 않는다 — 로빙 tabindex는 넣지 않음)
    expect(tabs().map((b) => b.classList.contains('active'))).toEqual([false, true, false, false]);
    expect(tabs().some((b) => b.hasAttribute('tabindex'))).toBe(false);
    // 탭 ↔ 몸: 탭마다 겹치지 않는 id와 aria-controls(몸 id), 몸은 tabpanel이고 고른 탭이 이름(리본 ribbon-panel 꼴)
    const ids = tabs().map((b) => b.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids.every((x) => x.length > 0)).toBe(true);
    expect(body.getAttribute('role')).toBe('tabpanel');
    expect(body.id).not.toBe('');
    expect(tabs().map((b) => b.getAttribute('aria-controls'))).toEqual([body.id, body.id, body.id, body.id]);
    expect(body.getAttribute('aria-labelledby')).toBe(tabs()[1]!.id);

    // 탭을 누르면 고른 상태가 옮겨 간다
    tabs()[2]!.click();
    expect(selected()).toEqual(['false', 'false', 'true', 'false']);
    expect(tabs().map((b) => b.classList.contains('active'))).toEqual([false, false, true, false]);
    expect(body.getAttribute('aria-labelledby')).toBe(tabs()[2]!.id);

    // 데스크톱(편집 화면) 팔레트도 같은 코드라 함께 맞춰진다
    h.app.setViewOnly(false);
    pal.open('layers');
    expect(selected()).toEqual(['false', 'true', 'false', 'false']);
    expect(body.getAttribute('aria-labelledby')).toBe(tabs()[1]!.id);
  });
});
