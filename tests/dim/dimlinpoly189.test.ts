/**
 * 189차: DIMLINEAR·DIMALIGNED(와 같은 함수를 쓰는 DIMHORIZONTAL·DIMVERTICAL) <객체 선택>으로 폴리선 고르기(`originsFromEntity`).
 * Autodesk DIMLINEAR·DIMALIGNED 도움말 <객체 선택>: 폴리선처럼 분해할 수 있는 객체는 낱낱의 선·호 세그먼트만 치수를 기입하고,
 * 고른 선·호는 그 끝점이 치수보조선 원점이다. 폴리선 종류(경량·2D)는 가르지 않는다.
 * 고치기 전에는 ① 세그먼트를 고를 때 호 세그먼트도 현(두 꼭짓점을 잇는 직선)까지 거리로 견줘, 호의 불룩한 쪽을 고르면 이웃한 세그먼트의 끝점으로
 * 치수를 만들었고, ② 2D POLYLINE(무거운 폴리선)은 받지 않아 알림만 하고 끝났다.
 * 이제 182~188차 치수 명령과 같은 세그먼트 고르기(`polySegment` — 호 세그먼트는 호 위 거리, −Z는 평면도 꼭짓점, 맞춤이 아닌 2D POLYLINE도)로
 * 고른 세그먼트의 두 끝점(꼭짓점 차례 — 직선·호 모두)을 원점으로 쓰고, 경량 폴리선과 같이 두 끝점에 연관한다.
 * 선·호·원(176·179차 시험)과 직선만 있는 경량 폴리선은 같은 값이고, 돌출 방향이 기운 경량 폴리선은 전과 같은 갈래다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerEditCmds2Dim } from '../../src/app/editcmds2-dim';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, lw, poly2d } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });
const MSG = '선, 호, 폴리선 세그먼트를 선택하십시오.';

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
/** 연관 참조 수가 n이고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, n: number) {
  const a = dimAssocOf(h.doc, d);
  expect(a).not.toBeNull();
  expect(a!.data.refs.filter((r) => r)).toHaveLength(n);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
/** 형상을 연관 따라가기 없이 바꾼 뒤 DIMREGEN이 맞춘 치수 */
function moveAndRegen(h: H, before: Entity, after: Entity, d: DimensionEntity): DimensionEntity | undefined {
  h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before, after }] });
  return regenAssociations(h.doc, () => h.st.session.newHandle()).dims.get(d.handle);
}
const heavy = (h: H, pts: [number, number, number?][], closed = false, ext?: Vec3, elevation = 0) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  p.elevation = elevation;
  return h.add(p) as PolylineEntity;
};

/**
 * (0, 0)→(10, 0) 볼록도 1(반시계 반원 — 중심 (5, 0), 반지름 5, (5, −5)를 지난다), (10, 0)→(10, −6) 직선.
 * 호 위 −45° 점 ON은 현(y 0)에서 3.54, 직선 세그먼트(x 10)에서 1.46 떨어져 있다
 */
const ARC_PL: [number, number, number?][] = [[0, 0, 1], [10, 0], [10, -6]];
const ON: [number, number] = [5 + 5 * Math.SQRT1_2, -5 * Math.SQRT1_2];

describe('① 호 세그먼트는 호 위 거리로 고른다', () => {
  it('DIMALIGNED: 호 위 점을 고르면 호 세그먼트의 끝점 (0, 0)·(10, 0), 값 10, 두 끝점 연관, 폴리선을 옮기면 따라간다', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL)) as LwPolylineEntity;
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: ON }, '5,-9']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    const moved = lw([[2, 0, 1], [12, 0], [12, -6]]) as LwPolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([2, 0, 12, 0]);
  });

  it('DIMLINEAR·DIMHORIZONTAL: 같은 점은 호 세그먼트의 수평 치수 값 10(전에는 이웃 직선 세그먼트의 수직 6·수평 0)', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL));
    await h.run('DIMLINEAR', ['', { pick: p.handle, at: ON }, '5,-9']);
    let d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.rotation).toBeCloseTo(0, 12);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    await h.run('DIMHORIZONTAL', ['', { pick: p.handle, at: ON }, '5,-9']);
    d = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
  });

  it('−Z 경량 폴리선: 평면도 호 위 점 (−8.54, −3.54)은 평면도 호 세그먼트 (0, 0)→(−10, 0), 값 10, 연관', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL, false, NEG_Z));
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [-ON[0], ON[1]] }, '-5,-9']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([0, 0, -10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('② 2D POLYLINE도 같은 모양의 경량 폴리선과 같이 받는다', () => {
  it('DIMALIGNED 직선 세그먼트: (0, 0)·(10, 0), 값 10, 두 끝점 연관, 폴리선을 옮기면 따라간다 / DIMLINEAR 수직 세그먼트 값 6', async () => {
    const h = harness();
    const p = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [5, 0] }, '5,-4']);
    const d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    const moved = poly2d([[2, 0], [12, 0], [12, 6]]) as PolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([2, 0, 12, 0]);
    const q = heavy(h, [[0, 20], [10, 20], [10, 26]]);
    await h.run('DIMLINEAR', ['', { pick: q.handle, at: [10, 23] }, '14,23']);
    const dv = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(dv)).toEqual([10, 20, 10, 26]);
    expect(dv.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(dv.measurement).toBeCloseTo(6, 9);
  });

  it('호 세그먼트: (10, 0)→(20, 0) 볼록도 1을 (15, −5)에서 고르면 끝점 (10, 0)·(20, 0), 값 10 — 경량 폴리선과 같은 원점', async () => {
    const h = harness();
    const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];
    const p = heavy(h, HALF);
    const q = h.add(lw(HALF));
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [15, -5] }, '15,-8']);
    const dp = lastDim(h);
    await h.run('DIMALIGNED', ['', { pick: q.handle, at: [15, -5] }, '15,-8']);
    const dq = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(dp)).toEqual([10, 0, 20, 0]);
    expect(dp.measurement).toBeCloseTo(10, 9);
    expect(origins(dp)).toEqual(origins(dq));
    expectAssocHolds(h, dp, 2);
  });

  it('닫힌 2D POLYLINE의 닫는 세그먼트 (10, 36)→(0, 30)과 고도 2인 −Z 2D POLYLINE의 평면도 세그먼트 (−14, 5)→(−14, 11)', async () => {
    const h = harness();
    const c = heavy(h, [[0, 30], [10, 30], [10, 36]], true);
    await h.run('DIMALIGNED', ['', { pick: c.handle, at: [5, 33] }, '3,36']);
    let d = lastDim(h);
    expect(d).toBeDefined();
    expect(origins(d)).toEqual([10, 36, 0, 30]);
    expect(d.measurement).toBeCloseTo(Math.hypot(10, 6), 9);
    const z = heavy(h, [[6, 5], [14, 5], [14, 11]], false, NEG_Z, 2);
    await h.run('DIMALIGNED', ['', { pick: z.handle, at: [-14, 8] }, '-18,8']);
    d = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(d)).toEqual([-14, 5, -14, 11]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('전과 같은 꼴', () => {
  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE, 3D 폴리선, 돌출 방향이 기운 2D POLYLINE은 전과 같은 알림만 한다', async () => {
    const h = harness();
    const fit = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    fit.flags |= 2;
    const spl = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    spl.flags |= 4;
    const p3 = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    p3.kind = '3d';
    p3.flags |= 8;
    const tilt = heavy(h, [[0, 0], [10, 0], [10, 6]], false, { x: 0, y: 1, z: 0 });
    for (const e of [fit, spl, p3, tilt]) await h.run('DIMALIGNED', ['', { pick: e.handle, at: [5, 0] }]);
    expect(h.printed.filter((t) => t === MSG)).toHaveLength(4);
    expect(dimsOf(h)).toHaveLength(0);
  });

  it('경량 폴리선의 직선 세그먼트를 고르면 같은 끝점, 돌출 방향이 기운 경량 폴리선은 전처럼 OCS 꼭짓점', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL));
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [10, -3] }, '14,-3']);
    let d = lastDim(h);
    expect(origins(d)).toEqual([10, 0, 10, -6]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
    const t = h.add(lw([[0, 40], [10, 40], [10, 46]], false, { x: 0, y: 1, z: 0 }));
    await h.run('DIMALIGNED', ['', { pick: t.handle, at: [5, 40] }, '5,36']);
    d = lastDim(h);
    expect(dimsOf(h)).toHaveLength(2);
    expect(origins(d)).toEqual([0, 40, 10, 40]);
  });
});
