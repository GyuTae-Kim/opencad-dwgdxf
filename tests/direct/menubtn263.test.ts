/**
 * 메뉴 단추 넷의 aria-haspopup·aria-expanded와 꺼진 항목뿐인 메뉴(263차 — 262차 「보고 두 것」 (1)·(2), W3C APG 메뉴 단추 꼴, WCAG 2.2 4.1.2·2.1.1).
 * (나) 응용프로그램 메뉴 A·리본 펼침 단추·객체 스냅 「▾」·주석 축척 단추는 메뉴를 연다고 알리지 않았다 — 253차 휴대폰 더 보기·254차 상태 막대 「⋯」 꼴로
 *     aria-haspopup="menu"와 aria-expanded(처음 false, 열면 true, 어떻게 닫히든 — Esc·항목 고르기·바깥 누르기·다른 메뉴 — showMenu onClose로 false).
 *     메뉴가 없는 리본 단추와, 같은 객체 스냅 메뉴를 객체 스냅 단추 오른쪽 클릭으로 연 길은 그대로(「▾」의 열림 상태를 바꾸지 않음).
 * (가) 켜진 항목이 없는 메뉴는 초점을 옮기지 않아(262차는 첫 켜진 항목에 둔다) 메뉴 키 처리(메뉴 안의 초점만 받음)가 Esc를 받지 못해 닫을 수 없었다 —
 *     메뉴 자체(tabindex -1)에 초점을 두어 Esc가 닫고 연 단추로 돌려준다.
 * 진짜 App·제목 막대·상태 막대·리본 단추와 진짜 메뉴(showMenu), 화면·명령행·엔진·글꼴·토스트는 가짜(menufocus262·viewa11y254 꼴).
 * 셸 전체를 만들지 않고 그 부분만 그린다(viewa11y254·tabkeys259 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, showMenu } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 메뉴는 진짜(열고 닫힐 때의 상태·초점을 본다), 토스트만 가짜
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // showMenu가 연 곳(document.activeElement instanceof HTMLElement)을, 「⋯」 메뉴가 숨긴 항목(instanceof HTMLButtonElement)을 본다
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
  // 앞 시험이 그린 것(초점을 가진 단추 포함)을 치운다 — 초점은 본문으로
  document.getElementById('app')!.replaceChildren();
  dom.window.localStorage.clear();
});

const menu = () => document.querySelector<HTMLElement>('.menu[role="menu"]');
const items = () => [...menu()!.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
/** 메뉴 항목의 이름(아이콘·단축키 글을 뺀 글 마디) */
const label = (b: Element) =>
  [...b.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('')
    .trim();
/** 지금 초점: 연 단추 'opener', 본문 'body', 메뉴 자체 'menu', 메뉴 항목이면 'menu:<항목 이름>' */
const where = (opener: Element) => {
  const a = document.activeElement;
  if (a === opener) return 'opener';
  if (a === document.body) return 'body';
  const m = menu();
  if (m && a === m) return 'menu';
  return m && a && m.contains(a) ? `menu:${label(a)}` : `other:${a?.tagName}`;
};
/** 지금 초점이 있는 곳에 키를 누른다(실제와 같다 — 초점이 메뉴 밖이면 메뉴의 키 처리는 받지 못하고 앱 창 키 처리로 간다) */
const press = (k: string) => (document.activeElement ?? document.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
/** 메뉴 바깥 누르기(showMenu의 pointerdown 지켜보기) */
const outside = () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
/** 메뉴 단추의 [aria-haspopup, aria-expanded] */
const aria = (b: Element) => [b.getAttribute('aria-haspopup'), b.getAttribute('aria-expanded')];

type ShellPart = { buildTitle(): void; buildStatus(): void; ribbonButton(b: object, large: boolean): HTMLButtonElement };
/** 셸 전체를 만들지 않고 제목 막대·상태 막대를 그린다(리본 단추는 ribbonButton으로 하나씩) — 켜짐 표시 맞추기·리본 명령 뒤처리는 빈 함수로 */
const shell = async () => {
  const { Shell } = await import('../../src/app/ui/shell');
  const h = makeApp();
  const title = document.createElement('div');
  const ribbon = document.createElement('div');
  const status = document.createElement('div');
  document.getElementById('app')!.replaceChildren(title, ribbon, status);
  const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, title, status, statusBtns: {}, refreshStatus() {}, afterRibbonCommand() {} }) as unknown as ShellPart;
  sh.buildTitle();
  sh.buildStatus();
  return { h, sh, title, ribbon, status };
};

describe('메뉴 단추 넷은 메뉴를 연다고·열림 상태를 알린다(263차 — 262차 보고 (2))', () => {
  it('응용프로그램 메뉴 A·리본 펼침 단추: aria-haspopup="menu", aria-expanded 처음 false — 열면 true, Esc·바깥 누르기·다른 메뉴로 닫히면 false(메뉴 없는 리본 단추는 그대로)', async () => {
    const { sh, title, ribbon } = await shell();
    const a = title.querySelector<HTMLButtonElement>('button.app-button')!;
    // 리본의 원(펼침 메뉴가 있는 단추 — shell.ts RIBBON 꼴)과 선(메뉴 없음)
    const circle = sh.ribbonButton(
      { cmd: 'CIRCLE', label: '원', icon: 'circle', tip: '원 (C)', menu: [{ label: '중심, 반지름', cmd: 'CIRCLE', icon: 'circle' }, { label: '2점', cmd: 'CIRCLE 2P', icon: 'circle' }] },
      true,
    );
    const line = sh.ribbonButton({ cmd: 'LINE', label: '선', icon: 'line', tip: '선 (L)' }, true);
    ribbon.append(circle, line);
    const got: unknown[] = [aria(a), aria(circle), aria(line)];

    // A: 누르면 true(초점은 첫 항목 — 262차), Esc로 닫으면 false·A로
    a.click();
    await settle();
    got.push(a.getAttribute('aria-expanded'), where(a));
    press('Escape');
    got.push(menu() === null, a.getAttribute('aria-expanded'), where(a));
    // 바깥 누르기로 닫아도 false
    a.click();
    await settle();
    got.push(a.getAttribute('aria-expanded'));
    outside();
    got.push(menu() === null, a.getAttribute('aria-expanded'));
    // 리본 원: 누르면 true. 그 메뉴가 열린 채 A를 누르면(새 메뉴가 앞 메뉴를 닫는다) 원 false·A true, Esc로 A false
    circle.click();
    await settle();
    got.push(circle.getAttribute('aria-expanded'), where(circle));
    a.click();
    await settle();
    got.push(circle.getAttribute('aria-expanded'), a.getAttribute('aria-expanded'));
    press('Escape');
    got.push(menu() === null, a.getAttribute('aria-expanded'), where(a), aria(line));

    expect(got).toEqual([
      ['menu', 'false'],
      ['menu', 'false'],
      [null, null],
      'true',
      'menu:새로 만들기',
      true,
      'false',
      'opener',
      'true',
      true,
      'false',
      'true',
      'menu:중심, 반지름',
      'false',
      'true',
      true,
      'false',
      'opener',
      [null, null],
    ]);
  });

  it('객체 스냅 「▾」·주석 축척 단추: 같은 꼴 — 항목 고르기·다른 메뉴·Esc로 닫히면 false. 객체 스냅 단추 오른쪽 클릭으로 연 같은 메뉴는 「▾」를 바꾸지 않는다', async () => {
    const { h, status } = await shell();
    const caret = status.querySelector<HTMLButtonElement>('button[aria-label="객체 스냅 종류"]')!;
    const osnap = status.querySelector<HTMLButtonElement>('button[aria-label="객체 스냅 (F3) · 오른쪽 클릭으로 종류 선택"]')!;
    const scale = status.querySelector<HTMLButtonElement>('button.as-scale-btn')!;
    const got: unknown[] = [aria(caret), aria(scale)];

    // 「▾」: 누르면 true(초점은 메뉴 안), 항목(첫 스냅 종류 켜고 끄기)을 고르면 false·「▾」로
    caret.click();
    await settle();
    got.push(caret.getAttribute('aria-expanded'), menu()!.contains(document.activeElement));
    const snaps = h.app.snapModes.size;
    items()[0]!.click();
    got.push(menu() === null, caret.getAttribute('aria-expanded'), where(caret), h.app.snapModes.size !== snaps);
    // 객체 스냅 단추 오른쪽 클릭(같은 메뉴, 연 단추 없음): 「▾」는 false 그대로
    osnap.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 300 }));
    await settle();
    got.push(menu() !== null, caret.getAttribute('aria-expanded'));
    closeMenu();
    // 주석 축척(모형 공간 — 축척 목록 메뉴): 누르면 true, 다른 메뉴가 열리면 false, 다시 열어 Esc로 닫으면 false·주석 축척 단추로
    scale.click();
    await settle();
    got.push(scale.getAttribute('aria-expanded'), menu()!.contains(document.activeElement));
    showMenu(0, 0, [{ label: '다른 메뉴', run() {} }]);
    got.push(scale.getAttribute('aria-expanded'), caret.getAttribute('aria-expanded'));
    closeMenu();
    scale.click();
    await settle();
    press('Escape');
    got.push(menu() === null, scale.getAttribute('aria-expanded'), where(scale));

    expect(got).toEqual([['menu', 'false'], ['menu', 'false'], 'true', true, true, 'false', 'opener', true, true, 'false', 'true', true, 'false', 'false', true, 'false', 'opener']);
  });
});

describe('꺼진 항목뿐인 메뉴는 메뉴 자체에 초점을 두어 Esc로 닫힌다(263차 — 262차 보고 (1))', () => {
  it('상태 막대 「⋯」에 꺼진 단추(도면 공간의 주석 축척)만 숨었을 때: 메뉴 자체(tabindex -1)에 초점, ↓는 그대로, Esc는 닫고 「⋯」으로(열림 상태 false)', async () => {
    const { status } = await shell();
    const more = status.querySelector<HTMLButtonElement>('button.status-more')!;
    // 좁은 창에서 넘친 것처럼(fitStatus 꼴) 주석 축척 단추를 「⋯」 메뉴로 옮기고, 도면 공간처럼 끈다(annoscale-status.ts refresh — 도면 공간의 주석 축척은 1:1)
    const scale = status.querySelector<HTMLButtonElement>('button.as-scale-btn')!;
    scale.classList.add('st-hidden');
    scale.disabled = true;
    more.hidden = false;

    more.click();
    await settle();
    const m = menu()!;
    const got: unknown[] = [items().map((b) => b.disabled), where(more), m.getAttribute('tabindex'), more.getAttribute('aria-expanded')];
    // 켜진 항목이 없으니 ↓는 아무것도 하지 않는다(메뉴·초점 그대로)
    press('ArrowDown');
    got.push(menu() === m, where(more));
    // Esc: 메뉴가 받아 닫고 「⋯」으로
    press('Escape');
    got.push(menu() === null, where(more), more.getAttribute('aria-expanded'));

    expect(got).toEqual([[true], 'menu', '-1', 'true', true, 'menu', true, 'opener', 'false']);
  });
});
