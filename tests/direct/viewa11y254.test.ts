/**
 * 휴대폰 보기 재기 단추의 「재는 중」과 데스크톱 상태 막대 「⋯」의 열림 상태(254차 — WCAG 2.2 4.1.2 이름·역할·값: 상태는 프로그램으로 읽혀야 함).
 * (1) 재기 단추(거리·반지름·각도·면적)는 재는 동안 모양(class on)으로만 눌린 상태를 보였다(252차 보고 (5)) — 스냅 칩과 같은 aria-pressed로
 *     재는 동안 true, 끝나면(결과·Esc·다른 재기로 바뀜) false. 켜짐 상태가 없는 다른 보기 단추(전체 보기·도면층·치수·더 보기)에는 두지 않는다.
 * (2) 데스크톱 상태 막대 「⋯」은 aria-haspopup만 있었다(253차 보고 (2)) — 253차 휴대폰 더 보기와 같은 꼴로 aria-expanded(처음 false,
 *     메뉴가 열리면 true, 닫히면 — Esc·항목 고르기·바깥 누르기·다른 메뉴 — showMenu onClose로 false).
 * 보이는 화면(class on·메뉴)은 그대로. 진짜 App·MobileView·명령과 진짜 메뉴(showMenu), 화면·명령행·엔진·글꼴·토스트는 가짜
 * (viewa11y253·measurecard 꼴). 상태 막대는 셸 전체를 만들지 않고 그 부분만 그린다(viewprops247 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { closeMenu, showMenu } from '../../src/app/ui/dom';
import { MobileView } from '../../src/app/ui/mobileview';
import { makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
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
  // showMenu가 연 곳(document.activeElement instanceof HTMLElement)을, 「⋯」 메뉴가 숨긴 항목(instanceof HTMLButtonElement)을 보고
  // 고른 항목을 MouseEvent click으로 그 단추에 보낸다
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
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

const P = (x: number, y: number) => ({ x, y });
const ev = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;

describe('휴대폰 보기 재기 단추는 재는 동안 눌린 상태를 알린다(254차 — 252차 보고 (5))', () => {
  it('거리·반지름·각도·면적: aria-pressed는 재는 동안 true, 끝나면(결과·Esc·다른 재기) false — class on과 같고, 다른 보기 단추에는 없다', async () => {
    const h = makeApp();
    registerCommands(h.app);
    const pk = new FakePicker(h.doc);
    (h.app as unknown as { picker: () => unknown }).picker = () => pk;
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
    root.append(mv.bar, mv.card);
    // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewa11y252·253 꼴)
    await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
    mv.apply(true);
    await settle();
    const tap = (p: { x: number; y: number }) => h.view.events.click!(p, p, ev);

    const btns = [...mv.bar.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns.map((b) => b.querySelector('.vb-lbl')?.textContent ?? '')).toEqual(['전체 보기', '거리', '반지름', '각도', '면적', '도면층', '치수', '']);
    const measures = btns.slice(1, 5);
    const others = [btns[0]!, ...btns.slice(5)];
    const pressed = () => measures.map((b) => b.getAttribute('aria-pressed'));
    /** 보이는 눌림 표시(class on) — aria-pressed와 늘 같아야 한다 */
    const shown = () => measures.map((b) => (b.classList.contains('on') ? 'true' : 'false'));
    const OFF = ['false', 'false', 'false', 'false'];

    // 처음: 재기 넷은 false, 켜짐 상태가 없는 단추(전체 보기·도면층·치수·더 보기)에는 aria-pressed를 두지 않는다
    expect(pressed()).toEqual(OFF);
    expect(shown()).toEqual(OFF);
    expect(others.some((b) => b.hasAttribute('aria-pressed'))).toBe(false);

    // 거리: 재는 동안 true, 두 점을 찍어 끝나면 false
    measures[0]!.click();
    await settle();
    expect(h.app.busyCommand).toBe('DIST');
    expect(pressed()).toEqual(['true', 'false', 'false', 'false']);
    expect(shown()).toEqual(pressed());
    tap(P(10, 10));
    await settle();
    tap(P(40, 50));
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(mv.card.classList.contains('is-result')).toBe(true);
    expect(pressed()).toEqual(OFF);
    expect(shown()).toEqual(OFF);

    // 반지름(MEASUREGEOM으로 돈다): 재는 동안 true, Esc로 그만두면 false
    measures[1]!.click();
    await settle();
    expect(h.app.busyCommand).toBe('MEASUREGEOM');
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
    expect(shown()).toEqual(pressed());
    h.app.cmd.escape();
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(pressed()).toEqual(OFF);
    expect(shown()).toEqual(OFF);

    // 각도를 재는 중에 면적을 누르면(앞 명령을 취소하고 새로 잰다) 각도는 false, 면적이 true
    measures[2]!.click();
    await settle();
    expect(h.app.busyCommand).toBe('MEASUREANGLE');
    expect(pressed()).toEqual(['false', 'false', 'true', 'false']);
    expect(shown()).toEqual(pressed());
    measures[3]!.click();
    await settle();
    expect(h.app.busyCommand).toBe('AREA');
    expect(pressed()).toEqual(['false', 'false', 'false', 'true']);
    expect(shown()).toEqual(pressed());
    h.app.cmd.escape();
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(pressed()).toEqual(OFF);
    expect(shown()).toEqual(OFF);
    expect(others.some((b) => b.hasAttribute('aria-pressed'))).toBe(false);
    h.app.cmd.watchers.clear();
  });
});

describe('데스크톱 상태 막대 「⋯」은 열림 상태를 알린다(254차 — 253차 보고 (2))', () => {
  it('aria-haspopup="menu" 그대로, aria-expanded는 처음 false — 열면 true, Esc·항목 고르기·바깥 누르기·다른 메뉴로 닫히면 false', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    const status = document.createElement('div');
    document.getElementById('app')!.replaceChildren(status);
    // 셸 전체를 만들지 않고 상태 막대만 그린다(buildStatus는 앱·상태 막대 칸·단추 표만 쓴다 — 켜짐 표시 맞추기는 빈 함수로)
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, status, statusBtns: {}, refreshStatus() {} }) as unknown as { buildStatus(): void };
    sh.buildStatus();
    const more = status.querySelector<HTMLButtonElement>('button.status-more')!;
    expect(more.textContent).toBe('⋯');
    expect(more.getAttribute('aria-label')).toBe('상태 막대의 나머지 항목');
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    // 좁은 창에서 넘친 것처럼(fitStatus 꼴): 격자 표시를 「⋯」 메뉴로 옮기고 「⋯」을 보인다
    const grid = status.querySelector<HTMLButtonElement>('button[aria-label="격자 표시 (F7)"]')!;
    grid.classList.add('st-hidden');
    more.hidden = false;

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
    expect(items().map((b) => b.textContent?.trim())).toEqual(['격자 표시']);
    menu()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    // 항목 고르기(격자 표시 — 숨긴 단추를 누른 것과 같다)
    const gridOn = h.app.gridOn;
    await open();
    items()[0]!.click();
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(h.app.gridOn).toBe(!gridOn);

    // 바깥 누르기
    await open();
    document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    expect(menu()).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    // 다른 메뉴가 열리면(그 메뉴가 이 메뉴를 닫는다) false, 다시 열면 true
    await open();
    showMenu(0, 0, [{ label: '다른 메뉴', run() {} }]);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    closeMenu();
    await open();
    closeMenu();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });
});
