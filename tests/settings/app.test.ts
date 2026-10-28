/**
 * 진짜 App이 OPTIONS·시스템 변수 값을 실제 동작에 쓰는지(화면·명령행·엔진·글꼴은 가짜, 고르기는 tests/direct의 FakePicker):
 * 설정 읽기·바로 반영(onSysvarChange), GRIPS·GRIPSIZE, APERTURE·AUTOSNAP 툴팁·마그넷·추적 비트(F10·F11), PICKFIRST, PICKADD, PICKAUTO,
 * SELECTIONPREVIEW, SHORTCUTMENU(모드 비트·시간에 민감한 오른쪽 클릭), GRIPMULTIFUNCTIONAL(커서를 올리면 뜨는 그립 메뉴). 기본값에서는 예전 동작 그대로(tests/direct가 지킨다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { App, type PointResult } from '../../src/app/app';
import type { OverlayState } from '../../src/app/view';
import { DEFAULT_SETTINGS } from '../../src/app/settings';
import { BROWSER_VARS, browserSysvar, setSysvarText, sysvarInfo } from '../../src/app/sysvars';
import { getSysVar, setSysVar } from '../../src/app/lisp-host';
import { prefSet } from '../../src/app/mgr-ui';
import { addHook } from '../../src/app/hooks';
import * as dom from '../../src/app/ui/dom';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.mocked(dom.showMenu).mockClear();
  for (const v of BROWSER_VARS) prefSet(`opencad.sysvar.${v.name}`, null);
});

type Pt = { x: number; y: number };
const P = (x: number, y: number) => ({ x, y });
const ev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...o }) as PointerEvent;

interface H extends RealApp {
  line: (x0: number, y0: number, x1: number, y1: number) => string;
  /** 비공개 메서드·상태를 시험에서 본다 */
  priv: { gripAt(p: Pt): unknown; updateHover(p: Pt): void; windowStart: unknown };
  ov: OverlayState;
  move(p: Pt, o?: Partial<PointerEvent>): void;
  click(p: Pt, o?: Partial<PointerEvent>): void;
  context(p: Pt, o?: Partial<PointerEvent>, held?: number): void;
  /** 변수 이름을 친 것처럼 바꾼다(실패하면 시험 실패) */
  set(name: string, value: number): void;
  sel(): string[];
}

function setup(): H {
  const h = makeApp();
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const e: LineEntity = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } };
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  return {
    ...h,
    line,
    priv: h.app as unknown as H['priv'],
    get ov() {
      return h.view.overlay as unknown as OverlayState;
    },
    move: (p, o) => h.view.events.move!(p, p, ev(o)),
    click: (p, o) => h.view.events.click!(p, p, ev(o)),
    context: (p, o, held) => h.view.events.context!(p, p, ev(o), held),
    set: (name, value) => expect(setSysvarText(h.app, name, String(value))).toBeNull(),
    sel: () => [...h.st.selection].sort(),
  };
}

/** 점 하나를 묻는 명령(결과를 모은다) */
function pointCmd(h: H, name: string, keywords?: { key: string; label: string }[]) {
  const got: PointResult[] = [];
  h.app.register({ name, title: name, run: async (ctx) => void got.push(await ctx.getPoint(`${name} 점:`, { keywords })) });
  return got;
}

/** 객체를 고르는 명령 */
function selCmd(h: H, noPickfirst = false) {
  const got: string[][] = [];
  h.app.register({ name: 'SEL', title: 'SEL', run: async (ctx) => void got.push(await ctx.getSelection('객체 선택:', { noPickfirst })) });
  return got;
}

describe('설정 읽기와 바로 반영', () => {
  it('시작할 때 기본값을 읽어 화면(view.prefs)에 넣고, 변수가 바뀌면 바로 다시 읽는다', () => {
    const h = setup();
    expect(h.app.settings).toEqual(DEFAULT_SETTINGS);
    expect((h.view as unknown as { prefs: unknown }).prefs).toEqual(DEFAULT_SETTINGS);
    h.set('CURSORSIZE', 100);
    h.set('ZOOMFACTOR', 80);
    expect(h.app.settings.cursorSize).toBe(100);
    expect((h.view as unknown as { prefs: { zoomFactor: number } }).prefs.zoomFactor).toBe(80);
    h.set('PICKBOX', 8);
    expect(h.ov.pickbox).toBe(8);
  });
});

describe('그립(GRIPS·GRIPSIZE)', () => {
  it('GRIPSIZE가 고르는 거리를 바꾸고, GRIPS 0이면 그립을 보이지도 누르지도 않는다', async () => {
    const h = setup();
    const a = h.line(0, 0, 10, 0);
    h.app.setSelection([a]);
    expect(h.ov.grips.length).toBeGreaterThan(0);
    // 그립(10,0)에서 7픽셀: 기본(6픽셀)은 못 잡고 GRIPSIZE 10(10픽셀)은 잡는다
    expect(h.priv.gripAt(P(10, 7))).toBeNull();
    h.set('GRIPSIZE', 10);
    expect(h.priv.gripAt(P(10, 7))).toMatchObject({ point: P(10, 0) });
    h.set('GRIPS', 0);
    expect(h.ov.grips).toEqual([]);
    expect(h.app.gripList).toEqual([]);
    // 그립 자리를 눌러도 그립 편집이 아니다
    h.click(P(10, 0));
    await settle();
    expect(h.app.hotGrip).toBeNull();
    expect(h.sel()).toEqual([a]);
    h.set('GRIPS', 2);
    expect(h.ov.grips.length).toBeGreaterThan(0);
  });
});

describe('다기능 그립 메뉴(GRIPMULTIFUNCTIONAL)', () => {
  it('비트 2를 끄면 그립에 커서를 올려 두어도 메뉴가 뜨지 않고(분홍 그립은 그대로), 오른쪽 클릭 메뉴는 뜬다', async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      const a = h.line(0, 0, 10, 0);
      addHook(h.app.gripMenuProviders, { name: 'g', items: () => [{ label: '정점 추가', run: () => {} }] });
      h.app.setSelection([a]);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(520);
      expect(vi.mocked(dom.showMenu)).toHaveBeenCalledTimes(1);
      h.move(P(60, 60));
      vi.mocked(dom.showMenu).mockClear();
      h.set('GRIPMULTIFUNCTIONAL', 1);
      expect(h.app.settings.gripMultifunctional).toBe(1);
      h.move(P(10.5, 0.5));
      expect(h.ov.hoverGrip).toEqual(P(10, 0));
      vi.advanceTimersByTime(520);
      expect(vi.mocked(dom.showMenu)).not.toHaveBeenCalled();
      h.context(P(10.5, 0.5));
      expect(vi.mocked(dom.showMenu)).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('객체 스냅(APERTURE·AUTOSNAP)', () => {
  it('조준창 밖이면 스냅하지 않고, AUTOSNAP 2(툴팁)를 끄면 스냅 이름 툴팁 대신 보통 문구 — 4(마그넷)를 꺼도 툴팁은 그대로', async () => {
    const h = setup();
    h.line(0, 0, 10, 0);
    const got = pointCmd(h, 'PT');
    void h.app.run('PT');
    await settle();
    h.move(P(4, 1));
    expect(h.ov.snap).toMatchObject({ kind: 'end', p: P(0, 0) });
    expect(h.ov.tip).toBe('끝점');
    h.set('APERTURE', 3);
    h.move(P(4, 1));
    expect(h.ov.snap).toBeNull();
    h.set('APERTURE', 10);
    h.set('AUTOSNAP', 63 & ~4);
    h.move(P(4, 1));
    expect(h.ov.tip).toBe('끝점');
    h.set('AUTOSNAP', 63 & ~2);
    h.move(P(4, 1));
    expect(h.ov.snap).toMatchObject({ kind: 'end' });
    expect(h.ov.tip).not.toBe('끝점');
    // 툴팁을 꺼도 스냅은 그대로 찍힌다
    h.click(P(4, 1));
    await settle();
    expect(got.at(-1)).toMatchObject({ point: P(0, 0), snap: { kind: 'end' } });
  });

  it('마그넷(AUTOSNAP 4): 켜면 십자선이 잡은 스냅점에 붙고, 끄면 커서 자리 그대로 — 어느 쪽이든 누르면 스냅점', async () => {
    const h = setup();
    h.line(0, 0, 10, 0);
    const got = pointCmd(h, 'PT');
    void h.app.run('PT');
    await settle();
    h.move(P(1, 1));
    expect(h.ov.snap).toMatchObject({ kind: 'end', p: P(0, 0) });
    expect(h.ov.cursor).toEqual(P(0, 0));
    h.set('AUTOSNAP', 63 & ~4);
    h.move(P(1, 1));
    expect(h.ov.snap).toMatchObject({ kind: 'end', p: P(0, 0) });
    expect(h.ov.cursor).toEqual(P(1, 1));
    // 표식기·툴팁은 마그넷과 따로(4만 끄면 그대로)
    expect(h.ov.tip).toBe('끝점');
    h.click(P(1, 1));
    await settle();
    expect(got.at(-1)).toMatchObject({ point: P(0, 0), snap: { kind: 'end' } });
    // 스냅점이 없으면 마그넷이 켜져 있어도 커서 자리
    h.set('AUTOSNAP', 63);
    void h.app.run('PT');
    await settle();
    h.move(P(5, 40));
    expect(h.ov.snap).toBeNull();
    expect(h.ov.cursor).toEqual(P(5, 40));
  });
});

describe('극좌표·객체 스냅 추적(F10·F11 = AUTOSNAP 8·16)', () => {
  type KeyApp = { onKey(ev: KeyboardEvent): void };
  const key = (h: H, k: string) => (h.app as unknown as KeyApp).onKey({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault() {} } as unknown as KeyboardEvent);
  const lisp = (h: H) => Number(getSysVar(h.app, 'AUTOSNAP'));

  it('한 상태: F10·F11, 변수 입력(SETVAR·SYSVDLG), AutoLISP setvar·getvar가 같은 값을 보고 이 브라우저에 남는다', () => {
    const h = setup();
    // AutoCAD 초기값 63: 둘 다 켜짐
    expect([h.app.polarOn, h.app.otrackOn]).toEqual([true, true]);
    const status = h.ui.refreshStatus ?? 0;
    key(h, 'F10');
    expect([h.app.polarOn, h.app.otrackOn]).toEqual([false, true]);
    expect([browserSysvar('AUTOSNAP'), lisp(h), sysvarInfo(h.app, 'AUTOSNAP')?.value]).toEqual([55, 55, 55]);
    key(h, 'F11');
    expect([h.app.polarOn, h.app.otrackOn]).toEqual([false, false]);
    expect(lisp(h)).toBe(39);
    expect(h.out().slice(-2)).toEqual(['<극좌표 끄기>', '<객체 스냅 추적 끄기>']);
    // 상태 막대가 다시 읽는다
    expect(h.ui.refreshStatus).toBeGreaterThan(status);
    // 변수 입력: 다른 비트(표식기·툴팁·마그넷)는 그 값대로, 추적 비트는 F10·F11 상태로
    h.set('AUTOSNAP', 63);
    expect([h.app.polarOn, h.app.otrackOn]).toEqual([true, true]);
    expect(setSysVar(h.app, 'AUTOSNAP', 7 | 16)).toBeNull();
    expect([h.app.polarOn, h.app.otrackOn]).toEqual([false, true]);
    // AutoLISP 직접 대입도 같은 상태
    h.app.polarOn = true;
    expect(lisp(h)).toBe(31);
    // 이 브라우저에 남아, 다음에 연 앱(새 App)도 같은 상태로 시작한다(AutoCAD는 레지스트리)
    const next = new App({} as HTMLElement);
    expect([next.polarOn, next.otrackOn, next.settings.autosnap]).toEqual([true, true, 31]);
    // 도면 머리말에는 AUTOSNAP이 없다(DXF·DWG 모두) — 도면을 바꿔도 그대로
    expect(h.doc.header.has('$AUTOSNAP')).toBe(false);
  });

  it('직교(F8)를 켜면 극좌표 추적(8)이 꺼지고, 8을 켜면(F10·변수·setvar AUTOSNAP) 직교가 꺼진다 — POLARMODE는 켜고 끄지 않는다', () => {
    const h = setup();
    expect([h.app.orthoOn, h.app.polarOn]).toEqual([false, true]);
    key(h, 'F8');
    expect([h.app.orthoOn, h.app.polarOn, lisp(h)]).toEqual([true, false, 55]);
    // 직교를 다시 꺼도 극좌표 추적은 꺼진 채
    key(h, 'F8');
    expect([h.app.orthoOn, h.app.polarOn]).toEqual([false, false]);
    key(h, 'F8');
    h.set('AUTOSNAP', 63);
    expect([h.app.orthoOn, h.app.polarOn]).toEqual([false, true]);
    expect(setSysVar(h.app, 'ORTHOMODE', 1)).toBeNull();
    expect([h.app.orthoOn, h.app.polarOn, lisp(h)]).toEqual([true, false, 55]);
    key(h, 'F10');
    expect([h.app.orthoOn, h.app.polarOn, lisp(h)]).toEqual([false, true, 63]);
    h.app.orthoOn = true;
    // POLARMODE는 AutoCAD처럼 각도 측정·추적 방식 비트(14차) — 극좌표 추적·직교를 바꾸지 않는다
    expect(setSysVar(h.app, 'POLARMODE', 1)).toBeNull();
    expect([h.app.orthoOn, h.app.polarOn, getSysVar(h.app, 'POLARMODE')]).toEqual([true, false, 1]);
    expect(setSysVar(h.app, 'AUTOSNAP', 63)).toBeNull();
    expect([h.app.orthoOn, h.app.polarOn, getSysVar(h.app, 'POLARMODE')]).toEqual([false, true, 1]);
  });

  it('객체 스냅 추적을 끄면(F11·AUTOSNAP 16) 획득점(+)을 지우고 더 얻지 않으며, 켜져 있으면 획득점에서 정렬', async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      // 끝점만(연장선 획득점이 섞이지 않게)
      h.set('OSMODE', 1);
      h.line(0, 0, 10, 0);
      const got = pointCmd(h, 'PT');
      void h.app.run('PT');
      await vi.advanceTimersByTimeAsync(0);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      h.move(P(10.3, 30));
      expect(h.ov.tracks.length).toBeGreaterThan(0);
      h.click(P(10.3, 30));
      await vi.advanceTimersByTimeAsync(0);
      expect((got.at(-1) as { point: Pt }).point.x).toBeCloseTo(10, 9);
      void h.app.run('PT');
      await vi.advanceTimersByTimeAsync(0);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([P(10, 0)]);
      h.set('AUTOSNAP', 63 & ~16);
      expect(h.ov.acquired).toEqual([]);
      h.move(P(10.5, 0.5));
      vi.advanceTimersByTime(450);
      expect(h.ov.acquired).toEqual([]);
      h.click(P(10.3, 30));
      await vi.advanceTimersByTimeAsync(0);
      expect(got.at(-1)).toMatchObject({ point: P(10.3, 30) });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('선택(PICKFIRST·PICKADD·PICKAUTO·SELECTIONPREVIEW)', () => {
  it('PICKFIRST 0: 명령 전에 고른 것은 쓰지 않고 풀고 새로 묻는다', async () => {
    const h = setup();
    const a = h.line(0, 0, 10, 0);
    const b = h.line(0, 20, 10, 20);
    const got = selCmd(h);
    h.app.setSelection([a]);
    void h.app.run('SEL');
    await settle();
    expect(got.at(-1)).toEqual([a]);
    h.set('PICKFIRST', 0);
    h.app.setSelection([a]);
    void h.app.run('SEL');
    await settle();
    expect(h.st.selection.size).toBe(0);
    expect(h.app.pendingInput?.kind).toBe('select');
    h.click(P(5, 20));
    h.app.submitInput('');
    await settle();
    expect(got.at(-1)).toEqual([b]);
  });

  it('PICKADD 0: 누르면 바꾸고 Shift로 더하기·빼기, 객체 선택 중에도 바꾸며 U는 바꾸기 전으로', async () => {
    const h = setup();
    // 그립(끝점·중간점)에서 먼 곳을 누른다
    const a = h.line(0, 0, 100, 0);
    const b = h.line(0, 20, 100, 20);
    h.set('PICKADD', 0);
    h.click(P(25, 0));
    h.click(P(25, 20));
    expect(h.sel()).toEqual([b]);
    h.click(P(25, 0), { shiftKey: true });
    expect(h.sel()).toEqual([a, b].sort());
    h.click(P(25, 0), { shiftKey: true });
    expect(h.sel()).toEqual([b]);
    h.app.clearSelection();
    const got = selCmd(h, true);
    void h.app.run('SEL');
    await settle();
    h.click(P(25, 0));
    h.click(P(25, 20));
    expect(h.sel()).toEqual([b]);
    h.app.submitInput('U');
    await settle();
    expect(h.sel()).toEqual([a]);
    h.app.submitInput('');
    await settle();
    expect(got.at(-1)).toEqual([a]);
  });

  it('PICKAUTO: 명령 프롬프트(4)·객체 선택 프롬프트(1)의 빈 곳 창 선택을 따로 끈다', async () => {
    const h = setup();
    h.line(0, 0, 10, 0);
    h.click(P(50, 50));
    expect(h.ov.windowRect).not.toBeNull();
    h.app.cancel();
    h.set('PICKAUTO', 1);
    h.click(P(50, 50));
    expect(h.ov.windowRect).toBeNull();
    expect(h.priv.windowStart).toBeNull();
    // 끌어도 고르지 않는다
    h.view.events.down!(P(50, 50), P(50, 50), ev());
    h.view.events.drag!(P(50, 50), P(-5, -5), false, ev());
    h.view.events.drag!(P(50, 50), P(-5, -5), true, ev());
    expect(h.st.selection.size).toBe(0);
    h.set('PICKAUTO', 4);
    selCmd(h, true);
    void h.app.run('SEL');
    await settle();
    h.click(P(50, 50));
    expect(h.ov.windowRect).toBeNull();
    expect(h.out().at(-1)).toContain('*잘못된 선택*');
  });

  it('SELECTIONPREVIEW: 명령 없을 때(2)·명령 중(1)의 호버 강조를 따로 끈다', async () => {
    const h = setup();
    h.line(0, 0, 10, 0);
    h.priv.updateHover(P(5, 0));
    expect(h.ov.hover).not.toBeNull();
    h.set('SELECTIONPREVIEW', 1);
    expect(h.ov.hover).toBeNull();
    h.priv.updateHover(P(5, 0));
    expect(h.ov.hover).toBeNull();
    selCmd(h, true);
    void h.app.run('SEL');
    await settle();
    h.priv.updateHover(P(5, 0));
    expect(h.ov.hover).not.toBeNull();
  });
});

describe('오른쪽 클릭(SHORTCUTMENU)', () => {
  it('기본·편집 모드 메뉴를 끄면 직전 명령 반복, 명령 모드는 4(늘 메뉴)·8(옵션이 있을 때만)', async () => {
    const h = setup();
    const a = h.line(0, 0, 10, 0);
    let n = 0;
    h.app.register({ name: 'CNT', title: 'CNT', run: () => void n++ });
    await h.app.run('CNT');
    h.set('SHORTCUTMENU', 10);
    h.context(P(50, 50));
    await settle();
    expect(n).toBe(2);
    expect(dom.showMenu).not.toHaveBeenCalled();
    // 선택이 있으면 편집 모드(2가 켜져 있으니 메뉴)
    h.app.setSelection([a]);
    h.context(P(50, 50));
    expect(dom.showMenu).toHaveBeenCalledTimes(1);
    h.set('SHORTCUTMENU', 9);
    h.context(P(50, 50));
    await settle();
    expect(n).toBe(3);
    h.app.clearSelection();
    // 명령 모드: 8을 끄면 옵션이 있어도 Enter
    h.set('SHORTCUTMENU', 3);
    const kw = pointCmd(h, 'KW', [{ key: 'U', label: '명령 취소' }]);
    void h.app.run('KW');
    await settle();
    h.context(P(1, 1));
    await settle();
    expect(kw.at(-1)).toEqual({ enter: true });
    // 4: 옵션이 없는 프롬프트·객체 선택에서도 메뉴
    h.set('SHORTCUTMENU', 7);
    const pt = pointCmd(h, 'PT');
    void h.app.run('PT');
    await settle();
    h.context(P(1, 1));
    expect(pt.length).toBe(0);
    expect(dom.showMenu).toHaveBeenCalledTimes(2);
    h.app.cancel();
    await settle();
    selCmd(h, true);
    void h.app.run('SEL');
    await settle();
    h.context(P(1, 1));
    expect(dom.showMenu).toHaveBeenCalledTimes(3);
    expect(h.app.pendingInput?.kind).toBe('select');
  });

  it('시간에 민감한 오른쪽 클릭(16): 짧게 누르면 Enter·반복, SHORTCUTMENUDURATION 이상이면 메뉴', async () => {
    const h = setup();
    let n = 0;
    h.app.register({ name: 'CNT', title: 'CNT', run: () => void n++ });
    await h.app.run('CNT');
    h.set('SHORTCUTMENU', 11 | 16);
    h.set('SHORTCUTMENUDURATION', 300);
    h.context(P(50, 50), {}, 120);
    await settle();
    expect(n).toBe(2);
    expect(dom.showMenu).not.toHaveBeenCalled();
    h.context(P(50, 50), {}, 450);
    expect(dom.showMenu).toHaveBeenCalledTimes(1);
    // 명령 중 옵션이 없는 프롬프트도 길게 누르면 메뉴, 짧으면 Enter
    const pt = pointCmd(h, 'PT');
    void h.app.run('PT');
    await settle();
    h.context(P(1, 1), {}, 500);
    expect(dom.showMenu).toHaveBeenCalledTimes(2);
    h.context(P(1, 1), {}, 50);
    await settle();
    expect(pt.at(-1)).toEqual({ enter: true });
  });
});
