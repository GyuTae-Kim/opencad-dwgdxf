/**
 * 23차: 도면 공간의 다른 치수에 뷰포트 안 모형 객체.
 * 도움말 "To Set Dimension Scale for Creating Dimensions in a Layout"(도면 공간에서 모형 공간 점에 객체 스냅으로 잡거나 객체를 바로 골라
 * 모형 공간 값의 치수를 만든다), DIMLFAC(반지름·지름·좌표를 포함한 모든 선형 치수 거리에 곱하고, 각도 치수에는 효과가 없다).
 * MEASUREGEOM 거리는 21·22차 그대로(도움말에 도면 공간의 투영 이야기가 없다 — 23차에 DIST의 투영을 붙였다가 리뷰 뒤 되돌렸다).
 * - 순수 함수: 뷰포트 안 모형 객체 고르기(단일 뷰포트·도면층·겹친 자리), 원·호·형상의 종이 변환(비틀기)
 * - 진짜 App: DIMRADIUS·DIMDIAMETER·DIMARC(부분 포함)·DIMANGULAR(호·두 선·원·정점)·DIMORDINATE·DIMLINEAR <객체 선택>,
 *   배치 객체가 먼저, 겹친 뷰포트, 모형 공간(그대로 연관), 고를 때 강조, MEASUREGEOM 거리는 그대로(두 점·다중 점)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ArcEntity, CircleEntity, DimensionEntity, Entity, LineEntity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerCommands } from '../../src/app/commands';
import { dimDisplayText } from '../../src/app/inquiry';
import { viewportXf } from '../../src/app/scene';
import { type VpXf, circleToPaper, geometryToPaper, modelToPaperVp, viewportPick } from '../../src/app/vpsnap';
import type { Picker } from '../../src/app/pick';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { createNewDocument } from '../../src/core/newdoc';
import type { LayerState } from '../../src/render/styles';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

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
const circle = (c: Vec3, r: number, o: Partial<CircleEntity> = {}) => ({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: c, radius: r, ...o }) as CircleEntity;
const arc = (c: Vec3, r: number, a0: number, a1: number) => ({ ...entityDefaults(), type: 'ARC', handle: '', center: c, radius: r, startAngle: a0, endAngle: a1 }) as ArcEntity;

function vpAt(id: number, r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity {
  return { ...newViewport(r, { handle: '', id, scale: k, bounds: { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y } }), ...extra };
}

function setup(cmds: 'dim' | 'measure' = 'dim') {
  const h = makeApp();
  if (cmds === 'dim') registerDimCommands(h.app);
  else registerCommands(h.app);
  const model = new FakePicker(h.doc);
  const paper = new FakePicker(h.doc);
  Object.defineProperty(paper, 'ents', { get: () => h.doc.blocks.get(PAPER_SPACE)!.entities.filter((e) => e.type !== 'VIEWPORT' && e.type !== 'DIMENSION') });
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
  addTo(PAPER_SPACE, vpAt(1, [0, 0, 420, 297], 1, P(0, 0), { status: 1 }));
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const move = (p: Pt) => h.view.events.move!(p, p, ev());
  const at = async (p: Pt) => {
    move(p);
    h.view.events.click!(p, p, ev());
    await settle();
  };
  const dims = (space = PAPER_SPACE) => h.doc.blocks.get(space)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
  const shown = () => h.out().filter((t) => t.startsWith('치수 문자 ='));
  h.st.space = PAPER_SPACE;
  return {
    ...h,
    type,
    at,
    move,
    dims,
    shown,
    add: <T extends Entity>(e: T) => addTo(MODEL_SPACE, e),
    addPaper: <T extends Entity>(e: T) => addTo(PAPER_SPACE, e),
    viewport: (r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}) => addTo(PAPER_SPACE, vpAt(2, r, k, c, extra)),
  };
}

// 1:10 뷰포트(종이 50,50–350,250, 가운데 200,150)에 모형 (500,300)이 가운데: 모형 (x, y) → 종이 (200 + (x−500)/10, 150 + (y−300)/10)
const VP: [number, number, number, number] = [50, 50, 350, 250];
const C = P(500, 300);
const paperOf = (m: Pt) => P(200 + (m.x - 500) / 10, 150 + (m.y - 300) / 10);

describe('뷰포트 안 모형 객체 고르기와 종이 변환(순수 함수)', () => {
  const doc = createNewDocument('metric');
  const onLayer = (name: string, e: Entity) => ({ ...e, layer: name });

  function world() {
    const d = createNewDocument('metric');
    const ents: Entity[] = [];
    const add = (e: Entity) => {
      e.handle = `E${ents.length + 1}`;
      ents.push(e);
      d.entityIndex.set(e.handle, e);
      d.blocks.get(MODEL_SPACE)!.entities.push(e);
      return e;
    };
    const pk = new FakePicker(d) as unknown as Picker;
    return { d, add, pk };
  }

  it('단일 뷰포트에 보이는 모형 객체만: 허용 거리는 종이 단위 ÷ 축척, 겹친 자리·도면층 꺼짐·뷰포트 동결은 고르지 않는다', () => {
    const w = world();
    const c = w.add(circle(V(500, 300), 400));
    const off = w.add(onLayer('OFF', line3(V(0, 600), V(1000, 600))));
    const frz = w.add(onLayer('VPF', line3(V(0, -300), V(1000, -300))));
    const A = { ...viewportXf(w.d, vpAt(2, VP, 0.1, C)), frozen: new Set(['VPF']) };
    A.vp.handle = 'A';
    const layers = new Map<string, LayerState>([['OFF', { on: false, frozen: false } as LayerState]]);
    // 원 위(모형 903,300 → 종이 240.3,150): 종이 허용 0.5 = 모형 5
    expect(viewportPick([A], w.pk, layers, P(240.3, 150), 0.5)).toEqual({ handle: c.handle, viewport: { handle: 'A', model: { x: expect.closeTo(903, 9), y: expect.closeTo(300, 9) } } });
    expect(viewportPick([A], w.pk, layers, P(240.3, 150), 0.2)).toBeNull();
    // 꺼진 도면층·그 뷰포트에서 동결한 도면층
    expect(viewportPick([A], w.pk, layers, paperOf(P(500, 600)), 0.5)).toBeNull();
    expect(viewportPick([A], w.pk, layers, paperOf(P(500, -300)), 0.5)).toBeNull();
    void off;
    void frz;
    // 뷰포트 밖
    expect(viewportPick([A], w.pk, layers, P(30, 150), 0.5)).toBeNull();
    // 겹친 뷰포트(같은 자리를 덮는 B)면 어느 뷰포트의 객체인지 알 수 없어 고르지 않는다(DIST의 "단일 뷰포트"와 같다)
    const B = { ...viewportXf(w.d, vpAt(3, [200, 100, 300, 200], 0.1, C)), frozen: new Set<string>() };
    B.vp.handle = 'B';
    expect(viewportPick([A, B], w.pk, layers, P(240.3, 150), 0.5)).toBeNull();
    expect(viewportPick([A, B], w.pk, layers, P(160.3, 150), 0.5)).toEqual({ handle: c.handle, viewport: { handle: 'A', model: expect.anything() } });
  });

  it('원·호의 종이 변환: 중심은 뷰포트 변환, 반지름은 축척배, 각도는 비틀기만큼(반시계 그대로)', () => {
    const vx = viewportXf(doc, vpAt(2, VP, 0.1, C, { twistAngle: 30 * D }));
    const pc = circleToPaper(vx, { c: P(600, 300), r: 200, a0: 0, a1: 90 * D });
    const q = modelToPaperVp(vx, P(600, 300));
    expect(pc.c).toEqual(q);
    expect(pc.r).toBeCloseTo(20, 12);
    expect(pc.a0).toBeCloseTo(-30 * D, 12);
    expect(pc.a1).toBeCloseTo(60 * D, 12);
    // 호의 시작점은 변환한 중심에서 변환한 각도로
    const s = modelToPaperVp(vx, P(800, 300));
    expect(q.x + 20 * Math.cos(pc.a0!)).toBeCloseTo(s.x, 9);
    expect(q.y + 20 * Math.sin(pc.a0!)).toBeCloseTo(s.y, 9);
    // 원(각도 없음)은 각도를 만들지 않는다
    expect(circleToPaper(vx, { c: P(0, 0), r: 1 })).not.toHaveProperty('a0');
  });

  it('형상의 종이 변환(고를 때 강조): 선분·삼각형 점마다', () => {
    const vx: VpXf = { k: 0.1, twist: 0, refX: 500, refY: 300, vp: { handle: 'A', center: V(200, 150), width: 300, height: 200 } };
    expect(geometryToPaper(vx, { segs: [500, 300, 1500, 300] })).toEqual({ segs: [200, 150, 300, 150] });
    expect(geometryToPaper(vx, { segs: [], tris: [500, 300, 600, 300, 500, 400] })).toEqual({ segs: [], tris: [200, 150, 210, 150, 200, 160] });
  });
});

describe('도면 공간 반지름·지름·호 길이 치수(진짜 App)', () => {
  it('DIMRADIUS: 1:10 뷰포트의 모형 원을 고르면 도면 공간 치수, 종이 원(중심·반지름)에, 값은 모형 반지름 400(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    const c = h.add(circle(V(500, 300), 400));
    void h.app.run('DIMRADIUS');
    await settle();
    // 강조: 고를 때 커서 아래 모형 원을 종이 자리에
    h.move(P(240.3, 150.2));
    await new Promise((r) => setTimeout(r, 60));
    const hv = h.view.overlay.hover as { segs: number[] } | null;
    expect(hv?.segs.length).toBeGreaterThan(0);
    expect(Math.max(...hv!.segs.filter((_, i) => i % 2 === 0))).toBeCloseTo(240, 0);
    await h.at(P(240.3, 150.2));
    await h.type('260,170');
    const [d] = h.dims();
    expect(d).toBeDefined();
    expect(d!.paperSpace).toBe(true);
    expect(d!.dimType & 7).toBe(4);
    expect(d!.defPoint.x).toBeCloseTo(200, 9);
    expect(d!.defPoint.y).toBeCloseTo(150, 9);
    expect(d!.measurement).toBeCloseTo(40, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^R400([.,]0+)?$/);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = R400([.,]0+)?$/)]);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(c.handle) as CircleEntity).reactors ?? []).toEqual([]);
    expect(h.dims(MODEL_SPACE)).toEqual([]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('DIMDIAMETER와 지금 DIMLFAC 2: 재지정 −20, 값 지름 1600', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    h.doc.header.set('$DIMLFAC', 2);
    void h.app.run('DIMDIAMETER');
    await settle();
    await h.at(P(159.8, 150.3));
    await h.type('150,180');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(3);
    expect(d!.measurement).toBeCloseTo(80, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-20, 12);
    expect(h.shown()[0]).toMatch(/1600([.,]0+)?$/);
  });

  it('DIMARC: 모형 호(반지름 400, 0~90°) — 종이 호에 두고 값은 모형 호 길이 628.32, 부분(P)은 모형 끝점에 스냅해 그 사이만', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(arc(V(500, 300), 400, 0, 90 * D));
    // 호를 둘로 나누는 모형 선(끝점이 호 위 45°)
    const m45 = P(500 + 400 * Math.cos(45 * D), 300 + 400 * Math.sin(45 * D));
    h.add(line3(V(500, 300), V(m45.x, m45.y)));
    void h.app.run('DIMARC');
    await settle();
    // 호 위 60° 자리(선에서 떨어진 곳)
    const a60 = paperOf(P(500 + 400 * Math.cos(60 * D), 300 + 400 * Math.sin(60 * D)));
    await h.at(P(a60.x + 0.2, a60.y + 0.1));
    expect(h.cmd.prompt).toContain('부분(P)');
    // 부분: 45° 끝점(모형 선의 끝점 스냅)에서 90°까지
    await h.type('P');
    const s45 = paperOf(m45);
    await h.at(P(s45.x + 0.3, s45.y - 0.2));
    const e90 = paperOf(P(500, 700));
    await h.at(P(e90.x + 0.2, e90.y + 0.2));
    await h.type('220,200');
    const [d] = h.dims();
    expect(d!.subtype).toBe('ARC_DIMENSION');
    expect(d!.arc?.partial).toBe(true);
    expect(d!.arc!.center.x).toBeCloseTo(200, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    // 종이 호 길이 40 × π/4, 값은 모형 400 × π/4 = 314.16
    expect(d!.measurement).toBeCloseTo((40 * Math.PI) / 4, 6);
    expect(h.shown()[0]).toMatch(/314[.,]16/);
  });

  it('비틀린 뷰포트(30°)의 모형 원: 중심은 비틀린 종이 자리, 값은 모형 반지름', async () => {
    const h = setup();
    const vp = h.viewport(VP, 0.1, C, { twistAngle: 30 * D });
    h.add(circle(V(600, 300), 200));
    const vx = viewportXf(h.doc, vp);
    const c = modelToPaperVp(vx, P(600, 300));
    const on = modelToPaperVp(vx, P(800, 300));
    void h.app.run('DIMRADIUS');
    await settle();
    await h.at(P(on.x + 0.2, on.y + 0.1));
    await h.type(`${c.x + 30},${c.y}`);
    const [d] = h.dims();
    expect(d!.defPoint.x).toBeCloseTo(c.x, 9);
    expect(d!.defPoint.y).toBeCloseTo(c.y, 9);
    expect(d!.measurement).toBeCloseTo(20, 9);
    expect(h.shown()[0]).toMatch(/^치수 문자 = R200([.,]0+)?$/);
  });

  it('그 자리에 배치 원이 있으면 배치 원이 먼저(이전처럼 재지정 없이 연관)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    const pc = h.addPaper(circle(V(220, 150), 20.3));
    void h.app.run('DIMRADIUS');
    await settle();
    await h.at(P(240.3, 150.2));
    await h.type('260,170');
    const [d] = h.dims();
    expect(d!.defPoint.x).toBeCloseTo(220, 9);
    expect(d!.measurement).toBeCloseTo(20.3, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeDefined();
    expect((h.doc.entityIndex.get(pc.handle) as CircleEntity).reactors?.length).toBeGreaterThan(0);
  });

  it('뷰포트가 겹친 자리에서는 모형 객체를 고르지 않는다(Enter로 끝)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.viewport([200, 100, 300, 200], 0.1, C);
    h.add(circle(V(500, 300), 400));
    void h.app.run('DIMRADIUS');
    await settle();
    await h.at(P(240.3, 150.2));
    expect(h.dims()).toEqual([]);
    expect(h.cmd.prompt).toContain('호 또는 원 선택');
    await h.type('');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('모형 공간 DIMRADIUS는 그대로(재지정 없음, 연관)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    h.st.space = MODEL_SPACE;
    void h.app.run('DIMRADIUS');
    await settle();
    await h.at(P(899.6, 300.4));
    await h.type('1000,500');
    const [d] = h.dims(MODEL_SPACE);
    expect(d!.measurement).toBeCloseTo(400, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeDefined();
  });
});

describe('도면 공간 각도·세로좌표·선형 <객체 선택>(진짜 App)', () => {
  it('DIMANGULAR 호: 각도는 축척과 무관(재지정 없음), 종이 호 중심에', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(arc(V(500, 300), 400, 0, 120 * D));
    void h.app.run('DIMANGULAR');
    await settle();
    const a60 = paperOf(P(500 + 400 * Math.cos(60 * D), 300 + 400 * Math.sin(60 * D)));
    await h.at(P(a60.x + 0.2, a60.y + 0.1));
    await h.type('200,200');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(5);
    expect(d!.measurement).toBeCloseTo(120 * D, 12);
    expect(d!.defPoint4.x).toBeCloseTo(200, 9);
    expect(d!.defPoint4.y).toBeCloseTo(150, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(h.shown()).toEqual(['치수 문자 = 120°']);
    expect(d!.xdict).toBeUndefined();
  });

  it('DIMANGULAR 두 선: 하나는 모형(1:10 뷰포트), 하나는 배치 선 — 보이는 두 선의 각도 30°', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    // 모형 수평선: 종이 (150..250, 150)
    h.add(line3(V(0, 300), V(1000, 300)));
    // 배치 선: 종이 (200,150)에서 30°
    h.addPaper(line3(V(200, 150), V(200 + 80 * Math.cos(30 * D), 150 + 80 * Math.sin(30 * D))));
    void h.app.run('DIMANGULAR');
    await settle();
    await h.at(P(230.2, 150.2));
    expect(h.cmd.prompt).toContain('두 번째 선 선택');
    const q = P(200 + 40 * Math.cos(30 * D), 150 + 40 * Math.sin(30 * D));
    await h.at(P(q.x - 0.1, q.y + 0.1));
    await h.type(`${200 + 60 * Math.cos(15 * D)},${150 + 60 * Math.sin(15 * D)}`);
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(2);
    expect(d!.measurement).toBeCloseTo(30 * D, 9);
    expect(h.shown()).toEqual(['치수 문자 = 30°']);
  });

  it('DIMANGULAR <정점 지정>: 정점·끝점이 뷰포트 안 모형 끝점에 스냅', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(500, 300), V(900, 300)));
    h.add(line3(V(500, 300), V(500, 700)));
    void h.app.run('DIMANGULAR');
    await settle();
    await h.type('');
    const v = paperOf(P(500, 300));
    const a = paperOf(P(900, 300));
    const b = paperOf(P(500, 700));
    await h.at(P(v.x + 0.3, v.y + 0.2));
    await h.at(P(a.x - 0.3, a.y + 0.2));
    await h.at(P(b.x + 0.2, b.y - 0.3));
    await h.type('220,170');
    const [d] = h.dims();
    expect(d!.defPoint4.x).toBeCloseTo(v.x, 9);
    expect(d!.defPoint4.y).toBeCloseTo(v.y, 9);
    expect(d!.measurement).toBeCloseTo(90 * D, 12);
  });

  it('DIMORDINATE: 피쳐가 모형 끝점 스냅이면 도면 공간 치수의 값에 뷰포트 축척(데이텀은 지금 UCS 원점)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(500, 300), V(900, 300)));
    void h.app.run('DIMORDINATE');
    await settle();
    // 모형 (900,300) → 종이 (240,150)
    await h.at(P(240.3, 150.2));
    await h.type('240,190');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(6);
    expect(d!.defPoint2.x).toBeCloseTo(240, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    // X 데이텀: 종이 X 240(도면 공간 UCS 원점에서) × 10
    expect(d!.measurement).toBeCloseTo(240, 9);
    expect(h.shown()[0]).toMatch(/^치수 문자 = 2400([.,]0+)?$/);
  });

  it('DIMORDINATE: 스냅 없이 찍은 피쳐는 이전처럼 도면 공간 값', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('240,150', '240,190');
    const [d] = h.dims();
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(h.shown()[0]).toMatch(/^치수 문자 = 240([.,]0+)?$/);
  });

  it('DIMLINEAR <객체 선택>: 뷰포트 안 모형 선 → 종이 끝점, 값 1000(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    const ln = h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIMLINEAR');
    await settle();
    await h.type('');
    expect(h.cmd.prompt).toContain('치수기입할 객체 선택');
    await h.at(P(200.2, 120.3));
    await h.type('200,100');
    const [d] = h.dims();
    expect(d!.defPoint2.x).toBeCloseTo(150, 9);
    expect(d!.defPoint3.x).toBeCloseTo(250, 9);
    expect(d!.defPoint2.y).toBeCloseTo(120, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 1000([.,]0+)?$/)]);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(ln.handle) as LineEntity).reactors ?? []).toEqual([]);
  });

  it('DIMALIGNED <객체 선택>의 배치 선은 그대로(재지정 없이 연관)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.addPaper(line3(V(100, 260), V(160, 280)));
    void h.app.run('DIMALIGNED');
    await settle();
    await h.type('');
    await h.at(P(130.1, 270.1));
    await h.type('120,285');
    const [d] = h.dims();
    expect(d!.measurement).toBeCloseTo(Math.hypot(60, 20), 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeDefined();
  });
});

describe('도면 공간 MEASUREGEOM 거리(진짜 App) — 21·22차 그대로', () => {
  // 23차에 DIST의 투영을 붙였다가 리뷰 뒤 되돌렸다: 도움말 MEASUREGEOM에는 도면 공간의 투영 이야기가 없고
  // "AREA·DIST·MASSPROP과 같은 계산을 많이 한다"는 한 문장뿐이라 21차 결정(도면 공간 거리)을 뒤집기에 근거가 약하다
  const result = (h: ReturnType<typeof setup>) => h.out().filter((t) => /^(거리|X 증분) =/.test(t));

  it('뷰포트 안 모형 끝점 자리를 눌러도 모형 객체에 스냅하지 않고 도면 공간 거리', async () => {
    const h = setup('measure');
    h.viewport(VP, 0.1, C);
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.at(P(150.5, 120.2));
    await h.at(P(250.5, 120.2));
    expect(result(h)).toEqual(['거리 = 100.0000 mm,  XY 평면에서의 각도 = 0°,  XY 평면으로부터의 각도 = 0°', 'X 증분 = 100.0000,  Y 증분 = 0.0000,  Z 증분 = 0.0000']);
    expect(h.cmd.lines.at(-1)!.measure!.value).toBe('100.0000 mm');
    await h.type('X');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('다중 점(M)도 누른 도면 공간 점 그대로 누적', async () => {
    const h = setup('measure');
    h.viewport(VP, 0.1, C);
    h.add(line3(V(0, 0), V(1000, 0)));
    h.add(line3(V(1000, 0), V(1000, 500)));
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.at(P(150.5, 120.2));
    await h.type('M');
    await h.at(P(250.4, 119.6));
    await h.at(P(250.3, 170.4));
    await h.type('');
    const paper = Math.hypot(250.4 - 150.5, 119.6 - 120.2) + Math.hypot(250.3 - 250.4, 170.4 - 119.6);
    expect(h.out().filter((t) => t.startsWith('거리 =')).at(-1)).toBe(`거리 = ${paper.toFixed(4)} mm`);
    await h.type('X');
  });
});
