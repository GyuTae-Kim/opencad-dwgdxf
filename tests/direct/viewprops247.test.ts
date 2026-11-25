/**
 * 휴대폰 보기 모드에서 도면을 고치는 남은 길(247차): 보기 모드는 보기·치수 확인 화면이라 그립·두 번 눌러 고치기·메뉴를 열지 않는데
 * (README 휴대폰 보기 절), 정보 카드 「특성 전체」·시트 머리 탭으로 가는 특성 탭에서는 값을 고칠 수 있었다(246차 보고 (1)).
 * - 특성 탭은 읽기 전용: 값은 그대로 보이고, 글 칸은 읽기 전용·고르기와 단추는 막히며, 칸으로 온 고치기 사건도 처리기에 닿지 않는다.
 * - 같은 표에서 찾은 작은 길: 문자 찾기의 대치, 배치 탭 길게 누르기 메뉴, 키보드 Delete·Ctrl+X·Ctrl+V.
 * 편집 화면(데스크톱·휴대폰 편집)은 그대로다.
 * 진짜 App·Palette, 화면·명령행·엔진·글꼴·메뉴·색 고르기는 가짜(viewlayers246.test.ts와 같은 틀).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { MenuItem } from '../../src/app/ui/dom';
import { showMenu } from '../../src/app/ui/dom';
import { pickColor } from '../../src/app/ui/colorpick';
import { Palette } from '../../src/app/ui/palettes';
import { currentLayer } from '../../src/app/layers';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));
vi.mock('../../src/app/ui/colorpick', async (orig) => ({ ...(await orig<object>()), pickColor: vi.fn(async () => null) }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
  // 팔레트가 다시 그릴 때 초점 칸을 되돌리며 `instanceof HTMLInputElement`를 본다(찾기 칸에 초점이 있을 때)
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  dom.window.localStorage.clear();
  vi.mocked(showMenu).mockClear();
  vi.mocked(pickColor).mockClear();
});

/** 도면층 0(현재)·A, 선 (0,0)-(10,0)과 문자 "ABC"(도면층 0), 진짜 팔레트를 앱의 refreshPalette에 잇는다(셸처럼) */
function setup() {
  const h = makeApp((doc) => {
    doc.layers.set('A', { ...structuredClone(doc.layers.get('0')!), name: 'A', handle: 'A0' });
  });
  const add = (e: Entity) => {
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const line = add({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity);
  const text = add({
    ...entityDefaults(),
    type: 'TEXT',
    handle: h.st.session.newHandle(),
    insert: { x: 0, y: 5, z: 0 },
    height: 2.5,
    text: 'ABC',
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
  } as TextEntity);
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const pal = new Palette(h.app, root);
  h.app.ui.refreshPalette = () => pal.refresh();
  /** 특성 칸(팔레트가 다시 그리면 새 요소라 그때마다 찾는다) */
  const field = <T extends HTMLElement = HTMLInputElement>(label: string) => pal.el.querySelector(`[data-field="pf-${label}"]`) as T;
  /** 값을 넣고 change(사람이 고친 것처럼) */
  const change = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new dom.window.Event('change'));
  };
  const fire = (el: Element, type: string) => {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    el.dispatchEvent(e);
    return e;
  };
  /** 팔레트 몸의 칸·단추 모두 */
  const controls = () => [...pal.el.querySelectorAll<HTMLElement>('.palette-body :is(input, textarea, select, button)')];
  const entity = <T extends Entity>(handle: string) => h.doc.entityIndex.get(handle) as T;
  return { ...h, pal, line, text, field, change, fire, controls, entity };
}

/** 칸이 모두 막혔는지: 글 칸은 읽기 전용, 고르기·단추는 막힘 */
function expectLocked(els: HTMLElement[]) {
  const tags = new Set(els.map((c) => c.tagName));
  expect(tags.has('INPUT') && tags.has('SELECT') && tags.has('BUTTON')).toBe(true);
  for (const c of els) {
    const name = c.dataset.field ?? c.textContent ?? c.tagName;
    if (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA') expect((c as HTMLInputElement).readOnly, name).toBe(true);
    else expect((c as HTMLButtonElement).disabled, name).toBe(true);
  }
}

describe('보기 모드 특성 탭은 읽기 전용(247차)', () => {
  it('고른 객체: 값은 그대로 보이고 칸·단추가 막히며, 칸으로 온 고치기(도면층·좌표·색)도 도면을 바꾸지 않는다', async () => {
    const h = setup();
    h.app.setSelection([h.line], 'replace');
    h.app.setViewOnly(true);
    h.pal.open('props');
    // 값은 보인다
    expect(h.field<HTMLSelectElement>('도면층').value).toBe('0');
    expect(h.field('시작 X').value).toMatch(/^0/);
    expect(h.field('끝 X').value).toMatch(/^10/);
    expectLocked(h.controls());
    // 막힌 칸에 값을 넣어 change가 와도(처리기에 닿지 않는다) 도면 그대로
    h.change(h.field<HTMLSelectElement>('도면층'), 'A');
    h.change(h.field('시작 X'), '7');
    h.fire(h.field<HTMLButtonElement>('색상'), 'click');
    await settle();
    expect(pickColor).not.toHaveBeenCalled();
    expect(h.entity<LineEntity>(h.line).layer).toBe('0');
    expect(h.entity<LineEntity>(h.line).start.x).toBe(0);
    // 명령 취소 목록 맨 위는 시험 준비 커밋 그대로
    expect(h.st.session.undoTop()?.label).toBe('T');
  });

  it('선택 없음(새 객체의 현재 특성)도 막히고 현재 도면층이 그대로, 문자를 고르면 「문자 편집...」 단추도 막힌다', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    h.pal.open('props');
    expect(h.pal.el.querySelector('.prop-group h4')?.textContent).toBe('새 객체의 현재 특성');
    expectLocked(h.controls());
    h.change(h.field<HTMLSelectElement>('도면층'), 'A');
    await settle();
    expect(currentLayer(h.app)).toBe('0');
    h.app.setSelection([h.text], 'replace');
    const edit = [...h.pal.el.querySelectorAll<HTMLButtonElement>('.palette-body button')].find((b) => b.textContent === '문자 편집...')!;
    expect(edit.disabled).toBe(true);
    expect(h.field('내용').value).toBe('ABC');
    expect(h.field('내용').readOnly).toBe(true);
  });

  it('그대로인 갈래: 편집 화면 특성 탭은 칸이 열려 있고 도면층·좌표·색 고치기가 그대로 된다', async () => {
    const h = setup();
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    expect(h.field<HTMLSelectElement>('도면층').disabled).toBe(false);
    expect(h.field('시작 X').readOnly).toBe(false);
    h.change(h.field<HTMLSelectElement>('도면층'), 'A');
    await settle();
    expect(h.entity<LineEntity>(h.line).layer).toBe('A');
    expect(h.st.session.undoTop()?.label).toBe('PROPERTIES');
    h.change(h.field('시작 X'), '7');
    await settle();
    expect(h.entity<LineEntity>(h.line).start.x).toBe(7);
    h.fire(h.field<HTMLButtonElement>('색상'), 'click');
    await settle();
    expect(pickColor).toHaveBeenCalledTimes(1);
  });

  it('특성 탭을 연 채 모드를 바꾸면 그 모드로 다시 그린다(보기 모드는 막힘, 편집 화면은 다시 열림)', async () => {
    const h = setup();
    h.app.setSelection([h.line], 'replace');
    h.pal.open('props');
    expect(h.field<HTMLSelectElement>('도면층').disabled).toBe(false);
    h.app.setViewOnly(true);
    await settle();
    expectLocked(h.controls());
    h.change(h.field<HTMLSelectElement>('도면층'), 'A');
    await settle();
    expect(h.entity<LineEntity>(h.line).layer).toBe('0');
    h.app.setViewOnly(false);
    await settle();
    expect(h.field<HTMLSelectElement>('도면층').disabled).toBe(false);
    h.change(h.field<HTMLSelectElement>('도면층'), 'A');
    await settle();
    expect(h.entity<LineEntity>(h.line).layer).toBe('A');
  });
});

describe('보기 모드의 다른 길(247차)', () => {
  it('문자 찾기: 보기 모드는 찾기만(대치할 문자 칸·대치 단추 없음), 편집 화면은 그대로', async () => {
    const h = setup();
    h.app.setViewOnly(true);
    h.pal.open('find');
    const buttons = () => [...h.pal.el.querySelectorAll('.find-panel button')].map((b) => b.textContent);
    expect(h.pal.el.querySelector('[data-field="find-replace"]')).toBeNull();
    expect(buttons()).toEqual(['찾기']);
    // 찾기는 그대로
    const q = h.pal.el.querySelector('[data-field="find-query"]') as HTMLInputElement;
    q.value = 'AB';
    q.dispatchEvent(new dom.window.Event('input'));
    (h.pal.el.querySelector('.find-panel button') as HTMLButtonElement).click();
    expect(h.pal.el.querySelector('.find-panel')!.textContent).toContain('객체 1개에서 1개를 찾았습니다.');
    expect(h.entity<TextEntity>(h.text).text).toBe('ABC');
    h.app.setViewOnly(false);
    await settle();
    expect(h.pal.el.querySelector('[data-field="find-replace"]')).not.toBeNull();
    expect(buttons()).toEqual(['찾기', '대치', '모두 대치']);
  });

  it('배치 탭: 보기 모드는 길게 누르기(contextmenu)에 배치 메뉴를 열지 않고(브라우저 메뉴도 막은 채), 편집 화면은 메뉴', async () => {
    const { Shell } = await import('../../src/app/ui/shell');
    const h = setup();
    // 셸 전체를 만들지 않고 배치 탭 줄만 그린다(refreshLayouts는 앱과 배치 탭 칸만 쓴다)
    const tabs = document.createElement('div');
    const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, layoutTabs: tabs }) as unknown as { refreshLayouts(): void };
    const model = () => [...tabs.querySelectorAll<HTMLButtonElement>('button.layouttab')].find((b) => b.textContent === '모형')!;
    h.app.setViewOnly(true);
    sh.refreshLayouts();
    const menu = h.fire(model(), 'contextmenu');
    expect(menu.defaultPrevented).toBe(true);
    expect(showMenu).not.toHaveBeenCalled();
    h.app.setViewOnly(false);
    sh.refreshLayouts();
    h.fire(model(), 'contextmenu');
    expect(showMenu).toHaveBeenCalledTimes(1);
    expect((vi.mocked(showMenu).mock.calls[0]![2] as MenuItem[]).map((m) => m.label)).toContain('새 배치');
  });

  it('키보드: 보기 모드는 Delete·Backspace·Ctrl+X·Ctrl+V로 지우거나 붙여넣지 않고(Ctrl+C 복사는 그대로), 편집 화면은 그대로', async () => {
    const h = setup();
    const ran: string[] = [];
    for (const n of ['ERASE', 'CUTCLIP', 'COPYCLIP', 'PASTECLIP']) h.app.register({ name: n, title: n, run: () => void ran.push(n) });
    const onKey = (h.app as unknown as { onKey(ev: KeyboardEvent): void }).onKey.bind(h.app);
    const press = async (key: string, ctrl = false) => {
      onKey({ key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault() {} } as unknown as KeyboardEvent);
      await settle();
    };
    h.app.setSelection([h.line], 'replace');
    h.app.setViewOnly(true);
    await press('Delete');
    await press('Backspace');
    await press('x', true);
    await press('v', true);
    await press('c', true);
    expect(ran).toEqual(['COPYCLIP']);
    h.app.setViewOnly(false);
    await press('Delete');
    await press('x', true);
    await press('v', true);
    expect(ran).toEqual(['COPYCLIP', 'ERASE', 'CUTCLIP', 'PASTECLIP']);
  });
});
