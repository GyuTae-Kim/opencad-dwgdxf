/**
 * 24차: 남은 치수 명령의 뷰포트 안 모형 객체.
 * 도움말 "To Set Dimension Scale for Creating Dimensions in a Layout"(도면 공간에서 모형 공간 점에 객체 스냅으로 잡거나 객체를 바로 골라
 * 모형 공간 값의 치수를 만든다), DIMLFAC(반지름·지름·좌표를 포함한 모든 선형 치수 거리에 곱하고, 각도 치수에는 효과가 없다),
 * DIMCONTINUE·DIMCONTINUEMODE(연속·기준선 치수는 앞 치수의 치수 스타일·도면층을 잇는다 — 뷰포트 축척 재지정은 말하지 않는다).
 * - 진짜 App: 스마트 치수 DIM(마우스 아래 모형 원·선, 두 점, 두 선 각도, 반지름·호 길이·꺾기, 세로좌표, 각도(A), 계속(C)),
 *   DIMJOGGED, DIMCONTINUE·DIMBASELINE(두 번째 원점 스냅 — 값은 이전과 같다), 배치 객체가 먼저, 모형 공간은 그대로
 * - DIMJOGGED의 "치수 문자 =" 안내도 놓일 공간의 DIMLFAC 규칙(도면 공간이면 음수 DIMLFAC의 크기)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ArcEntity, CircleEntity, DimensionEntity, Entity, LineEntity, MTextEntity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimSmartCommand, targetToPaper } from '../../src/app/dimsmart';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { dimDisplayText } from '../../src/app/inquiry';
import { viewportXf } from '../../src/app/scene';
import { modelToPaperVp } from '../../src/app/vpsnap';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { createNewDocument } from '../../src/core/newdoc';
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
const line3 = (a: Vec3, b: Vec3) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b }) as LineEntity;
const circle = (c: Vec3, r: number) => ({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: c, radius: r }) as CircleEntity;
const arc = (c: Vec3, r: number, a0: number, a1: number) => ({ ...entityDefaults(), type: 'ARC', handle: '', center: c, radius: r, startAngle: a0, endAngle: a1 }) as ArcEntity;

function vpAt(id: number, r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity {
  return { ...newViewport(r, { handle: '', id, scale: k, bounds: { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y } }), ...extra };
}

function setup() {
  const h = makeApp();
  registerDimCommands(h.app);
  registerDimSmartCommand(h.app);
  registerAnnot2Commands(h.app);
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
/** 지금 치수 스타일(새 미터 도면은 ISO-25) */
const curStyle = (h: ReturnType<typeof setup>) => h.doc.dimStyles.get(tableKey(String(h.doc.header.get('$DIMSTYLE'))))!;
/** 치수 블록에 그린 문자(MTEXT) */
const drawn = (h: ReturnType<typeof setup>, d: DimensionEntity) =>
  (h.doc.blocks.get(d.block.toUpperCase())!.entities.find((e): e is MTextEntity => e.type === 'MTEXT')?.text ?? '').replace(/^\\A1;/, '');

describe('치수 대상의 종이 변환(순수 함수)', () => {
  it('선은 두 끝, 원은 중심·반지름, 호는 각도까지 비틀린 뷰포트로', () => {
    const doc = createNewDocument('metric');
    const vx = viewportXf(doc, vpAt(2, VP, 0.1, C, { twistAngle: 30 * D }));
    const l = targetToPaper(vx, { kind: 'line', a: P(500, 300), b: P(900, 300), segment: 2 });
    expect(l).toEqual({ kind: 'line', a: modelToPaperVp(vx, P(500, 300)), b: modelToPaperVp(vx, P(900, 300)), segment: 2 });
    const c = targetToPaper(vx, { kind: 'circle', c: P(600, 300), r: 200 });
    expect(c).toEqual({ kind: 'circle', c: modelToPaperVp(vx, P(600, 300)), r: expect.closeTo(20, 12) });
    const a = targetToPaper(vx, { kind: 'arc', c: P(600, 300), r: 200, a0: 0, a1: 90 * D });
    expect(a.kind === 'arc' && a.a0).toBeCloseTo(-30 * D, 12);
    expect(a.kind === 'arc' && a.a1).toBeCloseTo(60 * D, 12);
  });
});

describe('스마트 치수 DIM의 뷰포트 안 모형 객체(진짜 App)', () => {
  it('모형 원 위를 누르면 지름: 마우스 아래 강조는 종이 자리, 값은 모형 지름 800(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    const c = h.add(circle(V(500, 300), 400));
    void h.app.run('DIM');
    await settle();
    h.move(P(240.3, 150.2));
    // 미리 보기: 모형 원을 종이 자리(가장 오른쪽 X 240)에 강조하고 지름 치수를 그린다
    const g = h.view.overlay.ghost;
    expect(g.length).toBeGreaterThan(1);
    expect(Math.max(...g[0]!.segs.filter((_, i) => i % 2 === 0))).toBeCloseTo(240, 0);
    await h.at(P(240.3, 150.2));
    expect(h.cmd.prompt).toContain('지름 치수 위치 지정');
    await h.type('260,170');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(3);
    expect(d!.paperSpace).toBe(true);
    expect(d!.measurement).toBeCloseTo(80, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown()).toEqual([expect.stringMatching(/800([.,]0+)?$/)]);
    expect(drawn(h, d!)).toMatch(/800([.,]0+)?$/);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(c.handle) as CircleEntity).reactors ?? []).toEqual([]);
    await h.type('');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('모형 선을 고르면 선형: 종이 끝점, 값 1000(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    const ln = h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIM');
    await settle();
    await h.at(P(200.2, 120.3));
    expect(h.cmd.prompt).toContain('각도에 대한 두 번째 선 지정');
    await h.type('200,100');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(0);
    expect(d!.defPoint2.x).toBeCloseTo(150, 9);
    expect(d!.defPoint3.x).toBeCloseTo(250, 9);
    expect(d!.defPoint2.y).toBeCloseTo(120, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 1000([.,]0+)?$/)]);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^1000([.,]0+)?$/);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(ln.handle) as LineEntity).reactors ?? []).toEqual([]);
    await h.type('');
  });

  it('모형 선을 고른 뒤 배치 선을 누르면 두 선의 각도 30°(재지정 없음)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    // 모형 수평선: 종이 (150..250, 150), 배치 선: 종이 (200,150)에서 30°
    h.add(line3(V(0, 300), V(1000, 300)));
    h.addPaper(line3(V(200, 150), V(200 + 80 * Math.cos(30 * D), 150 + 80 * Math.sin(30 * D))));
    void h.app.run('DIM');
    await settle();
    await h.at(P(230.2, 150.2));
    const q = P(200 + 40 * Math.cos(30 * D), 150 + 40 * Math.sin(30 * D));
    await h.at(P(q.x - 0.1, q.y + 0.1));
    expect(h.cmd.prompt).toContain('각도 치수 위치 지정');
    await h.type(`${200 + 60 * Math.cos(15 * D)},${150 + 60 * Math.sin(15 * D)}`);
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(2);
    expect(d!.measurement).toBeCloseTo(30 * D, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(h.shown()).toEqual(['치수 문자 = 30°']);
    await h.type('');
  });

  it('두 점: 둘 다 같은 뷰포트의 모형 끝점 스냅이면 모형 값, 한 점만이면 이전처럼 도면 공간 값', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIM');
    await settle();
    // 첫 프롬프트에서 끝점 스냅 표지가 보이는 자리를 누르면 객체가 아니라 첫 번째 원점(모형 끝점 (0,0) → 종이 (150,120))
    await h.at(P(150.4, 120.3));
    expect(h.cmd.prompt).toContain('두 번째 치수보조선 원점');
    await h.at(P(249.7, 120.2));
    await h.type('200,100');
    const [d1] = h.dims();
    expect(d1!.defPoint2.x).toBeCloseTo(150, 9);
    expect(d1!.defPoint3.x).toBeCloseTo(250, 9);
    expect(d1!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown().at(-1)).toMatch(/^치수 문자 = 1000([.,]0+)?$/);
    // 한 점만 모형 스냅
    await h.at(P(150.4, 120.3));
    await h.type('200,120', '180,100');
    const d2 = h.dims()[1]!;
    expect(d2.overrides?.[144]).toBeUndefined();
    expect(h.shown().at(-1)).toMatch(/^치수 문자 = 50([.,]0+)?$/);
    await h.type('');
  });

  it('모형 호: 반지름(값 400) → 호 길이(L, 값 628.32), 각도(A)는 재지정 없이 90°', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(arc(V(500, 300), 400, 0, 90 * D));
    const a60 = paperOf(P(500 + 400 * Math.cos(60 * D), 300 + 400 * Math.sin(60 * D)));
    const pick = P(a60.x + 0.2, a60.y + 0.1);
    void h.app.run('DIM');
    await settle();
    await h.at(pick);
    expect(h.cmd.prompt).toContain('반지름 치수 위치 지정');
    await h.type('230,190');
    await h.at(pick);
    await h.type('L', '230,200');
    await h.at(pick);
    await h.type('A', '230,180');
    const [r, l, a] = h.dims();
    expect(r!.dimType & 7).toBe(4);
    expect(r!.defPoint.x).toBeCloseTo(200, 9);
    expect(r!.measurement).toBeCloseTo(40, 9);
    expect(r!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(l!.subtype).toBe('ARC_DIMENSION');
    expect(l!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(a!.dimType & 7).toBe(5);
    expect(a!.measurement).toBeCloseTo(90 * D, 12);
    expect(a!.overrides?.[144]).toBeUndefined();
    const s = h.shown();
    expect(s[0]).toMatch(/^치수 문자 = R400([.,]0+)?$/);
    expect(s[1]).toMatch(/628[.,]32/);
    expect(s[2]).toBe('치수 문자 = 90°');
    for (const d of [r, l, a]) expect(d!.xdict).toBeUndefined();
    await h.type('');
  });

  it('모형 원의 꺾기(J): 종이 원에 두고 값은 모형 반지름 400, 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    void h.app.run('DIM');
    await settle();
    await h.at(P(240.3, 150.2));
    await h.type('J', '300,220', '260,190', '270,200');
    const [d] = h.dims();
    expect(d!.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect(d!.defPoint.x).toBeCloseTo(200, 9);
    expect(d!.measurement).toBeCloseTo(40, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown()[0]).toMatch(/^치수 문자 = R400([.,]0+)?$/);
    expect(d!.xdict).toBeUndefined();
    await h.type('');
  });

  it('세로좌표(O): 피쳐가 모형 끝점 스냅이면 뷰포트 축척, 스냅이 없으면 도면 공간 값', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(500, 300), V(900, 300)));
    void h.app.run('DIM');
    await settle();
    await h.type('O');
    await h.at(P(240.3, 150.2));
    await h.type('240,190');
    await h.type('100,60', '100,30');
    const [a, b] = h.dims();
    expect(a!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(b!.overrides?.[144]).toBeUndefined();
    const s = h.shown();
    expect(s[0]).toMatch(/^치수 문자 = 2400([.,]0+)?$/);
    expect(s[1]).toMatch(/^치수 문자 = 100([.,]0+)?$/);
    await h.type('', '');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('각도(A): 모형 호를 고르면 종이 호 중심에, 재지정 없이 120°', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(arc(V(500, 300), 400, 0, 120 * D));
    void h.app.run('DIM');
    await settle();
    await h.type('A');
    const a60 = paperOf(P(500 + 400 * Math.cos(60 * D), 300 + 400 * Math.sin(60 * D)));
    await h.at(P(a60.x + 0.2, a60.y + 0.1));
    await h.type('220,200');
    const [d] = h.dims();
    expect(d!.dimType & 7).toBe(5);
    expect(d!.defPoint4.x).toBeCloseTo(200, 9);
    expect(d!.defPoint4.y).toBeCloseTo(150, 9);
    expect(d!.measurement).toBeCloseTo(120 * D, 12);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeUndefined();
    await h.type('');
  });

  it('계속(C): 두 번째 원점이 모형 끝점에 스냅하지만 값은 이전처럼 도면 공간(재지정을 잇지 않는다)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(0, 0), V(1000, 0)));
    h.add(line3(V(1000, 0), V(1500, 0)));
    void h.app.run('DIM');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.at(P(249.7, 120.2));
    await h.type('200,100');
    // 직전에 만든 치수(이 시험 틀은 편집 관리자의 lastCreated 고리를 잇지 않는다)
    h.app.lastCreated.push(h.dims()[0]!.handle);
    await h.type('C', '');
    expect(h.cmd.prompt).toContain('[선택(S)/명령 취소(U)] <선택>');
    // 모형 (1500,0) → 종이 (300,120)
    await h.at(P(299.6, 120.3));
    const [, d] = h.dims();
    expect(d!.defPoint2.x).toBeCloseTo(250, 9);
    expect(d!.defPoint3.x).toBeCloseTo(300, 9);
    expect(d!.defPoint3.y).toBeCloseTo(120, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.measurement).toBeCloseTo(50, 9);
    await h.type('', '');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('배치 원이 먼저(재지정 없이 연관), 모형 공간 DIM은 그대로', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    const pc = h.addPaper(circle(V(220, 150), 20.3));
    void h.app.run('DIM');
    await settle();
    await h.at(P(240.3, 150.2));
    await h.type('260,170', '');
    const [d] = h.dims();
    // 지름의 두 현 위 점 가운데가 배치 원의 중심
    expect((d!.defPoint.x + d!.defPoint4.x) / 2).toBeCloseTo(220, 9);
    expect(d!.measurement).toBeCloseTo(40.6, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeDefined();
    expect((h.doc.entityIndex.get(pc.handle) as CircleEntity).reactors?.length).toBeGreaterThan(0);
    // 모형 공간
    h.st.space = MODEL_SPACE;
    void h.app.run('DIM');
    await settle();
    await h.at(P(899.6, 300.4));
    await h.type('1000,500', '');
    const [m] = h.dims(MODEL_SPACE);
    expect(m!.measurement).toBeCloseTo(800, 9);
    expect(m!.overrides?.[144]).toBeUndefined();
    expect(m!.xdict).toBeDefined();
  });
});

describe('DIMJOGGED·DIMCONTINUE·DIMBASELINE(진짜 App)', () => {
  it('DIMJOGGED: 뷰포트 안 모형 원 — 종이 원에 두고 값은 모형 반지름 400(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    const c = h.add(circle(V(500, 300), 400));
    void h.app.run('DIMJOGGED');
    await settle();
    await h.at(P(240.3, 150.2));
    expect(h.cmd.prompt).toContain('중심 위치 재지정');
    await h.type('300,220');
    // 안내의 측정값부터 모형 값
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = R400([.,]0+)?$/)]);
    await h.type('260,190', '270,200');
    const [d] = h.dims();
    expect(d!.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect(d!.paperSpace).toBe(true);
    expect(d!.defPoint.x).toBeCloseTo(200, 9);
    expect(d!.defPoint.y).toBeCloseTo(150, 9);
    expect(d!.measurement).toBeCloseTo(40, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(drawn(h, d!)).toMatch(/^R400([.,]0+)?$/);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^R400([.,]0+)?$/);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(c.handle) as CircleEntity).reactors ?? []).toEqual([]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('DIMJOGGED: 배치 원은 그대로(연관, 재지정 없음), 겹친 뷰포트 자리는 고르지 않는다', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(circle(V(500, 300), 400));
    const pc = h.addPaper(circle(V(100, 260), 10));
    void h.app.run('DIMJOGGED');
    await settle();
    await h.at(P(110.1, 260.1));
    await h.type('130,280', '115,270', '120,275');
    const [d] = h.dims();
    expect(d!.measurement).toBeCloseTo(10, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(d!.xdict).toBeDefined();
    expect((h.doc.entityIndex.get(pc.handle) as CircleEntity).reactors?.length).toBeGreaterThan(0);
  });

  it('도면 공간 DIMJOGGED와 치수 스타일 DIMLFAC −10: 안내·그린 문자·LIST가 같은 크기(전에는 안내가 1을 썼다)', async () => {
    const h = setup();
    curStyle(h).vars.DIMLFAC = -10;
    h.addPaper(circle(V(100, 260), 10));
    void h.app.run('DIMJOGGED');
    await settle();
    await h.at(P(110.1, 260.1));
    await h.type('130,280', '115,270', '120,275');
    const [d] = h.dims();
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = R100([.,]0+)?$/)]);
    expect(drawn(h, d!)).toMatch(/^R100([.,]0+)?$/);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^R100([.,]0+)?$/);
  });

  it('DIMCONTINUE·DIMBASELINE: 두 번째 원점이 뷰포트 안 모형 끝점에 스냅(값은 이전처럼 도면 공간)', async () => {
    const h = setup();
    h.viewport(VP, 0.1, C);
    h.add(line3(V(0, 0), V(1000, 0)));
    h.add(line3(V(1000, 0), V(1500, 0)));
    void h.app.run('DIMLINEAR');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.at(P(249.7, 120.2));
    await h.type('200,100');
    h.app.lastCreated.push(h.dims()[0]!.handle);
    void h.app.run('DIMCONTINUE');
    await settle();
    await h.at(P(299.6, 120.3));
    await h.type('', '');
    void h.app.run('DIMBASELINE');
    await settle();
    await h.at(P(299.6, 119.7));
    await h.type('', '');
    const [first, cont, base] = h.dims();
    expect(first!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(cont!.defPoint2.x).toBeCloseTo(250, 9);
    expect(cont!.defPoint3.x).toBeCloseTo(300, 9);
    expect(cont!.overrides?.[144]).toBeUndefined();
    expect(cont!.measurement).toBeCloseTo(50, 9);
    expect(base!.defPoint3.x).toBeCloseTo(300, 9);
    expect(base!.overrides?.[144]).toBeUndefined();
    // 모형 객체 스냅은 연관하지 않는다(공간을 넘는 연관은 아직 없다)
    expect(cont!.xdict).toBeUndefined();
    expect(h.app.busyCommand).toBeFalsy();
  });
});
