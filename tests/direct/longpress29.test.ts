/**
 * 29차: 안드로이드는 손가락을 길게 누르면 contextmenu를 보낸다(앱의 휴대폰 바로 가기 메뉴 — 고른 표 셀의 메뉴도 이 길).
 * 손가락을 누른 채 온 메뉴는 그 손가락을 떼는 것을 누르기로 치지 않는다(떼며 누른 것이 막 띄운 메뉴를 닫았다).
 * 메뉴가 오지 않은 톡과 마우스 오른쪽 클릭은 예전 그대로.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { DocState } from '../../src/app/docstate';

type Pt = { x: number; y: number };
const W = 375;
const H = 641;

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
  const menus: Pt[] = [];
  v.on({
    move: () => {},
    click: (_w: Pt, s: Pt) => void clicks.push(s),
    context: (_w: Pt, s: Pt) => void menus.push(s),
    down: () => {},
    viewChanged: () => {},
  } as unknown as Parameters<typeof v.on>[0]);
  v.setState(st);
  // 명령 없음(정밀 조준 없음 — 앱은 점 요청·보기 모드에서만 조준한다)
  v.aimEnabled = () => false;
  const fire = (type: string, p: Pt, o: { touch?: boolean; button?: number } = {}) => {
    const ev = new dom.window.MouseEvent(type, { clientX: p.x, clientY: p.y, button: o.button ?? 0, bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: 7 });
    Object.defineProperty(ev, 'pointerType', { value: o.touch === false ? 'mouse' : 'touch' });
    v.el.dispatchEvent(ev);
  };
  return { v, clicks, menus, fire };
}

describe('길게 누르기 메뉴(안드로이드 contextmenu)', () => {
  it('손가락을 누른 채 온 메뉴: 메뉴를 보내고, 떼는 것은 누르기가 아니다', async () => {
    const h = await view();
    h.fire('pointerdown', { x: 100.5, y: 200.5 });
    h.fire('contextmenu', { x: 100.5, y: 200.5 }, { touch: false, button: 2 });
    h.fire('pointerup', { x: 100.5, y: 200.5 });
    expect(h.menus).toEqual([{ x: 100.5, y: 200.5 }]);
    expect(h.clicks).toEqual([]);
    // 다음 톡은 예전처럼 누르기
    h.fire('pointerdown', { x: 50.5, y: 60.5 });
    h.fire('pointerup', { x: 50.5, y: 60.5 });
    expect(h.clicks).toEqual([{ x: 50.5, y: 60.5 }]);
  });

  it('메뉴가 오지 않은 톡, 마우스 오른쪽 클릭은 예전 그대로', async () => {
    const h = await view();
    h.fire('pointerdown', { x: 10.5, y: 20.5 });
    h.fire('pointerup', { x: 10.5, y: 20.5 });
    expect(h.clicks).toEqual([{ x: 10.5, y: 20.5 }]);
    h.fire('pointerdown', { x: 30.5, y: 40.5 }, { touch: false, button: 2 });
    h.fire('contextmenu', { x: 30.5, y: 40.5 }, { touch: false, button: 2 });
    h.fire('pointerup', { x: 30.5, y: 40.5 }, { touch: false, button: 2 });
    expect(h.menus).toEqual([{ x: 30.5, y: 40.5 }]);
    expect(h.clicks).toEqual([{ x: 10.5, y: 20.5 }]);
  });
});
