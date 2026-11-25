/**
 * 243차: 모형 타일 뷰포트(VPORTS)에서 손가락 조작이 손가락 밑 타일을 보지 않던 것.
 * 데스크톱은 휠이 커서 아래 타일을, 누르기가 누른 타일을 활성으로 한다(왼쪽 누르기는 활성으로만, 가운데 버튼은 이어서 그 타일을 옮김,
 * 타일 고르기 중이면 그 번호를 넘김). 손가락은 그 처리 앞에서 돌아가 언제나 활성 타일을 옮기고·확대하고, 다른 타일을 톡하면
 * 활성 타일 좌표(그 타일에 보이지 않는 자리)로 누르기가 갔다. 이제 손가락도 데스크톱과 같다. 타일이 없거나 활성 타일 안이면 그대로.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type Camera, DocState } from '../../src/app/docstate';
import { AIM_HOLD_MS, AIM_OFFSET_PX } from '../../src/app/aim';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
// 400 × 600 보기: 왼쪽 타일 0(화면 x 0~200, 활성), 오른쪽 타일 1(x 200~400)
const W = 400;
const H = 600;
const CAM0: Camera = { cx: 0, cy: 0, scale: 1 };
const CAM1: Camera = { cx: 1000, cy: 500, scale: 2 };
/** 오른쪽 타일 안의 점 */
const Q = P(300.5, 300.5);

const noop: object = new Proxy({}, { get: (_t, k) => (typeof k === 'symbol' || k === 'then' ? undefined : () => noop) });
vi.mock('../../src/render/webgl', async (orig) => ({
  ...(await orig<object>()),
  GLRenderer: class {
    constructor() {
      return noop;
    }
  },
}));

const { JSDOM } = createRequire(import.meta.url)('jsdom');
let dom: { window: Record<string, unknown> & { close(): void; MouseEvent: typeof MouseEvent; WheelEvent: typeof WheelEvent; HTMLCanvasElement: { prototype: object }; HTMLElement: { prototype: object } } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(dom.window.HTMLCanvasElement.prototype, { getContext: () => noop });
  Object.assign(dom.window.HTMLElement.prototype, {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }),
    setPointerCapture: () => {},
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

async function view(tiles = true) {
  const { CadView } = await import('../../src/app/view');
  const st = new DocState(1, createNewDocument('metric'), 't.dxf', 0, 0);
  st.cameras.set(MODEL_SPACE, { ...CAM0 });
  if (tiles) {
    st.tiles = {
      list: [
        { ll: { x: 0, y: 0 }, ur: { x: 0.5, y: 1 }, cam: null, prev: [] },
        { ll: { x: 0.5, y: 0 }, ur: { x: 1, y: 1 }, cam: { ...CAM1 }, prev: [] },
      ],
      active: 0,
    };
  }
  const v = new CadView(document.getElementById('host') as HTMLElement);
  const clicks: { w: Pt; s: Pt }[] = [];
  const picks: number[] = [];
  v.on({
    move: () => {},
    click: (w: Pt, s: Pt) => void clicks.push({ w, s }),
    context: () => {},
    down: () => {},
    drag: () => {},
    leave: () => {},
    viewChanged: () => {},
  } as unknown as Parameters<typeof v.on>[0]);
  v.setState(st);
  v.aimEnabled = () => false;
  const fire = (type: string, p: Pt, o: { id?: number; mouse?: boolean; button?: number } = {}) => {
    const ev = new dom.window.MouseEvent(type, { clientX: p.x, clientY: p.y, button: o.button ?? 0, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: o.id ?? 7 });
    Object.defineProperty(ev, 'pointerType', { value: o.mouse ? 'mouse' : 'touch' });
    v.el.dispatchEvent(ev);
  };
  const tap = (p: Pt) => {
    fire('pointerdown', p);
    fire('pointerup', p);
  };
  const wheel = (p: Pt, deltaY: number) => v.el.dispatchEvent(new dom.window.WheelEvent('wheel', { clientX: p.x, clientY: p.y, deltaY, bubbles: true, cancelable: true }));
  /** 지금 상태: 활성 타일, 활성 카메라, 왼쪽 타일에 남긴 카메라 */
  const state = () => ({ active: st.tiles?.active ?? -1, cam: { ...st.cameras.get(MODEL_SPACE)! }, left: st.tiles?.list[0]!.cam ?? null });
  return { v, st, clicks, picks, fire, tap, wheel, state };
}

describe('타일 뷰포트의 손가락 조작은 데스크톱 마우스와 같은 타일을 다룬다', () => {
  it('다른 타일을 톡: 그 타일을 활성으로만(누르기 아님 — 왼쪽 누르기와 같음), 다음 톡은 그 타일 좌표로 누르기', async () => {
    const m = await view();
    m.fire('pointerdown', Q, { mouse: true });
    m.fire('pointerup', Q, { mouse: true });
    expect(m.state()).toEqual({ active: 1, cam: CAM1, left: CAM0 });
    expect(m.clicks).toEqual([]);

    const t = await view();
    t.tap(Q);
    expect(t.state()).toEqual(m.state());
    expect(t.clicks).toEqual([]);
    t.tap(Q);
    expect(t.clicks).toEqual([{ s: Q, w: P(1000.25, 499.75) }]);
  });

  it('다른 타일에서 한 손가락 끌기: 그 타일을 활성으로 하고 그 타일을 옮긴다(가운데 버튼 끌기와 같음)', async () => {
    const spy = vi.spyOn(performance, 'now').mockReturnValue(100_000);
    try {
      const m = await view();
      m.fire('pointerdown', Q, { mouse: true, button: 1 });
      m.fire('pointermove', P(Q.x + 20, Q.y + 10), { mouse: true, button: 1 });
      m.fire('pointerup', P(Q.x + 20, Q.y + 10), { mouse: true, button: 1 });
      expect(m.state()).toEqual({ active: 1, cam: { cx: 990, cy: 505, scale: 2 }, left: CAM0 });

      const t = await view();
      t.fire('pointerdown', Q);
      t.fire('pointermove', P(Q.x + 20, Q.y + 10));
      t.fire('pointerup', P(Q.x + 20, Q.y + 10));
      expect(t.state()).toEqual(m.state());
      expect(t.clicks).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('두 손가락 가운데가 다른 타일: 그 타일을 활성으로 하고 가운데 아래 점을 고정해 확대(휠과 같음)', async () => {
    const M = P(290.5, 300.5);
    const m = await view();
    m.wheel(M, -100);
    expect(m.state().active).toBe(1);
    expect(m.state().left).toEqual(CAM0);
    const mw = m.v.screenToWorld(M.x, M.y);
    expect(mw.x).toBeCloseTo(995.25, 9);
    expect(mw.y).toBeCloseTo(499.75, 9);

    const t = await view();
    // 첫 손가락은 활성 왼쪽 타일, 둘째는 오른쪽 — 가운데 (290.5, 300.5)는 오른쪽 타일
    t.fire('pointerdown', P(190.5, 300.5), { id: 1 });
    t.fire('pointerdown', P(390.5, 300.5), { id: 2 });
    t.fire('pointermove', P(240.5, 300.5), { id: 1 });
    t.fire('pointermove', P(340.5, 300.5), { id: 2 });
    expect(t.state()).toEqual({ active: 1, cam: { cx: 1004.75, cy: 500.25, scale: 1 }, left: CAM0 });
    expect(t.v.screenToWorld(M.x, M.y)).toEqual(P(995.25, 499.75));
    t.fire('pointerup', P(240.5, 300.5), { id: 1 });
    t.fire('pointerup', P(340.5, 300.5), { id: 2 });
    expect(t.clicks).toEqual([]);
  });

  it('다른 타일을 길게 누르기: 활성으로만(조준·누르기 없음), 그 타일에서 다시 길게 누르면 그 타일 좌표로 조준', async () => {
    const t = await view();
    t.v.aimEnabled = () => true;
    t.fire('pointerdown', Q);
    await new Promise((r) => setTimeout(r, AIM_HOLD_MS + 150));
    expect(t.v.aiming).toBe(false);
    t.fire('pointerup', Q);
    expect(t.state().active).toBe(1);
    expect(t.clicks).toEqual([]);

    const p = P(300.5, 400.5);
    t.fire('pointerdown', p);
    const t0 = Date.now();
    while (!t.v.aiming && Date.now() - t0 < AIM_HOLD_MS + 5000) await new Promise((r) => setTimeout(r, 20));
    expect(t.v.aiming).toBe(true);
    t.fire('pointerup', p);
    expect(t.clicks).toEqual([{ s: P(300.5, 400.5 - AIM_OFFSET_PX), w: P(1000.25, 481.75) }]);
  });

  it('타일 고르기(-VPORTS 결합) 중 톡: 그 타일 번호를 넘기고 활성은 그대로(왼쪽 누르기와 같음)', async () => {
    const m = await view();
    m.v.tilePick = (i) => void m.picks.push(i);
    m.fire('pointerdown', Q, { mouse: true });
    m.fire('pointerup', Q, { mouse: true });
    expect(m.picks).toEqual([1]);
    expect(m.state().active).toBe(0);

    const t = await view();
    t.v.tilePick = (i) => void t.picks.push(i);
    t.tap(Q);
    expect(t.picks).toEqual([1]);
    expect(t.state()).toEqual({ active: 0, cam: CAM0, left: null });
    expect(t.clicks).toEqual([]);
  });

  it('그대로인 갈래: 활성 타일 안·타일 없는 화면의 톡은 누르기, 끌기는 화면 이동, 두 손가락은 가운데 고정 확대', async () => {
    const a = await view();
    a.tap(P(100.5, 300.5));
    expect(a.clicks).toEqual([{ s: P(100.5, 300.5), w: P(0.5, -0.5) }]);
    a.fire('pointerdown', P(100.5, 300.5));
    a.fire('pointermove', P(120.5, 310.5));
    a.fire('pointerup', P(120.5, 310.5));
    expect(a.state()).toEqual({ active: 0, cam: { cx: -20, cy: 10, scale: 1 }, left: null });
    expect(a.clicks).toHaveLength(1);

    const n = await view(false);
    n.tap(Q);
    expect(n.clicks).toEqual([{ s: Q, w: P(100.5, -0.5) }]);
    n.fire('pointerdown', P(150.5, 300.5), { id: 1 });
    n.fire('pointerdown', P(250.5, 300.5), { id: 2 });
    n.fire('pointermove', P(100.5, 300.5), { id: 1 });
    n.fire('pointermove', P(300.5, 300.5), { id: 2 });
    // 가운데 (200.5, 300.5) 아래 도면 점 (0.5, -0.5) 고정, 배율 1 × 200/100 = 2
    expect(n.st.cameras.get(MODEL_SPACE)).toEqual({ cx: 0.25, cy: -0.25, scale: 2 });
    expect(n.v.screenToWorld(200.5, 300.5)).toEqual(P(0.5, -0.5));
    expect(n.st.tiles).toBeNull();
  });
});
