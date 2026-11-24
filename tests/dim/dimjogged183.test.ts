/**
 * 183차: DIMJOGGED(꺾기 반지름 치수)의 폴리선 호 세그먼트와 −Z(대칭으로 뒤집힌) 원·호.
 * Autodesk DIMJOGGED 도움말 「호 또는 원 선택」: 원, 호, 폴리선의 호 세그먼트를 지정한다(DIMRADIUS와 같은 글 — 182차).
 * DXF 참조서의 OCS 쪽: CIRCLE·ARC의 중심(10)과 각도(50·51)는 객체 OCS 값이다. (0, 0, −1)이면 OCS X = WCS −X라
 * OCS 중심 (10, 5)인 −Z 원은 평면도 (−10, 5)에 그려진다.
 * 고치기 전에는 DIMJOGGED가 원·호만 받아 폴리선을 고르면 알림만 하고 끝났고, 원·호의 중심은 OCS 값을 평면도 자리로 그대로 써
 * −Z 원·호의 치수가 X 거울상 자리에 생겼다(174차가 DIMRADIUS·DIMDIAMETER·DIMARC에서 고친 꼴). 이제 174차 `circleOf`(평면도 중심·평면 Z)와
 * 182차 `polyArcOf`(고른 점에 가장 가까운 호 세그먼트)를 쓴다. 원·+Z 호는 전과 같은 값, 폴리선 호 세그먼트 치수는 182차처럼 연관을 붙이지 않는다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, CircleEntity, DimensionEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, circle, lw } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerAnnot2Commands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const lastDim = (h: H) => dims(h).at(-1)!;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(6)) + 0, Number(p.y.toFixed(6)) + 0];
/** 연관 참조가 모두 붙었고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, n: number) {
  const a = dimAssocOf(h.doc, d);
  expect(a).not.toBeNull();
  expect(a!.data.refs.filter((r) => r)).toHaveLength(n);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) */
const polyline = (h: H, ext?: { x: number; y: number; z: number }, elevation = 0) => {
  const p = lw([[0, 0], [10, 0, 1], [20, 0]], false, ext) as LwPolylineEntity;
  p.elevation = elevation;
  return h.add(p) as LwPolylineEntity;
};

describe('DIMJOGGED: −Z 원·호는 평면도 자리', () => {
  // 재지정 중심이 현 위 점보다 바깥이면 꺾기 가운데는 현 위 점 자리에서 법선 쪽으로 재지정 중심까지의 반(edit/dim/jogged.ts jogPoints — +Z 시험의 (14, 0)과 거울)
  it('OCS 중심 (10, 5) 반지름 4인 −Z 원: 중심 (−10, 5)·현 위 점 (−14, 5)·꺾기 (−14, 0), 두 점 모두 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    await h.run('DIMJOGGED', [{ pick: c.handle, at: [-14, 5] }, '-20,-5', '-16,5', '-15,0']);
    const d = lastDim(h);
    expect(d.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect(xy(d.defPoint4)).toEqual([-14, 5]);
    expect(xy(d.defPoint2)).toEqual([-20, -5]);
    expect(xy(d.defPoint3)).toEqual([-14, 0]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
  });

  it('OCS 고도 3인 −Z 원의 치수 점은 WCS Z −3', async () => {
    const h = harness();
    const c0 = circle(10, 5, 4, NEG_Z) as CircleEntity;
    c0.center.z = 3;
    const c = h.add(c0);
    await h.run('DIMJOGGED', [{ pick: c.handle, at: [-14, 5] }, '-20,-5', '-16,5', '-15,0']);
    const d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect([d.defPoint.z, d.defPoint4.z, d.defPoint2.z, d.defPoint3.z]).toEqual([-3, -3, -3, -3]);
  });

  it('OCS 0°~90° −Z 호(평면도 90°~180°): 중심 (−10, 5)·현 위 점은 135° 쪽, 두 점 모두 연관', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z));
    await h.run('DIMJOGGED', [{ pick: a.handle, at: [-12.828, 7.828] }, '-20,15', '-14,9', '-16,12']);
    const d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect(xy(d.defPoint4)).toEqual([-10 - 2 * Math.SQRT2, 5 + 2 * Math.SQRT2].map((v) => Number(v.toFixed(6)) + 0));
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('DIMJOGGED: 폴리선 호 세그먼트', () => {
  it('호 세그먼트의 중심 (15, 0)·현 위 점 (15, −5)에, 값 5, 연관 없음', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [15, -5] }, '25,-15', '15,-8', '16,-10']);
    const d = lastDim(h);
    expect(d.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect(xy(d.defPoint)).toEqual([15, 0]);
    expect(xy(d.defPoint4)).toEqual([15, -5]);
    expect(xy(d.defPoint2)).toEqual([25, -15]);
    expect(d.measurement).toBeCloseTo(5, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('고도 2인 −Z 폴리선(OCS X = WCS −X)의 호 세그먼트는 평면도 중심 (−15, 0)·현 위 점 (−15, −5)에 WCS Z −2', async () => {
    const h = harness();
    const p = polyline(h, NEG_Z, 2);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [-15, -5] }, '-25,-15', '-15,-8', '-16,-10']);
    const d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([-15, 0]);
    expect(xy(d.defPoint4)).toEqual([-15, -5]);
    expect(d.defPoint.z).toBe(-2);
    expect(d.measurement).toBeCloseTo(5, 9);
  });

  it('중심 위치 재지정에서 Enter면 치수 없이 끝나고, 만든 치수는 명령 취소 한 번에 사라지며 폴리선은 그대로', async () => {
    const h = harness();
    const p = polyline(h);
    const before = [...p.verts];
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [15, -5] }, '']);
    expect(dims(h)).toHaveLength(0);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [15, -5] }, '25,-15', '15,-8', '16,-10']);
    expect(dims(h)).toHaveLength(1);
    h.st.session.undo();
    expect(dims(h)).toHaveLength(0);
    expect([...(h.doc.entityIndex.get(p.handle) as LwPolylineEntity).verts]).toEqual(before);
  });
});

describe('전과 같은 꼴', () => {
  it('직선 세그먼트를 고르면 전과 같은 알림만 하고 치수를 만들지 않는다', async () => {
    const h = harness();
    const p = polyline(h);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [5, 0] }]);
    expect(h.printed).toContain('호 또는 원을 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });

  it('돌출 방향이 없거나 (0, 0, 1)인 원·호는 전과 같은 값(고도 2 원은 Z 2, 두 점 모두 연관)', async () => {
    const h = harness();
    const c0 = circle(10, 5, 4) as CircleEntity;
    c0.center.z = 2;
    const c = h.add(c0);
    await h.run('DIMJOGGED', [{ pick: c.handle, at: [14, 5] }, '20,-5', '16,5', '18,0']);
    let d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([10, 5]);
    expect(xy(d.defPoint4)).toEqual([14, 5]);
    expect(xy(d.defPoint2)).toEqual([20, -5]);
    // 고치기 전 판에서 본 값(재지정 중심이 현 위 점보다 바깥 — jogPoints가 꺾기를 현 위 점 자리에 둔다)
    expect(xy(d.defPoint3)).toEqual([14, 0]);
    expect([d.defPoint.z, d.defPoint4.z, d.defPoint2.z, d.defPoint3.z]).toEqual([2, 2, 2, 2]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
    const a = h.add(arc(10, 25, 4, 0, 90, { x: 0, y: 0, z: 1 }));
    await h.run('DIMJOGGED', [{ pick: a.handle, at: [12.828, 27.828] }, '20,35', '14,29', '16,32']);
    d = lastDim(h);
    expect(xy(d.defPoint)).toEqual([10, 25]);
    expect(xy(d.defPoint4)).toEqual([10 + 2 * Math.SQRT2, 25 + 2 * Math.SQRT2].map((v) => Number(v.toFixed(6)) + 0));
    expect(xy(d.defPoint2)).toEqual([20, 35]);
    expect(d.measurement).toBeCloseTo(4, 9);
  });
});
