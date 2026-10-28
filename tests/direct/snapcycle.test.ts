/**
 * 그리기 붙잡기(8차): 스냅 표식 위 Tab 순환과 지연된 접점(AutoCAD의 Deferred Tangent).
 * - findSnaps: 조준창 안의 후보를 알맞은 차례로(첫 후보 = findSnap), 같은 자리는 하나
 * - 지연된 접점: 기준점 없이 원·호 위 찍은 자리, 둘째 점(또는 둘째 지연된 접점)으로 접점·공통 접선을 구한다
 * - 앱: 겹친 후보 위에서 Tab이 다음 후보로 돌고(조준창 밖으로 나가면 처음부터), 동적 입력 칸에 친 값이 있으면 칸 잠그기가 먼저.
 *   LINE의 첫 점을 접점으로 잡으면 접선을 긋는다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { OverlayState } from '../../src/app/view';
import type { Picker } from '../../src/app/pick';
import { type WorldCircle, circleOf, commonTangent, findSnap, findSnaps, tangentFrom } from '../../src/app/snap';
import { registerDrawCommands } from '../../src/app/draw';
import { newDoc } from '../edit/make';
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
const circle = (cx: number, cy: number, r: number, a0 = 0, sweep = Math.PI * 2): WorldCircle => ({ cx, cy, r, a0, sweep });

describe('지연된 접점 풀기(기하)', () => {
  it('점에서 원에 그은 접선: 찍은 자리에 가까운 접점, 원 안이면 없음, 호 밖이면 다른 쪽 또는 없음', () => {
    const c = circle(0, 0, 5);
    const up = tangentFrom(c, P(0, 5), P(10, 0))!;
    expect(up.y).toBeGreaterThan(0);
    // 접선 조건: 반지름 ⟂ 접선
    expect((up.x - 0) * (10 - up.x) + (up.y - 0) * (0 - up.y)).toBeCloseTo(0, 9);
    expect(tangentFrom(c, P(0, -5), P(10, 0))!.y).toBeLessThan(0);
    expect(tangentFrom(c, P(0, 5), P(1, 1))).toBeNull();
    // 위쪽 반원 호: 아래쪽을 찍어도 위쪽 접점만 남는다
    const arc = circle(0, 0, 5, 0, Math.PI);
    expect(tangentFrom(arc, P(0, -5), P(10, 0))!.y).toBeGreaterThan(0);
    expect(tangentFrom(circle(0, 0, 5, Math.PI, Math.PI / 4), P(-5, 0), P(10, 0))).toBeNull();
  });

  it('두 원의 공통 접선: 찍은 자리로 바깥·안쪽 접선을 고르고, 한 원이 다른 원 안이면 없음', () => {
    const a = circle(0, 0, 1);
    const b = circle(10, 0, 2);
    // 둘 다 위쪽: 바깥 접선(위)
    const [t1, t2] = commonTangent(a, P(0, 1), b, P(10, 2))!;
    expect(t1.y).toBeGreaterThan(0);
    expect(t2.y).toBeGreaterThan(0);
    // 두 접점에서 반지름이 접선과 직각
    const dir = { x: t2.x - t1.x, y: t2.y - t1.y };
    expect(t1.x * dir.x + t1.y * dir.y).toBeCloseTo(0, 9);
    expect((t2.x - 10) * dir.x + t2.y * dir.y).toBeCloseTo(0, 9);
    expect(Math.hypot(t1.x, t1.y)).toBeCloseTo(1, 9);
    expect(Math.hypot(t2.x - 10, t2.y)).toBeCloseTo(2, 9);
    // 위·아래: 안쪽 접선(가운데에서 엇갈린다)
    const [i1, i2] = commonTangent(a, P(0, 1), b, P(10, -2))!;
    expect(i1.y).toBeGreaterThan(0);
    expect(i2.y).toBeLessThan(0);
    const di = { x: i2.x - i1.x, y: i2.y - i1.y };
    expect(i1.x * di.x + i1.y * di.y).toBeCloseTo(0, 9);
    expect((i2.x - 10) * di.x + i2.y * di.y).toBeCloseTo(0, 9);
    // 한 원이 다른 원 안, 같은 중심
    expect(commonTangent(circle(0, 0, 10), P(0, 10), circle(1, 0, 2), P(1, 2))).toBeNull();
    expect(commonTangent(circle(0, 0, 1), P(0, 1), circle(0, 0, 2), P(0, 2))).toBeNull();
  });
});

describe('스냅 후보 목록', () => {
  const setupDoc = () => {
    const doc = newDoc();
    const add = (e: Entity) => {
      e.handle = String(doc.entityIndex.size + 100);
      doc.blocks.get(MODEL_SPACE)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      return e;
    };
    return { doc, add, pk: new FakePicker(doc) as unknown as Picker };
  };

  it('겹친 후보를 알맞은 차례로 모두 내고 첫 후보는 findSnap과 같다(같은 자리는 하나)', () => {
    const { doc, add, pk } = setupDoc();
    add({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as Entity);
    add({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 10, z: 0 } } as Entity);
    add({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: { x: 0.6, y: 0.2, z: 0 }, radius: 0.3 } as Entity);
    const modes = new Set(['end', 'cen', 'qua', 'int'] as const);
    const list = findSnaps(doc, pk, P(0.1, 0.1), 1, modes);
    expect(list.length).toBeGreaterThan(2);
    expect(list[0]).toEqual(findSnap(doc, pk, P(0.1, 0.1), 1, modes));
    // 두 선의 공통 끝점·교차점은 한 자리
    expect(list.filter((s) => near(s, P(0, 0))).length).toBe(1);
    expect(list.some((s) => s.kind === 'cen' && near(s, P(0.6, 0.2)))).toBe(true);
  });

  it('지연된 접점: 기준점이 없어도 deferTan이면 원 위 가장 가까운 점, 아니면 없음', () => {
    const { doc, add, pk } = setupDoc();
    const c = add({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: { x: 0, y: 0, z: 0 }, radius: 10 } as Entity);
    const modes = new Set(['tan'] as const);
    expect(findSnap(doc, pk, P(0.3, 10.4), 1, modes)).toBeNull();
    const s = findSnap(doc, pk, P(0.3, 10.4), 1, modes, null, { deferTan: true })!;
    expect(s).toMatchObject({ kind: 'tan', handle: c.handle, deferred: true });
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(10, 9);
    expect(circleOf(c)).toMatchObject({ cx: 0, cy: 0, r: 10 });
  });
});

// ---------------------------------------------------------------------------
// 앱
// ---------------------------------------------------------------------------

type H = RealApp & { pk: FakePicker; cl: DirectCommandLine; move(p: Pt): void; click(p: Pt): void; add(e: Entity): Entity; tab(): boolean };
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
  const cl = h.cmd as unknown as DirectCommandLine;
  return {
    ...h,
    pk,
    cl,
    add,
    move: (p) => h.view.events.move!(p, p, ev()),
    click: (p) => h.view.events.click!(p, p, ev()),
    tab: () => cl.intercept!({ key: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent),
  };
}

/** 켜진 객체 스냅과 조준창(도면 단위 1 — 가짜 화면은 픽셀 = 도면 단위) */
function snaps(h: RealApp, kinds: string[]): void {
  h.app.snapModes.clear();
  for (const k of kinds) h.app.snapModes.add(k as never);
  h.app.osnapOn = true;
  (h.app as unknown as { settings: { aperture: number } }).settings.aperture = 1;
}

const lines = (h: RealApp) => [...h.doc.entityIndex.values()].filter((e): e is LineEntity => e.type === 'LINE');
const circ = (cx: number, cy: number, r: number) => ({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: { x: cx, y: cy, z: 0 }, radius: r }) as CircleEntity;

describe('스냅 표식 위 Tab 순환', () => {
  it('겹친 후보 위에서 Tab마다 다음 후보, 찍으면 그 점, 조준창 밖으로 나가면 처음부터', async () => {
    const h = setup();
    h.add({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as Entity);
    h.add(circ(0.4, 0.3, 0.2));
    snaps(h, ['end', 'cen']);
    void h.app.run('LINE');
    await settle();
    const at = P(0.1, 0.1);
    h.move(at);
    const first = { ...ov(h).snap!.p };
    expect(ov(h).snap!.kind).toBe('end');
    expect(h.tab()).toBe(true);
    expect(ov(h).snap!.kind).toBe('cen');
    expect(near(ov(h).snap!.p, P(0.4, 0.3))).toBe(true);
    // 조준창 안에서 조금 움직여도 고른 후보 그대로
    h.move(P(0.12, 0.11));
    expect(ov(h).snap!.kind).toBe('cen');
    // 한 바퀴 돌면 처음 후보
    expect(h.tab()).toBe(true);
    expect(near(ov(h).snap!.p, first)).toBe(true);
    expect(h.tab()).toBe(true);
    h.click(P(0.12, 0.11));
    await settle();
    // 첫 점이 원의 중심
    h.move(P(5, 5));
    expect(near(ov(h).rubber[0]!.pts.length ? P(ov(h).rubber[0]!.pts[0]!, ov(h).rubber[0]!.pts[1]!) : P(NaN, NaN), P(0.4, 0.3))).toBe(true);
    // 조준창 밖으로 나가면 순환은 끝나고 후보가 하나뿐이면 Tab은 동적 입력으로 넘어간다
    h.move(P(9.9, 0.1));
    expect(ov(h).snap!.kind).toBe('end');
    h.cl.input.value = '';
    h.app.dynOn = false;
    expect(h.tab()).toBe(false);
    h.app.cancel();
  });

  it('동적 입력 칸에 친 값이 있으면 Tab은 칸 잠그기', async () => {
    const h = setup();
    h.add({ ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as Entity);
    h.add(circ(0.4, 0.3, 0.2));
    snaps(h, ['end', 'cen']);
    void h.app.run('LINE');
    await settle();
    h.cl.type('20,20');
    await settle();
    h.move(P(0.1, 0.1));
    expect(ov(h).snap!.kind).toBe('end');
    h.cl.input.value = '5';
    expect(h.tab()).toBe(true);
    expect(h.cl.input.value).toBe('');
    expect(ov(h).dynFields![0]!.locked).toBe(true);
    // 거리를 잠근 점(스냅 없음) — 스냅 후보로 돌지 않았다
    expect(ov(h).snap).toBeNull();
    h.app.cancel();
  });
});

describe('LINE의 지연된 접점', () => {
  it('첫 점을 접점으로 원 위에 찍고 둘째 점을 찍으면 그 점에서 원에 그은 접선', async () => {
    const h = setup();
    // 극좌표 추적(F10, 기본 켜짐)은 끈다: 켜져 있으면 (20, 0)이 찍은 자리 (0.2, 5)의 0° 정렬 경로로 간다
    h.app.polarOn = false;
    h.add(circ(0, 0, 5));
    snaps(h, ['tan']);
    void h.app.run('LINE');
    await settle();
    h.move(P(0.2, 5.3));
    expect(ov(h).snap).toMatchObject({ kind: 'tan', deferred: true });
    expect(ov(h).tip).toBe('지연된 접점');
    h.click(P(0.2, 5.3));
    await settle();
    // 미리보기 선: 커서에서 원에 그은 접선
    h.move(P(20, 0));
    const pts = ov(h).rubber[0]!.pts;
    expect(Math.hypot(pts[0]!, pts[1]!)).toBeCloseTo(5, 9);
    expect(pts[1]!).toBeGreaterThan(0);
    h.click(P(20, 0));
    await settle();
    h.app.cancel();
    await settle();
    const l = lines(h)[0]!;
    expect(Math.hypot(l.start.x, l.start.y)).toBeCloseTo(5, 9);
    expect(l.start.y).toBeGreaterThan(0);
    expect(l.end).toMatchObject({ x: 20, y: 0 });
    // 반지름 ⟂ 선
    expect(l.start.x * (l.end.x - l.start.x) + l.start.y * (l.end.y - l.start.y)).toBeCloseTo(0, 9);
  });

  it('둘째 점도 다른 원의 접점이면 두 원의 공통 접선, 원 안의 점이면 다시 묻는다', async () => {
    const h = setup();
    h.add(circ(0, 0, 2));
    h.add(circ(20, 0, 3));
    snaps(h, ['tan']);
    void h.app.run('LINE');
    await settle();
    h.move(P(0, -2.2));
    h.click(P(0, -2.2));
    await settle();
    // 원 안의 점(스냅이 없는 곳): 접선이 없어 다시 묻는다
    h.app.osnapOn = false;
    h.move(P(0.5, 0.5));
    h.click(P(0.5, 0.5));
    await settle();
    expect(lines(h)).toHaveLength(0);
    h.app.osnapOn = true;
    h.move(P(20, -3.1));
    expect(ov(h).snap).toMatchObject({ kind: 'tan', deferred: true });
    h.click(P(20, -3.1));
    await settle();
    h.app.cancel();
    await settle();
    const l = lines(h)[0]!;
    expect(Math.hypot(l.start.x, l.start.y)).toBeCloseTo(2, 9);
    expect(Math.hypot(l.end.x - 20, l.end.y)).toBeCloseTo(3, 9);
    expect(l.start.y).toBeLessThan(0);
    expect(l.end.y).toBeLessThan(0);
    const d = { x: l.end.x - l.start.x, y: l.end.y - l.start.y };
    expect(l.start.x * d.x + l.start.y * d.y).toBeCloseTo(0, 9);
    expect((l.end.x - 20) * d.x + l.end.y * d.y).toBeCloseTo(0, 9);
  });
});
