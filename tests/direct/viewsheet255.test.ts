/**
 * 휴대폰 시트(폭 760px 미만에서 아래쪽 시트로 보이는 팔레트 — 도면층·특성·치수·찾기)를 열고 닫을 때의 초점과 Esc(255차 — 252차 보고 (3)).
 * WCAG 2.2 2.4.3 초점 순서·2.1.2 키보드 덫 없음, W3C APG 「Dialog (Modal)」의 여닫기 초점 규칙을 비모달 시트에 맞춘다:
 * 전에는 열어도 초점이 연 단추에 남고(찾기 탭만 찾을 글 칸), 닫으면 숨은 시트 안에 남아 본문으로 빠지며, Esc는 시트가 아니라 앱 취소(재기 취소·선택 해제)였다.
 * - 열면 초점을 고른 탭(253차 aria-selected)으로(찾기 탭은 지금처럼 찾을 글 칸), 닫으면(닫기 단추·Esc·재기 단추) 초점이 시트 안이었으면 연 단추로 —
 *   연 단추가 사라졌으면 도면(본문 — 앱 키 처리가 도면으로 받는 곳).
 * - Esc는 시트 안 글 칸 밖에서만 시트를 닫는다(글 칸의 Esc가 먼저). 진행 중인 재기는 그대로 — 시트 밖(연 단추)에서 한 번 더 누른 Esc가 취소한다.
 * - 시트는 도면을 덮지 않는 비모달이라 역할(dialog·aria-modal)은 두지 않는다. 데스크톱 오른쪽 팔레트(760px 이상 — 가로로 눕힌 휴대폰 포함)는 그대로.
 * 진짜 App·MobileView·Palette·명령과 앱 창 키 처리, 화면·명령행·엔진·글꼴·메뉴·토스트는 가짜(viewlayers246·viewa11y253 꼴).
 */
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import type { MenuItem } from '../../src/app/ui/dom';
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

/** 선 하나, 진짜 팔레트·휴대폰 보기(셸처럼 openPalette·closePalette·refreshPalette를 잇는다). width는 창 폭 */
async function setup(width: number) {
  setWidth(width);
  const h = makeApp();
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
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다(viewa11y253 꼴)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
  const btn = (label: string) => [...mv.bar.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.vb-lbl')?.textContent === label)!;
  const tab = (label: string) => [...pal.el.querySelectorAll<HTMLButtonElement>('.palette-tabs > button')].find((b) => b.textContent === label)!;
  const closeBtn = () => pal.el.querySelector<HTMLButtonElement>('.palette-head > button[aria-label="팔레트 닫기"]')!;
  const esc = (el: Element) => {
    const e = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  return { ...h, line, root, pal, mv, btn, tab, closeBtn, esc };
}

const focused = () => document.activeElement;

describe('휴대폰 시트는 열면 초점을 고른 탭으로, 닫으면 연 단추로 돌려주고 Esc로 닫힌다(255차)', () => {
  it('보기 단추 「도면층」·「치수」, 시트 안 탭 바꾸기, 글 칸의 Esc가 먼저, 더 보기 「문자 찾기」', async () => {
    const h = await setup(390);
    h.mv.apply(true);
    await settle();
    expect(h.app.viewOnly).toBe(true);
    const layers = h.btn('도면층');
    const dims = h.btn('치수');

    // 열면 고른 탭으로(전에는 연 단추에 남았다)
    layers.focus();
    layers.click();
    expect(h.pal.el.hidden).toBe(false);
    expect(focused()).toBe(h.tab('도면층'));
    expect(h.tab('도면층').getAttribute('aria-selected')).toBe('true');
    // 닫기 단추: 연 단추로(전에는 숨은 시트 안에 남았다)
    h.closeBtn().click();
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);

    // Esc: 시트를 닫고 연 단추로(앱 취소로 넘기지 않음)
    dims.focus();
    dims.click();
    expect(focused()).toBe(h.tab('치수'));
    const e1 = h.esc(focused()!);
    expect(e1.defaultPrevented).toBe(true);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(dims);

    // 시트 안에서 탭을 바꾸면 탭을 다시 그려도 초점은 새 고른 탭, 연 단추는 그대로(도면층)
    layers.focus();
    layers.click();
    const dimTab = h.tab('치수');
    dimTab.focus();
    dimTab.click();
    expect(h.tab('치수').getAttribute('aria-selected')).toBe('true');
    expect(dimTab.isConnected).toBe(false);
    expect(focused()).toBe(h.tab('치수'));
    h.esc(focused()!);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);

    // 글 칸(도면층 찾기)의 Esc는 시트를 닫지 않는다 — 탭으로 옮겨 누르면 닫힌다
    layers.click();
    const search = h.pal.el.querySelector<HTMLInputElement>('input.search')!;
    search.focus();
    const e2 = h.esc(search);
    expect(e2.defaultPrevented).toBe(false);
    expect(h.pal.el.hidden).toBe(false);
    expect(focused()).toBe(search);
    h.tab('도면층').focus();
    h.esc(h.tab('도면층'));
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);

    // 더 보기 「문자 찾기」(메뉴는 닫히며 초점을 더 보기로 돌려준 뒤 항목을 돌린다): 찾기 탭은 지금처럼 찾을 글 칸, 그 칸의 Esc는 칸이 삼킨다
    const more = h.mv.bar.querySelector<HTMLButtonElement>('.vb-more')!;
    more.focus();
    more.click();
    const items = vi.mocked(showMenu).mock.calls.at(-1)![2] as MenuItem[];
    items.find((m) => m.label === '문자 찾기')!.run!();
    expect(h.pal.el.hidden).toBe(false);
    const find = h.pal.el.querySelector<HTMLInputElement>('input.search')!;
    expect(focused()).toBe(find);
    h.esc(find);
    expect(h.pal.el.hidden).toBe(false);
    h.tab('찾기').focus();
    h.esc(h.tab('찾기'));
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(more);
  });

  it('Esc 차례: 재는 중에 연 시트의 Esc는 시트만 닫고 재기는 그대로 — 시트 밖(연 단추)의 Esc가 재기를 취소. 재기 단추가 시트를 닫아도 초점은 연 단추로', async () => {
    const h = await setup(390);
    h.mv.apply(true);
    await settle();
    const layers = h.btn('도면층');
    h.btn('거리').click();
    await settle();
    expect(h.app.busyCommand).toBe('DIST');
    layers.focus();
    layers.click();
    await settle();
    expect(h.app.busyCommand).toBe('DIST');
    expect(focused()).toBe(h.tab('도면층'));
    h.esc(focused()!);
    await settle();
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);
    expect(h.app.busyCommand).toBe('DIST');
    // 시트 밖(연 단추)의 Esc는 앱 취소 — 재기를 취소하고 시트는 닫힌 채
    h.esc(layers);
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(h.pal.el.hidden).toBe(true);

    // 재기 단추가 시트를 닫을 때 초점이 시트 안에 남아 있었으면(누르기가 초점을 옮기지 않는 브라우저 — 시험의 click도 옮기지 않음) 연 단추로
    layers.click();
    expect(focused()).toBe(h.tab('도면층'));
    h.btn('각도').click();
    await settle();
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(layers);
    expect(h.app.busyCommand).toBe('MEASUREANGLE');
  });

  it('정보 카드 「특성 전체」: 닫으면 그 칩으로 — 열린 동안 카드를 다시 그려 칩이 사라졌으면 시트 안 초점을 풀어 도면(본문)으로', async () => {
    const h = await setup(390);
    h.mv.apply(true);
    await settle();
    h.app.setSelection([h.line], 'replace');
    await settle();
    expect(h.mv.card.classList.contains('is-info')).toBe(true);
    const chip = () => [...h.mv.card.querySelectorAll<HTMLButtonElement>('button.mv-chip')].find((b) => b.textContent?.includes('특성 전체'))!;
    const c1 = chip();
    c1.focus();
    c1.click();
    expect(h.pal.el.hidden).toBe(false);
    expect(focused()).toBe(h.tab('특성'));
    h.esc(focused()!);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(c1);

    c1.click();
    expect(focused()).toBe(h.tab('특성'));
    // 고른 것·도면이 바뀌면 카드를 새로 그린다(칩이 새 요소)
    h.mv.refresh();
    await settle();
    expect(c1.isConnected).toBe(false);
    expect(chip()).toBeDefined();
    h.closeBtn().click();
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(document.body);
  });

  it('편집 화면의 좁은 화면 시트도 같은 시트: 명령행·리본 단추로 열면 고른 탭으로, Esc면 그 자리로 — 연 곳이 없으면(두 번 누르기) 닫을 때 본문', async () => {
    const h = await setup(390);
    expect(h.app.viewOnly).toBe(false);
    const opener = document.createElement('button');
    opener.textContent = '리본 단추';
    h.root.append(opener);
    opener.focus();
    h.pal.open('layers');
    expect(focused()).toBe(h.tab('도면층'));
    h.esc(focused()!);
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).toBe(opener);
    // 도면을 두 번 눌러 연 빠른 특성(초점은 본문)
    opener.blur();
    expect(focused()).toBe(document.body);
    h.pal.open('props');
    expect(focused()).toBe(h.tab('특성'));
    h.closeBtn().click();
    expect(focused()).toBe(document.body);
  });
});

describe('데스크톱 오른쪽 팔레트(760px 이상)는 그대로(255차)', () => {
  it('가로로 눕힌 휴대폰의 보기 모드(844px)·데스크톱 편집 화면: 열어도 초점을 옮기지 않고, 닫아도 돌려주지 않으며, Esc는 앱 취소(팔레트는 열린 채)', async () => {
    const h = await setup(844);
    h.mv.apply(true);
    await settle();
    const layers = h.btn('도면층');
    layers.focus();
    layers.click();
    expect(h.pal.el.hidden).toBe(false);
    expect(focused()).toBe(layers);
    const t = h.tab('도면층');
    t.focus();
    h.closeBtn().click();
    expect(h.pal.el.hidden).toBe(true);
    expect(focused()).not.toBe(layers);
    // Esc는 앱 취소: 고른 객체를 풀고 팔레트는 열린 채
    h.app.setSelection([h.line], 'replace');
    await settle();
    layers.click();
    h.tab('도면층').focus();
    const e = h.esc(h.tab('도면층'));
    await settle();
    expect(e.defaultPrevented).toBe(true);
    expect(h.pal.el.hidden).toBe(false);
    expect(h.st.selection.size).toBe(0);

    // 데스크톱 편집 화면(1024px)
    setWidth(1024);
    h.mv.apply(false);
    await settle();
    const opener = document.createElement('button');
    h.root.append(opener);
    opener.focus();
    h.pal.open('props');
    expect(focused()).toBe(opener);
    h.tab('특성').focus();
    h.esc(h.tab('특성'));
    await settle();
    expect(h.pal.el.hidden).toBe(false);
  });
});
