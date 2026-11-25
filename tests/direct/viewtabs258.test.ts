/**
 * 팔레트·휴대폰 시트 탭(특성·도면층·치수·찾기 — 같은 코드)의 로빙 tabindex와 화살표 옮기기(258차 — 253차 보고 (1), W3C APG 탭 꼴).
 * 전에는 탭 넷이 모두 Tab 차례에 들어가(Tab 네 번) 화살표로 옮길 수 없었다. 이 앱의 리본 탭 꼴(shell.ts buildRibbon)로 맞춘다:
 * 고른 탭만 tabindex 0·나머지 -1(탭 줄은 Tab 한 자리), 왼쪽·오른쪽 화살표(끝에서 돌아감)·Home·End는 초점만 옮기고 Enter·Space(단추 누르기)로 고른다(수동 고르기).
 * 화살표 사건은 앱 창 키 처리에 넘기지 않는다. 다시 그려도 초점은 256차 restoreFocus(탭 id), 시트를 열면 255차처럼 고른 탭.
 * 진짜 App·MobileView·Palette·명령과 앱 창 키 처리, 화면·명령행·엔진·글꼴·메뉴·토스트는 가짜(viewfocus256 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { EditSession } from '../../src/edit/session';
import { registerCommands } from '../../src/app/commands';
import { bindCommitHooks } from '../../src/app/hooks';
import { showMenu } from '../../src/app/ui/dom';
import { MobileView } from '../../src/app/ui/mobileview';
import { Palette } from '../../src/app/ui/palettes';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
const setWidth = (w: number) => Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: w });
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // 팔레트는 특성 칸을 되돌릴 때 `instanceof HTMLInputElement`를 본다(viewfocus256 꼴)
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  dom.window.localStorage.clear();
  vi.mocked(showMenu).mockClear();
});
/** 시험이 끝난 뒤 카드가 다시 그리지 않고 명령이 남지 않게 */
const unwatch: (() => void)[] = [];
afterEach(async () => {
  for (const f of unwatch.splice(0)) f();
  await settle();
  setWidth(1024);
});

/** 도면층 0(현재)·A, 선 하나, 진짜 팔레트·휴대폰 보기(셸처럼 openPalette·closePalette·refreshPalette를 잇는다). width는 창 폭 */
async function setup(width: number) {
  setWidth(width);
  const h = makeApp((doc) => {
    doc.layers.set('A', { ...structuredClone(doc.layers.get('0')!), name: 'A', handle: 'A0' });
  });
  h.st.session = new EditSession(h.doc, () => h.app.ui.refreshPalette());
  bindCommitHooks(h.app, h.st);
  registerCommands(h.app);
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const line = add({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity);
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const pal = new Palette(h.app, root);
  const mv = new MobileView(h.app, { openPalette: (t) => pal.open(t), closePalette: () => pal.close(), modeChanged() {} }, root);
  h.app.ui.refreshPalette = () => {
    pal.refresh();
    mv.refresh();
  };
  root.append(mv.bar, mv.card);
  unwatch.push(() => {
    h.app.cmd.watchers.clear();
    h.app.cancel(true);
  });
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewfocus256 꼴)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
  const btn = (label: string) => [...mv.bar.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.vb-lbl')?.textContent === label)!;
  const tabs = () => [...pal.el.querySelectorAll<HTMLButtonElement>('.palette-tabs > button')];
  const tab = (label: string) => tabs().find((b) => b.textContent === label)!;
  /** 탭마다 tabindex·aria-selected(특성·도면층·치수·찾기 차례) */
  const tabindex = () => tabs().map((b) => b.getAttribute('tabindex'));
  const selected = () => tabs().map((b) => b.getAttribute('aria-selected'));
  const body = pal.el.querySelector<HTMLElement>('.palette-body')!;
  const search = () => pal.el.querySelector<HTMLInputElement>('input.search')!;
  const key = (el: Element, k: string) => {
    const e = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  return { ...h, line, pal, mv, btn, tabs, tab, tabindex, selected, body, search, key };
}

const focused = () => document.activeElement as HTMLElement | null;

describe('팔레트·시트 탭은 Tab 한 자리이고 화살표로 옮긴다 — 리본 탭 꼴(258차)', () => {
  it('데스크톱 팔레트: 고른 탭만 tabindex 0, ←·→(끝에서 돌아감)·Home·End는 초점만 옮기고 다시 그리지 않으며 앱 키 처리에 넘기지 않는다', async () => {
    const h = await setup(1024);
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    expect(h.tabindex()).toEqual(['0', '-1', '-1', '-1']);
    let passed = 0;
    h.pal.el.addEventListener('keydown', () => passed++);
    const first = h.tab('특성');
    first.focus();
    const e = h.key(first, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(focused()).toBe(h.tab('도면층'));
    /** 지금 초점에서 키를 누르고 옮겨 간 탭의 글 */
    const go = (k: string) => {
      const ev = h.key(focused()!, k);
      expect(ev.defaultPrevented).toBe(true);
      return focused()!.textContent;
    };
    expect(['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'ArrowLeft'].map(go)).toEqual(['치수', '찾기', '특성', '찾기', '특성', '찾기', '치수']);
    // 수동 고르기(리본 꼴): 고른 탭·tabindex·몸 이름은 그대로, 탭 줄을 다시 그리지 않는다
    expect(first.isConnected).toBe(true);
    expect(h.selected()).toEqual(['true', 'false', 'false', 'false']);
    expect(h.tabindex()).toEqual(['0', '-1', '-1', '-1']);
    expect(h.body.getAttribute('aria-labelledby')).toBe(first.id);
    // 화살표·Home·End 사건은 탭에서 멈춘다(팔레트·앱 창 키 처리에 닿지 않음)
    expect(passed).toBe(0);
    // Enter·Space(단추 누르기)로 고르면 새 고른 탭에 초점, Tab 차례도 그 탭으로
    focused()!.click();
    expect(focused()).toBe(h.tab('치수'));
    expect(h.selected()).toEqual(['false', 'false', 'true', 'false']);
    expect(h.tabindex()).toEqual(['-1', '-1', '0', '-1']);
    expect(h.body.getAttribute('aria-labelledby')).toBe(h.tab('치수').id);
  });

  it('데스크톱 팔레트: 화살표로 옮긴 탭에 있는 동안 다른 일로 다시 그려도 그 탭(256차 탭 id), 고르면 새 고른 탭 — 찾기 탭은 지금처럼 찾을 글 칸', async () => {
    const h = await setup(1024);
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    h.tab('특성').focus();
    h.key(h.tab('특성'), 'ArrowRight');
    const t1 = h.tab('도면층');
    expect(focused()).toBe(t1);
    // 고른 것이 풀려 팔레트를 다시 그린다: 초점은 새 「도면층」 탭, 고른 탭·tabindex는 그대로(특성)
    h.app.setSelection([], 'replace');
    expect(t1.isConnected).toBe(false);
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.selected()).toEqual(['true', 'false', 'false', 'false']);
    expect(h.tabindex()).toEqual(['0', '-1', '-1', '-1']);
    // 고르기
    h.tab('도면층').click();
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.selected()).toEqual(['false', 'true', 'false', 'false']);
    expect(h.tabindex()).toEqual(['-1', '0', '-1', '-1']);
    // End → 찾기 탭을 고르면 찾을 글 칸(255·256차 그대로)
    h.key(focused()!, 'End');
    expect(focused()).toBe(h.tab('찾기'));
    h.tab('찾기').click();
    expect(focused()).toBe(h.search());
    expect(h.tabindex()).toEqual(['-1', '-1', '-1', '0']);
  });

  it('휴대폰 시트(390px 보기 모드): 열면 고른 탭(Tab 한 자리), 화살표로 옮겨 고르면 새 고른 탭, Esc는 그대로 시트를 닫고 연 단추로', async () => {
    const h = await setup(390);
    h.mv.apply(true);
    await settle();
    expect(h.app.viewOnly).toBe(true);
    const layers = h.btn('도면층');
    layers.focus();
    layers.click();
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.tabindex()).toEqual(['-1', '0', '-1', '-1']);
    // ←: 특성 → (끝에서 돌아가) 찾기 → 치수, 고른 탭은 그대로
    h.key(focused()!, 'ArrowLeft');
    expect(focused()).toBe(h.tab('특성'));
    h.key(focused()!, 'ArrowLeft');
    expect(focused()).toBe(h.tab('찾기'));
    h.key(focused()!, 'ArrowLeft');
    expect(focused()).toBe(h.tab('치수'));
    expect(h.selected()).toEqual(['false', 'true', 'false', 'false']);
    // 고르면 새 고른 탭에 초점과 Tab 차례
    focused()!.click();
    expect(focused()).toBe(h.tab('치수'));
    expect(h.selected()).toEqual(['false', 'false', 'true', 'false']);
    expect(h.tabindex()).toEqual(['-1', '-1', '0', '-1']);
    // Esc는 탭이 멈추지 않아 시트가 닫히고 연 단추로(255차)
    const esc = h.key(focused()!, 'Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);
    // 다시 열면 고른 탭(도면층)이 Tab 한 자리
    layers.click();
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.tabindex()).toEqual(['-1', '0', '-1', '-1']);
  });
});
