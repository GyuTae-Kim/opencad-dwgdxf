/**
 * 26차: 휴대폰 정밀 조준 십자선과 스냅 표식이 떠 있는 판(측정 띠·명령행·시트) 밑에 숨지 않게.
 * 375px 헤드리스 재현(고치기 전 빌드, 어둡게·밝게 같음): 끝점을 측정 띠 위 끝 4px 아래에 두고 십자선을 띠 위 끝 4px 위로 조준하면
 * 끝점 스냅 표식이 띠 밑(겹친 넓이 154px², 그 자리 맨 위 요소가 띠)이었고 마그넷(AUTOSNAP 4)으로 십자선도 띠 밑에 붙었다.
 * 손가락을 띠 위로 끌면 십자선(손가락 − 64) 자체가 띠 안, 편집 화면 명령행도 같았다.
 * 규칙: 덮개 밑은 겨눌 수 없는 벽 — 십자선이 덮개에서 조준창 + 표식기 반지름 + 2 안으로 들어가면 가장 가까운 변 바깥으로 민다
 * (SketchUp 앱 25차 십자선 비키기와 같은 규칙, 거리만 스냅 표식이 보이게). 덮개에서 먼 자리와 스냅 계산은 그대로.
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { DocState } from '../../src/app/docstate';
import { AIM_COVER_GAP_MIN, AIM_HOLD_MS, AIM_OFFSET_PX, aimCoverGap, aimPoint } from '../../src/app/aim';
import type { Box } from '../../src/app/overlay-place';
import { DEFAULT_SETTINGS, snapMarkerRadius } from '../../src/app/settings';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });

// 375 × 641 보기(헤드리스와 같은 꼴): 휴대폰 보기 모드 측정 띠(8..367, 529..633), 편집 화면 명령행(8..367, 525..608)
const W = 375;
const H = 641;
const VIEW = { w: W, h: H };
const CARD: Box = { x0: 8, y0: 529, x1: 367, y1: 633 };
const CMD: Box = { x0: 8, y0: 525, x1: 367, y1: 608 };
const GAP = aimCoverGap(DEFAULT_SETTINGS.aperture, snapMarkerRadius(DEFAULT_SETTINGS.markerSize));
/** 점에서 상자까지 거리(안이면 0) */
const dist = (p: Pt, b: Box) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));

describe('덮개를 비키는 거리(aimCoverGap)', () => {
  it('조준창 + 표식기 반지름 + 2, 기본값(조준창 10, 표식기 크기 5)은 18화소, 작아도 8화소', () => {
    expect(GAP).toBe(18);
    expect(aimCoverGap(1, 2)).toBe(AIM_COVER_GAP_MIN);
    expect(aimCoverGap(50, 21)).toBe(73);
  });
});

describe('정밀 조준 십자선 자리(aimPoint)', () => {
  it('덮개가 없거나 멀면 예전 자리(손가락 위 64, 위 가장자리에서 멈춤)', () => {
    expect(aimPoint(P(30, 200))).toEqual(P(30, 200 - AIM_OFFSET_PX));
    expect(aimPoint(P(30, 10), [CARD], VIEW, GAP)).toEqual(P(30, 0));
    expect(aimPoint(P(100.5, 300.25), [CARD], VIEW, GAP)).toEqual(P(100.5, 236.25));
    // 띠 위 끝에서 gap보다 조금 더 위
    expect(aimPoint(P(120.5, CARD.y0 - GAP - 0.5 + AIM_OFFSET_PX), [CARD], VIEW, GAP)).toEqual(P(120.5, CARD.y0 - GAP - 0.5));
  });

  it('헤드리스 재현 자리: 띠 위 끝 4px 위 십자선은 띠 위 끝 − 18로(아래 끝점은 조준창 밖)', () => {
    const q = aimPoint(P(185.5, CARD.y0 - 4 + AIM_OFFSET_PX), [CARD], VIEW, GAP);
    expect(q).toEqual(P(185.5, CARD.y0 - GAP));
    // 띠 위 끝 4px 아래의 끝점은 십자선에서 22px — 조준창(10) 밖이라 잡히지 않는다
    expect(Math.hypot(187.5 - q.x, CARD.y0 + 4 - q.y)).toBeGreaterThan(DEFAULT_SETTINGS.aperture);
  });

  it('손가락을 띠로 끌어 십자선 자리가 띠 안이어도 띠 위(아래·옆은 화면 끝 gap 안이라 쓰지 않는다)', () => {
    expect(aimPoint(P(200.5, CARD.y0 + 20 + AIM_OFFSET_PX), [CARD], VIEW, GAP)).toEqual(P(200.5, CARD.y0 - GAP));
    // 띠 아래 끝 가까이(아래로 밀면 641 − 18을 넘는다)
    expect(aimPoint(P(200.5, 630.5 + AIM_OFFSET_PX), [CARD], VIEW, GAP)).toEqual(P(200.5, CARD.y0 - GAP));
    // 편집 화면 명령행
    expect(aimPoint(P(50.5, 600.5 + AIM_OFFSET_PX), [CMD], { w: W, h: H }, GAP)).toEqual(P(50.5, CMD.y0 - GAP));
    // 화면 왼쪽·오른쪽 끝(gap 안)의 손가락도 위로는 민다(민 쪽 좌표만 본다)
    expect(aimPoint(P(3.5, 560.5 + AIM_OFFSET_PX), [CMD], VIEW, GAP)).toEqual(P(3.5, CMD.y0 - GAP));
    expect(aimPoint(P(372.5, 560.5 + AIM_OFFSET_PX), [CARD], VIEW, GAP)).toEqual(P(372.5, CARD.y0 - GAP));
  });

  it('어느 손가락 자리든 십자선은 덮개에서 gap 밖 — 조준창 안 스냅 점의 표식기(반지름 + 선 굵기)가 덮개에 걸리지 않는다', () => {
    const r = snapMarkerRadius(DEFAULT_SETTINGS.markerSize);
    for (const cover of [CARD, CMD]) {
      for (let fx = 3.3; fx < W; fx += 17.1) {
        for (let fy = 5.7; fy < H + 80; fy += 13.3) {
          const q = aimPoint(P(fx, fy), [cover], VIEW, GAP);
          expect(dist(q, cover)).toBeGreaterThanOrEqual(GAP - 1e-9);
          // 조준창 가장자리의 스냅 점에서도 표식기(반지름 r, 선 굵기 2)는 덮개 밖
          expect(dist(q, cover) - DEFAULT_SETTINGS.aperture - r - 1).toBeGreaterThan(0);
        }
      }
    }
  });

  it('옆에 뜬 판은 옆으로, 맞붙은 판 둘이면 둘 다 넘는다', () => {
    // 넓은 터치 화면의 오른쪽 특성 팔레트
    const side: Box = { x0: 600, y0: 0, x1: 1000, y1: 800 };
    expect(aimPoint(P(610.5, 400.5), [side], { w: 1000, h: 800 }, GAP)).toEqual(P(600 - GAP, 400.5 - AIM_OFFSET_PX));
    // 휴대폰 특성 시트(300..525)가 명령행 바로 위: 명령행 위는 시트 안이라 시트 위로
    const sheet: Box = { x0: 0, y0: 300, x1: W, y1: CMD.y0 };
    expect(aimPoint(P(150.5, 560.5 + AIM_OFFSET_PX), [CMD, sheet], VIEW, GAP)).toEqual(P(150.5, sheet.y0 - GAP));
  });
});

// ---------------------------------------------------------------------------
// 진짜 CadView: 길게 눌러 조준하는 동안 앱에 보내는 커서 자리와 떼어 누른 자리
// ---------------------------------------------------------------------------

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

async function touchView(covers: (() => Box[]) | null) {
  const { CadView } = await import('../../src/app/view');
  const st = new DocState(1, createNewDocument('metric'), 't.dxf', 0, 0);
  st.cameras.set(MODEL_SPACE, { cx: 0, cy: 0, scale: 1 });
  const view = new CadView(document.getElementById('host') as HTMLElement);
  const moves: { w: Pt; s: Pt }[] = [];
  const clicks: { w: Pt; s: Pt }[] = [];
  view.on({
    move: (w: Pt, s: Pt) => void moves.push({ w, s }),
    click: (w: Pt, s: Pt) => void clicks.push({ w, s }),
    down: () => {},
    viewChanged: () => {},
  } as unknown as Parameters<typeof view.on>[0]);
  view.setState(st);
  view.aimEnabled = () => true;
  view.covers = covers;
  const fire = (type: string, p: Pt) => {
    const ev = new dom.window.MouseEvent(type, { clientX: p.x, clientY: p.y, button: 0, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: 7 });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    view.el.dispatchEvent(ev);
  };
  /** 길게 눌러 조준이 시작될 때까지(횟수가 아니라 시간으로) 기다린다 */
  const hold = async (p: Pt) => {
    fire('pointerdown', p);
    const t0 = Date.now();
    while (!view.aiming && Date.now() - t0 < AIM_HOLD_MS + 5000) await new Promise((r) => setTimeout(r, 20));
    expect(view.aiming).toBe(true);
  };
  return { view, moves, clicks, fire, hold };
}

describe('진짜 CadView의 정밀 조준', () => {
  it('측정 띠 위 끝 근처에서 십자선을 띠 위 끝 − 18에 두고, 손가락을 띠로 끌어도 그 자리, 떼면 그 자리를 누른다', async () => {
    const h = await touchView(() => [CARD]);
    await h.hold(P(190.5, CARD.y0 - 4 + AIM_OFFSET_PX));
    expect(h.moves.at(-1)!.s).toEqual(P(190.5, CARD.y0 - GAP));
    h.fire('pointermove', P(200.5, CARD.y0 + 60 + AIM_OFFSET_PX));
    const last = h.moves.at(-1)!;
    expect(last.s).toEqual(P(200.5, CARD.y0 - GAP));
    expect(last.w).toEqual(h.view.screenToWorld(200.5, CARD.y0 - GAP));
    // 덮개에서 먼 자리는 예전처럼 손가락 위 64
    h.fire('pointermove', P(150.5, 300.5));
    expect(h.moves.at(-1)!.s).toEqual(P(150.5, 300.5 - AIM_OFFSET_PX));
    h.fire('pointermove', P(160.5, CARD.y0 + 10 + AIM_OFFSET_PX));
    h.fire('pointerup', P(160.5, CARD.y0 + 10 + AIM_OFFSET_PX));
    expect(h.clicks).toHaveLength(1);
    expect(h.clicks[0]!.s).toEqual(P(160.5, CARD.y0 - GAP));
    expect(h.clicks[0]!.w).toEqual(h.view.screenToWorld(160.5, CARD.y0 - GAP));
    expect(h.view.aiming).toBe(false);
  });

  it('덮개를 주지 않는 화면은 예전 그대로(손가락 위 64 — 띠가 없는 넓은 화면과 같다)', async () => {
    const h = await touchView(null);
    await h.hold(P(190.5, CARD.y0 + 20 + AIM_OFFSET_PX));
    expect(h.moves.at(-1)!.s).toEqual(P(190.5, CARD.y0 + 20));
    h.fire('pointerup', P(190.5, CARD.y0 + 20 + AIM_OFFSET_PX));
    expect(h.clicks[0]!.s).toEqual(P(190.5, CARD.y0 + 20));
  });
});
