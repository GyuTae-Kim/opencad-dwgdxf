/**
 * 메뉴 이름과 숨은 연 단추로의 초점 돌려주기(264차 — 263차 「보고 두 것」 (3)·(2), W3C APG 메뉴 단추 꼴, WCAG 2.2 4.1.2·2.4.3).
 * (3) showMenu가 만드는 role=menu에 이름이 없었다 — 연 단추(opt.opener)가 있으면 그 단추로 잇는다(aria-labelledby — 단추에 id가 없으면 새로, 있으면 그대로).
 *     연 단추가 없는 메뉴(오른쪽 클릭 등)는 맨 앞 머리글이 그 메뉴의 하나뿐인 머리글이면 그것(여러 머리글은 묶음 이름이라 아님), 아니면 지금처럼 이름 없음.
 * (2) 좁은 화면에서 상태 막대 「⋯」 메뉴로 옮긴 객체 스냅 「▾」·주석 축척 단추를 「⋯」에서 고르면, 그 메뉴의 연 단추는 숨은 단추라 닫을 때(Esc·항목 고르기)
 *     초점을 돌려주지 못하고 본문으로 갔다(브라우저는 display none 단추에 초점을 주지 않는다 — 이 시험 환경(jsdom)은 주므로 고치기 전에는 숨은 단추가
 *     초점을 받는 것으로 보인다). 연 단추가 보이지 않으면 메뉴를 열기 전의 초점(그 「⋯」)으로 돌려준다. 보이는 「▾」로 연 메뉴는 그대로 「▾」.
 * 진짜 App·제목 막대·상태 막대·리본 단추와 진짜 메뉴(showMenu), 화면·명령행·엔진·글꼴·토스트는 가짜(menubtn263 꼴).
 * 숨김은 앱 CSS의 상태 막대 규칙(src/styles.css `.statusbar > .st-hidden`)을 그대로 넣어 계산된 꼴(getComputedStyle)로 본다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, showMenu } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 메뉴는 진짜(열고 닫힐 때의 이름·초점을 본다), 토스트만 가짜
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // showMenu가 연 곳(document.activeElement instanceof HTMLElement)을, 「⋯」 메뉴가 숨긴 항목(instanceof HTMLButtonElement)을 보고
  // 고른 항목을 MouseEvent click으로 그 단추에 보낸다
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
  // 연 단추가 보이는지(계산된 display)를 이 문서의 규칙으로 본다
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
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
/** 지금 메뉴의 이름을 준 요소(aria-labelledby가 가리키는 것), 이름이 없으면 null */
const namer = () => {
  const id = menu()!.getAttribute('aria-labelledby');
  return id === null ? null : document.getElementById(id);
};
/** 지금 초점이 있는 곳에 키를 누른다(실제와 같다) */
const press = (k: string) => (document.activeElement ?? document.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
/** 메뉴 항목을 이름으로 골라 누른다 */
const pick = (name: string) =>
  items()
    .find((b) => label(b) === name)!
    .click();

type ShellPart = { buildTitle(): void; buildStatus(): void; ribbonButton(b: object, large: boolean): HTMLButtonElement };
/** 셸 전체를 만들지 않고 제목 막대·상태 막대를 그린다(menubtn263 꼴 — 리본 단추는 ribbonButton으로 하나씩) */
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

describe('메뉴는 연 단추(없으면 하나뿐인 맨 앞 머리글)로 이름을 받는다(264차 — 263차 보고 (3))', () => {
  it('응용프로그램 메뉴 A·리본 펼침·「▾」: 그 단추로(id가 없으면 새로, 다시 열어도 같은 id). 오른쪽 클릭 스냅 메뉴는 머리글, 머리글이 없거나 여럿이면 이름 없음, id가 있는 단추는 그 id', async () => {
    const { sh, title, ribbon, status } = await shell();
    const a = title.querySelector<HTMLButtonElement>('button.app-button')!;
    const circle = sh.ribbonButton(
      { cmd: 'CIRCLE', label: '원', icon: 'circle', tip: '원 (C)', menu: [{ label: '중심, 반지름', cmd: 'CIRCLE', icon: 'circle' }, { label: '2점', cmd: 'CIRCLE 2P', icon: 'circle' }] },
      true,
    );
    ribbon.append(circle);
    const caret = status.querySelector<HTMLButtonElement>('button[aria-label="객체 스냅 종류"]')!;
    const osnap = status.querySelector<HTMLButtonElement>('button[aria-label="객체 스냅 (F3) · 오른쪽 클릭으로 종류 선택"]')!;
    const got: unknown[] = [a.id];

    // A: 메뉴 이름은 A(새 id), 다시 열어도 같은 id
    a.click();
    await settle();
    const aId = a.id;
    got.push(namer() === a, aId !== '');
    press('Escape');
    a.click();
    await settle();
    got.push(namer() === a, a.id === aId);
    press('Escape');
    // 리본 펼침 단추·「▾」
    circle.click();
    await settle();
    got.push(namer() === circle);
    press('Escape');
    caret.click();
    await settle();
    got.push(namer() === caret);
    press('Escape');
    // 연 단추가 없는 메뉴: 객체 스냅 단추 오른쪽 클릭 — 맨 앞 머리글 「객체 스냅」 하나(열 때 초점이 있던 「▾」로 이름 짓지 않음)
    osnap.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 300 }));
    await settle();
    got.push(namer()?.textContent ?? null, namer()?.parentElement === menu());
    closeMenu();
    // 머리글 없는 메뉴, 머리글이 여럿인 메뉴(도면층 필터 메뉴 꼴 — 묶음 이름): 이름 없음
    showMenu(0, 0, [{ label: '다른 메뉴', run() {} }]);
    got.push(menu()!.getAttribute('aria-labelledby'));
    showMenu(0, 0, [{ heading: '가시성' }, { label: '켜기', run() {} }, { heading: '잠금' }, { label: '잠금', run() {} }]);
    got.push(menu()!.getAttribute('aria-labelledby'));
    // 이미 id가 있는 연 단추는 그 id 그대로
    const own = document.createElement('button');
    own.id = 'own-opener';
    title.append(own);
    showMenu(0, 0, [{ label: '항목', run() {} }], { opener: own });
    got.push(menu()!.getAttribute('aria-labelledby'), own.id);
    closeMenu();

    expect(got).toEqual(['', true, true, true, true, true, true, '객체 스냅', true, null, null, 'own-opener', 'own-opener']);
  });
});

describe('숨은 연 단추로 연 메뉴는 닫으면 열기 전 초점(「⋯」)으로 돌려준다(264차 — 263차 보고 (2))', () => {
  it('좁은 화면: 「⋯」에서 고른 「▾」·주석 축척 메뉴 — Esc·항목 고르기 뒤 「⋯」(이름은 숨은 연 단추). 보이는 「▾」로 연 메뉴는 「▾」 그대로', async () => {
    const { h, status } = await shell();
    status.classList.add('statusbar');
    const more = status.querySelector<HTMLButtonElement>('button.status-more')!;
    const caret = status.querySelector<HTMLButtonElement>('button[aria-label="객체 스냅 종류"]')!;
    const scale = status.querySelector<HTMLButtonElement>('button.as-scale-btn')!;
    /** 지금 초점: 「⋯」 'more', 「▾」 'caret', 주석 축척 'scale', 본문 'body', 메뉴 안 'menu' */
    const who = () => {
      const a = document.activeElement;
      if (a === more) return 'more';
      if (a === caret) return 'caret';
      if (a === scale) return 'scale';
      if (a === document.body) return 'body';
      return menu()?.contains(a) ? 'menu' : `other:${a?.tagName}`;
    };
    // 앱 CSS의 상태 막대 숨김 규칙을 그대로 넣는다 — 주석 축척 CSS(as-status-style) 뒤에(이 시험 환경은 같은 무게의 규칙을 차례로만 가른다)
    const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8').match(/\.statusbar > \.st-hidden \{[^}]*\}/)![0];
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);

    // 보이는 「▾」로 연 메뉴: Esc로 닫으면 「▾」(그대로)
    caret.click();
    await settle();
    press('Escape');
    const got: unknown[] = [who()];
    // 좁은 창에서 넘친 것처럼(fitStatus 꼴) 「▾」·주석 축척을 「⋯」 메뉴로 옮기고 「⋯」을 보인다
    caret.classList.add('st-hidden');
    scale.classList.add('st-hidden');
    more.hidden = false;
    got.push(dom.window.getComputedStyle(caret).display, dom.window.getComputedStyle(scale).display);
    // 「⋯」 메뉴(이름은 「⋯」) → 「객체 스냅 종류」: 스냅 메뉴가 열리고 초점은 메뉴 안, 이름은 숨은 「▾」
    more.click();
    await settle();
    got.push(namer() === more, items().map(label));
    pick('객체 스냅 종류');
    await settle();
    got.push(menu()!.contains(document.activeElement), namer() === caret, caret.getAttribute('aria-expanded'), more.getAttribute('aria-expanded'));
    // Esc: 닫고 「⋯」으로(고치기 전 — 숨은 「▾」)
    press('Escape');
    got.push(menu() === null, who(), caret.getAttribute('aria-expanded'));
    // 항목 고르기(첫 스냅 종류 켜고 끄기)로 닫아도 「⋯」
    more.click();
    await settle();
    pick('객체 스냅 종류');
    await settle();
    const snaps = h.app.snapModes.size;
    items()[0]!.click();
    got.push(menu() === null, who(), h.app.snapModes.size !== snaps);
    // 주석 축척(모형 공간 — 축척 목록 메뉴): 「⋯」 → 「주석 축척 1:1」 → 이름은 숨은 주석 축척 단추(머리글보다 먼저), Esc로 「⋯」
    more.click();
    await settle();
    pick('주석 축척 1:1');
    await settle();
    got.push(menu()!.contains(document.activeElement), namer() === scale, scale.getAttribute('aria-expanded'));
    press('Escape');
    got.push(menu() === null, who(), scale.getAttribute('aria-expanded'));

    expect(got).toEqual([
      'caret',
      'none',
      'none',
      true,
      ['객체 스냅 종류', '주석 축척 1:1'],
      true,
      true,
      'true',
      'false',
      true,
      'more',
      'false',
      true,
      'more',
      true,
      true,
      true,
      'true',
      true,
      'more',
      'false',
    ]);
  });
});
