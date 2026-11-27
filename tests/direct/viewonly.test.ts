/**
 * 휴대폰 보기 모드(App.viewOnly)와 터치 점 찍기: 진짜 App, 화면·명령행은 가짜(tests/direct/app.test.ts와 같은 틀).
 * 보기 모드는 누른 객체 하나만 고르고, 그립·그립 편집·두 번 눌러 편집·도면 영역 메뉴를 열지 않는다.
 * 손가락으로 찍은 점은 객체 스냅 조준창을 넓히고, 정밀 조준(view.aiming) 중에는 마우스처럼 커서·미리보기를 보인다.
 * 손가락 두 번 톡(편집 화면)의 dblclick은 톡 고르기와 같은 거리(PICKBOX × 3)로 객체를 고른다(268차 — 아래 끝 묶음).
 * 보기 모드의 배치 두 번 누르기는 그 자리 객체와 상관없이 뷰포트 드나들기만 한다(269차 — 끝 묶음 안).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import type { PointResult } from '../../src/app/app';
import type { OverlayState } from '../../src/app/view';
import { addHook } from '../../src/app/hooks';
import * as dom from '../../src/app/ui/dom';
import { setSysvarText } from '../../src/app/sysvars';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

beforeAll(async () => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
  // 빈 곳 dblclick이 기다리지 않고 띄우는 표 셀 편집 가져오기(app.ts — `void import('./tablecmds')`)를 미리 불러 둔다.
  // 처음 가져오기는 settle()보다 오래 걸려, 시험 파일이 끝난 뒤 모듈을 평가하다 TDZ 오류(Unhandled Rejection —
  // `Cannot access '__vite_ssr_import_9__' before initialization`, tablecmds.ts editTableCellAt)가 날 수 있었다(CI 2차 #362 조각 1, 같은 조각 파일에 따라 갈림)
  await import('../../src/app/tablecmds');
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.mocked(dom.showMenu).mockClear();
});

type Pt = { x: number; y: number };
const ev = (o: Partial<PointerEvent> = {}) => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...o }) as PointerEvent;
const P = (x: number, y: number) => ({ x, y });
const ov = (h: RealApp) => h.view.overlay as unknown as OverlayState;

function setup() {
  const h = makeApp();
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const e: LineEntity = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } };
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e.handle;
  };
  const view = h.view as unknown as { aiming?: boolean; aimEnabled: (() => boolean) | null };
  return {
    ...h,
    line,
    view2: view,
    move: (p: Pt, o?: Partial<PointerEvent>) => h.view.events.move!(p, p, ev(o)),
    click: (p: Pt, o?: Partial<PointerEvent>) => h.view.events.click!(p, p, ev(o)),
  };
}

describe('휴대폰 보기 모드', () => {
  it('누르면 그 객체 하나만 고르고, 그립·그립 편집·두 번 눌러 편집·도면 영역 메뉴가 없다', async () => {
    const h = setup();
    const a = h.line(0, 0, 10, 0);
    const b = h.line(0, 20, 10, 20);
    const ran: string[] = [];
    for (const n of ['GRIPEDIT', 'QUICKPROPERTIES']) h.app.register({ name: n, title: n, run: () => void ran.push(n) });
    h.app.setViewOnly(true);
    h.click(P(5, 0), { pointerType: 'touch' });
    h.click(P(5, 20), { pointerType: 'touch' });
    expect([...h.st.selection]).toEqual([b]);
    expect(ov(h).grips).toEqual([]);
    // 끝점(편집 화면이면 그립)을 눌러도 그립 편집이 아니다
    h.click(P(10, 20), { pointerType: 'touch' });
    h.view.events.dblclick!(P(5, 20), P(5, 20), ev());
    h.view.events.context!(P(5, 20), P(5, 20), ev({ button: 2 }));
    await settle();
    expect(ran).toEqual([]);
    expect(h.app.busyCommand).toBeNull();
    expect(dom.showMenu).not.toHaveBeenCalled();
    // 편집 화면으로 돌아오면 그립과 두 번 눌러 편집이 다시 있다
    h.app.setViewOnly(false);
    expect(ov(h).grips.length).toBeGreaterThan(0);
    h.view.events.dblclick!(P(5, 0), P(5, 0), ev());
    await settle();
    expect(ran).toEqual(['QUICKPROPERTIES']);
    expect([...h.st.selection]).toEqual([a]);
  });

  it('보기 모드로 바꾸면 진행 중 명령을 그만두고, 정밀 조준은 보기 모드이거나 명령이 입력을 기다릴 때만', async () => {
    const h = setup();
    expect(h.view2.aimEnabled?.()).toBe(false);
    h.app.register({ name: 'WAIT', title: 'w', run: async (ctx) => void (await ctx.getPoint('점:')) });
    void h.app.run('WAIT');
    await settle();
    expect(h.view2.aimEnabled?.()).toBe(true);
    h.app.setViewOnly(true);
    await settle();
    expect(h.app.busyCommand).toBeNull();
    expect(h.view2.aimEnabled?.()).toBe(true);
  });
});

describe('터치 점 찍기', () => {
  function pointCmd(h: ReturnType<typeof setup>) {
    const got: PointResult[] = [];
    h.app.register({ name: 'PT', title: 'PT', run: async (ctx) => void got.push(await ctx.getPoint('점:')) });
    return got;
  }
  const at = (r: PointResult | undefined) => (r && 'point' in r ? r.point : null);

  it('정밀 조준 없이 손가락으로 찍은 점은 객체 스냅 조준창이 두 배(손가락이 가려 보지 못한다)', async () => {
    const h = setup();
    h.line(0, 0, 100, 0);
    const got = pointCmd(h);
    // 끝점에서 15(조준창 10보다 멀고 20보다 가깝다)
    void h.app.run('PT');
    await settle();
    h.click(P(100, 15));
    await settle();
    expect(at(got.at(-1))).toEqual(P(100, 15));
    void h.app.run('PT');
    await settle();
    h.click(P(100, 15), { pointerType: 'touch' });
    await settle();
    expect(at(got.at(-1))).toEqual(P(100, 0));
    // 조준(보면서 맞춘 점)은 보통 조준창
    void h.app.run('PT');
    await settle();
    h.view2.aiming = true;
    h.click(P(100, 15), { pointerType: 'touch' });
    h.view2.aiming = false;
    await settle();
    expect(at(got.at(-1))).toEqual(P(100, 15));
  });

  it('터치는 커서가 없지만, 정밀 조준 중이면 십자선·스냅 미리보기를 보인다', async () => {
    const h = setup();
    h.line(0, 0, 100, 0);
    pointCmd(h);
    void h.app.run('PT');
    await settle();
    h.move(P(99, 2), { pointerType: 'touch' });
    expect(ov(h).cursor).toBeNull();
    h.view2.aiming = true;
    h.move(P(99, 2), { pointerType: 'touch' });
    h.view2.aiming = false;
    // 마그넷(AUTOSNAP 4, 기본 켜짐): 조준 십자선도 마우스 십자선처럼 잡은 스냅점에 붙는다
    expect(ov(h).cursor).toEqual(P(100, 0));
    expect(ov(h).snap?.p).toEqual(P(100, 0));
    // 마그넷을 끄면 손가락 위 십자선 자리 그대로(표식기만 스냅점에)
    expect(setSysvarText(h.app, 'AUTOSNAP', String(63 & ~4))).toBeNull();
    h.view2.aiming = true;
    h.move(P(99, 2), { pointerType: 'touch' });
    h.view2.aiming = false;
    expect(ov(h).cursor).toEqual(P(99, 2));
    expect(ov(h).snap?.p).toEqual(P(100, 0));
  });
});

/**
 * 268차: 손가락 두 번 톡의 dblclick 객체 고르기. 톡(onClick)은 PICKBOX × 3(기본 15px) 안의 객체를 고르는데, 뒤따르는 dblclick은 손가락이어도 PICKBOX × 1(5px)로
 * 다시 골라 톡 한 번으로 고르는 선(5~15px)을 두 번 톡 하면 편집이 열리지 않았다(표 빈 셀 찾기로 빠짐). dblclick은 MouseEvent라 pointerType이 없어
 * 바로 앞 누르기(두 번째 톡)의 것을 쓴다. 이 화면은 1 도면 단위 = 1px(FakeView), 손가락 그립 거리 12px(마우스·펜 6px), 두 누르기는 0.2초 사이(시간 멈춤).
 */
describe('손가락 두 번 톡의 객체 고르기(268차)', () => {
  const touch = { pointerType: 'touch' } as const;
  let clock = 1e6;
  /** 같은 자리를 0.2초 사이로 두 번 누른다 */
  const twice = (h: { click: (p: Pt, o?: Partial<PointerEvent>) => void }, p: Pt, o?: Partial<PointerEvent>) => {
    const t = vi.spyOn(performance, 'now');
    try {
      t.mockReturnValue(clock);
      h.click(p, o);
      t.mockReturnValue(clock + 200);
      h.click(p, o);
    } finally {
      t.mockRestore();
    }
    clock += 10_000;
  };
  /** 브라우저가 두 번째 누르기 뒤에 보내는 dblclick(MouseEvent — pointerType 없음) */
  const dblclick = (h: RealApp, p: Pt) => h.view.events.dblclick!(p, p, {} as MouseEvent);
  /** 두 번 누르기 고리가 받은 객체와 빠른 특성(선의 기본 두 번 누르기 편집) 실행 */
  const spy = (h: RealApp) => {
    const seen: string[] = [];
    const ran: string[] = [];
    addHook(h.app.dblClickHandlers, {
      name: 'seen268',
      dblclick: (handle) => {
        seen.push(handle);
        return false;
      },
    });
    h.app.register({ name: 'QUICKPROPERTIES', title: 'QUICKPROPERTIES', run: () => void ran.push('QUICKPROPERTIES') });
    return { seen, ran };
  };

  it('모형: 톡으로 고른 선(선에서 10px — 톡 거리 15 안, PICKBOX 5 밖)을 두 번 톡 하면 그 선의 두 번 누르기 편집(고리·빠른 특성)', async () => {
    const h = setup();
    const a = h.line(200, 50, 260, 50);
    const s = spy(h);
    // 두 번째 톡도 그립 자리가 아니다(끝점 (200, 50)·가운데 (230, 50)에서 hypot(15, 10) = 18 > 12)
    twice(h, P(215, 60), touch);
    expect([...h.st.selection]).toEqual([a]);
    dblclick(h, P(215, 60));
    await settle();
    // 전에는 PICKBOX × 1로 다시 골라 잡지 못하고 표 빈 셀 찾기로 빠졌다(표가 없어 아무것도 하지 않음)
    expect(s.seen).toEqual([a]);
    expect(s.ran).toEqual(['QUICKPROPERTIES']);
    expect([...h.st.selection]).toEqual([a]);
  });

  it('그대로: 마우스·펜은 PICKBOX × 1이고, 손가락 톡 뒤라도 마지막 누르기가 마우스면 × 1', async () => {
    const h = setup();
    const a = h.line(200, 50, 260, 50);
    const s = spy(h);
    // 마우스로 선에서 10px를 두 번(고르지 못해 창 선택이 열리고 빈 창으로 닫힘): 두 번 누르기도 아무것도 잡지 않는다
    twice(h, P(215, 60));
    dblclick(h, P(215, 60));
    await settle();
    expect(s.seen).toEqual([]);
    expect(s.ran).toEqual([]);
    // 펜으로 선에서 4px(PICKBOX 안 — 그립에서 hypot(15, 4) = 15.5 > 6): 고르고 두 번 누르기는 빠른 특성
    twice(h, P(215, 54), { pointerType: 'pen' });
    expect([...h.st.selection]).toEqual([a]);
    dblclick(h, P(215, 54));
    await settle();
    expect(s.seen).toEqual([a]);
    expect(s.ran).toEqual(['QUICKPROPERTIES']);
    // 손가락 톡(선에서 10px — 고름) 뒤 마우스로 같은 자리를 두 번: 마지막 누르기가 마우스라 dblclick은 × 1
    h.click(P(215, 60), touch);
    expect([...h.st.selection]).toEqual([a]);
    twice(h, P(215, 60));
    dblclick(h, P(215, 60));
    await settle();
    expect(s.seen).toEqual([a]);
    expect(s.ran).toEqual(['QUICKPROPERTIES']);
  });

  /**
   * 배치 Layout1: 전체 용지 뷰포트(id 1)와 뷰포트 V(가운데 (230, 50), 100×60 — x 180..280·y 20..80), V 안에 그린 배치 선 p (200, 50)–(260, 50).
   * 고르기는 지금 공간의 것(배치는 p만, 모형은 FakePicker)
   */
  function onLayout() {
    const h = setup();
    const lay = h.doc.layouts.find((l) => l.name === 'Layout1')!;
    const blk = h.doc.blocks.get(PAPER_SPACE)!;
    // 그리기·고르기만 볼 자료라 확정 고리 없이 블록과 색인에 넣는다
    const put = <T extends Entity>(e: T): T => {
      e.owner = lay.blockRecord;
      blk.entities.push(e);
      h.doc.entityIndex.set(e.handle, e);
      return e;
    };
    const vp = (id: number, cx: number, cy: number, w: number, ht: number): ViewportEntity => ({
      ...entityDefaults(),
      type: 'VIEWPORT',
      handle: h.st.session.newHandle(),
      paperSpace: true,
      center: { x: cx, y: cy, z: 0 },
      width: w,
      height: ht,
      status: id === 1 ? 1 : 2,
      id,
      viewCenter: { x: 0, y: 0 },
      snapBase: { x: 0, y: 0 },
      snapSpacing: { x: 10, y: 10 },
      gridSpacing: { x: 10, y: 10 },
      viewDirection: { x: 0, y: 0, z: 1 },
      viewTarget: { x: 0, y: 0, z: 0 },
      lensLength: 50,
      frontClip: 0,
      backClip: 0,
      viewHeight: ht,
      snapAngle: 0,
      twistAngle: 0,
      circleSides: 1000,
      flags: 32864,
      frozenLayers: [],
      renderMode: 0,
      ucsPerViewport: true,
    });
    put(vp(1, 210, 148.5, 420, 297));
    const v = put(vp(2, 230, 50, 100, 60)).handle;
    const p = put<LineEntity>({ ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), paperSpace: true, start: { x: 200, y: 50, z: 0 }, end: { x: 260, y: 50, z: 0 } }).handle;
    const fp = new FakePicker(h.doc);
    const paper = {
      pick: (x: number, y: number, tol: number) => (fp.distance(p, x, y) <= tol ? p : null),
      pickAll: (x: number, y: number, tol: number) => (fp.distance(p, x, y) <= tol ? [p] : []),
      select: () => [],
      geometry: (handle: string) => fp.geometry(handle),
    };
    (h.app as unknown as { picker: () => unknown }).picker = () => (h.st.space === MODEL_SPACE ? fp : paper);
    h.st.space = PAPER_SPACE;
    return { ...h, v, p, s: spy(h) };
  }

  it('배치: 뷰포트 안 배치 선(10px)을 손가락으로 두 번 톡 하면 뷰포트로 들어가지 않고 그 선의 편집(배치 갈래도 톡 고르기 거리)', async () => {
    const h = onLayout();
    twice(h, P(215, 60), touch);
    expect([...h.st.selection]).toEqual([h.p]);
    dblclick(h, P(215, 60));
    await settle();
    // 전에는 PICKBOX × 1로 배치 객체를 찾지 못해 뷰포트 V로 들어갔다(모형 공간)
    expect(h.st.msVp).toBeNull();
    expect(h.s.seen).toEqual([h.p]);
    expect(h.s.ran).toEqual(['QUICKPROPERTIES']);
  });

  it('그대로(배치): 손가락이라도 톡 거리 밖(26px), 마우스(10px), 보기 모드의 손가락(10px — 고칠 편집이 없다)은 뷰포트로 들어간다', async () => {
    const cases: [Pt, Partial<PointerEvent> | undefined, boolean][] = [
      [P(215, 76), touch, false],
      [P(215, 60), undefined, false],
      [P(215, 60), touch, true],
    ];
    for (const [p, o, view] of cases) {
      const h = onLayout();
      if (view) h.app.setViewOnly(true);
      twice(h, p, o);
      dblclick(h, p);
      await settle();
      expect(h.st.msVp).toEqual({ layout: PAPER_SPACE, handle: h.v });
      expect(h.s.seen).toEqual([]);
      expect(h.s.ran).toEqual([]);
    }
  });

  /**
   * 269차: 보기 모드의 배치 두 번 누르기는 뷰포트 드나들기만 한다(README 「뷰포트 안을 두 번 눌러(MSPACE)」 — 보기 모드는 두 번 눌러 고치기만 없다).
   * 전에는 뷰포트 안 배치 객체가 PICKBOX 안이면 그 객체 편집으로 넘기려 들어가지 않았는데, 보기 모드에는 그 편집이 없어 아무것도 하지 않았다.
   * 또 마지막 누르기의 종류는 화면 누르기(pointerdown → onDown — 마우스·펜)에서도 적는다: 끌기로 끝난 누르기에는 onClick이 오지 않는다
   */
  describe('보기 모드 배치 두 번 누르기와 끌기 뒤 두 번 누르기(269차)', () => {
    it('보기 모드: 뷰포트 안 배치 선 가까이(3px — PICKBOX 안)를 손가락·마우스로 두 번 누르면 뷰포트로 들어간다(잠긴 뷰포트도)', async () => {
      const cases: [Partial<PointerEvent> | undefined, boolean][] = [
        [touch, false],
        [undefined, false],
        [touch, true],
      ];
      for (const [o, locked] of cases) {
        const h = onLayout();
        // 잠금(0x4000)은 뷰포트 안 확대·이동만 막는다 — 들어가기는 그대로(viewportAt가 거르지 않음)
        if (locked) (h.doc.entityIndex.get(h.v) as ViewportEntity).flags |= 0x4000;
        h.app.setViewOnly(true);
        twice(h, P(215, 53), o);
        expect([...h.st.selection]).toEqual([h.p]);
        dblclick(h, P(215, 53));
        await settle();
        // 전에는 배치 선을 찾아 들어가지 않고, 보기 모드라 그 선의 편집도 없이 끝났다(msVp null)
        expect(h.st.msVp).toEqual({ layout: PAPER_SPACE, handle: h.v });
        expect(h.s.seen).toEqual([]);
        expect(h.s.ran).toEqual([]);
      }
    });

    it('그대로: 편집 화면은 그 배치 선의 편집, 보기 모드의 뷰포트 밖·꺼진 뷰포트는 아무것도 않고 MSPACE에서 뷰포트 밖은 종이 공간으로', async () => {
      // 편집 화면: 마우스·손가락 모두 PICKBOX 안의 배치 선 → 그 선의 두 번 누르기 편집(뷰포트로 들어가지 않음)
      for (const o of [undefined, touch]) {
        const h = onLayout();
        twice(h, P(215, 53), o);
        dblclick(h, P(215, 53));
        await settle();
        expect(h.st.msVp).toBeNull();
        expect(h.s.seen).toEqual([h.p]);
        expect(h.s.ran).toEqual(['QUICKPROPERTIES']);
      }
      const h = onLayout();
      h.app.setViewOnly(true);
      // 뷰포트 V 밖(x 180..280 밖)의 종이
      dblclick(h, P(300, 100));
      await settle();
      expect(h.st.msVp).toBeNull();
      // MSPACE에서 뷰포트 밖 → 종이 공간
      expect(h.app.enterViewport(h.st, h.doc.entityIndex.get(h.v) as ViewportEntity)).toBe(true);
      dblclick(h, P(300, 100));
      await settle();
      expect(h.st.msVp).toBeNull();
      expect(h.st.space).toBe(PAPER_SPACE);
      // 꺼진 뷰포트(status 0)는 viewportAt가 거른다 — 빈 자리·배치 선 가까이 모두 들어가지 않는다
      (h.doc.entityIndex.get(h.v) as ViewportEntity).status = 0;
      for (const p of [P(215, 75), P(215, 53)]) {
        dblclick(h, p);
        await settle();
        expect(h.st.msVp).toBeNull();
      }
      expect(h.s.seen).toEqual([]);
      expect(h.s.ran).toEqual([]);
    });

    it('손가락 톡 뒤 마우스 누르기 둘이 끌기로 끝나고 오는 dblclick은 PICKBOX × 1(끌기에는 onClick이 오지 않는다)', async () => {
      const h = setup();
      const a = h.line(200, 50, 260, 50);
      const s = spy(h);
      h.click(P(215, 60), touch);
      expect([...h.st.selection]).toEqual([a]);
      // 브라우저는 누른 자리가 가까운 두 누르기를 끌었어도 dblclick으로 묶을 수 있다(누르기 → 끌기 → 떼기를 두 번)
      for (let i = 0; i < 2; i++) {
        h.view.events.down!(P(215, 70), P(215, 70), ev());
        h.view.events.drag!(P(215, 70), P(215, 60), true, ev());
      }
      dblclick(h, P(215, 60));
      await settle();
      // 전에는 앞 손가락 톡의 거리(× 3 = 15 ≥ 10)로 골라 선의 편집을 열었다
      expect(s.seen).toEqual([]);
      expect(s.ran).toEqual([]);
    });
  });
});
