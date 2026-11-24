/**
 * 194차: DIMREASSOCIATE(치수 재연관)로 돌출 방향이 −Z인(대칭으로 뒤집힌) 원·호에 치수를 다시 연관하기(`app/dimassoc.ts` `reassociate`).
 * DXF 참조서의 OCS 쪽: CIRCLE·ARC의 중심(10)과 각도(50·51)는 객체 OCS 값이다. (0, 0, −1)이면 OCS X = WCS −X라 OCS 중심 (10, 5)인 −Z 원은
 * 평면도 (−10, 5)에 그려진다. Autodesk DIMREASSOCIATE 도움말: 고른 치수마다 그 치수 종류에 맞는 연관점 프롬프트를 내고(반지름·지름은 호 또는 원,
 * 각도는 정점 또는 호·원 선택), 고른 형상 객체에 정의점을 다시 연관한다. 같은 앱의 174~176차는 치수를 만들 때 −Z 원·호를 평면도 자리로
 * 옮겨 쓴다(`circleOf` — 평면도 중심·반시계 범위).
 * 고치기 전에는 재연관의 호 길이(ARC)·반지름·지름·각도 「호 또는 원 선택(S)」 갈래가 원·호의 중심·각도를 OCS 값 그대로 써, −Z 원·호를 고르면
 * 정의점이 X 거울상 자리로 옮겨졌고 그 점에는 연관 참조가 붙지 않았다(평면도 스냅 점과 맞지 않음). 이제 그 갈래들이 `circleOf`를 쓴다.
 * 각도 세 점 갈래는 점 스냅(평면도 스냅 후보)이라 이미 맞았고, +Z 원·호는 평면 사상이 항등이라 전과 같은 값이다.
 * 195차: 194차가 코드 읽기만 한 꺾기 반지름 치수(DIMJOGGED — 같은 반지름 갈래를 지남)의 −Z 원 재연관을 한 건 더 본다(맨 끝 절).
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, CircleEntity, DimensionEntity, Entity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimAssocCommands } from '../../src/app/dimassoc';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { type Input, makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, circle } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerDimAssocCommands(h.app);
  // 195차: 꺾기 반지름 치수(DIMJOGGED)를 만드는 명령
  registerAnnot2Commands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const lastDim = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'DIMENSION').at(-1) as DimensionEntity;
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
/** 연관 참조 칸 넷 가운데 붙은 칸(빈 칸은 거른다) */
const refsOn = (h: H, d: DimensionEntity) => (dimAssocOf(h.doc, d)?.data.refs ?? []).filter((r) => r);
/** 연관 참조 수가 n이고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, d: DimensionEntity, n: number) {
  expect(dimAssocOf(h.doc, d)).not.toBeNull();
  expect(refsOn(h, d)).toHaveLength(n);
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
/** 형상을 연관 따라가기 없이 바꾼 뒤 DIMREGEN이 맞춘 치수 */
function moveAndRegen(h: H, before: Entity, after: Entity, d: DimensionEntity): DimensionEntity | undefined {
  h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before, after }] });
  return regenAssociations(h.doc, () => h.st.session.newHandle()).dims.get(d.handle);
}
/** DIMASSOC 1(연관하지 않는 치수 객체)로 만든 치수 — 정의점은 DIMASSOC 2로 만든 것과 같은 자리(174·175차). 만든 뒤 2로 되돌린다 */
async function looseDim(h: H, cmd: string, inputs: Input[]): Promise<DimensionEntity> {
  h.doc.header.set('$DIMASSOC', 1);
  await h.run(cmd, inputs);
  h.doc.header.set('$DIMASSOC', 2);
  const d = lastDim(h);
  expect(dimAssocOf(h.doc, d)).toBeNull();
  return d;
}
/** DIMREASSOCIATE → 치수 d → 그 뒤 입력 */
async function reassoc(h: H, d: DimensionEntity, ...more: Input[]): Promise<DimensionEntity> {
  await h.run('DIMREASSOCIATE', [{ sel: [d.handle] }, ...more]);
  return h.doc.entityIndex.get(d.handle) as DimensionEntity;
}

describe('−Z 원(OCS 중심 (10, 5), 반지름 4 — 평면도 중심 (−10, 5))', () => {
  it('반지름 치수: 평면도 중심 (−10, 5)·현 위 점 (−14, 5)에 두 점 모두 연관, 원을 옮기면 따라간다(전에는 (10, 5)·(6, 5)로 옮기고 연관 없음)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z)) as CircleEntity;
    const d0 = await looseDim(h, 'DIMRADIUS', [{ pick: c.handle, at: [-14, 5] }, '-20,5']);
    expect([...xy(d0.defPoint), ...xy(d0.defPoint4)]).toEqual([-10, 5, -14, 5]);
    const d = await reassoc(h, d0, { pick: c.handle, at: [-10, 9] });
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect(xy(d.defPoint4)).toEqual([-14, 5]);
    expect(d.measurement).toBeCloseTo(4, 9);
    expectAssocHolds(h, d, 2);
    // OCS 중심 (12, 5) = 평면도 (−12, 5)로 옮기면 중심과 같은 각도의 현 위 점이 따라간다
    const m = moveAndRegen(h, c, { ...c, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(xy(m!.defPoint)).toEqual([-12, 5]);
    expect(xy(m!.defPoint4)).toEqual([-16, 5]);
  });

  it('다른 원에서 만든 반지름 치수를 −Z 원(OCS 중심 (40, 5), 반지름 6)에 다시 연관하면 평면도 중심 (−40, 5)·현 위 점 (−34, 5)(전에는 (40, 5)·(46, 5))', async () => {
    const h = harness();
    const a = h.add(circle(10, 5, 4)) as CircleEntity;
    const b = h.add(circle(40, 5, 6, NEG_Z)) as CircleEntity;
    const d0 = await looseDim(h, 'DIMRADIUS', [{ pick: a.handle, at: [14, 5] }, '20,5']);
    expect([...xy(d0.defPoint), ...xy(d0.defPoint4)]).toEqual([10, 5, 14, 5]);
    const d = await reassoc(h, d0, { pick: b.handle, at: [-46, 5] });
    expect(xy(d.defPoint)).toEqual([-40, 5]);
    expect(xy(d.defPoint4)).toEqual([-34, 5]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expectAssocHolds(h, d, 2);
  });

  it('지름 치수: 평면도 원의 양쪽 (−14, 5)·(−6, 5)에 두 점 모두 연관(전에는 (6, 5)·(14, 5)로 옮기고 연관 없음)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    const d0 = await looseDim(h, 'DIMDIAMETER', [{ pick: c.handle, at: [-14, 5] }, '-20,5']);
    expect([...xy(d0.defPoint4), ...xy(d0.defPoint)]).toEqual([-14, 5, -6, 5]);
    const d = await reassoc(h, d0, { pick: c.handle, at: [-10, 9] });
    expect(xy(d.defPoint4)).toEqual([-14, 5]);
    expect(xy(d.defPoint)).toEqual([-6, 5]);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, d, 2);
  });

  it('각도 치수 「호 또는 원 선택(S)」: 꼭짓점은 평면도 중심 (−10, 5), 첫 끝점은 고른 점 (−14, 5) — 중심·고른 점 연관, 원을 옮기면 따라간다(전에는 꼭짓점 (10, 5)·중심 연관 없음)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z)) as CircleEntity;
    const d0 = await looseDim(h, 'DIMANGULAR', [{ pick: c.handle, at: [-14, 5] }, '-10,9', '-16,11']);
    expect([...xy(d0.defPoint4), ...xy(d0.defPoint2), ...xy(d0.defPoint3)]).toEqual([-10, 5, -14, 5, -10, 9]);
    const d = await reassoc(h, d0, 'S', { pick: c.handle, at: [-14, 5] }, '');
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(xy(d.defPoint2)).toEqual([-14, 5]);
    expect(xy(d.defPoint3)).toEqual([-10, 9]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    // 참조 차례 [13 고른 점, 14 그대로 둔 점(연관 없음), 15 중심]
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

describe('−Z 호(OCS 중심 (10, 5), 반지름 4, OCS 0°~90° — 평면도 90°~180°)', () => {
  it('호 길이 치수: 평면도 반시계 시작 (−10, 9)·끝 (−14, 5)·중심 (−10, 5)에 세 점 모두 연관, 호를 옮기면 따라간다(전에는 (14, 5)·(10, 9)·(10, 5)로 옮기고 연관 없음)', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z)) as ArcEntity;
    const d0 = await looseDim(h, 'DIMARC', [{ pick: a.handle, at: [-12.828, 7.828] }, '-14,9']);
    expect([...xy(d0.defPoint2), ...xy(d0.defPoint3), ...xy(d0.defPoint4)]).toEqual([-10, 9, -14, 5, -10, 5]);
    const d = await reassoc(h, d0, { pick: a.handle, at: [-12.828, 7.828] });
    expect(xy(d.defPoint2)).toEqual([-10, 9]);
    expect(xy(d.defPoint3)).toEqual([-14, 5]);
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(d.measurement).toBeCloseTo(2 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
    const m = moveAndRegen(h, a, { ...a, center: { x: 12, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(xy(m!.defPoint2)).toEqual([-12, 9]);
    expect(xy(m!.defPoint3)).toEqual([-16, 5]);
    expect(xy(m!.defPoint4)).toEqual([-12, 5]);
    expect(m!.measurement).toBeCloseTo(2 * Math.PI, 9);
  });

  it('각도 치수 「호 또는 원 선택(S)」: 꼭짓점 (−10, 5)·끝점 (−10, 9)·(−14, 5)에 세 점 모두 연관(전에는 (10, 5)·(14, 5)·(10, 9)로 옮기고 연관 없음)', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z));
    const d0 = await looseDim(h, 'DIMANGULAR', [{ pick: a.handle, at: [-12.828, 7.828] }, '-16,11']);
    expect([...xy(d0.defPoint4), ...xy(d0.defPoint2), ...xy(d0.defPoint3)]).toEqual([-10, 5, -10, 9, -14, 5]);
    const d = await reassoc(h, d0, 'S', { pick: a.handle, at: [-12.828, 7.828] });
    expect(xy(d.defPoint4)).toEqual([-10, 5]);
    expect(xy(d.defPoint2)).toEqual([-10, 9]);
    expect(xy(d.defPoint3)).toEqual([-14, 5]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expectAssocHolds(h, d, 3);
  });

  it('각도 치수 세 점(이미 맞음): 꼭짓점은 그대로 두고 두 끝점을 끝점 스냅으로 찍으면 평면도 끝점 (−10, 9)·(−14, 5)에 두 점 연관', async () => {
    const h = harness();
    const a = h.add(arc(10, 5, 4, 0, 90, NEG_Z));
    const d0 = await looseDim(h, 'DIMANGULAR', [{ pick: a.handle, at: [-12.828, 7.828] }, '-16,11']);
    const d = await reassoc(h, d0, '', { click: [-10, 9], snap: 'end' }, { click: [-14, 5], snap: 'end' });
    expect([...xy(d.defPoint4), ...xy(d.defPoint2), ...xy(d.defPoint3)]).toEqual([-10, 5, -10, 9, -14, 5]);
    const refs = dimAssocOf(h.doc, d)!.data.refs;
    expect([!!refs[0], !!refs[1], !!refs[2]]).toEqual([true, true, false]);
    expectAssocHolds(h, d, 2);
  });
});

describe('+Z 원·호는 전과 같은 값', () => {
  it('반지름·지름: 같은 원이면 그 자리에 연관 둘, 다른 원(중심 (40, 5), 반지름 6)이면 같은 각도로 옮겨 (40, 5)·(46, 5)', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, { x: 0, y: 0, z: 1 }));
    const b = h.add(circle(40, 5, 6));
    let d = await reassoc(h, await looseDim(h, 'DIMRADIUS', [{ pick: c.handle, at: [14, 5] }, '20,5']), { pick: c.handle, at: [10, 9] });
    expect([...xy(d.defPoint), ...xy(d.defPoint4)]).toEqual([10, 5, 14, 5]);
    expect(refsOn(h, d)).toHaveLength(2);
    d = await reassoc(h, await looseDim(h, 'DIMDIAMETER', [{ pick: c.handle, at: [14, 5] }, '20,5']), { pick: c.handle, at: [10, 9] });
    expect([...xy(d.defPoint4), ...xy(d.defPoint)]).toEqual([14, 5, 6, 5]);
    expect(refsOn(h, d)).toHaveLength(2);
    d = await reassoc(h, await looseDim(h, 'DIMRADIUS', [{ pick: c.handle, at: [14, 5] }, '20,5']), { pick: b.handle, at: [46, 5] });
    expect([...xy(d.defPoint), ...xy(d.defPoint4)]).toEqual([40, 5, 46, 5]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expect(refsOn(h, d)).toHaveLength(2);
    expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
  });

  it('호 길이·각도 「호 또는 원 선택(S)」: 호(중심 (10, 25), 0°~90°)는 OCS 시작 (14, 25)·끝 (10, 29)·중심, 원은 중심 (10, 5)·고른 점 (14, 5)', async () => {
    const h = harness();
    const a = h.add(arc(10, 25, 4, 0, 90));
    const c = h.add(circle(10, 5, 4));
    let d = await reassoc(h, await looseDim(h, 'DIMARC', [{ pick: a.handle, at: [12.828, 27.828] }, '14,29']), { pick: a.handle, at: [12.828, 27.828] });
    expect([...xy(d.defPoint2), ...xy(d.defPoint3), ...xy(d.defPoint4)]).toEqual([14, 25, 10, 29, 10, 25]);
    expect(refsOn(h, d)).toHaveLength(3);
    d = await reassoc(h, await looseDim(h, 'DIMANGULAR', [{ pick: a.handle, at: [12.828, 27.828] }, '16,31']), 'S', { pick: a.handle, at: [12.828, 27.828] });
    expect([...xy(d.defPoint4), ...xy(d.defPoint2), ...xy(d.defPoint3)]).toEqual([10, 25, 14, 25, 10, 29]);
    expect(refsOn(h, d)).toHaveLength(3);
    d = await reassoc(h, await looseDim(h, 'DIMANGULAR', [{ pick: c.handle, at: [14, 5] }, '10,9', '16,11']), 'S', { pick: c.handle, at: [14, 5] }, '');
    expect([...xy(d.defPoint4), ...xy(d.defPoint2), ...xy(d.defPoint3)]).toEqual([10, 5, 14, 5, 10, 9]);
    expect(refsOn(h, d)).toHaveLength(2);
    expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
  });
});

describe('195차 — 꺾기 반지름 치수(DIMJOGGED)의 −Z 원 재연관(194차가 코드 읽기만 한 반지름 갈래)', () => {
  it('+Z 원(중심 (10, 5), 반지름 4)에서 만든 꺾기 치수를 −Z 원(OCS 중심 (40, 5), 반지름 6)에: 평면도 중심 (−40, 5)·현 위 점 (−34, 5)에 두 점 연관, 재지정 중심·꺾기 점은 중심과 함께 (−50, 0) 옮기고, 원을 옮기면 따라간다', async () => {
    const h = harness();
    const a = h.add(circle(10, 5, 4)) as CircleEntity;
    const b = h.add(circle(40, 5, 6, NEG_Z)) as CircleEntity;
    // 고른 점 (14, 5), 재지정 중심 (20, −5), 치수선 위치 (20, 5) — 현 위 점은 중심에서 (20, 5) 쪽 (14, 5), 꺾기 위치 (17, 0)
    const d0 = await looseDim(h, 'DIMJOGGED', [{ pick: a.handle, at: [14, 5] }, '20,-5', '20,5', '17,0']);
    expect(d0.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect([...xy(d0.defPoint), ...xy(d0.defPoint4), ...xy(d0.defPoint2)]).toEqual([10, 5, 14, 5, 20, -5]);
    const jog0 = { x: d0.defPoint3.x, y: d0.defPoint3.y };
    const d = await reassoc(h, d0, { pick: b.handle, at: [-46, 5] });
    expect(xy(d.defPoint)).toEqual([-40, 5]);
    expect(xy(d.defPoint4)).toEqual([-34, 5]);
    expect(d.measurement).toBeCloseTo(6, 9);
    expect(xy(d.defPoint2)).toEqual([-30, -5]);
    expect(xy(d.defPoint3)).toEqual(xy({ x: jog0.x - 50, y: jog0.y }));
    expectAssocHolds(h, d, 2);
    // OCS 중심 (42, 5) = 평면도 (−42, 5)로 옮기면 중심·현 위 점·재지정 중심이 (−2, 0) 따라간다
    const m = moveAndRegen(h, b, { ...b, center: { x: 42, y: 5, z: 0 } }, d);
    expect(m).toBeDefined();
    expect(xy(m!.defPoint)).toEqual([-42, 5]);
    expect(xy(m!.defPoint4)).toEqual([-36, 5]);
    expect(xy(m!.defPoint2)).toEqual([-32, -5]);
  });
});
