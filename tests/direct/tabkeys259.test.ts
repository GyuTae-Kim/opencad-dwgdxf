/**
 * 가로 탭 줄(리본 탭·도면 탭·팔레트 탭)의 화살표 옮기기는 수정 키 없는 키만(259차 — 258차 보고 (1)·(2), W3C APG 탭 꼴).
 * 전에는 세 곳이 같은 셈을 각자 두고 수정 키를 가리지 않아, 탭에 초점이 있으면 Alt+←·→(브라우저 뒤로·앞으로)·Ctrl+Home·Shift+End 같은 조합도
 * 탭 옮기기로 먹고 preventDefault·stopPropagation으로 막았다. 이제 셈은 dom.ts `tabKeyTarget` 하나이고, Alt·Ctrl·Meta·Shift와 함께 누른 키는
 * 탭이 손대지 않고 넘긴다(기본 동작도 막지 않음 — 브라우저·앱 단축키 그대로). 수정 키 없는 ←·→(끝에서 돌아감)·Home·End와 고르기 방식은 그대로.
 * 리본·도면 탭은 셸 전체를 만들지 않고 그 줄만 그린다(viewprops247·viewa11y254 꼴), 팔레트는 진짜 App·Palette·명령(viewtabs258 꼴).
 * 화면·명령행·엔진·글꼴·메뉴·토스트는 가짜.
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { EditSession } from '../../src/edit/session';
import { registerCommands } from '../../src/app/commands';
import { DocState } from '../../src/app/docstate';
import { bindCommitHooks } from '../../src/app/hooks';
import { tabKeyTarget } from '../../src/app/ui/dom';
import { Palette } from '../../src/app/ui/palettes';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  // 팔레트는 특성 칸을 되돌릴 때 `instanceof HTMLInputElement`를 본다(viewtabs258 꼴)
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  dom.window.localStorage.clear();
});
/** 시험이 끝난 뒤 명령이 남지 않게 */
const unwatch: (() => void)[] = [];
afterEach(async () => {
  for (const f of unwatch.splice(0)) f();
  await settle();
});

type Mods = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
/** 요소에 keydown을 보내고 사건을 돌려준다 */
const key = (el: Element, k: string, mods: Mods = {}) => {
  const e = new dom.window.KeyboardEvent('keydown', { key: k, ...mods, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};
const focused = () => document.activeElement as HTMLElement | null;
/** 수정 키 조합(이름은 실패했을 때 읽기 쉽게) */
const COMBOS: [string, string, Mods][] = [
  ['Alt+←', 'ArrowLeft', { altKey: true }],
  ['Alt+→', 'ArrowRight', { altKey: true }],
  ['Ctrl+Home', 'Home', { ctrlKey: true }],
  ['Ctrl+End', 'End', { ctrlKey: true }],
  ['⌘+→', 'ArrowRight', { metaKey: true }],
  ['⌘+Home', 'Home', { metaKey: true }],
  ['Shift+←', 'ArrowLeft', { shiftKey: true }],
  ['Shift+End', 'End', { shiftKey: true }],
];

/**
 * 탭 줄 하나를 견준다: 처음 탭(at)에서 수정 키 조합은 초점을 옮기지 않고 기본 동작을 막지 않으며 줄 밖으로 넘어가고(passed),
 * 수정 키 없는 ←·→·Home·End는 지금처럼 옮기고(끝에서 돌아감) 막고 넘기지 않는다
 */
function check(tabs: () => HTMLElement[], at: number, box: HTMLElement) {
  let passed = 0;
  box.addEventListener('keydown', () => passed++);
  const list = tabs();
  const n = list.length;
  expect(n).toBeGreaterThanOrEqual(3);
  list[at]!.focus();
  expect(focused()).toBe(list[at]);
  const mods = COMBOS.map(([name, k, m]) => {
    const e = key(focused()!, k, m);
    return `${name}: ${e.defaultPrevented ? '막음' : '넘김'} ${tabs().indexOf(focused()!)}`;
  });
  expect(mods).toEqual(COMBOS.map(([name]) => `${name}: 넘김 ${at}`));
  expect(passed).toBe(COMBOS.length);
  // 수정 키 없는 키는 그대로: 처음 탭에서 → · ← · ←(돌아감 또는 하나 앞) · End · Home · ←(첫 탭에서 끝으로 돌아감) · →(끝에서 첫 탭으로)
  const plain = ['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'End', 'Home', 'ArrowLeft', 'ArrowRight'].map((k) => {
    const e = key(focused()!, k);
    return `${k}: ${e.defaultPrevented ? '막음' : '넘김'} ${tabs().indexOf(focused()!)}`;
  });
  const want = [(at + 1) % n, at, (at - 1 + n) % n, n - 1, 0, n - 1, 0];
  expect(plain).toEqual(['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'End', 'Home', 'ArrowLeft', 'ArrowRight'].map((k, i) => `${k}: 막음 ${want[i]}`));
  expect(passed).toBe(COMBOS.length);
}

describe('탭 화살표는 수정 키 없는 키만 — 세 곳이 한 셈(259차)', () => {
  it('tabKeyTarget: ←·→(끝에서 돌아감)·Home·End만, 수정 키(Alt·Ctrl·Meta·Shift)와 함께면 -1', () => {
    const k = (key: string, mods: Mods = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
    expect([k('ArrowRight'), k('ArrowLeft'), k('Home'), k('End'), k('ArrowUp'), k('ArrowDown'), k('Enter'), k('a')].map((e) => tabKeyTarget(e, 1, 4))).toEqual([2, 0, 0, 3, -1, -1, -1, -1]);
    expect([k('ArrowRight'), k('ArrowLeft')].map((e) => tabKeyTarget(e, 3, 4))).toEqual([0, 2]);
    expect([k('ArrowRight'), k('ArrowLeft')].map((e) => tabKeyTarget(e, 0, 4))).toEqual([1, 3]);
    expect(COMBOS.map(([, key, m]) => tabKeyTarget(k(key, m), 1, 4))).toEqual(COMBOS.map(() => -1));
  });

  it('리본 탭(수동 고르기): 수정 키 조합은 넘기고, ←·→·Home·End는 그대로 — 고른 탭·Tab 차례는 그대로', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    const ribbonTabs = document.createElement('div');
    const ribbon = document.createElement('div');
    document.getElementById('app')!.replaceChildren(ribbonTabs, ribbon);
    // 셸 전체를 만들지 않고 리본 탭 줄만 그린다(패널은 빈 칸, 리본 단추 상태 맞추기는 빈 함수로)
    const sh = Object.assign(Object.create(Shell.prototype) as object, {
      app: h.app,
      ribbonTabs,
      ribbon,
      activeTab: 0,
      overlayMode: false,
      panelElement: () => document.createElement('div'),
      refreshRibbonState() {},
    }) as unknown as { buildRibbon(): void };
    sh.buildRibbon();
    const tabs = () => [...ribbonTabs.children] as HTMLElement[];
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    check(tabs, 0, ribbonTabs);
    // 화살표는 초점만(수동 고르기) — 고른 탭·Tab 차례는 첫 탭 그대로
    expect(tabs().map((b) => b.getAttribute('tabindex'))).toEqual(tabs().map((_, i) => (i === 0 ? '0' : '-1')));
    expect(tabs().map((b) => b.getAttribute('aria-selected'))).toEqual(tabs().map((_, i) => (i === 0 ? 'true' : 'false')));
  });

  it('도면 탭(시작·t.dwg·u.dwg): 수정 키 조합은 넘기고, ←·→·Home·End는 그대로', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    h.app.docs.push(new DocState(2, createNewDocument('metric'), 'u.dwg', 0, 0));
    const fileTabs = document.createElement('div');
    document.getElementById('app')!.replaceChildren(fileTabs);
    // 셸 전체를 만들지 않고 도면 탭 줄만 그린다
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, fileTabs, refreshRibbonState() {} }) as unknown as { refreshTabs(): void };
    sh.refreshTabs();
    const tabs = () => [...fileTabs.querySelectorAll<HTMLElement>('.filetab-open')];
    expect(tabs().map((b) => b.textContent)).toEqual(['시작', 't.dwg', 'u.dwg']);
    // 지금 도면(t.dwg)에서 시작
    check(tabs, 1, fileTabs);
  });

  it('팔레트 탭(1024px, 수동 고르기): 수정 키 조합은 넘기고, ←·→·Home·End는 그대로 — 고른 탭·Tab 차례는 그대로', async () => {
    const h = makeApp();
    h.st.session = new EditSession(h.doc, () => h.app.ui.refreshPalette());
    bindCommitHooks(h.app, h.st);
    registerCommands(h.app);
    const line = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
    line.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: line }] });
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const pal = new Palette(h.app, root);
    h.app.ui.refreshPalette = () => pal.refresh();
    unwatch.push(() => {
      h.app.cmd.watchers.clear();
      h.app.cancel(true);
    });
    // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewtabs258 꼴)
    await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
    h.app.setSelection([line.handle], 'replace');
    pal.open('props');
    const tabs = () => [...pal.el.querySelectorAll<HTMLElement>('.palette-tabs > button')];
    expect(tabs().map((b) => b.textContent)).toEqual(['특성', '도면층', '치수', '찾기']);
    check(tabs, 0, pal.el);
    expect(tabs().map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(tabs().map((b) => b.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
  });
});
