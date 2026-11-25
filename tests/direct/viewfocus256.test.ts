/**
 * 팔레트를 다시 그려도 초점이 같은 뜻의 요소에 남는 것(256차 — 255차 보고 (1)·(3), WCAG 2.2 2.4.3 초점 순서).
 * 데스크톱 오른쪽 팔레트와 휴대폰 시트는 같은 코드이고, 다시 그리기(refresh)는 탭 줄과 몸을 통째로 새로 만든다 — 전에는 특성 칸(data-field)만 되돌려
 * 누른 도면층 켜기 단추·탭 등의 초점이 본문으로 빠졌다. 키보드 사용자는 도면층 하나를 켜고 끌 때마다 자리를 잃고,
 * 시트에서는 그 뒤 Esc가 시트 밖 Esc(앱 취소)라 시트를 닫지 않았다.
 * 이제 다시 그린 뒤 같은 표지(탭 id·도면층 행 data-layer와 단추 data-act·특성 칸 data-field·접근 이름)의 요소로 돌려주고,
 * 그 요소가 없거나 받지 못하면 그 도면층 행의 첫 단추, 그다음 고른 탭으로. 도면층 찾기 칸은 커서 자리도 돌려준다.
 * 진짜 App·MobileView·Palette·명령과 앱 창 키 처리, 화면·명령행·엔진·글꼴·메뉴·토스트는 가짜(viewsheet255 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { EditSession } from '../../src/edit/session';
import { registerCommands } from '../../src/app/commands';
import { ft } from '../../src/app/filetext';
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
  // 고치기 전 팔레트는 특성 칸을 되돌릴 때 `instanceof HTMLInputElement`를 본다(viewprops247 꼴)
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

/** 도면층 0(현재)·A, 선 하나(도면층 0), 진짜 팔레트·휴대폰 보기(셸처럼 openPalette·closePalette·refreshPalette를 잇는다). width는 창 폭 */
async function setup(width: number) {
  setWidth(width);
  const h = makeApp((doc) => {
    doc.layers.set('A', { ...structuredClone(doc.layers.get('0')!), name: 'A', handle: 'A0' });
  });
  // 편집을 확정하면 앱처럼(edits.ts onApply) 팔레트를 다시 그린다 — 도면층 켜고 끄기·특성 칸 바꾸기가 refresh에 닿는 길
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
  // 셸의 refreshPalette처럼 팔레트와 휴대폰 보기를 함께 다시 그린다
  h.app.ui.refreshPalette = () => {
    pal.refresh();
    mv.refresh();
  };
  root.append(mv.bar, mv.card);
  unwatch.push(() => {
    h.app.cmd.watchers.clear();
    h.app.cancel(true);
  });
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewsheet255 꼴)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
  const btn = (label: string) => [...mv.bar.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.vb-lbl')?.textContent === label)!;
  const tab = (label: string) => [...pal.el.querySelectorAll<HTMLButtonElement>('.palette-tabs > button')].find((b) => b.textContent === label)!;
  /** 그 도면층의 행(다시 그리면 새 요소라 그때마다 찾는다) */
  const row = (name: string) => [...pal.el.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.querySelector('td.layer-name')?.textContent === name)!;
  /** 행의 켜기(1)·동결(2)·잠금(3) 단추 */
  const toggle = (name: string, col: 1 | 2 | 3) => row(name).children[col]!.querySelector('button') as HTMLButtonElement;
  /** 도면층 막대 단추(접근 이름, 없으면 글) */
  const bar = (label: string) => [...pal.el.querySelectorAll<HTMLButtonElement>('.layer-bar button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!;
  const search = () => pal.el.querySelector<HTMLInputElement>('input.search')!;
  const field = <T extends HTMLElement>(label: string) => pal.el.querySelector(`[data-field="pf-${label}"]`) as T;
  const key = (el: Element, k: string) => {
    const e = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  const fire = (el: Element, type: string) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  return { ...h, line, root, pal, mv, btn, tab, row, toggle, bar, search, field, key, fire };
}

const focused = () => document.activeElement;

describe('다시 그려도 초점은 같은 뜻의 요소에(256차)', () => {
  it('데스크톱 도면층 탭: 켜기·동결 단추는 같은 도면층의 같은 단추, 모두 켜기는 그 단추 — 이름 바꾸기 칸이 사라지면 그 행의 첫 단추, 꺼진 지우기 단추면 고른 탭', async () => {
    const h = await setup(1024);
    h.pal.open('layers');
    // 켜기: 다시 그린 새 단추(접근 이름은 상태대로 「A 꺼짐」)
    const on = h.toggle('A', 1);
    on.focus();
    on.click();
    expect(h.doc.layers.get('A')!.off).toBe(true);
    expect(on.isConnected).toBe(false);
    expect(focused()).toBe(h.toggle('A', 1));
    expect(focused()!.getAttribute('aria-label')).toBe(`${ft('A')} 꺼짐`);
    // 동결
    h.toggle('A', 2).focus();
    h.toggle('A', 2).click();
    expect(h.doc.layers.get('A')!.frozen).toBe(true);
    expect(focused()).toBe(h.toggle('A', 2));
    // 막대의 모두 켜기
    const all = h.bar('모두 켜기');
    all.focus();
    all.click();
    expect(h.doc.layers.get('A')!.off).toBe(false);
    expect(all.isConnected).toBe(false);
    expect(focused()).toBe(h.bar('모두 켜기'));

    // 이름 바꾸기 칸(이름 두 번 누르기)의 Esc: 칸이 없어지면 그 행의 첫 단추(켜기)
    // 이름 칸이 고치기 칸으로 바뀌면 이름 글로 행을 찾지 못하므로 행을 먼저 잡아 둔다
    const rowA = h.row('A');
    h.fire(rowA.querySelector('td.layer-name')!, 'dblclick');
    const input = rowA.querySelector<HTMLInputElement>('input.cell-input')!;
    expect(focused()).toBe(input);
    h.key(input, 'Escape');
    expect(input.isConnected).toBe(false);
    expect(focused()).toBe(h.toggle('A', 1));

    // 지우기: 고른 도면층이 사라져 단추가 꺼지면(초점을 받지 못함) 고른 탭
    h.row('A').click();
    const del = h.bar('도면층 지우기');
    expect(del.disabled).toBe(false);
    del.focus();
    del.click();
    expect(h.doc.layers.has('A')).toBe(false);
    expect(h.bar('도면층 지우기').disabled).toBe(true);
    expect(focused()).toBe(h.tab('도면층'));
  });

  it('도면층 찾기 칸: 글을 칠 때마다 다시 그려도 커서 자리·고른 범위를 지킨다(전에는 글 끝으로 옮겼다)', async () => {
    const h = await setup(1024);
    h.pal.open('layers');
    const s1 = h.search();
    s1.focus();
    s1.value = 'A';
    s1.setSelectionRange(1, 1);
    h.fire(s1, 'input');
    // 앞에 한 글자를 더 친다(커서는 그 글자 뒤 — 글 끝이 아님)
    const s2 = h.search();
    expect(s2).not.toBe(s1);
    expect(focused()).toBe(s2);
    s2.value = '0A';
    s2.setSelectionRange(1, 1);
    h.fire(s2, 'input');
    const s3 = h.search();
    expect(focused()).toBe(s3);
    expect(s3.value).toBe('0A');
    expect([s3.selectionStart, s3.selectionEnd]).toEqual([1, 1]);
    // 고른 범위도 그대로
    s3.setSelectionRange(0, 1);
    h.fire(s3, 'input');
    const s4 = h.search();
    expect(focused()).toBe(s4);
    expect([s4.selectionStart, s4.selectionEnd]).toEqual([0, 1]);
  });

  it('데스크톱 팔레트 탭을 키보드로 누르면 새 고른 탭(255차 보고 (3)) — 찾기 탭은 지금처럼 찾을 글 칸, 탭에서 Esc(앱 취소 — 고른 것이 바뀜)로 다시 그려도 탭에', async () => {
    const h = await setup(1024);
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    // 키보드로 누르기 = 초점이 있는 탭의 click
    const t1 = h.tab('도면층');
    t1.focus();
    t1.click();
    expect(t1.isConnected).toBe(false);
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.tab('도면층').getAttribute('aria-selected')).toBe('true');
    h.tab('치수').focus();
    h.tab('치수').click();
    expect(focused()).toBe(h.tab('치수'));
    expect(h.tab('치수').getAttribute('aria-selected')).toBe('true');
    // 찾기 탭은 지금처럼 찾을 글 칸
    h.tab('찾기').focus();
    h.tab('찾기').click();
    expect(focused()).toBe(h.search());
    // 특성 탭에서 Esc: 데스크톱은 앱 취소(255차 그대로 — 팔레트는 열린 채) → 고른 것이 풀려 다시 그려도 그 탭에
    h.tab('특성').focus();
    h.tab('특성').click();
    expect(focused()).toBe(h.tab('특성'));
    const t2 = h.tab('특성');
    const e = h.key(t2, 'Escape');
    await settle();
    expect(e.defaultPrevented).toBe(true);
    expect(h.st.selection.size).toBe(0);
    expect(h.pal.el.hidden).toBe(false);
    expect(t2.isConnected).toBe(false);
    expect(focused()).toBe(h.tab('특성'));
  });

  it('휴대폰 시트(390px 보기 모드): 도면층을 켜고 꺼도 같은 단추에 남아, 그 뒤 Esc가 시트를 닫고 연 단추 「도면층」으로(255차)', async () => {
    const h = await setup(390);
    h.mv.apply(true);
    await settle();
    expect(h.app.viewOnly).toBe(true);
    const layers = h.btn('도면층');
    layers.focus();
    layers.click();
    expect(focused()).toBe(h.tab('도면층'));
    h.toggle('A', 1).focus();
    h.toggle('A', 1).click();
    expect(h.doc.layers.get('A')!.off).toBe(true);
    expect(focused()).toBe(h.toggle('A', 1));
    // 다시 켜도 같은 단추
    h.toggle('A', 1).click();
    expect(h.doc.layers.get('A')!.off).toBe(false);
    expect(focused()).toBe(h.toggle('A', 1));
    // 시트 안 Esc: 시트를 닫고 연 단추로
    const e = h.key(focused()!, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);
  });

  it('특성 칸: 값을 바꿔 다시 그려도 같은 칸(지금과 같음) — 고른 것이 바뀌어 그 칸이 없어지면 「특성」 탭', async () => {
    const h = await setup(1024);
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    const layer = h.field<HTMLSelectElement>('도면층');
    layer.focus();
    layer.value = 'A';
    h.fire(layer, 'change');
    expect((h.doc.entityIndex.get(h.line) as LineEntity).layer).toBe('A');
    expect(layer.isConnected).toBe(false);
    expect(focused()).toBe(h.field('도면층'));
    // 선의 「시작 X」 칸에 초점 — 고른 것이 풀리면 새 객체의 현재 특성(시작 X 없음)으로 다시 그린다
    const x = h.field<HTMLInputElement>('시작 X');
    x.focus();
    h.app.setSelection([], 'replace');
    expect(h.field('시작 X')).toBeNull();
    expect(focused()).toBe(h.tab('특성'));
  });
});
