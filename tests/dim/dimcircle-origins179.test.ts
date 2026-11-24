/**
 * 179차: DIMLINEAR·DIMALIGNED <객체 선택>으로 원을 고르기.
 * Autodesk DIMLINEAR 도움말 <객체 선택>: 원을 고르면 지름의 끝점을 치수보조선 원점으로 쓴다. 원을 고른 점이 북·남 사분점에 가까우면 수평 치수,
 * 동·서 사분점에 가까우면 수직 치수를 그린다. Autodesk DIMALIGNED 도움말 <객체 선택>: 원을 고르면 지름의 끝점을 쓰고, 원을 고른 점이 첫 치수보조선 원점이다.
 * 고치기 전에는 원을 받지 않아 「선, 호, 폴리선 세그먼트를 선택하십시오.」만 알리고 치수를 만들지 않았다.
 * 이제 원의 평면도 자리(−Z 원은 174차 `circleOf`의 평면 사상)에서 지름 끝점을 세고, 선형은 사분점 연관, 정렬은 원 위 점 연관을 붙인다.
 * 선·호·폴리선의 결과(176차 시험)와 DIMHORIZONTAL·DIMVERTICAL(원을 받지 않음)은 그대로다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CadDocument, CircleEntity, DimensionEntity, Entity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerEditCmds2Dim } from '../../src/app/editcmds2-dim';
import { OSNAP, dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, circle } from '../edit/make';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

const V = (x: number, y: number) => ({ x, y, z: 0 });
const D = Math.PI / 180;

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerEditCmds2Dim(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dimsOf = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const lastDim = (h: H) => dimsOf(h).at(-1)!;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
/** 치수보조선 원점 둘(13·14) */
const origins = (d: DimensionEntity) => [...xy(d.defPoint2), ...xy(d.defPoint3)];
/** 연관 참조의 객체 스냅 종류(점 참조 차례)이고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, kinds: number[]) {
  const a = dimAssocOf(h.doc, d);
  expect(a).not.toBeNull();
  expect(a!.data.refs.filter((r) => r).map((r) => r!.osnap)).toEqual(kinds);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
/** 형상을 연관 따라가기 없이 바꾼 뒤 DIMREGEN이 맞춘 치수 */
function moveAndRegen(h: H, before: Entity, after: Entity, d: DimensionEntity): DimensionEntity | undefined {
  h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before, after }] });
  return regenAssociations(h.doc, () => h.st.session.newHandle()).dims.get(d.handle);
}

describe('DIMLINEAR <객체 선택>: 원', () => {
  it('북 사분점 가까이 고르면 수평 치수: 원점은 서·동 사분점 (6, 5)·(14, 5), 값 8(지름), 사분점 연관, 원을 옮기고 키우면 따라간다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4)) as CircleEntity;
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [10.5, 8.97] }, '10,14']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([6, 5, 14, 5]);
    expect(d.rotation).toBeCloseTo(0, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.QUAD, OSNAP.QUAD]);
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 }, radius: 5 }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([7, 5, 17, 5]);
  });

  it('남 사분점 가까이 고르면 치수선을 옆에 놓아도 수평 치수(값 8)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4));
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [9.4, 1.05] }, '20,5']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([6, 5, 14, 5]);
    expect(d.rotation).toBeCloseTo(0, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
  });

  it('동·서 사분점 가까이 고르면 수직 치수: 원점은 남·북 사분점 (10, 1)·(10, 9), 값 8, 사분점 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4));
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [13.97, 5.5] }, '20,5']);
    let d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([10, 1, 10, 9]);
    expect(d.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.QUAD, OSNAP.QUAD]);
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [6.03, 4.4] }, '10,14']);
    d = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(d)).toEqual([10, 1, 10, 9]);
    expect(d.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
  });

  it('−Z 원(OCS 중심 (10, 5) → 평면도 (−10, 5)): 원점은 평면도 서·동 사분점 (−14, 5)·(−6, 5), 사분점 연관, 원을 옮기면 따라간다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z)) as CircleEntity;
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [-10.5, 8.97] }, '-10,14']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([-14, 5, -6, 5]);
    expect(d.rotation).toBeCloseTo(0, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.QUAD, OSNAP.QUAD]);
    // OCS 중심 (12, 5) = 평면도 (−12, 5)
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([-16, 5, -8, 5]);
  });

  it('30° 돌린 UCS: 사분점·지름을 UCS 축으로 센다(WCS 65° 점 = UCS 35° → UCS 동쪽에 가까워 UCS 수직), 값 8, 원 위 점 연관', async () => {
    const h = harness((d0) => d0.header.set('$UCSXDIR', { x: Math.cos(30 * D), y: Math.sin(30 * D), z: 0 }));
    const c = h.add(circle(10, 5, 4));
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [10 + 4 * Math.cos(65 * D), 5 + 4 * Math.sin(65 * D)] }, '0,0']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    // UCS Y축 (−sin 30°, cos 30°)의 지름 끝: 중심 ∓ 4 × UCS Y
    expect(origins(d)).toEqual(xy({ x: 12, y: 5 - 4 * Math.cos(30 * D) }).concat(xy({ x: 8, y: 5 + 4 * Math.cos(30 * D) })));
    expect(d.rotation).toBeCloseTo(120 * D, 12);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.NEAR, OSNAP.NEAR]);
  });
});

describe('DIMALIGNED <객체 선택>: 원', () => {
  it('고른 점 (13.2, 7.4)이 첫 원점, 둘째는 지름 반대쪽 끝 (6.8, 2.6), 값 8, 원 위 점 연관, 원을 옮기면 따라간다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4)) as CircleEntity;
    await h.run('DIMALIGNED', ['', { pick: c.handle, at: [13.2, 7.4] }, '7,10']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(d.dimType & 7).toBe(1);
    expect(origins(d)).toEqual([13.2, 7.4, 6.8, 2.6]);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.NEAR, OSNAP.NEAR]);
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([15.2, 7.4, 8.8, 2.6]);
  });

  it('원 밖 가까이 고른 점은 원 위로 옮긴 점이 첫 원점(−Z 원은 평면도 원에서)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z)) as CircleEntity;
    // 평면도 중심 (−10, 5)에서 (−0.8, 0.6) 쪽 4.05 거리
    await h.run('DIMALIGNED', ['', { pick: c.handle, at: [-10 - 0.8 * 4.05, 5 + 0.6 * 4.05] }, '-13,0']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([-13.2, 7.4, -6.8, 2.6]);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, [OSNAP.NEAR, OSNAP.NEAR]);
    // OCS 중심 (12, 5) = 평면도 (−12, 5)
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([-15.2, 7.4, -8.8, 2.6]);
  });
});

describe('그대로인 것', () => {
  it('DIMHORIZONTAL·DIMVERTICAL은 원을 받지 않는다(도움말 밖 — 전과 같음)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4));
    await h.run('DIMHORIZONTAL', ['', { pick: c.handle, at: [10.5, 8.97] }]);
    await h.run('DIMVERTICAL', ['', { pick: c.handle, at: [13.97, 5.5] }]);
    expect(dimsOf(h)).toHaveLength(0);
    expect(h.printed.filter((t) => t === '선, 호, 폴리선 세그먼트를 선택하십시오.')).toHaveLength(2);
  });

  it('돌출 방향이 Z축과 평행하지 않은 원(평면도에서 타원)은 DIMLINEAR·DIMALIGNED도 받지 않는다(전과 같음)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, { x: 0, y: 1, z: 0 }));
    await h.run('DIMLINEAR', ['', { pick: c.handle, at: [10, 0] }]);
    await h.run('DIMALIGNED', ['', { pick: c.handle, at: [10, 0] }]);
    expect(dimsOf(h)).toHaveLength(0);
    expect(h.printed.filter((t) => t === '선, 호, 폴리선 세그먼트를 선택하십시오.')).toHaveLength(2);
  });
});

describe('도면 공간: 뷰포트에 보이는 모형 원(진짜 App)', () => {
  beforeAll(() => {
    const g = browserGlobals();
    vi.stubGlobal('window', g.window);
    vi.stubGlobal('document', g.document);
  });
  afterAll(() => vi.unstubAllGlobals());

  type Pt = { x: number; y: number };
  const P = (x: number, y: number): Pt => ({ x, y });
  const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
  const circle3 = (c: Vec3, r: number) => ({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: c, radius: r }) as CircleEntity;
  const vpAt = (id: number, r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity => ({
    ...newViewport(r, { handle: '', id, scale: k, bounds: { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y } }),
    ...extra,
  });

  function setup() {
    const h = makeApp();
    registerDimCommands(h.app);
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
    const at = async (p: Pt) => {
      h.view.events.move!(p, p, ev());
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
      dims,
      shown,
      add: <T extends Entity>(e: T) => addTo(MODEL_SPACE, e),
      viewport: (r: [number, number, number, number], k: number, c: Pt) => addTo(PAPER_SPACE, vpAt(2, r, k, c)),
    };
  }

  it('DIMLINEAR: 1:10 뷰포트의 모형 원(중심 (500, 300)·반지름 400 → 종이 (200, 150)·40)을 북쪽에서 고르면 종이 서·동 사분점의 수평 치수, 값 800(재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    const c = h.add(circle3({ x: 500, y: 300, z: 0 }, 400));
    void h.app.run('DIMLINEAR');
    await settle();
    await h.type('');
    expect(h.cmd.prompt).toContain('치수기입할 객체 선택');
    await h.at(P(200.3, 190.2));
    await h.type('200,200');
    const [d] = h.dims();
    expect(d).toBeDefined();
    expect(d!.defPoint2.x).toBeCloseTo(160, 9);
    expect(d!.defPoint2.y).toBeCloseTo(150, 9);
    expect(d!.defPoint3.x).toBeCloseTo(240, 9);
    expect(d!.defPoint3.y).toBeCloseTo(150, 9);
    expect(d!.rotation).toBeCloseTo(0, 12);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 800([.,]0+)?$/)]);
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(c.handle) as CircleEntity).reactors ?? []).toEqual([]);
  });
});
