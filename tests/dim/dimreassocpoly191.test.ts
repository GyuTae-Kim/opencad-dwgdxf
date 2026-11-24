/**
 * 191차: DIMREASSOCIATE(치수 재연관)의 선형·정렬 치수 「객체 선택(S)」으로 폴리선 고르기(`objectEnds` — `app/dimassoc.ts`).
 * Autodesk DIMREASSOCIATE 도움말: 선형·정렬 치수의 첫 번째 치수보조선 원점 프롬프트에서 S를 넣고 형상 객체를 고른다.
 * 받는 객체와 쓰는 점은 같은 옵션인 DIMLINEAR·DIMALIGNED <객체 선택>(189차 — 고른 선·호의 끝점, 폴리선은 고른 낱낱의 세그먼트, 폴리선 종류를 가르지 않음)과 같다.
 * 고치기 전 `objectEnds`는 176·189차 이전 `originsFromEntity`의 옛 사본이라 ① 호 세그먼트도 현까지 거리로 견줘 호의 불룩한 쪽을 고르면 이웃 세그먼트의
 * 끝점에 연관했고, ② 2D POLYLINE(무거운 폴리선)은 「객체를 다시 선택하십시오.」만 했으며, ③ −Z 호·경량 폴리선은 OCS 값을 그대로 써 X 거울상 자리로 옮기고
 * 연관도 붙지 않았다. 이제 DIMLINEAR·DIMALIGNED와 같은 `originsFromEntity`(호 위 거리·평면도 자리·맞춤이 아닌 2D POLYLINE)를 쓴다.
 * 선·자연 +Z 호·직선 세그먼트·돌출 방향이 기운 경량 폴리선과 맞춤·3D·기운 2D POLYLINE의 결과는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimAssocCommands } from '../../src/app/dimassoc';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { type Input, makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, line, lw, poly2d } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });
const AGAIN = '객체를 다시 선택하십시오.';

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerDimAssocCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dimsOf = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
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
const heavy = (h: H, pts: [number, number, number?][], closed = false, ext?: Vec3) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  return h.add(p) as PolylineEntity;
};
/** 원점을 쳐서 넣은(연관 없는) 정렬·선형 치수 — 원점 (0, 30)·(4, 30), 치수선 (2, 33) */
async function looseDim(h: H, cmd: 'DIMALIGNED' | 'DIMLINEAR' = 'DIMALIGNED'): Promise<DimensionEntity> {
  await h.run(cmd, ['0,30', '4,30', '2,33']);
  const d = dimsOf(h).at(-1)!;
  expect(origins(d)).toEqual([0, 30, 4, 30]);
  expect(dimAssocOf(h.doc, d)).toBeNull();
  return d;
}
/** DIMREASSOCIATE → 치수 d → 객체 선택(S) → 고르기(그 뒤 입력이 있으면 이어서) */
async function reassoc(h: H, d: DimensionEntity, pick: Input, ...more: Input[]): Promise<DimensionEntity> {
  await h.run('DIMREASSOCIATE', [{ sel: [d.handle] }, 'S', pick, ...more]);
  return h.doc.entityIndex.get(d.handle) as DimensionEntity;
}

/**
 * (0, 0)→(10, 0) 볼록도 1(반시계 반원 — 중심 (5, 0), 반지름 5, (5, −5)를 지난다), (10, 0)→(10, −6) 직선(189차 시험과 같은 폴리선).
 * 호 위 −45° 점 ON은 현(y 0)에서 3.54, 직선 세그먼트(x 10)에서 1.46 떨어져 있다
 */
const ARC_PL: [number, number, number?][] = [[0, 0, 1], [10, 0], [10, -6]];
const ON: [number, number] = [5 + 5 * Math.SQRT1_2, -5 * Math.SQRT1_2];

describe('① 경량 폴리선의 호 세그먼트는 호 위 거리로 고른다', () => {
  it('정렬 치수: 호 위 점을 고르면 호 세그먼트의 끝점 (0, 0)·(10, 0)에 연관, 값 10, 폴리선을 옮기면 따라간다(전에는 이웃 직선 (10, 0)·(10, −6))', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL)) as LwPolylineEntity;
    const d = await reassoc(h, await looseDim(h), { pick: p.handle, at: ON });
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    const moved = lw([[2, 0, 1], [12, 0], [12, -6]]) as LwPolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([2, 0, 12, 0]);
  });

  it('선형(수평) 치수: 같은 점은 호 세그먼트의 수평 값 10(전에는 이웃 직선의 수평 0)', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL));
    const d = await reassoc(h, await looseDim(h, 'DIMLINEAR'), { pick: p.handle, at: ON });
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.rotation).toBeCloseTo(0, 12);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('② 맞춤이 아닌 2D POLYLINE도 같은 모양의 경량 폴리선과 같이 받는다', () => {
  it('직선 세그먼트: (0, 0)·(10, 0)에 두 끝점 연관, 값 10, 폴리선을 옮기면 따라간다', async () => {
    const h = harness();
    const p = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    const d = await reassoc(h, await looseDim(h), { pick: p.handle, at: [5, 0] });
    expect(origins(d)).toEqual([0, 0, 10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    expect(h.printed).not.toContain(AGAIN);
    const moved = poly2d([[2, 0], [12, 0], [12, 6]]) as PolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([2, 0, 12, 0]);
  });

  it('호 세그먼트: (10, 0)→(20, 0) 볼록도 1을 (15, −5)에서 고르면 끝점 (10, 0)·(20, 0) — 경량 폴리선과 같은 원점·연관', async () => {
    const h = harness();
    const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];
    const p = heavy(h, HALF);
    const q = h.add(lw(HALF));
    const dp = await reassoc(h, await looseDim(h), { pick: p.handle, at: [15, -5] });
    const dq = await reassoc(h, await looseDim(h), { pick: q.handle, at: [15, -5] });
    expect(origins(dp)).toEqual([10, 0, 20, 0]);
    expect(dp.measurement).toBeCloseTo(10, 9);
    expect(origins(dq)).toEqual(origins(dp));
    expect(dimAssocOf(h.doc, dp)!.data.refs.filter((r) => r)).toHaveLength(2);
    expectAssocHolds(h, dq, 2);
  });
});

describe('③ −Z 호·경량 폴리선은 평면도 자리(DIMLINEAR <객체 선택>과 같은 176차 규칙)', () => {
  it('−Z 경량 폴리선: 평면도 호 위 점 (−8.54, −3.54)은 평면도 호 세그먼트 (0, 0)→(−10, 0)에 연관(전에는 OCS 자리 (10, 0))', async () => {
    const h = harness();
    const p = h.add(lw(ARC_PL, false, NEG_Z));
    const d = await reassoc(h, await looseDim(h), { pick: p.handle, at: [-ON[0], ON[1]] });
    expect(origins(d)).toEqual([0, 0, -10, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
  });

  it('−Z 호: OCS 중심 (5, 0)·0°→180°는 평면도 끝점 (−10, 0)·(0, 0)에 연관(전에는 (10, 0)·(0, 0)이고 첫 원점은 연관 없음)', async () => {
    const h = harness();
    const a = h.add(arc(5, 0, 5, 0, 180, NEG_Z));
    const d = await reassoc(h, await looseDim(h), { pick: a.handle, at: [-5, 5] });
    expect(origins(d)).toEqual([-10, 0, 0, 0]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('전과 같은 꼴', () => {
  it('선·자연 +Z 호는 그 끝점, 경량 폴리선의 직선 세그먼트는 그 두 꼭짓점에 연관', async () => {
    const h = harness();
    const l = h.add(line(0, 50, 10, 56));
    let d = await reassoc(h, await looseDim(h), { pick: l.handle, at: [5, 53] });
    expect(origins(d)).toEqual([0, 50, 10, 56]);
    expect(d.measurement).toBeCloseTo(Math.hypot(10, 6), 9);
    expectAssocHolds(h, d, 2);
    const a = h.add(arc(5, 60, 5, 0, 180));
    d = await reassoc(h, await looseDim(h), { pick: a.handle, at: [5, 65] });
    expect(origins(d)).toEqual([10, 60, 0, 60]);
    expect(d.measurement).toBeCloseTo(10, 9);
    expectAssocHolds(h, d, 2);
    const p = h.add(lw(ARC_PL));
    d = await reassoc(h, await looseDim(h), { pick: p.handle, at: [10, -3] });
    expect(origins(d)).toEqual([10, 0, 10, -6]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
  });

  it('돌출 방향이 기운 경량 폴리선은 전처럼 OCS 꼭짓점 (0, 40)·(10, 40)', async () => {
    const h = harness();
    const t = h.add(lw([[0, 40], [10, 40], [10, 46]], false, { x: 0, y: 1, z: 0 }));
    const d = await reassoc(h, await looseDim(h), { pick: t.handle, at: [5, 40] });
    expect(origins(d)).toEqual([0, 40, 10, 40]);
  });

  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE, 3D 폴리선, 돌출 방향이 기운 2D POLYLINE은 전처럼 다시 선택하게 하고 치수는 그대로', async () => {
    const h = harness();
    const fit = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    fit.flags |= 2;
    const spl = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    spl.flags |= 4;
    const p3 = heavy(h, [[0, 0], [10, 0], [10, 6]]);
    p3.kind = '3d';
    p3.flags |= 8;
    const tilt = heavy(h, [[0, 0], [10, 0], [10, 6]], false, { x: 0, y: 1, z: 0 });
    const d0 = await looseDim(h);
    for (const e of [fit, spl, p3, tilt]) {
      const d = await reassoc(h, d0, { pick: e.handle, at: [5, 0] }, '');
      expect(origins(d)).toEqual([0, 30, 4, 30]);
      expect(dimAssocOf(h.doc, d)).toBeNull();
    }
    expect(h.printed.filter((t) => t === AGAIN)).toHaveLength(4);
  });
});
