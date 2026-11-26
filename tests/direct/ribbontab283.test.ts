/**
 * 접힌 리본 패널 팝업의 Tab 차례(283차 — 282차 「보고 두 것」 (3)·(1), WCAG 2.2 2.4.3 초점 순서).
 * 팝업(`.ribbon-pop`, role=dialog — 모달 아님)은 본문 끝에 붙어, 팝업 끝 컨트롤에서 Tab을 누르면 문서 끝(브라우저 화면)으로, 첫 컨트롤에서 Shift+Tab을 누르면
 * 문서의 앞 요소(상태 막대 끝 등)로 빠졌다 — 연 단추와 그 다음 리본 단추로 돌아올 수 없었다. 이제 팝업 내용이 연 단추 바로 뒤에 있는 차례로(HTML popover 연 단추 꼴):
 * - 끝 컨트롤(켜진 컨트롤이 없으면 팝업 자체)에서 Tab이면 닫고 연 단추 다음 요소로. 다음 요소가 없으면(문서 끝) 연 단추로 두고 기본 동작을 막지 않는다(브라우저가 이어 옮김).
 * - 첫 컨트롤(또는 팝업 자체)에서 Shift+Tab이면 닫고 연 단추로(열어 두면 연 단추에서 다시 Tab이 팝업을 건너뛴다).
 * - 가운데·반대 방향·수정 키(Ctrl+Tab = 다음 도면)는 가로채지 않는다.
 * 그리고 팝업 안 펼침 단추(「측정 ▾」)로 연 메뉴를 닫으면 초점이 접힌 패널 단추로 간다(282차 보고 (1) — 전에는 그 단추가 팝업과 함께 문서에서 빠져 본문으로).
 * 가짜 DOM은 Tab의 기본 초점 이동을 하지 않는다 — 앱이 직접 옮기는 자리만 activeElement로 본다.
 * 진짜 App·명령·리본 그리기(Shell.buildRibbon — 리본 탭 줄과 리본만, ribbonpop282 꼴), 좁은 창은 리본 폭 1,000px·넘친 폭 1,400px·패널 폭(펼침 200·접힘 60) 가짜:
 * 홈 탭의 특성·유틸리티·그룹이 접힌다. 유틸리티의 켜진 컨트롤은 측정·ID 점·리스트·모두 선택(신속 선택·유사 선택·계산기는 이 시험에 등록하지 않은 명령이라 꺼짐),
 * 그룹 패널은 모두 꺼져 팝업 자체에 초점이 간다.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 팝업 안 컨트롤 찾기(focusables)와 메뉴는 진짜, 토스트만 가짜
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
let rect: Element['getBoundingClientRect'];
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
  // 리본 접기는 리본의 안쪽 여백(계산된 꼴)을, 팝업 안 컨트롤 찾기는 보이는지(계산된 꼴)를 본다(menuname264 꼴)
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  // 패널 폭: 펼친 패널 200px, 접힌 패널(단추 하나) 60px. 나머지 요소는 jsdom 그대로(0)
  rect = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function (this: Element) {
    if (!this.classList.contains('rpanel')) return rect.call(this);
    const width = this.querySelector('.folded') ? 60 : 200;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 60, width, height: 60, toJSON() {} } as DOMRect;
  };
});
afterAll(() => {
  dom.window.Element.prototype.getBoundingClientRect = rect;
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  // 앞 시험이 그린 것(초점을 가진 단추·남은 팝업·메뉴 포함)을 치운다 — 초점은 본문으로
  document.getElementById('app')!.replaceChildren();
  for (const p of document.querySelectorAll('.ribbon-pop, .menu')) p.remove();
  dom.window.localStorage.clear();
});

const pops = () => [...document.querySelectorAll<HTMLElement>('.ribbon-pop')];
/** 지금 초점: 연 단추 'opener', 본문 'body', 팝업 자체 'pop', 팝업 안이면 'pop:<글>', 그 밖은 'other:<글>' */
const where = (opener: Element) => {
  const a = document.activeElement;
  if (a === opener) return 'opener';
  if (a === document.body) return 'body';
  const pop = document.querySelector('.ribbon-pop');
  if (pop && a === pop) return 'pop';
  if (pop && a && pop.contains(a)) return `pop:${a.textContent?.trim()}`;
  return `other:${a?.textContent?.trim()}`;
};
/** 지금 초점이 있는 곳에 키를 누른다(팝업 밖이면 앱 창 키 처리로 간다). 기본 동작이 막혔는지 돌려준다 */
const key = (k: string, mod: { shiftKey?: boolean; ctrlKey?: boolean } = {}) => {
  const ev = new dom.window.KeyboardEvent('keydown', { key: k, ...mod, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(ev);
  return ev.defaultPrevented;
};
/** 열린 팝업 안의 명령 단추 */
const cmdButton = (cmd: string) => document.querySelector<HTMLButtonElement>(`.ribbon-pop button[data-cmd="${cmd}"]`)!;

/** 진짜 App·명령과, 좁은 창에서 그린 홈 탭 리본(셸 전체를 만들지 않고 리본 탭 줄과 리본만) — 접힌 단추 [특성, 유틸리티, 그룹] */
async function setup() {
  const { Shell } = await import('../../src/app/ui/shell');
  const h = makeApp();
  registerCommands(h.app);
  const ribbonTabs = document.createElement('div');
  const ribbon = document.createElement('div');
  ribbon.style.paddingLeft = '0px';
  ribbon.style.paddingRight = '0px';
  Object.defineProperty(ribbon, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(ribbon, 'scrollWidth', { configurable: true, value: 1400 });
  document.getElementById('app')!.replaceChildren(ribbonTabs, ribbon);
  const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, ribbonTabs, ribbon, activeTab: 0, overlayMode: false }) as unknown as { buildRibbon(): void };
  sh.buildRibbon();
  const [, util, group] = [...ribbon.querySelectorAll<HTMLButtonElement>('button.folded')] as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
  return { util, group };
}

describe('접힌 리본 패널 팝업의 Tab 차례(283차 — 282차 보고 (3)·(1))', () => {
  it('끝 컨트롤에서 Tab이면 닫고 연 단추 다음 리본 요소로. 켜진 컨트롤이 없는 팝업(팝업 자체)에서 Tab, 연 단추 뒤가 문서 끝이면 연 단추로 두고 기본 동작은 막지 않는다', async () => {
    const { util, group } = await setup();
    util.focus();
    util.click();
    await settle();
    const got: unknown[] = [[...document.querySelectorAll('.ribbon-pop button:not([disabled])')].map((b) => b.textContent?.trim())];
    cmdButton('SELECTALL').focus();
    got.push(key('Tab'), pops().length, util.getAttribute('aria-expanded'), where(util));
    await settle();
    // 그룹(마지막 접힌 패널 — 리본·문서에서 그 뒤에 Tab 차례 요소가 없음)
    group.focus();
    group.click();
    await settle();
    got.push(where(group), key('Tab'), pops().length, group.getAttribute('aria-expanded'), where(group));

    expect(got).toEqual([['측정', 'ID 점', '리스트', '모두 선택'], true, 0, 'false', 'other:그룹 ▾', 'pop', false, 0, 'false', 'opener']);
  });

  it('첫 컨트롤·팝업 자체에서 Shift+Tab이면 닫고 연 단추로. 가운데·첫에서 Tab·끝에서 Shift+Tab·Ctrl+Tab(다음 도면)은 가로채지 않는다', async () => {
    const { util, group } = await setup();
    util.focus();
    util.click();
    await settle();
    // 첫 컨트롤(측정)에서 Tab: 끝이 아니라 그대로(가짜 DOM은 기본 이동을 하지 않아 초점이 제자리)
    const got: unknown[] = [where(util), key('Tab'), where(util)];
    cmdButton('SELECTALL').focus();
    got.push(key('Tab', { shiftKey: true }), where(util));
    key('Tab', { ctrlKey: true });
    got.push(pops().length, util.getAttribute('aria-expanded'), where(util));
    cmdButton('MEASUREGEOM').focus();
    got.push(key('Tab', { shiftKey: true }), pops().length, util.getAttribute('aria-expanded'), where(util));
    await settle();
    group.focus();
    group.click();
    await settle();
    got.push(where(group), key('Tab', { shiftKey: true }), pops().length, group.getAttribute('aria-expanded'), where(group));

    expect(got).toEqual(['pop:측정', false, 'pop:측정', false, 'pop:모두 선택', 1, 'true', 'pop:모두 선택', true, 0, 'false', 'opener', 'pop', true, 0, 'false', 'opener']);
  });

  it('팝업 안 펼침 단추(측정 ▾)로 연 메뉴: 팝업은 닫히고 메뉴 첫 항목에 초점, 그 메뉴를 Esc로 닫으면 접힌 패널 단추로(282차 보고 (1))', async () => {
    const { util } = await setup();
    util.focus();
    util.click();
    await settle();
    const measure = cmdButton('MEASUREGEOM');
    measure.click();
    await settle();
    const got: unknown[] = [pops().length, util.getAttribute('aria-expanded'), document.querySelectorAll('.menu').length, where(util), measure.isConnected];
    key('Escape');
    await settle();
    got.push(document.querySelectorAll('.menu').length, where(util));

    expect(got).toEqual([0, 'false', 1, 'other:거리', false, 0, 'opener']);
  });
});
