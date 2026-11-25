/**
 * 손가락·마우스로 연 메뉴도 초점을 메뉴 안으로 옮긴다(262차 — 252차 「보고 두 것」 (7), W3C APG 메뉴 단추 꼴, WCAG 2.2 2.4.3 초점 순서).
 * showMenu는 키보드로 연 메뉴(연 곳이 :focus-visible)만 첫 항목에 초점을 두었다 — 손가락·마우스·화면 읽기 프로그램의 두 번 톡(click)으로 연 메뉴는
 * 초점이 연 단추(누르기로 초점을 받지 않는 Safari·iOS에서는 그 앞 초점·없음)에 남아, 화면 읽기 사용자가 메뉴 안으로 들어가기 어려웠다.
 * 이제 누르기·오른쪽 클릭으로 연 메뉴도 첫 켜진 항목에 초점을 두고(보이는 표시는 :focus-visible 규칙대로), 닫으면(Esc·항목 고르기) 연 단추로 돌려준다 —
 * 단추로 여는 메뉴는 그 단추를 넘겨 받아, 누르기로 초점을 받지 않은 단추(이 시험 환경의 click도 같다)로도 돌아간다. 바깥 누르기로 닫으면 지금처럼 돌려주지 않는다.
 * 도면 영역 오른쪽 클릭 메뉴는 초점이 옮겨 가도 마우스 동작이 같다(다음 마우스 이동·메뉴 안 누르기가 메뉴를 닫지 않고, 항목 누르기는 그 항목).
 * 진짜 App·MobileView·상태 막대와 진짜 메뉴(showMenu), 화면·명령행·엔진·글꼴·토스트는 가짜(viewa11y253·254 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { closeMenu } from '../../src/app/ui/dom';
import { MobileView } from '../../src/app/ui/mobileview';
import { makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 메뉴는 진짜(열고 닫힐 때의 초점을 본다), 토스트만 가짜
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
  // 앞 시험이 그린 것(초점을 가진 단추 포함)을 치운다 — 초점은 body로
  document.getElementById('app')!.replaceChildren();
  dom.window.localStorage.clear();
});

const P = (x: number, y: number) => ({ x, y });
const menu = () => document.querySelector<HTMLElement>('.menu[role="menu"]');
const items = () => [...menu()!.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
/** 메뉴 항목의 이름(아이콘·단축키 글을 뺀 글 마디) */
const label = (b: Element) =>
  [...b.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('')
    .trim();
/** 지금 초점: 연 단추 'opener', 본문 'body', 메뉴 안이면 'menu:<항목 이름>' */
const where = (opener: Element) => {
  const a = document.activeElement;
  if (a === opener) return 'opener';
  if (a === document.body) return 'body';
  const m = menu();
  return m && a && m.contains(a) ? `menu:${label(a)}` : `other:${a?.tagName}`;
};
/** 키를 누른다: 초점이 메뉴 안이면 그 항목에(실제와 같다), 아니면(고치기 전 — 초점이 메뉴 밖) 메뉴에 */
const key = (k: string) => {
  const a = document.activeElement;
  const m = menu();
  (m && a && m.contains(a) ? a : m!).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

describe('손가락·마우스로 연 메뉴도 초점을 메뉴 안으로 옮기고, 닫으면 연 단추로 돌려준다(262차)', () => {
  it('휴대폰 보기 더 보기: 누르면 첫 항목, Esc·항목 고르기 뒤 더 보기 단추, 바깥 누르기는 지금처럼 돌려주지 않음', async () => {
    const h = makeApp();
    registerCommands(h.app);
    const root = document.getElementById('app')!;
    const opened: string[] = [];
    const mv = new MobileView(h.app, { openPalette: (t) => opened.push(t), closePalette() {}, modeChanged() {} }, root);
    root.append(mv.bar, mv.card);
    // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewa11y253 꼴)
    await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
    mv.apply(true);
    await settle();
    const more = mv.bar.lastElementChild as HTMLButtonElement;
    expect(more.classList.contains('vb-more')).toBe(true);
    const got: unknown[] = [where(more)];

    // 손가락으로 누른다(click — 단추는 초점을 받지 않는다: Safari·iOS와 같다). 바깥 누르기 지켜보기가 붙을 때까지 기다린다
    more.click();
    await settle();
    got.push(where(more), more.getAttribute('aria-expanded'));
    // Esc: 닫고 더 보기 단추로
    key('Escape');
    got.push(menu() === null, where(more), more.getAttribute('aria-expanded'));
    // 다시 열어 ↓로 옮긴 뒤 항목 고르기(문자 찾기 — 시트를 연다): 닫고 더 보기 단추로
    more.click();
    await settle();
    key('ArrowDown');
    got.push(where(more));
    items()
      .find((b) => label(b) === '문자 찾기')!
      .click();
    got.push(menu() === null, where(more), [...opened]);
    // 바깥 누르기: 닫기만 한다(돌려주지 않음 — 지금과 같다)
    more.click();
    await settle();
    document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    got.push(menu() === null, where(more));

    expect(got).toEqual(['body', 'menu:점 좌표 (ID)', 'true', true, 'opener', 'false', 'menu:문자 찾기', true, 'opener', ['find'], true, 'body']);
    h.app.cmd.watchers.clear();
  });

  it('데스크톱 상태 막대 「⋯」: 누르면 첫 항목, Esc·항목 고르기 뒤 「⋯」 단추', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    const status = document.createElement('div');
    document.getElementById('app')!.replaceChildren(status);
    // 셸 전체를 만들지 않고 상태 막대만 그린다(viewa11y254 꼴)
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, status, statusBtns: {}, refreshStatus() {} }) as unknown as { buildStatus(): void };
    sh.buildStatus();
    const more = status.querySelector<HTMLButtonElement>('button.status-more')!;
    // 좁은 창에서 넘친 것처럼: 격자 표시를 「⋯」 메뉴로 옮기고 「⋯」을 보인다
    status.querySelector<HTMLButtonElement>('button[aria-label="격자 표시 (F7)"]')!.classList.add('st-hidden');
    more.hidden = false;
    const got: unknown[] = [where(more)];

    more.click();
    await settle();
    got.push(where(more), more.getAttribute('aria-expanded'));
    key('Escape');
    got.push(menu() === null, where(more), more.getAttribute('aria-expanded'));
    // 항목 고르기(격자 표시 — 숨긴 단추를 누른 것과 같다)
    const gridOn = h.app.gridOn;
    more.click();
    await settle();
    items()[0]!.click();
    got.push(menu() === null, where(more), h.app.gridOn === !gridOn);

    expect(got).toEqual(['body', 'menu:격자 표시', 'true', true, 'opener', 'false', true, 'opener', true]);
  });

  it('도면 영역 오른쪽 클릭 메뉴: 첫 켜진 항목에 초점 — 다음 마우스 이동·메뉴 안 누르기는 메뉴를 닫지 않고, 항목을 누르면 그 항목(닫으면 본문 — 도면은 초점을 받지 않는다)', async () => {
    const h = makeApp();
    registerCommands(h.app);
    const pk = new FakePicker(h.doc);
    (h.app as unknown as { picker: () => unknown }).picker = () => pk;
    const ran: string[] = [];
    h.app.contextMenuProviders.push({ name: 'menufocus262', items: () => [{ label: '시험 항목', run: () => ran.push('run') }] });
    const mouse = (button: number) => ({ pointerType: 'mouse', button, shiftKey: false, ctrlKey: false, metaKey: false, clientX: 40, clientY: 30 }) as PointerEvent;

    // 명령이 없고 고른 것이 없는 오른쪽 클릭 = 기본 모드 메뉴(SHORTCUTMENU 11)
    h.view.events.context!(P(40, 30), P(40, 30), mouse(2));
    await settle();
    const m = menu()!;
    const first = m.querySelector<HTMLButtonElement>('button[role="menuitem"]:not([disabled])');
    const got: unknown[] = [m !== null, document.activeElement === first, m.contains(document.activeElement)];
    // 다음 마우스 이동(도면 위): 메뉴는 그대로, 초점도 그대로
    h.view.events.move!(P(60, 50), P(60, 50), mouse(0));
    got.push(menu() === m, document.activeElement === first);
    // 메뉴 안 누르기(pointerdown — 바깥 누르기 지켜보기)는 닫지 않는다
    const item = items().find((b) => label(b) === '시험 항목')!;
    item.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    got.push(menu() === m);
    // 누르면 그 항목을 고른다
    item.click();
    got.push(menu() === null, [...ran], document.activeElement === document.body);

    expect(got).toEqual([true, true, true, true, true, true, true, ['run'], true]);
  });
});
