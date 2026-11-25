// @vitest-environment jsdom
/**
 * 나머지 탭 목록의 화살표 옮기기(260차 — 258차 보고 (3), 259차 보고 (1), W3C APG 탭 꼴).
 * 리본·도면·팔레트 탭(258·259차) 밖의 탭 목록 — 관리 대화 상자 탭 묶음(mgr-ui `tabs` — OPTIONS·DWGPROPS·EATTEDIT, 여기서는 DWGPROPS),
 * 치수 스타일 대화 상자(7탭), 디자인센터, 블록 팔레트, 참조 편집 대화 상자 — 는 탭마다 Tab 차례에 들고 화살표로 옮길 수 없었다.
 * 이제 고른 탭만 tabindex 0(나머지 -1), 수정 키 없는 ←·→(끝에서 돌아감)·Home·End는 초점만 옮기고(막고 위로 넘기지 않음), 수정 키 조합은 넘기며
 * (259차 `tabKeyTarget`), Enter·Space(단추 누르기)로 고른다(리본 꼴 수동 고르기). 디자인센터는 aria-selected를 새로 달고, 참조 편집은 탭 역할까지
 * (role=tab·aria-selected·aria-controls, 쪽 tabpanel·aria-labelledby — 253차 꼴) 새로 단다. 탭 위 Enter는 탭 고르기만 — 참조 편집 몸의 확인·디자인센터의
 * 넣기로 넘기지 않는다. 치수 스타일은 고르면 탭 줄을 다시 그리므로 같은 자리(새 고른 탭)에 초점을 돌려준다.
 * 도면 탭 Delete(닫기)도 Alt·Ctrl·⌘·Shift와 함께면 닫지 않고 넘긴다(259차 보고 (1)).
 * 진짜 App, 화면·명령행·엔진·글꼴은 가짜(viewedit250·annotedit/styles 꼴).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewDocument } from '../../src/core/newdoc';
import { DocState } from '../../src/app/docstate';
import { registerDwgProps } from '../../src/app/dwgprops';
import { registerDimStyleCommands } from '../../src/app/dimstyle';
import { registerDesignCenterCommands } from '../../src/app/designcenter';
import { registerBlkPaletteCommands } from '../../src/app/blkcmds-palette';
import { refEditDialog } from '../../src/app/refedit-ui';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

// jsdom에는 캔버스 그리기가 없다(미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(async () => {
  document.body.replaceChildren();
  await settle();
});

type Mods = { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
/** 요소에 keydown을 보내고 사건을 돌려준다 */
const key = (el: Element, k: string, mods: Mods = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, ...mods, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};
const focused = () => document.activeElement as HTMLElement | null;
const attr = (tabs: HTMLElement[], a: string) => tabs.map((b) => b.getAttribute(a));
/** 고른 탭(sel)만 tabindex 0·aria-selected true */
const roving = (n: number, sel: number) => [Array.from({ length: n }, (_, i) => (i === sel ? '0' : '-1')), Array.from({ length: n }, (_, i) => (i === sel ? 'true' : 'false'))];
const state = (tabs: HTMLElement[]) => [attr(tabs, 'tabindex'), attr(tabs, 'aria-selected')];
const SEQ = ['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'End', 'Home', 'ArrowLeft', 'ArrowRight'];
/** 탭 줄의 탭 단추(다섯 줄 모두 자식이 탭 단추뿐 — 치수 스타일은 고르면 새 요소라 그때마다 읽는다) */
const kids = (box: HTMLElement) => () => [...box.children] as HTMLElement[];

/**
 * 탭 줄 하나: 탭 at에 초점을 두고 Alt+←(넘김 — 초점 그대로, 막지 않음, 줄 상자로 올라감), 이어 수정 키 없는 → · ← · ← · End · Home · ← · →
 * (초점만 옮기고 막으며 줄 상자로 넘기지 않음). 끝나면 초점은 첫 탭
 */
function arrows(tabs: () => HTMLElement[], at: number, box: HTMLElement): string[] {
  let passed = 0;
  const count = () => passed++;
  box.addEventListener('keydown', count);
  tabs()[at]!.focus();
  const out = [`처음 ${tabs().indexOf(focused()!)}`];
  const alt = key(focused()!, 'ArrowLeft', { altKey: true });
  out.push(`Alt+←: ${alt.defaultPrevented ? '막음' : '넘김'} ${tabs().indexOf(focused()!)}`);
  for (const k of SEQ) {
    const e = key(focused()!, k);
    out.push(`${k}: ${e.defaultPrevented ? '막음' : '넘김'} ${tabs().indexOf(focused()!)}`);
  }
  out.push(`줄 상자 ${passed}`);
  box.removeEventListener('keydown', count);
  return out;
}
const want = (at: number, n: number) => [
  `처음 ${at}`,
  `Alt+←: 넘김 ${at}`,
  ...[(at + 1) % n, at, (at - 1 + n) % n, n - 1, 0, n - 1, 0].map((i, j) => `${SEQ[j]}: 막음 ${i}`),
  '줄 상자 1',
];

describe('나머지 탭 목록 — 고른 탭만 Tab 차례, ←·→·Home·End로 옮기고 Enter·Space로 고름(260차)', () => {
  it('관리 대화 상자 탭 묶음(DWGPROPS 일반·요약·통계·사용자 정의 — OPTIONS·EATTEDIT와 같은 함수)', async () => {
    const h = makeApp();
    registerDwgProps(h.app);
    const run = h.app.run('DWGPROPS');
    await vi.waitFor(() => expect(document.querySelector('.dialog')?.getAttribute('aria-label')).toMatch(/ 특성$/));
    // 첫 칸에 초점을 두는 대화 상자의 타이머가 끝난 뒤에 시작한다
    await settle();
    const dlg = document.querySelector('.dialog') as HTMLElement;
    const box = dlg.querySelector('.mgr-tabs') as HTMLElement;
    const tabs = kids(box);
    expect(tabs().map((b) => b.textContent)).toEqual(['일반', '요약', '통계', '사용자 정의']);
    expect(state(tabs())).toEqual(roving(4, 1));
    expect(arrows(tabs, 1, box)).toEqual(want(1, 4));
    // 화살표는 초점만(수동 고르기) — 고른 탭·Tab 차례 그대로
    expect(state(tabs())).toEqual(roving(4, 1));
    // End → 사용자 정의, 누르기(Enter·Space) → 고름, 쪽이 바뀌고 초점 그대로
    key(focused()!, 'End');
    focused()!.click();
    expect([state(tabs()), tabs().indexOf(focused()!), [...dlg.querySelectorAll<HTMLElement>('.mgr-page')].map((p) => p.hidden)]).toEqual([roving(4, 3), 3, [true, true, true, false]]);
    ([...dlg.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent === '취소') as HTMLButtonElement).click();
    await run;
  });

  it('치수 스타일 대화 상자(7탭): 고르면 탭 줄을 다시 그려도 초점이 새 고른 탭에 남는다', async () => {
    const h = makeApp();
    registerDimStyleCommands(h.app);
    void h.app.run('DIMSTYLE');
    await settle();
    ([...document.querySelectorAll<HTMLButtonElement>('.dialog button')].find((b) => b.textContent === '수정...') as HTMLButtonElement).click();
    await settle();
    const dlg = [...document.querySelectorAll<HTMLElement>('.dialog')].find((d) => d.getAttribute('aria-label')?.startsWith('치수 스타일 수정'))!;
    const box = dlg.querySelector('[role=tablist]') as HTMLElement;
    const tabs = kids(box);
    expect(tabs().map((b) => b.textContent)).toEqual(['선', '기호 및 화살표', '문자', '맞춤⁠', '1차 단위', '대체 단위', '공차']);
    expect(state(tabs())).toEqual(roving(7, 0));
    expect(arrows(tabs, 0, box)).toEqual(want(0, 7));
    expect(state(tabs())).toEqual(roving(7, 0));
    // → → 문자, 누르기 → 탭 줄을 다시 그린다(새 요소) — 초점은 새 문자 탭
    key(focused()!, 'ArrowRight');
    key(focused()!, 'ArrowRight');
    const old = focused();
    old!.click();
    expect([state(tabs()), tabs().indexOf(focused()!), tabs()[2] === old]).toEqual([roving(7, 2), 2, false]);
  });

  it('디자인센터(열린 도면·사용 내역): aria-selected를 달고, 탭 위 Enter는 패널(고른 항목 넣기)로 넘기지 않는다', async () => {
    const h = makeApp();
    registerDesignCenterCommands(h.app);
    void h.app.run('ADCENTER');
    await settle();
    try {
      const pal = document.querySelector('.dc-panel') as HTMLElement;
      const box = pal.querySelector('.dc-tabs') as HTMLElement;
      const tabs = kids(box);
      expect(tabs().map((b) => b.textContent)).toEqual(['열린 도면', '사용 내역']);
      expect(state(tabs())).toEqual(roving(2, 0));
      expect(arrows(tabs, 0, box)).toEqual(want(0, 2));
      expect(state(tabs())).toEqual(roving(2, 0));
      // → 사용 내역, Enter는 막지 않고(단추 누르기 그대로) 패널로 넘기지 않음, 누르기 → 고름
      key(focused()!, 'ArrowRight');
      let toPanel = 0;
      const count = () => toPanel++;
      pal.addEventListener('keydown', count);
      const enter = key(focused()!, 'Enter');
      pal.removeEventListener('keydown', count);
      focused()!.click();
      expect([enter.defaultPrevented, toPanel, state(tabs()), tabs().indexOf(focused()!)]).toEqual([false, 0, roving(2, 1), 1]);
    } finally {
      await h.app.run('ADCCLOSE');
    }
  });

  it('블록 팔레트(현재 도면·최근 사용·라이브러리)', async () => {
    const h = makeApp();
    // 가짜 화면 요소에는 떼기가 없다(팔레트를 닫을 때 끌어 놓기 처리기를 뗀다)
    Object.assign(h.view.el, { removeEventListener() {} });
    registerBlkPaletteCommands(h.app);
    void h.app.run('BLOCKSPALETTE');
    await settle();
    try {
      const box = document.querySelector('.bp-panel .bp-tabs') as HTMLElement;
      const tabs = kids(box);
      expect(tabs().map((b) => b.textContent)).toEqual(['현재 도면', '최근 사용', '라이브러리']);
      expect(state(tabs())).toEqual(roving(3, 0));
      expect(arrows(tabs, 0, box)).toEqual(want(0, 3));
      expect(state(tabs())).toEqual(roving(3, 0));
      key(focused()!, 'End');
      focused()!.click();
      expect([state(tabs()), tabs().indexOf(focused()!)]).toEqual([roving(3, 2), 2]);
    } finally {
      await h.app.run('BLOCKSPALETTECLOSE');
    }
  });

  it('참조 편집 대화 상자(참조 식별·설정): 탭 역할(253차 꼴)을 달고, 탭 위 Enter는 확인으로 넘기지 않는다', async () => {
    let done = false;
    const p = refEditDialog([{ label: 'B1', depth: 0, kind: 'block', preview: () => null }], { unique: false, attdefs: false, lock: false }, 'auto').then((r) => {
      done = true;
      return r;
    });
    const dlg = document.querySelector('.dialog') as HTMLElement;
    expect(dlg.getAttribute('aria-label')).toBe('참조 편집');
    const box = dlg.querySelector('.re-tabs') as HTMLElement;
    const tabs = kids(box);
    const pages = [...dlg.querySelectorAll<HTMLElement>('.re-page')];
    expect(tabs().map((b) => b.textContent)).toEqual(['참조 식별', '설정']);
    // 역할: 탭 ↔ 쪽 이음(쪽 id·탭 id가 비어 있지 않음)
    expect([attr(tabs(), 'role'), attr(pages, 'role'), pages.every((x) => x.id) && tabs().every((b) => b.id)]).toEqual([['tab', 'tab'], ['tabpanel', 'tabpanel'], true]);
    expect([attr(tabs(), 'aria-controls'), attr(pages, 'aria-labelledby')]).toEqual([pages.map((x) => x.id), tabs().map((b) => b.id)]);
    expect(state(tabs())).toEqual(roving(2, 0));
    expect(arrows(tabs, 0, box)).toEqual(want(0, 2));
    expect(state(tabs())).toEqual(roving(2, 0));
    // → 설정, Enter: 대화 상자는 열린 채(확인으로 넘기지 않음), 누르기 → 설정 쪽
    key(focused()!, 'ArrowRight');
    const enter = key(focused()!, 'Enter');
    await settle();
    expect([enter.defaultPrevented, dlg.isConnected, done]).toEqual([false, true, false]);
    focused()!.click();
    expect([state(tabs()), tabs().indexOf(focused()!), pages.map((x) => x.hidden)]).toEqual([roving(2, 1), 1, [true, false]]);
    ([...dlg.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent === '취소') as HTMLButtonElement).click();
    expect(await p).toBeNull();
  });

  it('도면 탭 Delete(닫기): Alt·Ctrl·⌘·Shift와 함께면 닫지 않고 넘김, Delete만 닫음(259차 보고 (1))', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = makeApp();
    const u = new DocState(2, createNewDocument('metric'), 'u.dwg', 0, 0);
    h.app.docs.push(u);
    const closed: DocState[] = [];
    Object.assign(h.app, { close: async (st: DocState) => (closed.push(st), true) });
    const fileTabs = document.createElement('div');
    document.body.replaceChildren(fileTabs);
    // 셸 전체를 만들지 않고 도면 탭 줄만 그린다(tabkeys259 꼴)
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, fileTabs, refreshRibbonState() {} }) as unknown as { refreshTabs(): void };
    sh.refreshTabs();
    const tabs = () => [...fileTabs.querySelectorAll<HTMLElement>('.filetab-open')];
    expect(tabs().map((b) => b.textContent)).toEqual(['시작', 't.dwg', 'u.dwg']);
    tabs()[2]!.focus();
    // 넘긴 키는 탭 줄을 지나 앱 창 키 처리로 간다 — 거기서 Delete는 다른 단추에 초점이 있을 때와 같은 「고른 객체 지우기」(고른 것이 없어 아무것도 안 함)
    let passed = 0;
    fileTabs.addEventListener('keydown', () => passed++);
    const got = ([['Shift+Delete', { shiftKey: true }], ['Ctrl+Delete', { ctrlKey: true }], ['Alt+Delete', { altKey: true }], ['⌘+Delete', { metaKey: true }], ['Delete', {}]] as [string, Mods][]).map(([name, m]) => {
      const before = passed;
      key(focused()!, 'Delete', m);
      return `${name}: ${passed > before ? '넘김' : '탭이 받음'} ${closed.length}`;
    });
    expect(got).toEqual(['Shift+Delete: 넘김 0', 'Ctrl+Delete: 넘김 0', 'Alt+Delete: 넘김 0', '⌘+Delete: 넘김 0', 'Delete: 탭이 받음 1']);
    expect([closed, h.st.selection.size]).toEqual([[u], 0]);
  });
});
