/**
 * 244차: 세 손가락에서 확대 짝(touches의 앞 두 손가락)의 하나를 떼거나 취소하면 확대 기준(처음 거리·가운데 도면 점·카메라)을
 * 다시 잡지 않아, 다음 이동에서 남은 두 손가락을 옛 짝의 기준으로 셈해 화면이 튀었다. 이제 남은 두 손가락·지금 카메라로 다시 잡아
 * 첫 이동의 화면이 그대로이고, 이어 벌리면 그 둘의 가운데를 중심으로 확대한다. 짝 밖 손가락을 떼거나 1·2손가락만 쓰는 조작은 그대로.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type Camera, DocState } from '../../src/app/docstate';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
// 400 × 600 보기(타일 없음), 화면 가운데 (200, 300)
const W = 400;
const H = 600;
/** 짝 1·2를 (150.5|250.5, 300.5)에서 (100.5|300.5, 300.5)로 벌린 뒤의 카메라: 가운데 (200.5, 300.5) 아래 도면 (0.5, −0.5), 배율 1 × 200/100 */
const C: Camera = { cx: 0.25, cy: -0.25, scale: 2 };

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
let dom: { window: Record<string, unknown> & { close(): void; MouseEvent: typeof MouseEvent; HTMLCanvasElement: { prototype: object }; HTMLElement: { prototype: object } } };
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

async function view() {
  const { CadView } = await import('../../src/app/view');
  const st = new DocState(1, createNewDocument('metric'), 't.dxf', 0, 0);
  st.cameras.set(MODEL_SPACE, { cx: 0, cy: 0, scale: 1 });
  const v = new CadView(document.getElementById('host') as HTMLElement);
  const clicks: Pt[] = [];
  v.on({
    move: () => {},
    click: (_w: Pt, s: Pt) => void clicks.push(s),
    context: () => {},
    down: () => {},
    drag: () => {},
    leave: () => {},
    viewChanged: () => {},
  } as unknown as Parameters<typeof v.on>[0]);
  v.setState(st);
  v.aimEnabled = () => false;
  const fire = (type: string, p: Pt, id: number) => {
    const ev = new dom.window.MouseEvent(type, { clientX: p.x, clientY: p.y, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: id });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    v.el.dispatchEvent(ev);
  };
  const cam = () => ({ ...st.cameras.get(MODEL_SPACE)! });
  /** 짝 1·2를 누르고 벌려 카메라 C로 */
  const pinchToC = () => {
    fire('pointerdown', P(150.5, 300.5), 1);
    fire('pointerdown', P(250.5, 300.5), 2);
    fire('pointermove', P(100.5, 300.5), 1);
    fire('pointermove', P(300.5, 300.5), 2);
  };
  return { v, clicks, fire, cam, pinchToC };
}

describe('손가락 수가 바뀌어도 화면이 튀지 않는다', () => {
  it('셋째를 더하고(짝 그대로) 확대 짝의 하나를 떼면: 첫 이동의 화면 그대로, 이어 남은 둘의 가운데를 중심으로 확대', async () => {
    const t = await view();
    t.pinchToC();
    expect(t.cam()).toEqual(C);
    // 2 → 3: 셋째는 짝이 아니다 — 누르고 움직여도 화면 그대로
    t.fire('pointerdown', P(200.5, 500.5), 3);
    t.fire('pointermove', P(210.5, 480.5), 3);
    expect(t.cam()).toEqual(C);
    // 3 → 2: 짝의 하나(1)를 뗌 — 남은 짝 (2, 3)의 가운데 (255.5, 390.5) 아래 도면 점은 (28, −45.5)
    t.fire('pointerup', P(100.5, 300.5), 1);
    expect(t.cam()).toEqual(C);
    t.fire('pointermove', P(210.5, 480.5), 3);
    expect(t.cam()).toEqual(C);
    // 가운데를 두고 두 배로 벌림 → 배율 4, 가운데 아래 도면 점 그대로
    t.fire('pointermove', P(345.5, 210.5), 2);
    t.fire('pointermove', P(165.5, 570.5), 3);
    const c = t.cam();
    expect(c.scale).toBeCloseTo(4, 9);
    expect(c.cx).toBeCloseTo(14.125, 9);
    expect(c.cy).toBeCloseTo(-22.875, 9);
    const w = t.v.screenToWorld(255.5, 390.5);
    expect(w.x).toBeCloseTo(28, 9);
    expect(w.y).toBeCloseTo(-45.5, 9);
    t.fire('pointerup', P(345.5, 210.5), 2);
    t.fire('pointerup', P(165.5, 570.5), 3);
    expect(t.clicks).toEqual([]);
  });

  it('확대 짝의 하나가 취소돼도(pointercancel) 떼기와 같이 첫 이동의 화면 그대로', async () => {
    const t = await view();
    t.pinchToC();
    t.fire('pointerdown', P(210.5, 480.5), 3);
    t.fire('pointercancel', P(300.5, 300.5), 2);
    t.fire('pointermove', P(210.5, 480.5), 3);
    expect(t.cam()).toEqual(C);
    // 남은 짝 (1, 3)의 가운데 (155.5, 390.5) 아래 도면 점 (−22, −45.5)
    expect(t.v.screenToWorld(155.5, 390.5)).toEqual(P(-22, -45.5));
    t.fire('pointerup', P(100.5, 300.5), 1);
    t.fire('pointerup', P(210.5, 480.5), 3);
    expect(t.clicks).toEqual([]);
  });

  it('그대로인 갈래: 짝 밖 손가락을 뗀 3 → 2, 한 손가락 끌기 → 두 손가락 확대 → 한 손가락', async () => {
    const a = await view();
    a.pinchToC();
    a.fire('pointerdown', P(210.5, 480.5), 3);
    a.fire('pointerup', P(210.5, 480.5), 3);
    a.fire('pointermove', P(100.5, 300.5), 1);
    expect(a.cam()).toEqual(C);
    // 짝을 처음 자리로 되돌리면 처음 화면
    a.fire('pointermove', P(150.5, 300.5), 1);
    a.fire('pointermove', P(250.5, 300.5), 2);
    expect(a.cam()).toEqual({ cx: 0, cy: 0, scale: 1 });

    const b = await view();
    b.fire('pointerdown', P(100.5, 300.5), 1);
    b.fire('pointermove', P(120.5, 310.5), 1);
    expect(b.cam()).toEqual({ cx: -20, cy: 10, scale: 1 });
    // 1 → 2: 그때 화면에서 확대 시작 — 가운데 (170.5, 310.5) 아래 도면 (−49.5, −0.5)를 새 가운데 (220.5, 310.5)에, 배율 2
    b.fire('pointerdown', P(220.5, 310.5), 2);
    expect(b.cam()).toEqual({ cx: -20, cy: 10, scale: 1 });
    b.fire('pointermove', P(320.5, 310.5), 2);
    expect(b.cam()).toEqual({ cx: -59.75, cy: 4.75, scale: 2 });
    // 2 → 1: 남은 손가락은 화면을 옮기지 않고, 떼도 누르기가 아니다
    b.fire('pointerup', P(320.5, 310.5), 2);
    b.fire('pointermove', P(150.5, 350.5), 1);
    expect(b.cam()).toEqual({ cx: -59.75, cy: 4.75, scale: 2 });
    b.fire('pointerup', P(150.5, 350.5), 1);
    expect(b.clicks).toEqual([]);
  });
});
