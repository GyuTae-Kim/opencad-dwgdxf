/**
 * 휴대폰 보기 모드(App.viewOnly)와 터치 점 찍기: 진짜 App, 화면·명령행은 가짜(tests/direct/app.test.ts와 같은 틀).
 * 보기 모드는 누른 객체 하나만 고르고, 그립·그립 편집·두 번 눌러 편집·도면 영역 메뉴를 열지 않는다.
 * 손가락으로 찍은 점은 객체 스냅 조준창을 넓히고, 정밀 조준(view.aiming) 중에는 마우스처럼 커서·미리보기를 보인다.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { PointResult } from '../../src/app/app';
import type { OverlayState } from '../../src/app/view';
import * as dom from '../../src/app/ui/dom';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
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
    expect(ov(h).cursor).toEqual(P(99, 2));
    expect(ov(h).snap?.p).toEqual(P(100, 0));
  });
});
