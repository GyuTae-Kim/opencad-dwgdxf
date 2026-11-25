// @vitest-environment jsdom
/**
 * 배치 탭(모형·배치)의 화살표 옮기기(261차 — 260차 보고 (1), W3C APG 탭 꼴 — 리본·팔레트·대화 상자 탭(258~260차)과 같은 꼴).
 * 전에는 배치 탭 줄이 역할 없는 단추 줄이라 탭마다 Tab 차례에 들고 화살표로 옮길 수 없었고, 누르면 공간을 비동기로 바꾼 뒤 줄을 다시 그려
 * 누른 탭의 초점이 본문으로 빠졌다. 이제 보통 상태(블록 편집기 밖)의 줄은 tablist·tab·aria-selected, 고른 탭만 tabindex 0(나머지 -1),
 * 수정 키 없는 ←·→(끝에서 돌아감)·Home·End는 초점만 옮기고(막고 위로 넘기지 않음 — 259차 `tabKeyTarget`, 수정 키 조합은 넘김),
 * Enter·Space(단추 누르기)로 고른다(지금처럼 공간 바꾸기 — 수동 고르기). 줄을 다시 그리면 초점이 배치 탭에 있었을 때 같은 배치의 탭에 돌려준다
 * (256차 restoreFocus 꼴의 열쇠 — 비동기 공간 바꾸기가 끝난 뒤에는 새 고른 탭). 블록 편집기 중의 줄(이름 글·블록 저장·닫기 단추)은 그대로다.
 * 셸 전체를 만들지 않고 배치 탭 줄만 그린다(viewprops247·tabkeys259 꼴). 진짜 App, 화면·명령행·엔진·글꼴은 가짜(tabkeys260 꼴).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

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
const attr = (els: HTMLElement[], a: string) => els.map((b) => b.getAttribute(a));
/** 고른 탭(sel)만 tabindex 0·aria-selected true */
const roving = (n: number, sel: number) => [Array.from({ length: n }, (_, i) => (i === sel ? '0' : '-1')), Array.from({ length: n }, (_, i) => (i === sel ? 'true' : 'false'))];
const state = (tabs: HTMLElement[]) => [attr(tabs, 'tabindex'), attr(tabs, 'aria-selected')];
const SEQ = ['ArrowRight', 'ArrowLeft', 'ArrowLeft', 'End', 'Home', 'ArrowLeft', 'ArrowRight'];

/**
 * 탭 줄 하나(tabkeys260 꼴): 탭 at에 초점을 두고 Alt+←(넘김 — 초점 그대로, 막지 않음, 줄 상자로 올라감), 이어 수정 키 없는 → · ← · ← · End · Home · ← · →
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

/** 모형·Layout1(새 도면)·Layout2 — 셸 전체를 만들지 않고 배치 탭 줄만 그려 앱의 refreshLayouts에 잇는다(셸처럼) */
async function setup() {
  const { Shell } = await import('../../src/app/ui/shell');
  const h = makeApp((doc) => {
    // 셋째 탭(배치 탭 줄은 배치의 이름·블록 이름만 읽는다 — 화살표 시험용이고, 이 배치로 공간을 바꾸지는 않는다)
    doc.layouts.push({ ...doc.layouts[1]!, handle: 'FF02', name: 'Layout2', blockName: '*Paper_Space0', tabOrder: 2 });
  });
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, layoutTabs: box }) as unknown as { refreshLayouts(): void };
  h.app.ui.refreshLayouts = () => sh.refreshLayouts();
  sh.refreshLayouts();
  return { h, sh, box, tabs: () => [...box.children] as HTMLElement[] };
}

describe('배치 탭(모형·배치) — 고른 탭만 Tab 차례, ←·→·Home·End로 옮기고 Enter·Space로 고름(261차)', () => {
  it('보통 상태: 줄은 tablist, 탭은 tab·aria-selected, 고른 탭(모형)만 tabindex 0 — 화살표는 초점만 옮기고 Alt+←는 넘긴다', async () => {
    const { box, tabs } = await setup();
    expect(tabs().map((b) => b.textContent)).toEqual(['모형', 'Layout1', 'Layout2']);
    expect([box.getAttribute('role'), attr(tabs(), 'role'), state(tabs())]).toEqual(['tablist', ['tab', 'tab', 'tab'], roving(3, 0)]);
    expect(arrows(tabs, 0, box)).toEqual(want(0, 3));
    // 화살표는 초점만(수동 고르기) — 고른 탭·Tab 차례 그대로
    expect(state(tabs())).toEqual(roving(3, 0));
  });

  it('누르기(Enter·Space)로 고르기: 비동기 공간 바꾸기가 끝나 다시 그린 줄에서 새 고른 탭에 초점, 그 사이 다른 길로 다시 그려도 같은 배치의 탭', async () => {
    const { h, sh, tabs } = await setup();
    const paper = tableKey(h.doc.layouts[1]!.blockName);
    const t1 = tabs()[1]!;
    t1.focus();
    // 배치 장면을 그려 오는 동안(엔진) 공간 바꾸기가 기다린다 — 끝나는 때는 시험이 정한다
    let done!: () => void;
    h.st.buildPending.set(
      paper,
      new Promise<void>((r) => {
        done = r;
      }),
    );
    t1.click();
    await settle();
    const mid = [h.st.space, state(tabs()), tabs().indexOf(focused()!), focused() === t1];
    // 기다리는 사이 다른 길(편집 고리 등)이 줄을 다시 그린다 — 초점은 같은 배치의 새 탭(고른 탭은 아직 모형)
    sh.refreshLayouts();
    const again = focused();
    const redraw = [state(tabs()), tabs().indexOf(again!), again === t1];
    done();
    await settle();
    const after = [h.st.space, state(tabs()), tabs().indexOf(focused()!), focused() === again];
    expect([mid, redraw, after]).toEqual([
      [MODEL_SPACE, roving(3, 0), 1, true],
      [roving(3, 0), 1, false],
      [paper, roving(3, 1), 1, false],
    ]);
  });

  it('블록 편집기 중의 줄(이름 글·블록 저장·닫기)은 그대로 — 역할·tabindex 없음, 화살표를 받지 않음. 나오면 다시 탭 목록', async () => {
    const { h, sh, box, tabs } = await setup();
    h.st.blockEdit = { name: 'B1', key: 'B1', back: MODEL_SPACE, depth: 0 };
    sh.refreshLayouts();
    const row = [...box.children] as HTMLElement[];
    const save = row[1]!;
    save.focus();
    const e = key(save, 'ArrowRight');
    expect([box.getAttribute('role'), row.map((x) => x.tagName), row.slice(1).map((x) => x.textContent), attr(row, 'role'), attr(row, 'tabindex'), e.defaultPrevented, focused() === save]).toEqual([
      null,
      ['SPAN', 'BUTTON', 'BUTTON'],
      ['블록 저장', '블록 편집기 닫기'],
      [null, null, null],
      [null, null, null],
      false,
      true,
    ]);
    h.st.blockEdit = null;
    sh.refreshLayouts();
    expect([box.getAttribute('role'), state(tabs())]).toEqual(['tablist', roving(3, 0)]);
  });
});
