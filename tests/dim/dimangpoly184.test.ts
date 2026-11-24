/**
 * 184차: DIMANGULAR로 폴리선의 호 세그먼트·직선 세그먼트 고르기.
 * Autodesk DIMANGULAR 도움말 「호 선택」: 고른 호 또는 폴리선 호 세그먼트의 점을 정의점으로 쓴다(호의 중심이 각도 꼭짓점, 호의 끝점이 치수보조선 원점).
 * 「선 선택」: 두 선 또는 폴리선 세그먼트로 각도를 정의한다(두 선의 교점이 각도 꼭짓점).
 * 고치기 전에는 LINE·ARC·CIRCLE만 받아, 폴리선을 처음 고르면 「호, 원, 선을 선택하십시오.」, 둘째 선으로 고르면 「선을 선택하십시오.」 알림만 하고 끝났다.
 * 이제 고른 점에 가장 가까운 세그먼트(182차 DIMRADIUS·DIMDIAMETER·DIMARC와 같은 고르기 — −Z 폴리선은 평면도 꼭짓점)가 호면 호 갈래,
 * 직선이면 선 갈래로 치수를 만든다. 폴리선 세그먼트 쪽은 182·183차처럼 연관을 붙이지 않는다.
 * LINE·ARC·CIRCLE은 전과 같은 값(아래 마지막 묶음과 175차·23차 시험).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, LwPolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, line, lw } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const lastDim = (h: H) => dims(h).at(-1)!;
const r9 = (v: number) => Number(v.toFixed(9)) + 0;
const xy = (p: { x: number; y: number }) => [r9(p.x), r9(p.y)];
const xyz = (p: Vec3) => [r9(p.x), r9(p.y), r9(p.z)];
/** 두 선 각도의 네 점 참조(13, 14, 15, 10 차례) 가운데 연관이 있는 자리 */
const refMask = (h: H, d: DimensionEntity) => {
  const refs = dimAssocOf(h.doc, d)!.data.refs;
  return [0, 1, 2, 3].map((i) => !!refs[i]);
};

/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) */
const halfRound = (h: H, ext?: Vec3, elevation = 0) => {
  const p = lw([[0, 0], [10, 0, 1], [20, 0]], false, ext) as LwPolylineEntity;
  p.elevation = elevation;
  return h.add(p) as LwPolylineEntity;
};

describe('호 선택: 폴리선 호 세그먼트', () => {
  it('반원 세그먼트: 꼭짓점은 호 중심 (15, 0), 끝점 (10, 0)·(20, 0), 값 180°, 연관 없음', async () => {
    const h = harness();
    const p = halfRound(h);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(5);
    expect(xy(d.defPoint4)).toEqual([15, 0]);
    expect(xy(d.defPoint2)).toEqual([10, 0]);
    expect(xy(d.defPoint3)).toEqual([20, 0]);
    expect(d.measurement).toBeCloseTo(Math.PI, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('둥근 모서리의 90° 세그먼트(모깎기)는 같은 자리의 ARC를 고른 것과 같은 정의점·값', async () => {
    const h = harness();
    // (0,0)→(10,0) 직선, (10,0)→(15,5) 반시계 90°(중심 (10,5)), (15,5)→(15,15) 직선
    const p = h.add(lw([[0, 0], [10, 0, Math.tan(Math.PI / 8)], [15, 5], [15, 15]]));
    const a = h.add(arc(10, 5, 5, 270, 360));
    const at: [number, number] = [10 + 5 * Math.SQRT1_2, 5 - 5 * Math.SQRT1_2];
    await h.run('DIMANGULAR', [{ pick: p.handle, at }, '13,2']);
    const dp = lastDim(h);
    await h.run('DIMANGULAR', [{ pick: a.handle, at }, '13,2']);
    const da = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(xy(dp.defPoint4)).toEqual([10, 5]);
    expect(xy(dp.defPoint2)).toEqual([10, 0]);
    expect(xy(dp.defPoint3)).toEqual([15, 5]);
    expect(dp.measurement).toBeCloseTo(Math.PI / 2, 9);
    for (const k of ['defPoint', 'defPoint2', 'defPoint3', 'defPoint4'] as const) expect(xyz(dp[k])).toEqual(xyz(da[k]));
    expect(dp.measurement).toBeCloseTo(da.measurement, 12);
  });

  it('시계 세그먼트(볼록도 −1)는 반시계로 바꿔 첫 끝점 (10, 10)·둘째 끝점 (0, 10)', async () => {
    const h = harness();
    const p = h.add(lw([[0, 10, -1], [10, 10]]));
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [5, 15] }, '5,18']);
    const d = lastDim(h);
    expect(xy(d.defPoint4)).toEqual([5, 10]);
    expect(xy(d.defPoint2)).toEqual([10, 10]);
    expect(xy(d.defPoint3)).toEqual([0, 10]);
    expect(d.measurement).toBeCloseTo(Math.PI, 9);
  });

  it('고도 2인 −Z 폴리선(OCS X = WCS −X)의 호 세그먼트는 평면도 중심 (−15, 0)에 WCS Z −2, 끝점 (−20, 0)·(−10, 0)', async () => {
    const h = harness();
    const p = halfRound(h, NEG_Z, 2);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [-15, -5] }, '-15,-8']);
    const d = lastDim(h);
    expect(xyz(d.defPoint4)).toEqual([-15, 0, -2]);
    expect(xy(d.defPoint2)).toEqual([-20, 0]);
    expect(xy(d.defPoint3)).toEqual([-10, 0]);
    expect(d.measurement).toBeCloseTo(Math.PI, 9);
  });
});

describe('선 선택: 폴리선 직선 세그먼트', () => {
  it('같은 폴리선의 두 세그먼트: 모서리 (10, 0)에서 90°, 두 선 각도의 정의점은 세그먼트 끝점, 연관 없음', async () => {
    const h = harness();
    const p = h.add(lw([[0, 0], [10, 0], [10, 10]]));
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [5, 0] }, { pick: p.handle, at: [10, 5] }, '7,3']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(2);
    expect(xy(d.defPoint2)).toEqual([0, 0]);
    expect(xy(d.defPoint3)).toEqual([10, 0]);
    expect(xy(d.defPoint4)).toEqual([10, 0]);
    expect(xy(d.defPoint)).toEqual([10, 10]);
    expect(xy(d.defPoint5!)).toEqual([7, 3]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('LINE과 폴리선 직선 세그먼트(어느 쪽을 먼저 골라도): 꼭짓점 (0, 0)에서 90°, LINE 쪽 두 끝점만 연관', async () => {
    const h = harness();
    const l = h.add(line(0, 0, 10, 0));
    const p = h.add(lw([[0, 0], [0, 10], [-10, 10]]));
    await h.run('DIMANGULAR', [{ pick: l.handle, at: [5, 0] }, { pick: p.handle, at: [0, 5] }, '3,3']);
    let d = lastDim(h);
    expect(d.dimType & 7).toBe(2);
    expect(xy(d.defPoint4)).toEqual([0, 0]);
    expect(xy(d.defPoint)).toEqual([0, 10]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(refMask(h, d)).toEqual([true, true, false, false]);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [0, 5] }, { pick: l.handle, at: [5, 0] }, '3,3']);
    d = lastDim(h);
    expect(xy(d.defPoint2)).toEqual([0, 0]);
    expect(xy(d.defPoint3)).toEqual([0, 10]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(refMask(h, d)).toEqual([false, false, true, true]);
    expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
  });

  it('고도 2인 −Z 폴리선의 직선 세그먼트는 평면도 꼭짓점으로: 모서리 (−10, 0)에서 90°, 정의점 WCS Z −2', async () => {
    const h = harness();
    const p0 = lw([[0, 0], [10, 0], [10, 10]], false, NEG_Z) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [-5, 0] }, { pick: p.handle, at: [-10, 5] }, '-7,3']);
    const d = lastDim(h);
    expect(xyz(d.defPoint2)).toEqual([0, 0, -2]);
    expect(xyz(d.defPoint3)).toEqual([-10, 0, -2]);
    expect(xyz(d.defPoint4)).toEqual([-10, 0, -2]);
    expect(xyz(d.defPoint)).toEqual([-10, 10, -2]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
  });

  it('직선 세그먼트 다음 둘째로 호 세그먼트를 고르면 「선을 선택하십시오.」만 하고 치수를 만들지 않는다', async () => {
    const h = harness();
    const p = halfRound(h);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [5, 0] }, { pick: p.handle, at: [15, -5] }]);
    expect(h.printed).toContain('선을 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });
});

describe('전과 같은 꼴', () => {
  it('LINE 다음 폴리선 호 세그먼트는 「선을 선택하십시오.」, 돌출 방향이 기운 폴리선은 「호, 원, 선을 선택하십시오.」', async () => {
    const h = harness();
    const l = h.add(line(0, -10, 10, -10));
    const p = halfRound(h);
    const tilted = h.add(lw([[0, 0], [10, 0, 1], [20, 0]], false, { x: 1, y: 0, z: 0 }));
    await h.run('DIMANGULAR', [{ pick: l.handle, at: [5, -10] }, { pick: p.handle, at: [15, -5] }]);
    expect(h.printed).toContain('선을 선택하십시오.');
    await h.run('DIMANGULAR', [{ pick: tilted.handle, at: [0, 5] }]);
    expect(h.printed).toContain('호, 원, 선을 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });

  it('치수 호 위치에서 Enter면 치수 없이 끝나고, 만든 치수는 명령 취소 한 번에 사라지며 폴리선은 그대로', async () => {
    const h = harness();
    const p = halfRound(h);
    const before = [...p.verts];
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [15, -5] }, '']);
    expect(dims(h)).toHaveLength(0);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    expect(dims(h)).toHaveLength(1);
    h.st.session.undo();
    expect(dims(h)).toHaveLength(0);
    expect([...(h.doc.entityIndex.get(p.handle) as LwPolylineEntity).verts]).toEqual(before);
  });

  it('LINE 두 개: 꼭짓점 (0, 0)에서 90°, 네 끝점 모두 연관', async () => {
    const h = harness();
    const a = h.add(line(0, 0, 10, 0));
    const b = h.add(line(0, 0, 0, 10));
    await h.run('DIMANGULAR', [{ pick: a.handle, at: [5, 0] }, { pick: b.handle, at: [0, 5] }, '3,3']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(2);
    expect(xy(d.defPoint2)).toEqual([0, 0]);
    expect(xy(d.defPoint3)).toEqual([10, 0]);
    expect(xy(d.defPoint4)).toEqual([0, 0]);
    expect(xy(d.defPoint)).toEqual([0, 10]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(refMask(h, d)).toEqual([true, true, true, true]);
  });
});
