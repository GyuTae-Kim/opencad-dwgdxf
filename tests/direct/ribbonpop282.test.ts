/**
 * 접힌 리본 패널 단추의 팝업 여닫기(282차 — 263차 「보고 두 것」 (1), W3C APG 공개 단추·대화 상자 꼴, WCAG 2.2 4.1.2·2.4.3·2.1.1).
 * 좁은 창에서 리본 패널이 넘치면 오른쪽 패널부터 단추 하나(「… ▾」)로 접고, 누르면 패널 내용을 아래 팝업(role=dialog)으로 펼친다. 전에는:
 * - 단추가 aria-haspopup="true"(= 메뉴)인데 여는 것은 대화 상자 역할 팝업이고, 열림 상태(aria-expanded)가 없었다.
 * - 열어도 초점이 팝업 안으로 가지 않고, Esc로 닫히지 않으며(Esc는 앱 취소 — 고른 객체를 풂), 열린 팝업의 단추를 다시 누르면 다시 열었다(옛 바깥 누르기 지켜보기는 남음).
 * - 팝업 안 리본 단추는 누르기(pointerdown)에서 팝업을 지워, 손을 뗄 때 그 단추가 문서에 없었다(브라우저는 누른 곳·뗀 곳의 공통 조상에 click을 보낸다 — 코드로 읽음).
 * - 리본을 다시 그리면(창 크기 바꿈 등) 연 단추는 바뀌는데 팝업과 지켜보기는 남았다.
 * 이제 닫기는 한 함수(팝업 지우기·지켜보기 풀기·aria-expanded false·초점이 팝업 안이었으면 연 단추로)로 모인다.
 * 진짜 App·명령·리본 그리기(Shell.buildRibbon — 셸 전체를 만들지 않고 리본 탭 줄과 리본만, tabkeys259 꼴), 화면·명령행·엔진·글꼴·토스트는 가짜.
 * 좁은 창은 리본 폭(1,000px)·넘친 폭(1,400px)과 패널 폭(펼침 200px·접힘 60px — getBoundingClientRect 가짜)으로 만든다: 홈 탭 일곱 패널 가운데
 * 오른쪽 셋(특성·유틸리티·그룹)이 접힌다(layout.ts foldCount — 1,400 → 1,260 → 1,120 → 980).
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 팝업 안 첫 컨트롤 찾기(focusables)와 메뉴는 진짜, 토스트만 가짜
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
  // 리본 접기는 리본의 안쪽 여백(계산된 꼴)을, 팝업 안 첫 컨트롤 찾기는 보이는지(계산된 꼴)를 본다(menuname264 꼴)
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
  // 앞 시험이 그린 것(초점을 가진 단추·남은 팝업 포함)을 치운다 — 초점은 본문으로
  document.getElementById('app')!.replaceChildren();
  for (const p of document.querySelectorAll('.ribbon-pop')) p.remove();
  dom.window.localStorage.clear();
});
/** 시험마다 건 엿보기(창 리스너·명령 실행)를 푼다 */
const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  for (const s of spies.splice(0)) s.mockRestore();
});

/** 리본 폭 1,000px에 넘친 폭: 좁은 창이면 1,400px(오른쪽 셋을 접음), 넓은 창이면 900px(접지 않음) */
const narrow = (ribbon: HTMLElement, on: boolean) => {
  Object.defineProperty(ribbon, 'clientWidth', { configurable: true, value: 1000 });
  Object.defineProperty(ribbon, 'scrollWidth', { configurable: true, value: on ? 1400 : 900 });
};
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
/** 지금 초점이 있는 곳에 키를 누른다(실제와 같다 — 팝업 밖이면 앱 창 키 처리로 간다) */
const press = (k: string) => (document.activeElement ?? document.body).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
/** 팝업 바깥(본문) 누르기 */
const outside = () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));

/** 선 하나를 둔 진짜 App·명령과, 좁은 창에서 그린 홈 탭 리본(셸 전체를 만들지 않고 리본 탭 줄과 리본만) */
async function setup() {
  const { Shell } = await import('../../src/app/ui/shell');
  const h = makeApp();
  registerCommands(h.app);
  const line = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  line.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: line }] });
  const ribbonTabs = document.createElement('div');
  const ribbon = document.createElement('div');
  ribbon.style.paddingLeft = '0px';
  ribbon.style.paddingRight = '0px';
  narrow(ribbon, true);
  document.getElementById('app')!.replaceChildren(ribbonTabs, ribbon);
  const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, ribbonTabs, ribbon, activeTab: 0, overlayMode: false }) as unknown as { buildRibbon(): void };
  sh.buildRibbon();
  // 창 capture pointerdown 리스너(팝업의 바깥 누르기 지켜보기)가 몇 개 남았는지 센다
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  spies.push(add, remove);
  const watching = (c: unknown[]) => c[0] === 'pointerdown' && c[2] === true;
  const live = () => {
    const gone = new Set((remove.mock.calls as unknown[][]).filter(watching).map((c) => c[1]));
    return (add.mock.calls as unknown[][]).filter(watching).filter((c) => !gone.has(c[1])).length;
  };
  const folded = () => [...ribbon.querySelectorAll<HTMLButtonElement>('button.folded')];
  return { h, sh, line, ribbon, ribbonTabs, folded, live };
}

describe('접힌 리본 패널 단추의 팝업 여닫기(282차 — 263차 보고 (1))', () => {
  it('단추는 aria-haspopup="dialog"·aria-expanded 처음 false — 열면 true·초점은 팝업의 첫 켜진 단추, 팝업 안 Esc는 닫고 연 단추로(앱 취소로 넘기지 않아 고른 객체 그대로)', async () => {
    const { h, line, folded, live } = await setup();
    const got: unknown[] = [folded().map((b) => [b.title, b.getAttribute('aria-haspopup'), b.getAttribute('aria-expanded')])];
    const util = folded()[1]!;
    util.focus();
    util.click();
    await settle();
    const pop = document.querySelector('.ribbon-pop');
    got.push(pops().length, pop?.getAttribute('role'), pop?.getAttribute('aria-label'), util.getAttribute('aria-expanded'), where(util), live());
    h.app.setSelection([line.handle], 'replace');
    press('Escape');
    await settle();
    got.push(pops().length, util.getAttribute('aria-expanded'), where(util), live(), h.st.selection.size);

    expect(got).toEqual([
      [
        ['특성 패널 펼치기', 'dialog', 'false'],
        ['유틸리티 패널 펼치기', 'dialog', 'false'],
        ['그룹 패널 펼치기', 'dialog', 'false'],
      ],
      1,
      'dialog',
      '유틸리티',
      'true',
      'pop:측정',
      1,
      0,
      'false',
      'opener',
      0,
      1,
    ]);
  });

  it('열린 팝업의 단추를 다시 누르면 닫는다(토글). 다른 접힌 패널을 열면 앞 단추는 false·팝업은 하나, 켜진 컨트롤이 없으면 팝업 자체에 초점, 바깥 누르기는 닫되 초점을 돌려주지 않는다 — 지켜보기는 남지 않는다', async () => {
    const { folded, live } = await setup();
    const [props, util, group] = folded() as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    util.focus();
    util.click();
    await settle();
    util.click();
    await settle();
    const got: unknown[] = [pops().length, util.getAttribute('aria-expanded'), where(util), live()];
    // 특성을 연 채 그룹을 누른다. 그룹 패널(GROUP·UNGROUP·PICKSTYLE)은 이 시험에 등록하지 않은 명령이라 모두 꺼져 있다
    props.click();
    await settle();
    group.click();
    await settle();
    got.push(pops().map((p) => p.getAttribute('aria-label')), props.getAttribute('aria-expanded'), group.getAttribute('aria-expanded'), where(group), document.querySelector('.ribbon-pop')?.getAttribute('tabindex'), live());
    outside();
    await settle();
    got.push(pops().length, group.getAttribute('aria-expanded'), where(group), live());

    expect(got).toEqual([0, 'false', 'opener', 0, ['그룹'], 'false', 'true', 'pop', '-1', 1, 0, 'false', 'body', 0]);
  });

  it('팝업 안 리본 단추: 누르기(pointerdown)로는 닫지 않고, 그 단추의 click이 명령을 돌린 뒤 닫아 연 단추로(명령이 도는 동안 팝업은 문서에 있음)', async () => {
    const { h, folded, live } = await setup();
    const ran: [string, boolean][] = [];
    spies.push(
      vi.spyOn(h.app, 'run').mockImplementation(async (name: string) => {
        ran.push([name, document.querySelector('.ribbon-pop') !== null]);
      }),
    );
    const util = folded()[1]!;
    util.focus();
    util.click();
    await settle();
    const all = document.querySelector<HTMLButtonElement>('.ribbon-pop button[data-cmd="SELECTALL"]')!;
    all.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    await settle();
    const got: unknown[] = [pops().length, all.isConnected, all.disabled];
    all.click();
    await settle();
    got.push(ran, pops().length, util.getAttribute('aria-expanded'), where(util), live());

    expect(got).toEqual([1, true, false, [['SELECTALL', true]], 0, 'false', 'opener', 0]);
  });

  it('리본을 다시 그리면 팝업을 닫는다 — 초점이 팝업 안이었으면 같은 패널의 새 접힌 단추로, 그 패널이 더는 접히지 않으면 고른 리본 탭으로', async () => {
    const { sh, ribbon, ribbonTabs, folded, live } = await setup();
    const util = folded()[1]!;
    util.focus();
    util.click();
    await settle();
    sh.buildRibbon();
    await settle();
    const again = folded()[1]!;
    const got: unknown[] = [pops().length, util.isConnected, util.getAttribute('aria-expanded'), again.title, again.getAttribute('aria-expanded'), document.activeElement === again, live()];
    // 창을 넓혀(넘침 없음) 다시 그리면 접힌 패널이 없다 — 고른 리본 탭(홈)으로
    again.click();
    await settle();
    narrow(ribbon, false);
    sh.buildRibbon();
    await settle();
    got.push(pops().length, folded().length, document.activeElement === ribbonTabs.children[0], live());

    expect(got).toEqual([0, false, 'false', '유틸리티 패널 펼치기', 'false', true, 0, 0, 0, true, 0]);
  });
});
