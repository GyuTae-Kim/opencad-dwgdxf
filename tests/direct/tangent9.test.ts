/**
 * 9차 그리기 붙잡기(진짜 App):
 * - 접점 스냅이 폴리선 호 구간에도 잡힌다(기준점에서 그은 접점, 지연된 접점). 원을 그리는 요청은 선에도 지연된 접점
 * - CIRCLE Ttr: 객체 스냅이 꺼져 있어도 접점(지연된 접점)만 켠 점 요청, 잡히지 않은 곳이면 다시 묻는다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { OverlayState } from '../../src/app/view';
import type { Picker } from '../../src/app/pick';
import { arcPieceCircle, findSnaps, tanPieceAt } from '../../src/app/snap';
import { registerDrawCommands } from '../../src/app/draw';
import { lw, newDoc } from '../edit/make';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { type DirectCommandLine, FakePicker } from './fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const near = (a: Pt, b: Pt, eps = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) < eps;

/** 아래로 볼록한 반원(중심 (5,0), 반지름 5)이 가운데 있는 폴리선: (−10,0) → (0,0) ⌒ (10,0) → (10,−10) */
const archPoly = () => lw([[-10, 0], [0, 0, 1], [10, 0], [10, -10]]);

describe('접점 대상(폴리선 호 구간·선)', () => {
  const setupDoc = () => {
    const doc = newDoc();
    const add = (e: Entity) => {
      doc.blocks.get(MODEL_SPACE)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      return e;
    };
    // 상자로 고르는 가짜 고르기는 폴리선 호의 볼록한 부분을 빼먹으므로 모든 객체를 후보로
    const pk = { candidates: () => [...doc.entityIndex.keys()].map((handle) => ({ handle })), entity: (h: string) => doc.entityIndex.get(h), distance: () => 0, segmentsNear: () => [] } as unknown as Picker;
    return { doc, add, pk };
  };

  it('기준점에서 폴리선 호 구간에 그은 접점(호 범위 안만)', () => {
    const { doc, add, pk } = setupDoc();
    const pl = add(archPoly());
    const list = findSnaps(doc, pk, P(5.2, -5.3), 1, new Set(['tan'] as const), P(20, -5));
    expect(list[0]).toMatchObject({ kind: 'tan', handle: pl.handle });
    expect(near(list[0]!, P(5, -5))).toBe(true);
    expect(list[0]!.deferred).toBeUndefined();
    // 위쪽 접점(53°)은 호(아래 반원) 밖이라 없다
    expect(findSnaps(doc, pk, P(8, 4), 1, new Set(['tan'] as const), P(20, -5))).toEqual([]);
  });

  it('지연된 접점: 폴리선 호 위 가장 가까운 점, 직선 구간은 원 그리기(deferTanLines)에서만', () => {
    const { doc, add, pk } = setupDoc();
    const pl = add(archPoly());
    const s = findSnaps(doc, pk, P(5.3, -5.2), 1, new Set(['tan'] as const), null, { deferTan: true })[0]!;
    expect(s).toMatchObject({ kind: 'tan', handle: pl.handle, deferred: true });
    expect(Math.hypot(s.x - 5, s.y)).toBeCloseTo(5, 9);
    expect(findSnaps(doc, pk, P(-5, 0.3), 1, new Set(['tan'] as const), null, { deferTan: true })).toEqual([]);
    const l = findSnaps(doc, pk, P(-5, 0.3), 1, new Set(['tan'] as const), null, { deferTan: true, deferTanLines: true })[0]!;
    expect(l).toMatchObject({ kind: 'tan', deferred: true });
    expect(near(l, P(-5, 0))).toBe(true);
  });

  it('tanPieceAt: 찍은 자리의 조각, 시계 방향 호도 반시계 원·호로', () => {
    const pl = { ...archPoly(), handle: 'A' } as Entity;
    const arc = tanPieceAt(pl, P(5, -5))!;
    expect(arc.k).toBe('arc');
    const c = arcPieceCircle(arc as Parameters<typeof arcPieceCircle>[0]);
    expect(c.cx).toBeCloseTo(5, 9);
    expect(c.cy).toBeCloseTo(0, 9);
    expect(c.r).toBeCloseTo(5, 9);
    expect(c.sweep).toBeCloseTo(Math.PI, 9);
    // 시계 방향(볼록 −1)의 위쪽 반원
    const cw = lw([[0, 0, -1], [10, 0]]);
    const cc = arcPieceCircle(tanPieceAt(cw, P(5, 5)) as Parameters<typeof arcPieceCircle>[0]);
    expect(Math.sin(cc.a0 + cc.sweep / 2)).toBeCloseTo(1, 9);
    // 선 조각은 원 그리기(lines)에서만: 아니면 그 객체의 호 구간
    expect(tanPieceAt(pl, P(-5, 0))!.k).toBe('arc');
    expect(tanPieceAt(pl, P(-5, 0), true)!.k).toBe('line');
    expect(tanPieceAt(ln(0, 0, 10, 0), P(5, 0))).toBeNull();
    expect(tanPieceAt(ln(0, 0, 10, 0), P(5, 0), true)!.k).toBe('line');
  });
});

// ---------------------------------------------------------------------------
// 앱
// ---------------------------------------------------------------------------

type H = RealApp & { cl: DirectCommandLine; move(p: Pt): void; click(p: Pt): void; add(e: Entity): Entity };
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
const ov = (h: RealApp) => h.view.overlay as unknown as OverlayState;

function setup(): H {
  const h = makeApp();
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const add = (e: Entity) => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e;
  };
  (h.app as unknown as { settings: { aperture: number } }).settings.aperture = 1;
  return {
    ...h,
    cl: h.cmd as unknown as DirectCommandLine,
    add,
    move: (p) => h.view.events.move!(p, p, ev()),
    click: (p) => h.view.events.click!(p, p, ev()),
  };
}

const ln = (x0: number, y0: number, x1: number, y1: number) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: x0, y: y0, z: 0 }, end: { x: x1, y: y1, z: 0 } }) as LineEntity;

describe('CIRCLE Ttr: 접점만 켠 점 요청', () => {
  it('객체 스냅이 꺼져 있어도 선 위에 지연된 접점, 빈 곳이면 다시 묻는다', async () => {
    const h = setup();
    h.add(ln(0, 0, 10, 0));
    h.add(ln(0, 0, 0, 10));
    h.app.osnapOn = false;
    void h.app.run('CIRCLE');
    await settle();
    h.cl.type('T');
    await settle();
    h.move(P(5, 0.3));
    expect(ov(h).snap).toMatchObject({ kind: 'tan', deferred: true });
    expect(near(ov(h).snap!.p, P(5, 0))).toBe(true);
    expect(ov(h).tip).toBe('지연된 접점');
    // 빈 곳
    h.move(P(30, 30));
    h.click(P(30, 30));
    await settle();
    expect(h.out()).toContain('객체 스냅 점을 찾지 못했습니다. 다시 지정하십시오.');
    h.move(P(5, 0.3));
    h.click(P(5, 0.3));
    await settle();
    h.move(P(0.3, 5));
    h.click(P(0.3, 5));
    await settle();
    h.cl.type('2');
    await settle();
    const c = [...h.doc.entityIndex.values()].find((e): e is CircleEntity => e.type === 'CIRCLE')!;
    expect(c.center.x).toBeCloseTo(2, 9);
    expect(c.center.y).toBeCloseTo(2, 9);
    expect(c.radius).toBeCloseTo(2, 9);
    // 다음 명령의 점 요청은 객체 스냅 설정 그대로(꺼짐)
    void h.app.run('LINE');
    await settle();
    h.move(P(5, 0.3));
    expect(ov(h).snap).toBeNull();
    h.app.cancel();
    await settle();
  });
});
