/**
 * 특성 칸에 치던 글(확정 전)이 팔레트를 다시 그려도 남는 것(257차 — 256차 보고 (1)·(2)).
 * 팔레트 다시 그리기(refresh)는 몸을 통째로 새로 만든다. 256차는 초점을 같은 특성 칸(data-field)으로 돌려주되 도면 값을 다시 그려 전체를 골랐다 —
 * Enter·칸 떠남(change) 전에 다른 일(도면층 바꾸기 등 편집 확정, 같은 객체를 다시 고름)로 다시 그리면 친 글과 커서를 잃었다.
 * 이제 지난번에 그릴 때와 대상(탭·보기 모드·문서·공간·고른 객체 집합·고른 표 셀)이 같으면 같은 칸에 친 글·커서를 되돌리고,
 * 치지 않은 칸도 커서를 지킨다. 다른 객체를 고르면(칸의 뜻이 바뀜) 지금처럼 도면 값·전체 고르기. Enter 확정·Esc 되돌리기는 그대로.
 * 진짜 App·Palette·명령, 화면·명령행·엔진·글꼴·메뉴·토스트는 가짜(viewfocus256 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { EditSession } from '../../src/edit/session';
import { registerCommands } from '../../src/app/commands';
import { bindCommitHooks } from '../../src/app/hooks';
import { patchLayers } from '../../src/app/layers';
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
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1024 });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  // 되돌린 칸이 떠날 때 대신 보내는 change(257차)는 칸의 창(jsdom) 사건이어야 한다(viewa11y254의 MouseEvent 꼴)
  vi.stubGlobal('Event', dom.window.Event);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
/** 시험이 끝난 뒤 명령이 남지 않게 */
const unwatch: (() => void)[] = [];
afterEach(async () => {
  for (const f of unwatch.splice(0)) f();
  await settle();
});

/** 도면층 0(현재)·A, 선 L1 (0,0)-(10,0)·L2 (5,5)-(15,5)(도면층 0), 진짜 팔레트(1024px 데스크톱 — 셸처럼 refreshPalette를 잇는다) */
async function setup() {
  const h = makeApp((doc) => {
    doc.layers.set('A', { ...structuredClone(doc.layers.get('0')!), name: 'A', handle: 'A0' });
  });
  // 편집을 확정하면 앱처럼(edits.ts onApply) 팔레트를 다시 그린다 — 도면층 바꾸기·특성 칸 확정이 refresh에 닿는 길(viewfocus256 꼴)
  h.st.session = new EditSession(h.doc, () => h.app.ui.refreshPalette());
  bindCommitHooks(h.app, h.st);
  registerCommands(h.app);
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    add({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } } as LineEntity);
  const l1 = line(0, 0, 10, 0);
  const l2 = line(5, 5, 15, 5);
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const pal = new Palette(h.app, root);
  h.app.ui.refreshPalette = () => pal.refresh();
  unwatch.push(() => {
    h.app.cmd.watchers.clear();
    h.app.cancel(true);
  });
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewfocus256 꼴)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
  /** 특성 칸(다시 그리면 새 요소라 그때마다 찾는다) */
  const field = (label: string) => pal.el.querySelector(`[data-field="pf-${label}"]`) as HTMLInputElement;
  const key = (el: Element, k: string) => {
    const e = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  /** 사용자가 글을 치는 것: 글·커서를 바꾸고 input 사건만(change 없음 — 확정 전) */
  const type = (el: HTMLInputElement, text: string, caret: number) => {
    el.value = text;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  /** 다른 일로 다시 그리기: 도면층 A를 끄는 편집 확정(고른 것은 그대로) */
  const layerOff = () => expect(patchLayers(h.app, 'LAYER', [['A', { off: true }]])).toBe(1);
  const startX = (handle: string) => (h.doc.entityIndex.get(handle) as LineEntity).start.x;
  return { ...h, l1, l2, pal, field, key, type, layerOff, startX };
}

const focused = () => document.activeElement;
const range = (el: HTMLInputElement) => [el.selectionStart, el.selectionEnd];

describe('특성 칸에 치던 글은 같은 대상이면 다시 그려도 남는다(257차)', () => {
  it('같은 객체를 보는 동안 다른 일(도면층 끄기·같은 객체 다시 고르기)로 다시 그려도 친 글·커서가 남고, Enter가 그 글을 확정한다', async () => {
    const h = await setup();
    h.app.setSelection([h.l1], 'replace');
    h.pal.open('props');
    const x = h.field('시작 X');
    x.focus();
    h.type(x, '12.5', 2);
    // 도면층 바꾸기(편집 확정) — 고른 것은 그대로
    h.layerOff();
    const x2 = h.field('시작 X');
    expect(x2).not.toBe(x);
    expect(focused()).toBe(x2);
    expect(x2.value).toBe('12.5');
    expect(range(x2)).toEqual([2, 2]);
    expect(h.startX(h.l1)).toBe(0);
    // 같은 객체를 다시 고름 — 고른 것은 같다
    h.app.setSelection([h.l1], 'replace');
    const x3 = h.field('시작 X');
    expect(x3).not.toBe(x2);
    expect(focused()).toBe(x3);
    expect(x3.value).toBe('12.5');
    expect(range(x3)).toEqual([2, 2]);
    // Enter: 되돌린 글을 확정하고 칸을 떠난다(확정 규칙 그대로)
    h.key(x3, 'Enter');
    expect(h.startX(h.l1)).toBe(12.5);
    expect(focused()).toBe(document.body);
  });

  it('다른 객체를 고르면 지금처럼 그 객체의 도면 값·전체 고르기(친 글은 버림) — 그 칸에서 친 글도 다시 그려 남고, Esc는 도면 값으로 되돌린다', async () => {
    const h = await setup();
    h.app.setSelection([h.l2], 'replace');
    h.pal.open('props');
    const o2 = h.field('시작 X').value;
    h.app.setSelection([h.l1], 'replace');
    const x = h.field('시작 X');
    x.focus();
    h.type(x, '99', 1);
    // 다른 객체를 고름: 칸의 뜻이 바뀌어 그 객체의 도면 값을 전체 골라 둔다(256차 그대로)
    h.app.setSelection([h.l2], 'replace');
    const x2 = h.field('시작 X');
    expect(focused()).toBe(x2);
    expect(x2.value).toBe(o2);
    expect(range(x2)).toEqual([0, o2.length]);
    expect(h.startX(h.l1)).toBe(0);
    // 이 칸에서 친 글은 다른 일로 다시 그려도 남는다
    h.type(x2, '75', 1);
    h.layerOff();
    const x3 = h.field('시작 X');
    expect(x3).not.toBe(x2);
    expect(focused()).toBe(x3);
    expect(x3.value).toBe('75');
    expect(range(x3)).toEqual([1, 1]);
    // Esc: 도면 값으로 되돌리고 칸을 떠난다 — 확정하지 않는다(Esc 규칙 그대로)
    h.key(x3, 'Escape');
    expect(x3.value).toBe(o2);
    expect(focused()).toBe(document.body);
    expect(h.startX(h.l2)).toBe(5);
  });

  it('치지 않은 칸도 같은 대상이면 다시 그려도 커서 자리를 지킨다(256차 보고 (2) — 전에는 전체 고르기)', async () => {
    const h = await setup();
    h.app.setSelection([h.l1], 'replace');
    h.pal.open('props');
    const x = h.field('끝 X');
    const v = x.value;
    expect(v.length).toBeGreaterThan(1);
    x.focus();
    x.setSelectionRange(1, 1);
    h.layerOff();
    const x2 = h.field('끝 X');
    expect(x2).not.toBe(x);
    expect(focused()).toBe(x2);
    expect(x2.value).toBe(v);
    expect(range(x2)).toEqual([1, 1]);
  });
});
