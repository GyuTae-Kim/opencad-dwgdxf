/**
 * 175차: 돌출 방향이 −Z인(대칭으로 뒤집힌) 원·호에 만드는 각도 치수(DIMANGULAR 호·원 갈래)와 중심 표식(CENTERMARK).
 * DXF 참조서의 OCS 쪽: CIRCLE·ARC의 중심(10)과 각도(50·51), LWPOLYLINE의 꼭짓점(10)·고도(38)는 객체 OCS 값이다.
 * (0, 0, −1)이면 OCS X = WCS −X라 OCS 중심 (10, 5)인 −Z 원은 평면도 (−10, 5)에 그려진다.
 * Autodesk DIMANGULAR 도움말: 호를 고르면 호의 중심이 꼭짓점, 호의 끝점이 각도 끝점이고, 원을 고르면 고른 점이 첫 끝점, 중심이 꼭짓점이다.
 * Autodesk CENTERMARK 도움말: 고른 원·호의 중심에 중심 표식을 만든다.
 * 고치기 전에는 OCS 값을 평면도 자리로 그대로 써 각도 치수와 중심 표식이 X 거울상 자리에 생겼다(각도 치수의 끝점·중심 연관도 붙지 않았다).
 * 이제 174차의 평면 사상(`circleOf`)을 함께 쓴다. +Z 원·호·폴리선은 평면 사상이 항등이라 전과 같은 값이다.
 * 이 앱의 CENTERMARK는 익명 블록 참조 하나로 만들고 연관을 붙이지 않는다(자리·Z만 본다).
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, CircleEntity, DimensionEntity, Entity, LineEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerAnnot2Misc } from '../../src/app/annot2-misc';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { NEG_Z, arc, circle, lw } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerAnnot2Misc(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const lastDim = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'DIMENSION').at(-1) as DimensionEntity;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
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
/** n번째(0부터) CENTERMARK 블록 참조의 선 */
function markLines(h: H, n: number): LineEntity[] {
  const ins = modelEntities(h.doc, 'INSERT');
  expect(ins.length).toBeGreaterThan(n);
  const def = h.doc.blocks.get(tableKey(ins[n]!.block))!;
  return def.entities.filter((e): e is LineEntity => e.type === 'LINE');
}

describe('DIMANGULAR: −Z 호·원', () => {
  it('OCS 0°~90° −Z 호(평면도 90°~180°): 꼭짓점 (−10, 5)·끝점 (−10, 9)·(−14, 5), 세 점 연관, 호를 옮기면 따라간다', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z)) as ArcEntity;
    await h.run('DIMANGULAR', [{ pick: a.handle, at: [-12.828, 7.828] }, '-16,11']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(5);
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(xy(d.defPoint2)).toEqual([-10, 9]);
    expect(xy(d.defPoint3)).toEqual([-14, 5]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expectAssocHolds(h, d, 3);
    // OCS 중심 (12, 5) = 평면도 (−12, 5)로 옮기면 꼭짓점·두 끝점이 따라간다
    const m = moveAndRegen(h, a, { ...a, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(xy(m!.defPoint4)).toEqual([-12, 5]);
    expect(xy(m!.defPoint2)).toEqual([-12, 9]);
    expect(xy(m!.defPoint3)).toEqual([-16, 5]);
    expect(m!.measurement).toBeCloseTo(Math.PI / 2, 9);
  });

  it('−Z 원: 꼭짓점은 평면도 중심 (−10, 5), 첫 끝점은 고른 점 (−14, 5) — 고른 점·중심 연관, 원을 옮기면 따라간다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z)) as CircleEntity;
    await h.run('DIMANGULAR', [{ pick: c.handle, at: [-14, 5] }, '-10,9', '-16,11']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(5);
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(xy(d.defPoint2)).toEqual([-14, 5]);
    expect(xy(d.defPoint3)).toEqual([-10, 9]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    // 참조 차례 [13 고른 점, 14 찍은 점(스냅 없이 입력 — 연관 없음), 15 중심]
    const refs = dimAssocOf(h.doc, d)!.data.refs;
    expect([!!refs[0], !!refs[1], !!refs[2]]).toEqual([true, false, true]);
    expectAssocHolds(h, d, 2);
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(xy(m!.defPoint4)).toEqual([-12, 5]);
    expect(xy(m!.defPoint2)).toEqual([-16, 5]);
    expect(xy(m!.defPoint3)).toEqual([-10, 9]);
  });
});

describe('CENTERMARK: −Z 원·호·폴리선 호', () => {
  it('OCS 고도 3인 −Z 원: 십자는 평면도 중심 (−10, 5)에, 선 여섯 개 모두 WCS Z −3', async () => {
    const h = harness();
    const c0 = circle(10, 5, 4, NEG_Z) as CircleEntity;
    c0.center.z = 3;
    const c = h.add(c0);
    await h.run('CENTERMARK', [{ pick: c.handle, at: [-14, 5] }, '']);
    const ls = markLines(h, 0);
    expect(ls).toHaveLength(6);
    expect(seg(ls[0]!)).toEqual([-10.4, 5, -9.6, 5]);
    expect(seg(ls[1]!)).toEqual([-10, 4.6, -10, 5.4]);
    // 연장선: 십자 반 길이 0.4 + 간격 0.4에서 원 밖 3.5까지(지름 8 — CENTERCROSSSIZE·CENTERCROSSGAP 기본 0.1x·0.05x)
    expect(seg(ls[2]!)).toEqual([-9.2, 5, -2.5, 5]);
    expect(ls.every((l) => l.start.z === -3 && l.end.z === -3)).toBe(true);
  });

  it('OCS 0°~270° −Z 호: 중심각 270°(연장선 있음) 그대로, 십자는 (−10, 5)에', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 270, NEG_Z));
    await h.run('CENTERMARK', [{ pick: a.handle, at: [-14, 5] }, '']);
    const ls = markLines(h, 0);
    expect(ls).toHaveLength(6);
    expect(seg(ls[0]!)).toEqual([-10.4, 5, -9.6, 5]);
    expect(seg(ls[1]!)).toEqual([-10, 4.6, -10, 5.4]);
    expect(ls.every((l) => l.start.z === 0 && l.end.z === 0)).toBe(true);
  });

  it('고도 2인 −Z 폴리선의 반원 세그먼트(OCS (6, 5)→(14, 5), 볼록도 1): 십자는 평면도 중심 (−10, 5)에 WCS Z −2', async () => {
    const h = harness();
    const p0 = lw([[6, 5, 1], [14, 5]], false, NEG_Z) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0);
    await h.run('CENTERMARK', [{ pick: p.handle, at: [-10, 1] }, '']);
    const ls = markLines(h, 0);
    expect(ls).toHaveLength(2);
    expect(seg(ls[0]!)).toEqual([-10.4, 5, -9.6, 5]);
    expect(seg(ls[1]!)).toEqual([-10, 4.6, -10, 5.4]);
    expect(ls.every((l) => l.start.z === -2 && l.end.z === -2)).toBe(true);
  });
});

describe('+Z 원·호·폴리선은 전과 같은 값', () => {
  it('DIMANGULAR 호·원(돌출 방향 없음·(0, 0, 1))', async () => {
    const h = harness();
    const a = h.add(arc(10, 25, 4, 0, 90));
    await h.run('DIMANGULAR', [{ pick: a.handle, at: [12.828, 27.828] }, '14,29']);
    let d = lastDim(h);
    expect(xy(d.defPoint4)).toEqual([10, 25]);
    expect(xy(d.defPoint2)).toEqual([14, 25]);
    expect(xy(d.defPoint3)).toEqual([10, 29]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(dimAssocOf(h.doc, d)!.data.refs.filter((r) => r)).toHaveLength(3);
    const c = h.add(circle(30, 25, 4, { x: 0, y: 0, z: 1 }));
    await h.run('DIMANGULAR', [{ pick: c.handle, at: [34, 25] }, '30,29', '36,31']);
    d = lastDim(h);
    expect(xy(d.defPoint4)).toEqual([30, 25]);
    expect(xy(d.defPoint2)).toEqual([34, 25]);
    expect(xy(d.defPoint3)).toEqual([30, 29]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    const refs = dimAssocOf(h.doc, d)!.data.refs;
    expect([!!refs[0], !!refs[1], !!refs[2]]).toEqual([true, false, true]);
    expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
  });

  it('CENTERMARK 원(고도 3)·호·폴리선 반원(고도 2)', async () => {
    const h = harness();
    const c0 = circle(50, 5, 4) as CircleEntity;
    c0.center.z = 3;
    const c = h.add(c0);
    await h.run('CENTERMARK', [{ pick: c.handle, at: [54, 5] }, '']);
    let ls = markLines(h, 0);
    expect(ls).toHaveLength(6);
    expect(seg(ls[0]!)).toEqual([49.6, 5, 50.4, 5]);
    expect(seg(ls[2]!)).toEqual([50.8, 5, 57.5, 5]);
    expect(ls.every((l) => l.start.z === 3 && l.end.z === 3)).toBe(true);
    const a = h.add(arc(10, 25, 4, 0, 90, { x: 0, y: 0, z: 1 }));
    await h.run('CENTERMARK', [{ pick: a.handle, at: [14, 25] }, '']);
    ls = markLines(h, 1);
    expect(ls).toHaveLength(2);
    expect(seg(ls[0]!)).toEqual([9.6, 25, 10.4, 25]);
    const p0 = lw([[6, 45, 1], [14, 45]]) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0);
    await h.run('CENTERMARK', [{ pick: p.handle, at: [10, 41] }, '']);
    ls = markLines(h, 2);
    expect(ls).toHaveLength(2);
    expect(seg(ls[0]!)).toEqual([9.6, 45, 10.4, 45]);
    expect(seg(ls[1]!)).toEqual([10, 44.6, 10, 45.4]);
    expect(ls.every((l) => l.start.z === 2 && l.end.z === 2)).toBe(true);
  });
});
