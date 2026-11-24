/**
 * 176차: 돌출 방향이 −Z인(대칭으로 뒤집힌) 호·폴리선을 고르는 선형 치수의 <객체 선택>(DIMLINEAR·DIMALIGNED·DIMHORIZONTAL·DIMVERTICAL —
 * `originsFromEntity`)과 CENTERLINE의 폴리선 직선 세그먼트(`straightOf`).
 * DXF 참조서의 OCS 쪽: ARC의 중심(10)과 각도(50·51), LWPOLYLINE의 꼭짓점(10)·고도(38)는 객체 OCS 값이고, LINE의 끝점(10·11)은 WCS 값이다.
 * (0, 0, −1)이면 OCS X = WCS −X라 OCS 중심 (10, 5)인 −Z 호는 평면도 (−10, 5)에 그려진다.
 * Autodesk DIMLINEAR 도움말 <객체 선택>: 고른 선·호의 끝점이 치수보조선 원점이고, 폴리선은 고른 세그먼트를 잰다.
 * Autodesk CENTERLINE 도움말: 고른 두 선(선·폴리선 직선 세그먼트)의 중심선을 만든다.
 * 고치기 전에는 OCS 값을 평면도 자리로 그대로 써 치수보조선 원점과 중심선이 X 거울상 자리 쪽에 생겼다(치수 연관도 붙지 않았다).
 * 이제 174·175차의 평면 사상을 함께 쓴다. 선과 +Z 호·폴리선은 평면 사상이 항등이라 전과 같은 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, DimensionEntity, Entity, LineEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerEditCmds2Dim } from '../../src/app/editcmds2-dim';
import { registerAnnot2Misc } from '../../src/app/annot2-misc';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { NEG_Z, arc, line, lw } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerEditCmds2Dim(h.app);
  registerAnnot2Misc(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const lastDim = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'DIMENSION').at(-1) as DimensionEntity;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
/** 치수보조선 원점 둘(13·14) */
const origins = (d: DimensionEntity) => [...xy(d.defPoint2), ...xy(d.defPoint3)];
const seg = (l: LineEntity) => [...xy(l.start), ...xy(l.end)];
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
/** n번째(0부터) CENTERLINE 블록 참조의 선 */
function centerLines(h: H, n: number): LineEntity[] {
  const ins = modelEntities(h.doc, 'INSERT');
  expect(ins.length).toBeGreaterThan(n);
  const def = h.doc.blocks.get(tableKey(ins[n]!.block))!;
  return def.entities.filter((e): e is LineEntity => e.type === 'LINE');
}

describe('선형 치수 <객체 선택>: −Z 호·폴리선', () => {
  it('DIMLINEAR −Z 호(OCS 0°~90°): 원점은 평면도 끝점 (−14, 5)·(−10, 9), 두 끝점 연관, 호를 옮기면 따라간다', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z)) as ArcEntity;
    await h.run('DIMLINEAR', ['', { pick: a.handle, at: [-12.828, 7.828] }, '-12,14']);
    const d = lastDim(h);
    // 호의 시작점(OCS 0° 점 (14, 5) → WCS (−14, 5))이 첫 원점
    expect(origins(d)).toEqual([-14, 5, -10, 9]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
    // OCS 중심 (12, 5) = 평면도 (−12, 5)로 옮기면 두 원점이 따라간다
    const m = moveAndRegen(h, a, { ...a, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([-16, 5, -12, 9]);
  });

  it('DIMALIGNED −Z 폴리선: 고른 점 (−14, 8)에 가까운 평면도 세그먼트 (−14, 5)→(−14, 11)을 재고 연관, 폴리선을 옮기면 따라간다', async () => {
    const h = harness();
    const p0 = lw([[6, 5], [14, 5], [14, 11]], false, NEG_Z) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0) as LwPolylineEntity;
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [-14, 8] }, '-18,8']);
    const d = lastDim(h);
    expect(origins(d)).toEqual([-14, 5, -14, 11]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
    // OCS X로 +2 옮기면(WCS −2) 같은 세그먼트를 따라간다
    const moved = lw([[8, 5], [16, 5], [16, 11]], false, NEG_Z) as LwPolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(origins(m!)).toEqual([-16, 5, -16, 11]);
  });

  it('DIMHORIZONTAL −Z 호·DIMVERTICAL −Z 폴리선 세그먼트도 평면도 끝점에 연관', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z));
    await h.run('DIMHORIZONTAL', ['', { pick: a.handle, at: [-12.828, 7.828] }, '-12,14']);
    let d = lastDim(h);
    expect(origins(d)).toEqual([-14, 5, -10, 9]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
    const p = h.add(lw([[6, 25], [14, 25], [14, 31]], false, NEG_Z));
    await h.run('DIMVERTICAL', ['', { pick: p.handle, at: [-14, 28] }, '-18,28']);
    d = lastDim(h);
    expect(origins(d)).toEqual([-14, 25, -14, 31]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
  });
});

describe('CENTERLINE: −Z 폴리선 직선 세그먼트', () => {
  it('선 (−20, 0)→(0, 0)과 −Z 폴리선 OCS (2, 10)→(18, 10)(평면도 (−2, 10)→(−18, 10)): 중심선은 y 5, x −22.5~2.5', async () => {
    const h = harness();
    const l = h.add(line(-20, 0, 0, 0));
    const p = h.add(lw([[2, 10], [18, 10], [18, 20]], false, NEG_Z));
    await h.run('CENTERLINE', [{ pick: l.handle, at: [-10, 0] }, { pick: p.handle, at: [-10, 10] }]);
    const ls = centerLines(h, 0);
    expect(ls).toHaveLength(1);
    // 대응하는 끝의 가운데 (−19, 5)~(−1, 5)에 연장 3.5(CENTEREXE 미터 기본)
    expect(seg(ls[0]!)).toEqual([-22.5, 5, 2.5, 5]);
  });

  it('−Z 폴리선 둘: 고른 점에 가까운 평면도 직선 세그먼트끼리(볼록도 세그먼트는 건너뜀)', async () => {
    const h = harness();
    // OCS (0, 0)→(20, 0) 직선, (20, 0)→(20, 10) 반원 — 평면도 (0, 0)→(−20, 0)
    const p1 = h.add(lw([[0, 0], [20, 0, 1], [20, 10]], false, NEG_Z));
    // OCS (2, 10)→(18, 10) — 평면도 (−2, 10)→(−18, 10)
    const p2 = h.add(lw([[2, 10], [18, 10]], false, NEG_Z));
    await h.run('CENTERLINE', [{ pick: p1.handle, at: [-10, 0] }, { pick: p2.handle, at: [-10, 10] }]);
    const ls = centerLines(h, 0);
    expect(ls).toHaveLength(1);
    expect(seg(ls[0]!)).toEqual([2.5, 5, -22.5, 5]);
  });
});

describe('선·+Z 호·폴리선은 전과 같은 값', () => {
  it('DIMLINEAR 선·+Z 호(돌출 방향 없음·(0, 0, 1))·DIMALIGNED +Z 폴리선', async () => {
    const h = harness();
    const l = h.add(line(0, 40, 10, 45));
    await h.run('DIMLINEAR', ['', { pick: l.handle, at: [5, 42.5] }, '5,50']);
    let d = lastDim(h);
    expect(origins(d)).toEqual([0, 40, 10, 45]);
    expectAssocHolds(h, d, 2);
    const a = h.add(arc(10, 5, 4, 0, 90));
    await h.run('DIMLINEAR', ['', { pick: a.handle, at: [12.828, 7.828] }, '12,14']);
    d = lastDim(h);
    expect(origins(d)).toEqual([14, 5, 10, 9]);
    expectAssocHolds(h, d, 2);
    const a1 = h.add(arc(30, 5, 4, 0, 90, { x: 0, y: 0, z: 1 }));
    await h.run('DIMLINEAR', ['', { pick: a1.handle, at: [32.828, 7.828] }, '32,14']);
    d = lastDim(h);
    expect(origins(d)).toEqual([34, 5, 30, 9]);
    expectAssocHolds(h, d, 2);
    const p0 = lw([[6, 25], [14, 25], [14, 31]]) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0);
    await h.run('DIMALIGNED', ['', { pick: p.handle, at: [14, 28] }, '18,28']);
    d = lastDim(h);
    expect(origins(d)).toEqual([14, 25, 14, 31]);
    expectAssocHolds(h, d, 2);
  });

  it('CENTERLINE 선과 +Z 폴리선', async () => {
    const h = harness();
    const l = h.add(line(0, 0, 20, 0));
    const p = h.add(lw([[2, 10], [18, 10], [18, 20]]));
    await h.run('CENTERLINE', [{ pick: l.handle, at: [10, 0] }, { pick: p.handle, at: [10, 10] }]);
    const ls = centerLines(h, 0);
    expect(ls).toHaveLength(1);
    expect(seg(ls[0]!)).toEqual([-2.5, 5, 22.5, 5]);
  });
});
