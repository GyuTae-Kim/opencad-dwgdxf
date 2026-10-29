/**
 * 21차: 도면 공간 DIST의 투영 거리. 도움말 DIST(도면 공간에서는 대개 2D 도면 공간 거리, 단일 뷰포트에 보이는 모형 공간 객체에 객체 스냅을 쓰면
 * 화면과 나란한 평면에 투영한 2D 모형 공간 거리)와 "To Set Dimension Scale for Creating Dimensions in a Layout"(도면 공간에서 객체 스냅으로
 * 모형 공간 점에 스냅한다).
 * - 순수 함수: 뷰포트 변환(장면과 같은 모형 → 종이), 덮는지(사각형·자르기 경계), 투영 증분(축척·뷰 비틀기), 투영 뷰포트 고르기,
 *   뷰포트 안 모형 스냅(동결·꺼진 도면층, 뷰포트 밖 점), 스냅 목록 합치기
 * - 진짜 App: 두 점 DIST(축척·비틀기·도면 공간 UCS), 한 점만 모형 스냅, 다른 뷰포트, 겹친 뷰포트, 다중 점, 'DIST, MEASUREGEOM(23차부터 같은 투영),
 *   모형 공간(그대로)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { registerDrawCommands } from '../../src/app/draw';
import { viewportXf } from '../../src/app/scene';
import { type SnapPoint, findSnaps, mergeSnaps } from '../../src/app/snap';
import { type VpXf, modelToPaperVp, paperToModelVp, projectedDelta, projectionViewport, viewportCovers, viewportSnaps } from '../../src/app/vpsnap';
import type { Picker } from '../../src/app/pick';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { createNewDocument } from '../../src/core/newdoc';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';
import type { LayerState } from '../../src/render/styles';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

const D = Math.PI / 180;
type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
const line3 = (a: Vec3, b: Vec3, o: Partial<LineEntity> = {}) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b, ...o }) as LineEntity;
/** 화면에 남긴 마지막 표시(DIST가 둘째 점에 거리 글을 단다) */
const lastMark = (h: { view: { overlay: { marks: unknown[] } } }) => h.view.overlay.marks.at(-1) as { p: Pt; text?: string };

/** 뷰포트 변환을 직접(장면 렌더러의 drawViewport 행렬: 화면 y 아래, 모형 (dx, dy) → [k·c, −k·s; −k·s, −k·c], c = cos(−비틀기)) */
function rendererPaper(vx: VpXf, m: Pt): Pt {
  const c = Math.cos(-vx.twist);
  const s = Math.sin(-vx.twist);
  const k = vx.k;
  const sx = k * c * (m.x - vx.refX) + -k * s * (m.y - vx.refY);
  const sy = -k * s * (m.x - vx.refX) + -k * c * (m.y - vx.refY);
  // 화면 y는 아래 → 종이 y는 위
  return { x: vx.vp.center.x + sx, y: vx.vp.center.y - sy };
}

/** 종이 사각형 [x0, y0, x1, y1]에 축척 k(종이/모형)로 모형 범위 중심을 보이는 뷰포트 */
function vpAt(handle: string, id: number, r: [number, number, number, number], k: number, center: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity {
  const v = newViewport(r, { handle, id, scale: k, bounds: { minX: center.x, minY: center.y, maxX: center.x, maxY: center.y } });
  return { ...v, ...extra };
}

describe('뷰포트 변환과 투영 증분(순수 함수)', () => {
  const doc = createNewDocument('metric');

  it('모형 → 종이는 장면이 그리는 변환과 같고, 종이 → 모형은 그 역(축척 1:50, 뷰 비틀기 30°, 뷰 중심이 DCS)', () => {
    const vp = vpAt('A1', 2, [20, 30, 220, 180], 1 / 50, P(0, 0), { twistAngle: 30 * D, viewCenter: { x: 400, y: -250 }, viewTarget: V(1000, 2000, 0) });
    const vx = viewportXf(doc, vp);
    expect(vx.k).toBeCloseTo(1 / 50, 15);
    for (const m of [P(1000, 2000), P(1500, 2300), P(-200, 50)]) {
      const p = modelToPaperVp(vx, m);
      const q = rendererPaper(vx, m);
      expect(p.x).toBeCloseTo(q.x, 10);
      expect(p.y).toBeCloseTo(q.y, 10);
      const back = paperToModelVp(vx, p);
      expect(back.x).toBeCloseTo(m.x, 9);
      expect(back.y).toBeCloseTo(m.y, 9);
    }
    // 뷰 중심(DCS)을 비틀기만큼 돌린 모형 점이 뷰포트 중심에 온다
    const c = Math.cos(30 * D);
    const s = Math.sin(30 * D);
    const ref = modelToPaperVp(vx, P(1000 + c * 400 + s * 250, 2000 + s * 400 - c * 250));
    expect(ref.x).toBeCloseTo(120, 9);
    expect(ref.y).toBeCloseTo(105, 9);
  });

  it('투영 증분: 길이는 모형 평면 거리, 방향은 화면 축(R(−비틀기)), 종이 증분 ÷ 축척과 같다', () => {
    const vp = vpAt('A1', 2, [0, 0, 200, 100], 1 / 50, P(0, 0), { twistAngle: 30 * D });
    const vx = viewportXf(doc, vp);
    const a = P(10, 20);
    const b = P(110, 20);
    const d = projectedDelta(vx, a, b);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(100, 12);
    expect(d.x).toBeCloseTo(100 * Math.cos(-30 * D), 12);
    expect(d.y).toBeCloseTo(100 * Math.sin(-30 * D), 12);
    const pa = modelToPaperVp(vx, a);
    const pb = modelToPaperVp(vx, b);
    expect((pb.x - pa.x) / vx.k).toBeCloseTo(d.x, 9);
    expect((pb.y - pa.y) / vx.k).toBeCloseTo(d.y, 9);
    // 비틀기 없으면 모형 증분 그대로
    expect(projectedDelta({ twist: 0 }, a, b)).toEqual({ x: 100, y: 0 });
  });

  it('뷰포트가 덮는 점: 사각형 안, 자르기 경계가 있으면 그 안도', () => {
    const vx: VpXf = { k: 1, twist: 0, refX: 0, refY: 0, vp: { handle: 'A', center: V(50, 50), width: 100, height: 60 } };
    expect(viewportCovers(vx, P(10, 30))).toBe(true);
    expect(viewportCovers(vx, P(10, 15))).toBe(false);
    expect(viewportCovers(vx, P(105, 50))).toBe(false);
    // 삼각형 자르기 경계: 사각형 안이어도 경계 밖은 덮지 않는다
    const clipped: VpXf = { ...vx, clip: [0, 20, 100, 20, 50, 80] };
    expect(viewportCovers(clipped, P(50, 40))).toBe(true);
    expect(viewportCovers(clipped, P(5, 75))).toBe(false);
  });

  it('투영 뷰포트: 점이 모두 같은 뷰포트의 모형 스냅이고 그 점을 덮는 뷰포트가 하나뿐일 때만', () => {
    const A: VpXf = { k: 0.1, twist: 0, refX: 0, refY: 0, vp: { handle: 'A', center: V(50, 50), width: 100, height: 100 } };
    const B: VpXf = { k: 0.2, twist: 0, refX: 0, refY: 0, vp: { handle: 'B', center: V(200, 50), width: 100, height: 100 } };
    // B와 겹치는 C(B의 오른쪽 위 구석)
    const C: VpXf = { k: 0.2, twist: 0, refX: 0, refY: 0, vp: { handle: 'C', center: V(260, 90), width: 60, height: 60 } };
    const vxs = [A, B, C];
    const sA = (x: number, y: number) => ({ p: P(x, y), viewport: { handle: 'A', model: P(x * 10, y * 10) } });
    const sB = (x: number, y: number) => ({ p: P(x, y), viewport: { handle: 'B', model: P(x * 5, y * 5) } });
    expect(projectionViewport(vxs, [sA(10, 10), sA(80, 30)])).toBe(A);
    // 한 점만 모형 스냅
    expect(projectionViewport(vxs, [sA(10, 10), { p: P(80, 30) }])).toBeNull();
    expect(projectionViewport(vxs, [{ p: P(10, 10), viewport: null }, sA(80, 30)])).toBeNull();
    // 두 점의 뷰포트가 다르다
    expect(projectionViewport(vxs, [sA(10, 10), sB(180, 30)])).toBeNull();
    // 둘째 점을 덮는 뷰포트가 둘(B·C가 겹친 곳)
    expect(projectionViewport(vxs, [sB(170, 20), sB(240, 80)])).toBeNull();
    expect(projectionViewport(vxs, [sB(170, 20), sB(190, 60)])).toBe(B);
    // 없는 뷰포트(꺼졌거나 지운 것)
    expect(projectionViewport([B, C], [sA(10, 10), sA(80, 30)])).toBeNull();
    expect(projectionViewport(vxs, [])).toBeNull();
  });
});

describe('뷰포트 안 모형 객체 스냅(viewportSnaps)과 합치기', () => {
  function world() {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const add = (e: Entity) => {
      e.handle = `L${ms.entities.length + 1}`;
      e.owner = ms.recordHandle;
      ms.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      return e;
    };
    // 1:10 뷰포트: 종이 (50,50)-(350,250), 모형 (500,300)이 가운데
    const vp = vpAt('V1', 2, [50, 50, 350, 250], 0.1, P(500, 300));
    const vx = viewportXf(doc, vp);
    const pk = new FakePicker(doc) as unknown as Picker;
    return { doc, add, vx, pk };
  }
  const modes = new Set(['end', 'mid'] as const);
  const layers = new Map<string, LayerState>();

  it('커서를 모형으로 옮겨 잡고 종이 좌표로 돌려준다(모형 좌표와 뷰포트를 싣는다, Z는 없다)', () => {
    const { doc, add, vx, pk } = world();
    add(line3(V(0, 0, 7), V(1000, 0, 7)));
    const scores = new Map<SnapPoint, number>();
    const got = viewportSnaps(doc, [vx], pk, layers, P(150.4, 120.3), 10, modes, null, scores);
    expect(got[0]).toMatchObject({ kind: 'end', viewport: { handle: 'V1', model: { x: 0, y: 0 } } });
    expect(got[0]!.x).toBeCloseTo(150, 12);
    expect(got[0]!.y).toBeCloseTo(120, 12);
    expect(got[0]!.z).toBeUndefined();
    // 점수는 모형에서 잰 것(조준창으로 나눈 거리 — 종이에서 재도 같다)
    expect(scores.get(got[0]!)).toBeCloseTo(Math.hypot(0.4, 0.3) / 10, 9);
  });

  it('뷰포트 밖의 점, 그 뷰포트에서 동결한 도면층, 꺼진 도면층의 객체는 잡지 않는다', () => {
    const { doc, add, vx, pk } = world();
    // 끝점 (−30, 300)은 종이 (47, 150) — 뷰포트(x 50~350) 밖. 커서 (52.2, 150.3)은 모형 (22, 303)이라 모형 조준창(100) 안이다
    add(line3(V(-30, 300), V(400, 300)));
    let got = viewportSnaps(doc, [vx], pk, layers, P(52.2, 150.3), 10, modes, null, new Map());
    expect(got).toEqual([]);
    // 끝점 (1500, 600)은 종이 (300, 180), (1500, 800)은 (300, 200)
    add(line3(V(1500, 600), V(2500, 600), { layer: 'VPF' }));
    add(line3(V(1500, 800), V(2500, 800), { layer: 'OFF' }));
    const frozen = { ...vx, frozen: new Set(['VPF']) };
    const ls = new Map<string, LayerState>([['OFF', { name: 'OFF', rgb: 0, aci: 7, hasRgb: false, on: false, frozen: false, lineweight: -3, transparency: 255, plot: true }]]);
    got = viewportSnaps(doc, [frozen], pk, ls, P(300.3, 180.2), 10, modes, null, new Map());
    expect(got).toEqual([]);
    got = viewportSnaps(doc, [frozen], pk, ls, P(300.3, 200.2), 10, modes, null, new Map());
    expect(got).toEqual([]);
    // 그 도면층을 동결하지 않은 뷰포트·켠 도면층이면 잡는다
    got = viewportSnaps(doc, [vx], pk, layers, P(300.3, 180.2), 10, modes, null, new Map());
    expect(got[0]).toMatchObject({ kind: 'end', viewport: { model: { x: 1500, y: 600 } } });
    got = viewportSnaps(doc, [vx], pk, layers, P(300.3, 200.2), 10, modes, null, new Map());
    expect(got[0]).toMatchObject({ kind: 'end', viewport: { model: { x: 1500, y: 800 } } });
  });

  it('커서를 덮지 않는 뷰포트는 보지 않는다', () => {
    const { doc, add, vx, pk } = world();
    add(line3(V(0, 0), V(1000, 0)));
    expect(viewportSnaps(doc, [vx], pk, layers, P(40, 120), 10, modes, null, new Map())).toEqual([]);
  });

  it('합치기: 두 목록을 점수 차례로, 같은 자리는 하나만(b가 비면 a 그대로)', () => {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const e = line3(V(0, 0), V(10, 0));
    e.handle = 'L1';
    ms.entities.push(e);
    doc.entityIndex.set('L1', e);
    const scores = new Map<SnapPoint, number>();
    const a = findSnaps(doc, new FakePicker(doc) as unknown as Picker, P(9, 0.5), 3, modes, null, undefined, scores);
    expect(a.map((s) => s.kind)).toEqual(['end']);
    expect(scores.get(a[0]!)).toBeCloseTo(Math.hypot(1, 0.5) / 3, 12);
    const near: SnapPoint = { x: 9.2, y: 0.4, kind: 'end' };
    const same: SnapPoint = { x: 10, y: 0, kind: 'end' };
    scores.set(near, 0.01);
    scores.set(same, 0.001);
    expect(mergeSnaps(a, [], scores, 3)).toEqual(a);
    const m = mergeSnaps(a, [near, same], scores, 3);
    expect(m).toEqual([same, near]);
  });
});

// ---------------------------------------------------------------------------
// 진짜 App(배치의 도면 공간)
// ---------------------------------------------------------------------------

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const model = new FakePicker(h.doc);
  // 도면 공간 객체만 보는 고르기
  const paper = new FakePicker(h.doc);
  Object.defineProperty(paper, 'ents', { get: () => h.doc.blocks.get(PAPER_SPACE)!.entities.filter((e) => e.type !== 'VIEWPORT') });
  (h.app as unknown as { picker: () => unknown }).picker = () => (h.st.space === MODEL_SPACE ? model : paper);
  (h.app as unknown as { pickerFor: (st: unknown, sp: string) => unknown }).pickerFor = (_st, sp) => (sp === MODEL_SPACE ? model : paper);
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = true;
  h.app.snapModes.clear();
  h.app.snapModes.add('end');
  const cl = h.cmd as unknown as DirectCommandLine;
  const addTo = <T extends Entity>(block: string, e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(block)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block, entity: e }] });
    return e;
  };
  // 배치 전체(용지) 뷰포트 id 1
  addTo(PAPER_SPACE, vpAt('', 1, [0, 0, 420, 297], 1, P(0, 0), { status: 1 }));
  const viewport = (r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}) => addTo(PAPER_SPACE, vpAt('', 2, r, k, c, extra));
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const at = async (p: Pt) => {
    h.view.events.move!(p, p, ev());
    h.view.events.click!(p, p, ev());
    await settle();
  };
  const result = () => h.out().filter((t) => /^(거리|X 증분) =/.test(t));
  h.st.space = PAPER_SPACE;
  return { ...h, cl, add: <T extends Entity>(e: T) => addTo(MODEL_SPACE, e), addPaper: <T extends Entity>(e: T) => addTo(PAPER_SPACE, e), viewport, type, at, result };
}

describe('도면 공간 DIST의 투영 거리(진짜 App)', () => {
  it('단일 뷰포트(1:10)의 모형 선 두 끝점: 모형 공간 거리·증분(Z 없이)', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0, 5), V(1000, 0, 9)));
    void h.app.run('DIST');
    await settle();
    // 모형 (0,0)은 종이 (150,120), (1000,0)은 (250,120)
    await h.at(P(150.4, 120.3));
    await h.at(P(249.7, 119.6));
    expect(h.result()).toEqual(['거리 = 1000.0000 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 1000.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000']);
    // 휴대폰 결과 카드도 모형 거리, 표시는 종이의 두 점
    expect(h.cmd.lines.at(-1)!.measure!.value).toBe('1000.0000 mm');
    expect(lastMark(h).text).toBe('1000.0000 mm');
    expect(lastMark(h).p.x).toBeCloseTo(250, 9);
  });

  it('뷰 비틀기 30°·도면 공간 UCS 90°: 거리는 같고 증분·각도는 화면(도면 공간 UCS) 방향', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300), { twistAngle: 30 * D });
    h.add(line3(V(500, 300), V(800, 300)));
    const vp = h.doc.blocks.get(PAPER_SPACE)!.entities.at(-1) as ViewportEntity;
    const vx = viewportXf(h.doc, vp);
    const a = modelToPaperVp(vx, P(500, 300));
    const b = modelToPaperVp(vx, P(800, 300));
    void h.app.run('DIST');
    await settle();
    await h.at(P(a.x + 0.3, a.y + 0.2));
    await h.at(P(b.x - 0.3, b.y + 0.2));
    // 화면에서는 −30° 방향(뷰 비틀기만큼 돌아 보인다)
    expect(h.result()).toEqual(['거리 = 300.0000 mm,  XY 평면에서의 각도 = 330°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 259.8076,  Y 증분 = -150.0000,  Z 증분 = 0.0000']);
    // 도면 공간 UCS를 90° 돌리면 증분이 그 축으로(거리는 그대로)
    h.doc.header.set('$PUCSXDIR', V(0, 1, 0));
    h.doc.header.set('$PUCSYDIR', V(-1, 0, 0));
    void h.app.run('DIST');
    await settle();
    await h.at(P(a.x + 0.3, a.y + 0.2));
    await h.at(P(b.x - 0.3, b.y + 0.2));
    expect(h.result().slice(-2)).toEqual(['거리 = 300.0000 mm,  XY 평면에서의 각도 = 240°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = -150.0000,  Y 증분 = -259.8076,  Z 증분 = 0.0000']);
  });

  it('한 점만 모형 스냅이면 도면 공간 2D 거리(도면 공간 단위)', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIST');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.type('150,160');
    expect(h.result()).toEqual(['거리 = 40.0000 mm,  XY 평면에서의 각도 = 90°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 0.0000,  Y 증분 = 40.0000,  Z 증분 = 0.0000']);
  });

  it('두 점이 다른 뷰포트이거나 그 점을 덮는 뷰포트가 둘이면 도면 공간 2D 거리', async () => {
    const h = setup();
    // 같은 모형을 떨어진 두 뷰포트(1:10, 1:20)로: 모형 (0,0)은 첫째의 종이 (150,120), (1000,0)은 둘째의 종이 (415,155)
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.viewport([360, 50, 420, 290], 0.05, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIST');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.at(P(414.8, 155.2));
    expect(h.result()[0]).toMatch(new RegExp(`^거리 = ${Math.hypot(265, 35).toFixed(4)} mm,`));
    expect(h.result()[1]).toBe('X 증분 = 265.0000,  Y 증분 = 35.0000,  Z 증분 = 0.0000');
    // 겹친 뷰포트: 첫째 뷰포트 안에 같은 축척의 작은 뷰포트를 겹쳐 두면 그 안의 점은 단일 뷰포트가 아니다
    const h2 = setup();
    h2.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h2.viewport([200, 100, 300, 140], 0.1, P(500, 300));
    h2.add(line3(V(0, 0), V(1000, 0)));
    void h2.app.run('DIST');
    await settle();
    await h2.at(P(150.4, 120.3));
    await h2.at(P(249.7, 119.6));
    expect(h2.result()).toEqual(['거리 = 100.0000 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 100.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000']);
  });

  it('다중 점: 모든 점이 같은 뷰포트의 모형 스냅이면 누적 거리도 모형 단위, 길이를 쳐서 만든 구간이 있으면 도면 공간', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    h.add(line3(V(1000, 0), V(1000, 500)));
    const totals = () => h.out().filter((t) => /^거리 = [^,]*$/.test(t));
    void h.app.run('DIST');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.type('M');
    await h.at(P(249.7, 119.6));
    // 툴팁: 누적 거리 + 고무줄 구간(모형 단위 — 종이 길이 ÷ 축척)
    h.view.events.move!(P(250.3, 140), P(250.3, 140), ev());
    expect(h.view.overlay.tip).toBe(`거리 = ${(1000 + Math.hypot(0.3, 20) / 0.1).toFixed(4)} mm`);
    await h.at(P(249.6, 169.7));
    await h.type('');
    expect(totals()).toEqual(['거리 = 1000.0000 mm', '거리 = 1500.0000 mm']);
    expect(h.cmd.lines.at(-1)!.measure!.value).toBe('1500.0000 mm');
    expect(lastMark(h).text).toBe('1500.0000 mm');
    // 길이(L)로 친 구간이 끼면 전체가 도면 공간 거리
    void h.app.run('DIST');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.type('M');
    await h.at(P(249.7, 119.6));
    await h.type('L', '30', '');
    expect(totals().slice(-2)).toEqual(['거리 = 1000.0000 mm', '거리 = 130.0000 mm']);
  });

  it("'DIST(도면 공간의 LINE 안)도 같은 규칙, LINE은 뷰포트 안 모형 객체에 스냅하지 않는다", async () => {
    const h = setup();
    registerDrawCommands(h.app);
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('LINE');
    await settle();
    await h.type('10,10', "'DIST");
    await h.at(P(150.4, 120.3));
    await h.at(P(249.7, 119.6));
    expect(h.result()).toEqual(['거리 = 1000.0000 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 1000.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000']);
    expect(h.app.busyCommand).toBe('LINE');
    // LINE의 점은 커서 자리 그대로(전과 같다)
    await h.at(P(150.4, 120.3));
    await h.type('');
    const lines = h.doc.blocks.get(PAPER_SPACE)!.entities.filter((e) => e.type === 'LINE') as LineEntity[];
    expect(lines.map((l) => [l.start.x, l.start.y, l.end.x, l.end.y])).toEqual([[10, 10, 150.4, 120.3]]);
  });

  it('MEASUREGEOM 거리도 같은 투영(23차 — 도움말 MEASUREGEOM: AREA·DIST·MASSPROP과 같은 계산을 많이 한다. 21·22차에는 도면 공간 거리 100이었다)', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.at(P(150.5, 120.2));
    await h.at(P(250.5, 120.2));
    expect(h.result()).toEqual(['거리 = 1000.0000 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 1000.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000']);
    await h.type('X');
  });

  it('모형 공간은 그대로 3D 거리', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0, 5), V(1000, 0, 9)));
    h.st.space = MODEL_SPACE;
    void h.app.run('DIST');
    await settle();
    await h.at(P(0.4, 0.3));
    await h.at(P(999.7, 0.4));
    expect(h.result()[1]).toBe('X 증분 = 1000.0000,  Y 증분 = 0.0000,  Z 증분 = 4.0000');
  });
});
