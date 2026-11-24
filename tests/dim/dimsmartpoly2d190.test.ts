/**
 * 190차: 스마트 치수 DIM이 2D POLYLINE(무거운 폴리선)에 마우스를 올리거나 고를 때 경량 폴리선과 같은 치수 후보를 내기.
 * Autodesk DIM 도움말: 객체 위에 머무르면 그 객체에 맞는 치수 종류를 미리 보이고, 고르면 그 종류가 기본값이 된다.
 * 폴리선은 고른 세그먼트에 따라 선형 또는 반지름이고, 도움말은 폴리선 종류(경량·2D)를 가르지 않는다.
 * 고치기 전에는 DIM의 치수 대상(`smartTarget`)이 경량 폴리선만 받아, 2D POLYLINE 위에서는 미리 보기가 없고
 * 누르면 객체가 아니라 첫 번째 치수보조선 원점으로 받았다(각도(A) 옵션은 「호, 원, 선을 선택하십시오.」).
 * 이제 188차 `segmentShape`(맞춤·스플라인 맞춤이 아닌 2D POLYLINE을 같은 꼭짓점·볼록도·닫힘·고도·돌출 방향의 경량 꼴로)로
 * 넘겨 같은 모양의 경량 폴리선과 같은 미리 보기·치수·연관(직선 세그먼트는 두 끝점, 호 세그먼트는 없음)을 만든다.
 * 맞춤 꼴·3D 폴리선과 −Z 폴리선(DIM이 경량 폴리선도 받지 않는 꼴)은 전과 같이 첫 원점으로 받는다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimSmartCommand } from '../../src/app/dimsmart';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { type Input, makeHarness } from '../cmds2/harness';
import { NEG_Z, lw, poly2d } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });
type Pts = [number, number, number?][];

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimSmartCommand(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dimsOf = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const r9 = (v: number) => Number(v.toFixed(9)) + 0;
const xy = (p: { x: number; y: number }) => [r9(p.x), r9(p.y)];
const xyz = (p: Vec3) => [r9(p.x), r9(p.y), r9(p.z)];
const DEFS = ['defPoint', 'defPoint2', 'defPoint3', 'defPoint4', 'textMid'] as const;
/** 견줄 치수 값(종류·정의점·측정값) */
const shape = (d: DimensionEntity) => ({ type: d.dimType & 7, sub: d.subtype ?? '', pts: DEFS.map((k) => xyz(d[k])), m: r9(d.measurement), rot: r9(d.rotation ?? 0) });
const assocFlags = (h: H, d: DimensionEntity) => dimAssocOf(h.doc, d)?.data.refs.map((r) => !!r) ?? null;

const heavy = (pts: Pts, closed = false, ext?: Vec3, elevation = 0) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  p.elevation = elevation;
  return p;
};
const light = (pts: Pts, closed = false, ext?: Vec3, elevation = 0) => {
  const q = lw(pts, closed, ext) as LwPolylineEntity;
  q.elevation = elevation;
  return q;
};

/** 새 도면에 객체 하나를 넣고 같은 입력으로 DIM을 돌린다 */
async function dimOn(e: Entity, inputs: (handle: string) => Input[]) {
  const h = harness();
  const a = h.add(e);
  await h.run('DIM', inputs(a.handle));
  return { h, e: a, ds: dimsOf(h) };
}

/** (0, 0)→(10, 0)→(10, 6) 직선 둘 */
const ELL: Pts = [[0, 0], [10, 0], [10, 6]];
/** (0, 0)→(10, 0) 직선, (10, 0)→(20, 0) 볼록도 1(반시계 반원 — 중심 (15, 0), 반지름 5, (15, −5)를 지난다) */
const HALF: Pts = [[0, 0], [10, 0, 1], [20, 0]];

describe('2D POLYLINE: 같은 모양의 경량 폴리선과 같은 미리 보기·치수', () => {
  it('직선 세그먼트: 고도 3인 2D POLYLINE 위 미리 보기, 수평 10·수직 6 선형 치수와 두 끝점 연관 — 경량 폴리선과 같고 옮기면 따라간다', async () => {
    const inputs = (): Input[] => [{ click: [5, 0] }, { click: [5, 4] }, { click: [10, 3] }, { click: [14, 3] }, ''];
    const P = await dimOn(heavy(ELL, false, undefined, 3), inputs);
    const L = await dimOn(light(ELL, false, undefined, 3), inputs);
    // 첫 프롬프트의 미리 보기(객체 강조 + 치수)
    expect(P.h.ghostSizes[0]).toBeGreaterThan(0);
    expect(P.h.ghostSizes[0]).toBe(L.h.ghostSizes[0]);
    expect(P.ds).toHaveLength(2);
    const [d1, d2] = P.ds as [DimensionEntity, DimensionEntity];
    expect(d1.dimType & 7).toBe(0);
    expect([...xy(d1.defPoint2), ...xy(d1.defPoint3)]).toEqual([0, 0, 10, 0]);
    expect(d1.measurement).toBeCloseTo(10, 9);
    expect([...xy(d2.defPoint2), ...xy(d2.defPoint3)]).toEqual([10, 0, 10, 6]);
    expect(d2.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(d2.measurement).toBeCloseTo(6, 9);
    expect(P.ds.map(shape)).toEqual(L.ds.map(shape));
    expect(assocFlags(P.h, d1)?.filter((x) => x)).toHaveLength(2);
    expect(P.ds.map((d) => assocFlags(P.h, d))).toEqual(L.ds.map((d) => assocFlags(L.h, d)));
    expect(regenAssociations(P.h.doc, () => P.h.st.session.newHandle()).dims.size).toBe(0);
    // 꼭짓점을 X로 +2 옮기면 첫 치수의 원점이 따라간다
    const p = P.h.doc.entityIndex.get(P.e.handle) as PolylineEntity;
    const moved = poly2d([[2, 0], [12, 0], [12, 6]]) as PolylineEntity;
    P.h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before: p, after: { ...p, verts: moved.verts } }] });
    const m = regenAssociations(P.h.doc, () => P.h.st.session.newHandle()).dims.get(d1.handle);
    expect(m).toBeDefined();
    expect([...xy(m!.defPoint2), ...xy(m!.defPoint3)]).toEqual([2, 0, 12, 0]);
  });

  it('닫힌 2D POLYLINE의 닫는 세그먼트 (10, 36)→(0, 30): 수직 띠 안 커서는 정렬 치수 — 경량 폴리선과 같다', async () => {
    const box: Pts = [[0, 30], [10, 30], [10, 36]];
    const inputs = (): Input[] => [{ click: [5, 33] }, { click: [4, 35] }, ''];
    const P = await dimOn(heavy(box, true), inputs);
    const L = await dimOn(light(box, true), inputs);
    expect(P.ds).toHaveLength(1);
    const d = P.ds[0]!;
    expect(d.dimType & 7).toBe(1);
    expect([...xy(d.defPoint2), ...xy(d.defPoint3)]).toEqual([10, 36, 0, 30]);
    expect(d.measurement).toBeCloseTo(Math.hypot(10, 6), 9);
    expect(P.ds.map(shape)).toEqual(L.ds.map(shape));
  });

  it('호 세그먼트: 반지름 5(중심 (15, 0)·현 위 점 (15, −5))와 호 길이(L) 5π, 연관 없음 — 경량 폴리선과 같다', async () => {
    // 둘째 고르기는 첫 치수와 겹치지 않는 호 위 −45° 점
    const c = (r: number): [number, number] => [15 + r * Math.SQRT1_2, -r * Math.SQRT1_2];
    const inputs = (): Input[] => [{ click: [15, -5] }, { click: [15, -10] }, { click: c(5) }, 'L', { click: c(9) }, ''];
    const P = await dimOn(heavy(HALF), inputs);
    const L = await dimOn(light(HALF), inputs);
    expect(P.h.ghostSizes[0]).toBeGreaterThan(0);
    expect(P.h.ghostSizes[0]).toBe(L.h.ghostSizes[0]);
    expect(P.ds).toHaveLength(2);
    const [dr, da] = P.ds as [DimensionEntity, DimensionEntity];
    expect(dr.dimType & 7).toBe(4);
    expect(xy(dr.defPoint)).toEqual([15, 0]);
    expect(xy(dr.defPoint4)).toEqual([15, -5]);
    expect(dr.measurement).toBeCloseTo(5, 9);
    expect(da.subtype).toBe('ARC_DIMENSION');
    expect(da.measurement).toBeCloseTo(5 * Math.PI, 9);
    expect(P.ds.map(shape)).toEqual(L.ds.map(shape));
    expect(P.ds.map((d) => assocFlags(P.h, d))).toEqual([null, null]);
    expect(L.ds.map((d) => assocFlags(L.h, d))).toEqual([null, null]);
  });

  it('두 직선 세그먼트를 차례로 누르면 모서리 (10, 0)의 90° 각도 치수 — 경량 폴리선과 같은 치수·연관', async () => {
    const inputs = (): Input[] => [{ click: [5, 0] }, { click: [10, 5] }, { click: [7, 3] }, ''];
    const corner: Pts = [[0, 0], [10, 0], [10, 10]];
    const P = await dimOn(heavy(corner), inputs);
    const L = await dimOn(light(corner), inputs);
    expect(P.ds).toHaveLength(1);
    const d = P.ds[0]!;
    expect(d.dimType & 7).toBe(2);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(P.ds.map(shape)).toEqual(L.ds.map(shape));
    const f = assocFlags(P.h, d);
    expect(f?.some((x) => x)).toBe(true);
    expect(f).toEqual(assocFlags(L.h, L.ds[0]!));
  });

  it('각도(A): 호 세그먼트를 고르면 꼭짓점 (15, 0)·180° — 경량 폴리선과 같다(전에는 「호, 원, 선을 선택하십시오.」)', async () => {
    const inputs = (handle: string): Input[] => ['A', { pick: handle, at: [15, -5] }, '15,-8', ''];
    const P = await dimOn(heavy(HALF), inputs);
    const L = await dimOn(light(HALF), inputs);
    expect(P.h.printed).not.toContain('호, 원, 선을 선택하십시오.');
    expect(P.ds).toHaveLength(1);
    const d = P.ds[0]!;
    expect(d.dimType & 7).toBe(5);
    expect(xy(d.defPoint4)).toEqual([15, 0]);
    expect(d.measurement).toBeCloseTo(Math.PI, 9);
    expect(P.ds.map(shape)).toEqual(L.ds.map(shape));
  });
});

describe('전과 같은 꼴', () => {
  /** 객체 위를 눌러도 미리 보기가 없고 첫 번째 치수보조선 원점 (x, 0)으로 받는다(두 점 (x, 0)·(2x, 6) — 커서가 수직 띠 안이라 정렬 치수) */
  async function expectPointFlow(e: Entity, x: number) {
    const r = await dimOn(e, () => [{ click: [x, 0] }, `${2 * x},6`, `${x},9`, '']);
    expect(r.h.ghostSizes[0]).toBe(0);
    expect(r.ds).toHaveLength(1);
    const d = r.ds[0]!;
    expect([...xy(d.defPoint2), ...xy(d.defPoint3)]).toEqual([x, 0, 2 * x, 6]);
    expect(d.dimType & 7).toBe(1);
    expect(d.measurement).toBeCloseTo(Math.hypot(x, 6), 9);
  }

  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE과 3D 폴리선은 객체 치수 후보가 없다', async () => {
    const fit = heavy(ELL);
    fit.flags |= 2;
    const spl = heavy(ELL);
    spl.flags |= 4;
    const p3 = heavy(ELL);
    p3.kind = '3d';
    p3.flags |= 8;
    for (const e of [fit, spl, p3]) await expectPointFlow(e, 5);
  });

  it('−Z 2D POLYLINE은 −Z 경량 폴리선과 같이 객체 치수 후보가 없다(DIM은 돌출 방향이 +Z인 객체만)', async () => {
    await expectPointFlow(heavy(ELL, false, NEG_Z, 2), -5);
    await expectPointFlow(light(ELL, false, NEG_Z, 2), -5);
  });
});
