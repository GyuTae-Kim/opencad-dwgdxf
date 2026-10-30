/**
 * 22차: 배치 뷰포트 안 모형 공간(MSPACE)의 줌. 도움말 ZOOM(줌은 현재 뷰포트의 뷰를 바꾼다 — 윈도우는 그 영역이 창을 채우고, 중심은
 * 중심점과 배율 또는 높이, 이전은 앞 뷰 10개까지, nX는 현재 뷰에 대해·nXP는 도면 공간 단위에 대해), "About Scaling Views in Layout
 * Viewports"(뷰포트 축척 = 도면 공간 단위 ÷ 모형 공간 단위, 뷰포트 안 모형 공간에서 ZOOM XP로), "To Lock the Scale of a Layout
 * Viewport"(화면표시가 잠긴 뷰포트에서 줌은 배치 전체에 걸리고 뷰포트 축척은 그대로).
 * - 순수 함수(vpzoom.ts)와 21차까지의 셈(창을 화면 가운데에 두던 것)의 재현
 * - 진짜 CadView 카메라(그리기는 가짜 WebGL·2D — 카메라 셈만): 윈도우·범위·nX·nXP·중심·이전·PAN·휠, 잠긴 뷰포트, 모형 공간(그대로)
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { DocState } from '../../src/app/docstate';
import type { SpaceScene } from '../../src/app/scene';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import {
  VP_PREVIOUS_MAX,
  fitScale,
  lockedPaperCamera,
  msCamera,
  paperScaledView,
  parseZoomFactor,
  patchOf,
  rememberView,
  scaledView,
  validView,
  viewOf,
  viewOfCamera,
  windowView,
  type VpViewPatch,
} from '../../src/app/vpzoom';

// 그리기는 하지 않는다: WebGL 렌더러와 2D 문맥은 무엇이든 받아 주는 빈 객체
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
let dom: { window: Record<string, unknown> & { close(): void; HTMLCanvasElement: { prototype: object }; HTMLElement: { prototype: object } } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(dom.window.HTMLCanvasElement.prototype, { getContext: () => noop });
  // 도면 영역 1000×600 CSS 픽셀
  Object.assign(dom.window.HTMLElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0 }) });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  });
  // 그리기 고리는 돌리지 않는다(카메라만 본다)
  vi.stubGlobal('requestAnimationFrame', () => 1);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });

/** 종이 사각형 r에 축척 k(종이/모형)로 모형 점 c를 가운데에 보이는 뷰포트 */
function vpAt(handle: string, r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity {
  return { ...newViewport(r, { handle, id: 2, scale: k, bounds: { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y } }), ...extra };
}

/** 모형 점 → 종이(비틀림 없는 뷰포트) */
function toPaper(vp: ViewportEntity, m: Pt): Pt {
  const v = viewOf(vp);
  const k = vp.height / vp.viewHeight;
  return { x: vp.center.x + (m.x - v.refX) * k, y: vp.center.y + (m.y - v.refY) * k };
}

/** 모형 점이 뷰포트 안에 보이는지(종이 사각형 안) */
function shows(vp: ViewportEntity, m: Pt, eps = 1e-9): boolean {
  const p = toPaper(vp, m);
  return Math.abs(p.x - vp.center.x) <= vp.width / 2 + eps && Math.abs(p.y - vp.center.y) <= vp.height / 2 + eps;
}

describe('MSPACE 줌 셈(순수 함수)', () => {
  // A3 용지 왼쪽 아래의 작은 뷰포트(종이 10,10–110,80), 종이 카메라는 용지 가운데(210, 148.5)를 화면 가운데에
  const paper = { cx: 210, cy: 148.5, scale: 2 };
  const base = vpAt('V', [10, 10, 110, 80], 0.1, P(500, 250));

  it('21차까지의 셈(재현): 창을 화면 가운데에 두고 뷰포트 크기로만 맞추면 창 가운데가 뷰포트 가운데에서 밀려 창이 뷰포트 밖으로 나간다', () => {
    // 이전 zoomRect: 카메라 가운데 = 창 가운데, 배율 = 뷰포트의 화면 크기에 맞춤 → setCamera가 뷰포트 뷰로 옮김
    const [x0, y0, x1, y1] = [-100, -300, 1100, 800];
    const W = base.width * paper.scale;
    const H = base.height * paper.scale;
    const scale = Math.min((W * 0.96) / (x1 - x0), (H * 0.96) / (y1 - y0));
    const old = viewOfCamera(base, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale }, paper);
    const oldVp = { ...base, ...patchOf(base, old) };
    // 축척은 맞지만(뷰포트 높이 ÷ 창 높이 × 0.96) 뷰포트 가운데에 오는 모형 점이 창 가운데(500, 250)가 아니다
    expect(base.height / old.viewHeight).toBeCloseTo((70 / 1100) * 0.96, 12);
    expect(Math.hypot(old.refX - 500, old.refY - 250)).toBeGreaterThan(1000);
    expect(shows(oldVp, P(500, 250))).toBe(false);
    // 새 셈: 창 가운데가 뷰포트 가운데, 창 네 구석이 뷰포트 안이고 한 방향은 여백만 남기고 꽉 찬다
    const v = windowView(base, x0, y0, x1, y1, 0.02);
    const nv = { ...base, ...patchOf(base, v) };
    expect(v.refX).toBe(500);
    expect(v.refY).toBe(250);
    for (const m of [P(x0, y0), P(x1, y0), P(x0, y1), P(x1, y1)]) expect(shows(nv, m)).toBe(true);
    expect(base.height / v.viewHeight).toBeCloseTo((70 / 1100) * 0.96, 12);
  });

  it('MSPACE 카메라 ↔ 뷰포트 뷰: 휠·끌기의 카메라를 뷰로 옮겨도 같은 카메라, 종이 카메라는 그대로', () => {
    const v = viewOf(base);
    const c = msCamera(base, v, paper);
    // 종이 카메라 가운데(210, 148.5)는 뷰포트 가운데(60, 45)에서 (150, 103.5) — 모형으로 1500, 1035
    expect(c.cx).toBeCloseTo(500 + 1500, 9);
    expect(c.cy).toBeCloseTo(250 + 1035, 9);
    expect(c.scale).toBeCloseTo(0.2, 12);
    const back = viewOfCamera(base, c, paper);
    expect(back.refX).toBeCloseTo(500, 9);
    expect(back.refY).toBeCloseTo(250, 9);
    expect(back.viewHeight).toBeCloseTo(700, 9);
  });

  it('잠긴 뷰포트: 모형 카메라를 종이 카메라로 — 같은 모형 점이 같은 화면 자리, 뷰포트 뷰는 그대로', () => {
    const c = { cx: 520, cy: 260, scale: 3 };
    const p = lockedPaperCamera(base, c);
    // 화면 가운데의 모형 점 (520, 260)은 종이 (62, 46)
    expect(p.cx).toBeCloseTo(62, 9);
    expect(p.cy).toBeCloseTo(46, 9);
    expect(p.scale).toBeCloseTo(30, 9);
    // 그 종이 카메라로 다시 만든 MSPACE 카메라는 c와 같다
    const again = msCamera(base, viewOf(base), p);
    expect(again.cx).toBeCloseTo(c.cx, 9);
    expect(again.cy).toBeCloseTo(c.cy, 9);
    expect(again.scale).toBeCloseTo(c.scale, 12);
  });

  it('nX는 뷰포트 가운데를 두고 지금 축척의 n배, nXP는 뷰포트 축척 n(종이 1 = 모형 1/n)', () => {
    const v2 = scaledView(base, 2);
    expect(v2).toEqual({ refX: 500, refY: 250, viewHeight: 350 });
    const xp = paperScaledView({ ...base, viewHeight: 1234 }, 0.05);
    expect(xp.refX).toBe(500);
    expect(base.height / xp.viewHeight).toBeCloseTo(0.05, 15);
    // .5XP(도움말 예): 모형 공간을 도면 공간 단위의 절반 축척으로
    expect(paperScaledView(base, 0.5).viewHeight).toBe(140);
  });

  it('맞춤 배율·쓸 만한 뷰·뷰 중심(DCS = 뷰 대상 기준)', () => {
    expect(fitScale(100, 50, 1000, 600, 0)).toBe(10);
    expect(fitScale(100, 50, 1000, 600, 0.1)).toBe(8);
    expect(fitScale(0, 0, 0, 0, 0)).toBeNull();
    expect(validView({ refX: 0, refY: 0, viewHeight: 0 })).toBe(false);
    expect(validView({ refX: NaN, refY: 0, viewHeight: 1 })).toBe(false);
    const t = { ...base, viewTarget: { x: 1000, y: 2000, z: 0 }, viewCenter: { x: -500, y: -1750 } };
    expect(viewOf(t)).toEqual({ refX: 500, refY: 250, viewHeight: 700 });
    expect(patchOf(t, { refX: 600, refY: 300, viewHeight: 70 })).toEqual({ viewHeight: 70, viewCenter: { x: -400, y: -1700 } });
  });

  it('ZOOM 축척 입력: nX·nXP·숫자만(대소문자, .5xp), 0 이하·분수·글자는 받지 않는다', () => {
    expect(parseZoomFactor('2X')).toEqual({ n: 2, unit: 'x' });
    expect(parseZoomFactor('.5xp')).toEqual({ n: 0.5, unit: 'xp' });
    expect(parseZoomFactor(' 0.05 XP ')).toEqual({ n: 0.05, unit: 'xp' });
    expect(parseZoomFactor('3')).toEqual({ n: 3, unit: '' });
    expect(parseZoomFactor('1.')).toEqual({ n: 1, unit: '' });
    for (const t of ['0', '0xp', '-2x', '1/2xp', 'W', 'x', '2y', '1e3x', '']) expect(parseZoomFactor(t)).toBeNull();
  });

  it('이전 뷰는 뷰포트마다 10개까지(오래된 것부터 버린다)', () => {
    const list: VpViewPatch[] = [];
    for (let i = 1; i <= 12; i++) rememberView(list, { ...base, viewHeight: i });
    expect(VP_PREVIOUS_MAX).toBe(10);
    expect(list.map((v) => v.viewHeight)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 남긴 값은 사본(뷰포트 객체가 바뀌어도 그대로)
    const vp = { ...base, viewCenter: { ...base.viewCenter } };
    rememberView(list, vp);
    vp.viewCenter.x = -1;
    expect(list.at(-1)!.viewCenter.x).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 진짜 CadView 카메라
// ---------------------------------------------------------------------------

async function viewWith(vpExtra: Partial<ViewportEntity> = {}) {
  const { CadView } = await import('../../src/app/view');
  const doc = createNewDocument('metric');
  const vp = vpAt('V1', [10, 10, 110, 80], 0.1, P(500, 250), vpExtra);
  doc.blocks.get(PAPER_SPACE)!.entities.push(vp);
  doc.entityIndex.set('V1', vp);
  const st = new DocState(1, doc, 't.dwg', 0, 0);
  // 모형 범위(0,0)–(1000,500)
  st.scenes.set(MODEL_SPACE, { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 } } as unknown as SpaceScene);
  // 종이 카메라: 용지 가운데(210, 148.5)가 화면 가운데, 종이 1 = 2픽셀
  st.cameras.set(PAPER_SPACE, { cx: 210, cy: 148.5, scale: 2 });
  st.msVp = { layout: PAPER_SPACE, handle: 'V1' };
  st.space = MODEL_SPACE;
  const view = new CadView(document.getElementById('host') as HTMLElement);
  const patches: Pick<ViewportEntity, 'viewHeight' | 'viewCenter'>[] = [];
  let changed = 0;
  view.on({
    // 앱(onViewportView)처럼 뷰포트 객체를 곧바로 바꾼다
    viewportView: (e: ViewportEntity, patch: Pick<ViewportEntity, 'viewHeight' | 'viewCenter'>) => {
      patches.push(patch);
      e.viewHeight = patch.viewHeight;
      e.viewCenter = { ...patch.viewCenter };
    },
    viewChanged: () => void changed++,
  } as unknown as Parameters<typeof view.on>[0]);
  view.setState(st);
  const k = () => vp.height / vp.viewHeight;
  const ref = () => viewOf(vp);
  return { view, st, vp, patches, k, ref, changes: () => changed, paper: () => ({ ...st.cameras.get(PAPER_SPACE)! }) };
}

describe('진짜 CadView: 배치 뷰포트 안 모형 공간(MSPACE)의 줌', () => {
  it('윈도우(21차 보고의 창): 창 가운데가 뷰포트 가운데, 창이 뷰포트를 채운다 — 종이 카메라는 그대로', async () => {
    const h = await viewWith();
    expect(h.view.width).toBe(1000);
    const p0 = h.paper();
    h.view.zoomRect(-100, -300, 1100, 800);
    expect(h.ref().refX).toBeCloseTo(500, 9);
    expect(h.ref().refY).toBeCloseTo(250, 9);
    expect(h.k()).toBeCloseTo((70 / 1100) * 0.96, 12);
    for (const m of [P(-100, -300), P(1100, 800)]) expect(shows(h.vp, m, 1e-6)).toBe(true);
    expect(h.paper()).toEqual(p0);
    // 화면에서도: 창 가운데의 화면 자리 = 뷰포트 가운데의 화면 자리
    const s = h.view.worldToScreen(500, 250);
    const c = h.view.paperPoint(s.x, s.y);
    expect(c.x).toBeCloseTo(60, 9);
    expect(c.y).toBeCloseTo(45, 9);
  });

  it('범위: 모형 범위 가운데가 뷰포트 가운데(여백 4%), 객체가 비었으면 뷰는 그대로', async () => {
    const h = await viewWith();
    h.view.zoomExtents();
    expect(h.ref()).toEqual({ refX: 500, refY: 250, viewHeight: expect.any(Number) });
    expect(h.k()).toBeCloseTo((100 / 1000) * 0.92, 12);
    expect(shows(h.vp, P(0, 0))).toBe(true);
    expect(shows(h.vp, P(1000, 500))).toBe(true);
    h.st.scenes.delete(MODEL_SPACE);
    const before = { ...h.vp.viewCenter, vh: h.vp.viewHeight };
    h.view.zoomExtents();
    expect({ ...h.vp.viewCenter, vh: h.vp.viewHeight }).toEqual(before);
  });

  it('nX·ZOOMIN: 뷰포트 가운데를 두고 배율, nXP: 뷰포트 축척 n(가운데 그대로)', async () => {
    const h = await viewWith();
    h.view.zoomRect(200, 100, 400, 200);
    const k0 = h.k();
    h.view.zoomCenter(2);
    expect(h.ref().refX).toBeCloseTo(300, 9);
    expect(h.ref().refY).toBeCloseTo(150, 9);
    expect(h.k()).toBeCloseTo(k0 * 2, 12);
    expect(h.view.zoomPaperScale(0.1)).toBe('done');
    expect(h.vp.viewHeight).toBe(700);
    expect(h.ref().refX).toBeCloseTo(300, 9);
    expect(h.view.msViewport()).toEqual({ height: 70, locked: false });
    expect(h.view.viewHeight()).toBe(700);
  });

  it('중심: 중심점이 뷰포트 가운데, 높이가 뷰 높이(없으면 지금 높이)', async () => {
    const h = await viewWith();
    h.view.zoomCenterAt(200, 100, 300);
    expect(h.vp.viewCenter).toEqual({ x: 200, y: 100 });
    expect(h.vp.viewHeight).toBe(300);
    h.view.zoomCenterAt(-50, 20);
    expect(h.vp.viewCenter).toEqual({ x: -50, y: 20 });
    expect(h.vp.viewHeight).toBe(300);
  });

  it('이전: 그 뷰포트의 앞 뷰를 차례로(10개까지), 휠 확대는 남기지 않는다', async () => {
    const h = await viewWith();
    const v0 = { ...h.vp.viewCenter, vh: h.vp.viewHeight };
    h.view.zoomRect(200, 100, 400, 200);
    const v1 = { ...h.vp.viewCenter, vh: h.vp.viewHeight };
    h.view.zoomCenterAt(0, 0, 50);
    // 휠(화면 점 고정, 남기지 않음)
    h.view.zoomAt(300, 400, 1.5);
    expect(h.view.zoomPrevious()).toBe(true);
    expect({ ...h.vp.viewCenter, vh: h.vp.viewHeight }).toEqual(v1);
    expect(h.view.zoomPrevious()).toBe(true);
    expect({ ...h.vp.viewCenter, vh: h.vp.viewHeight }).toEqual(v0);
    expect(h.view.zoomPrevious()).toBe(false);
    for (let i = 1; i <= 12; i++) h.view.zoomCenterAt(i, 0, 10 * i);
    let n = 0;
    while (h.view.zoomPrevious()) n++;
    expect(n).toBe(10);
    expect(h.vp.viewHeight).toBe(20);
  });

  it('PAN 두 점: 축척 그대로 뷰만 옮긴다(이전에는 화면 크기 창을 뷰포트에 맞춰 축소했다)', async () => {
    const h = await viewWith();
    const k0 = h.k();
    h.view.panWorld(100, 50);
    expect(h.k()).toBe(k0);
    expect(h.vp.viewCenter).toEqual({ x: 400, y: 200 });
    expect(h.view.zoomPrevious()).toBe(true);
    expect(h.vp.viewCenter).toEqual({ x: 500, y: 250 });
  });

  it('휠: 커서 아래 모형 점이 그 자리에 남는다(그대로)', async () => {
    const h = await viewWith();
    const at = P(260, 470);
    const m0 = h.view.screenToWorld(at.x, at.y);
    h.view.zoomAt(at.x, at.y, 1.7);
    const m1 = h.view.screenToWorld(at.x, at.y);
    expect(m1.x).toBeCloseTo(m0.x, 6);
    expect(m1.y).toBeCloseTo(m0.y, 6);
    expect(h.k()).toBeCloseTo(0.17, 12);
  });

  it('화면표시가 잠긴 뷰포트: 윈도우는 배치 전체를 화면에 맞추고(창 가운데가 화면 가운데) 뷰포트 뷰는 그대로, nXP는 바꾸지 않고, 이전은 배치 화면', async () => {
    const h = await viewWith({ flags: 0x4000 });
    const p0 = h.paper();
    h.view.zoomRect(400, 200, 600, 300);
    expect(h.patches).toEqual([]);
    expect(h.vp.viewHeight).toBe(700);
    const s = h.view.worldToScreen(500, 250);
    expect(s.x).toBeCloseTo(500, 6);
    expect(s.y).toBeCloseTo(300, 6);
    // 창 (200×100 모형 = 20×10 종이)이 화면 1000×600에 맞는다
    expect(h.paper().scale).toBeCloseTo((1000 * 0.96) / 20, 9);
    expect(h.view.zoomPaperScale(0.5)).toBe('locked');
    expect(h.vp.viewHeight).toBe(700);
    expect(h.view.msViewport()).toEqual({ height: 70, locked: true });
    expect(h.view.zoomPrevious()).toBe(true);
    expect(h.paper()).toEqual(p0);
    // PAN도 배치 전체를 옮긴다(축척 그대로)
    h.view.panWorld(100, 0);
    expect(h.vp.viewHeight).toBe(700);
    expect(h.paper().scale).toBeCloseTo(p0.scale, 12);
    expect(h.paper().cx).toBeCloseTo(p0.cx - 10, 9);
  });

  it('모형 공간(뷰포트 밖)은 그대로: 창 가운데가 화면 가운데, 화면에 맞춘 배율, 이전 화면', async () => {
    const h = await viewWith();
    h.st.msVp = null;
    h.st.cameras.set(MODEL_SPACE, { cx: 0, cy: 0, scale: 1 });
    h.view.zoomRect(0, 0, 1000, 500);
    expect(h.st.cameras.get(MODEL_SPACE)).toEqual({ cx: 500, cy: 250, scale: 0.96 });
    h.view.panWorld(100, 50);
    expect(h.st.cameras.get(MODEL_SPACE)).toEqual({ cx: 400, cy: 200, scale: 0.96 });
    h.view.zoomCenterAt(10, 20, 300);
    expect(h.st.cameras.get(MODEL_SPACE)).toEqual({ cx: 10, cy: 20, scale: 2 });
    expect(h.view.viewHeight()).toBe(300);
    expect(h.view.zoomPaperScale(0.1)).toBe('none');
    expect(h.view.msViewport()).toBeNull();
    expect(h.view.zoomPrevious()).toBe(true);
    expect(h.st.cameras.get(MODEL_SPACE)).toEqual({ cx: 400, cy: 200, scale: 0.96 });
    expect(h.patches).toEqual([]);
  });
});
