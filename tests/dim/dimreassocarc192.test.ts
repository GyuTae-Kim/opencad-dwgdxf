/**
 * 192차: DIMREASSOCIATE(치수 재연관)로 호 길이 치수(DIMARC)를 폴리선 호 세그먼트에 다시 연관하기(`app/dimassoc.ts`).
 * Autodesk DIMREASSOCIATE 도움말: 고른 치수마다 그 치수 종류에 맞는 연관점 프롬프트를 낸다. 이 앱의 호 길이 갈래 프롬프트는 AutoCAD 2026 한국어판대로
 * 「호 또는 폴리선 호 세그먼트 선택 <다음>:」이고, Autodesk DIMARC 도움말의 첫 프롬프트도 호 또는 폴리선 호 세그먼트를 고르며, 호 길이 치수 작성 도움말은
 * 호 또는 폴리선 호 세그먼트를 따라 잰 거리라고 적는다. 연관 치수 도움말이 연관하지 않는 객체로 적은 것(해치·이미지·언더레이·다중선·2D 솔리드·두께 있는 객체)에
 * 폴리선은 없다. 고치기 전에는 고르기 거르개가 ARC만 받아 폴리선을 고르면 「객체를 다시 선택하십시오.」만 했다 — 182차부터 DIMARC가 폴리선 호 세그먼트에
 * 연관 없이 만드는 치수를 다시 연관할 길이 없었다. 이제 고른 점에 가장 가까운 세그먼트가 호면(182차 `polyArcOf` — DIMARC 만들기와 같은 고르기,
 * 맞춤이 아닌 2D POLYLINE도, −Z 폴리선은 평면도) 그 호의 반시계 시작·끝·중심으로 정의점을 옮기고, ARC와 같은 세 참조(두 끝점·중심)를 고른 세그먼트 번호
 * 표지로 붙인다. ARC를 고른 결과, 직선 세그먼트·원·맞춤 꼴·3D 폴리선의 다시 선택은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, LwPolylineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimAssocCommands } from '../../src/app/dimassoc';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { type Input, makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, circle, lw, poly2d } from '../edit/make';

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
/** 호 길이 치수의 시작(13)·끝(14)·중심(15) */
const arcPts = (d: DimensionEntity) => [...xy(d.defPoint2), ...xy(d.defPoint3), ...xy(d.defPoint4)];
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

/** (0, 0)→(10, 0) 직선, (10, 0)→(20, 0) 볼록도 1(반시계 반원 — 중심 (15, 0), 반지름 5, (15, −5)를 지난다) — 182차 시험과 같은 폴리선 */
const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];

/** HALF를 Y로 −40 옮긴 폴리선에서 DIMARC로 만든(연관 없는 — 182차) 호 길이 치수: 시작 (10, −40)·끝 (20, −40)·중심 (15, −40), 값 5π */
async function looseArcDim(h: H): Promise<DimensionEntity> {
  const src = h.add(lw([[0, -40], [10, -40, 1], [20, -40]]));
  await h.run('DIMARC', [{ pick: src.handle, at: [15, -45] }, '15,-48']);
  const d = dimsOf(h).at(-1)!;
  expect(d.subtype).toBe('ARC_DIMENSION');
  expect(arcPts(d)).toEqual([10, -40, 20, -40, 15, -40]);
  expect(dimAssocOf(h.doc, d)).toBeNull();
  return d;
}
/** DIMREASSOCIATE → 치수 d → 호 고르기(그 뒤 입력이 있으면 이어서) */
async function reassoc(h: H, d: DimensionEntity, pick: Input, ...more: Input[]): Promise<DimensionEntity> {
  await h.run('DIMREASSOCIATE', [{ sel: [d.handle] }, pick, ...more]);
  return h.doc.entityIndex.get(d.handle) as DimensionEntity;
}

describe('폴리선 호 세그먼트를 고르면 그 호에 정의점을 옮기고 두 끝점·중심에 연관한다', () => {
  it('경량 폴리선 반시계 세그먼트: (15, −5)를 고르면 시작 (10, 0)·끝 (20, 0)·중심 (15, 0), 값 5π, 연관 셋, 폴리선을 옮기면 따라간다(전에는 다시 선택)', async () => {
    const h = harness();
    const p = h.add(lw(HALF)) as LwPolylineEntity;
    const d = await reassoc(h, await looseArcDim(h), { pick: p.handle, at: [15, -5] });
    expect(arcPts(d)).toEqual([10, 0, 20, 0, 15, 0]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
    expect(h.printed).not.toContain(AGAIN);
    const moved = lw([[2, 0], [12, 0, 1], [22, 0]]) as LwPolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: moved.verts }, d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([12, 0, 22, 0, 17, 0]);
  });

  it('시계 세그먼트(볼록도 −1)는 DIMARC처럼 반시계로 바꿔 시작 (10, 30)·끝 (0, 30)·중심 (5, 30)', async () => {
    const h = harness();
    const p = h.add(lw([[0, 30, -1], [10, 30]]));
    const d = await reassoc(h, await looseArcDim(h), { pick: p.handle, at: [5, 35] });
    expect(arcPts(d)).toEqual([10, 30, 0, 30, 5, 30]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
  });

  it('맞춤이 아닌 2D POLYLINE은 같은 모양의 경량 폴리선과 같은 정의점·연관 수', async () => {
    const h = harness();
    const p = h.add(poly2d(HALF)) as PolylineEntity;
    const q = h.add(lw(HALF));
    const dp = await reassoc(h, await looseArcDim(h), { pick: p.handle, at: [15, -5] });
    const dq = await reassoc(h, await looseArcDim(h), { pick: q.handle, at: [15, -5] });
    expect(arcPts(dp)).toEqual([10, 0, 20, 0, 15, 0]);
    expect(arcPts(dq)).toEqual(arcPts(dp));
    expect(dp.measurement).toBeCloseTo(5 * Math.PI, 9);
    expect(dimAssocOf(h.doc, dp)!.data.refs.filter((r) => r)).toHaveLength(3);
    expectAssocHolds(h, dq, 3);
  });

  it('−Z 경량 폴리선은 평면도 호(OCS X = WCS −X): 평면도 (−15, −5)를 고르면 시작 (−20, 0)·끝 (−10, 0)·중심 (−15, 0)', async () => {
    const h = harness();
    const p = h.add(lw(HALF, false, NEG_Z));
    const d = await reassoc(h, await looseArcDim(h), { pick: p.handle, at: [-15, -5] });
    expect(arcPts(d)).toEqual([-20, 0, -10, 0, -15, 0]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
  });

  it('중심이 같은 반원 둘(닫힌 볼록도 1·1 — 도넛 꼴)의 둘째를 고르면 세 참조가 둘째 세그먼트 표지(2)이고, 둘째만 바뀌어도 그 중심을 따라간다', async () => {
    const h = harness();
    const p = h.add(lw([[0, 0, 1], [10, 0, 1]], true)) as LwPolylineEntity;
    const d = await reassoc(h, await looseArcDim(h), { pick: p.handle, at: [5, 5] });
    expect(arcPts(d)).toEqual([10, 0, 0, 0, 5, 0]);
    expect(dimAssocOf(h.doc, d)!.data.refs.filter((r) => r).map((r) => r!.gsMarker)).toEqual([2, 2, 2]);
    expectAssocHolds(h, d, 3);
    // 둘째 세그먼트 볼록도 0.5: 반지름 6.25, 중심 (5, −3.75) — 첫째 세그먼트(중심 (5, 0))는 그대로
    const edited = lw([[0, 0, 1], [10, 0, 0.5]], true) as LwPolylineEntity;
    const m = moveAndRegen(h, p, { ...p, verts: edited.verts }, d);
    expect(m).toBeDefined();
    expect(arcPts(m!)).toEqual([10, 0, 0, 0, 5, -3.75]);
    expect(m!.measurement).toBeCloseTo(6.25 * 4 * Math.atan(0.5), 9);
  });
});

describe('전과 같은 꼴', () => {
  it('ARC는 그 시작·끝·중심에 연관(OCS 시작 각도의 점이 시작)', async () => {
    const h = harness();
    const a = h.add(arc(5, 60, 5, 0, 180));
    const d = await reassoc(h, await looseArcDim(h), { pick: a.handle, at: [5, 65] });
    expect(arcPts(d)).toEqual([10, 60, 0, 60, 5, 60]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    expectAssocHolds(h, d, 3);
  });

  it('직선 세그먼트, 원, 곡선 맞춤 2D POLYLINE, 3D 폴리선은 다시 선택하게 하고 치수는 그대로', async () => {
    const h = harness();
    const plain = h.add(lw(HALF));
    const c = h.add(circle(50, 0, 5));
    const fit = h.add(poly2d(HALF)) as PolylineEntity;
    fit.flags |= 2;
    const p3 = h.add(poly2d(HALF)) as PolylineEntity;
    p3.kind = '3d';
    p3.flags |= 8;
    const d0 = await looseArcDim(h);
    const picks: Input[] = [
      { pick: plain.handle, at: [5, 0] },
      { pick: c.handle, at: [55, 0] },
      { pick: fit.handle, at: [15, -5] },
      { pick: p3.handle, at: [15, -5] },
    ];
    for (const pick of picks) {
      const d = await reassoc(h, d0, pick, '');
      expect(arcPts(d)).toEqual([10, -40, 20, -40, 15, -40]);
      expect(dimAssocOf(h.doc, d)).toBeNull();
    }
    expect(h.printed.filter((t) => t === AGAIN)).toHaveLength(4);
  });
});
