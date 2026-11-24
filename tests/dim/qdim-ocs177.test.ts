/**
 * 177차: 돌출 방향이 −Z인(대칭으로 뒤집힌) 원·호·폴리선·블록 참조를 고르는 QDIM(`edit/annot/qdim.ts` `qdimGeometry`).
 * DXF 참조서의 OCS 쪽: CIRCLE·ARC의 중심(10)과 각도(50·51), LWPOLYLINE의 꼭짓점(10)·고도(38), 2D POLYLINE의 정점, INSERT의 삽입점(10)은
 * 객체 OCS 값이고, LINE의 끝점과 POINT의 위치(10)는 WCS 값이다. (0, 0, −1)이면 OCS X = WCS −X라 OCS 중심 (10, 5)인 −Z 원은 평면도 (−10, 5)에 그려진다.
 * Autodesk QDIM 도움말: 고른 객체의 끝점·중심(원·호)으로 연속·다중·기준선·세로좌표·반지름·지름 치수를 한꺼번에 만든다.
 * 고치기 전에는 OCS 값을 평면도 자리로 그대로 써 치수 점·원 중심이 X 거울상 자리에 생겼다(연관도 붙지 않았고, 편집(E)도 그 자리를 봤다).
 * 이제 174~176차의 평면 사상(`circleOf`·`lwPlanVertices` — `edit/geom/ocs.ts`)을 함께 쓴다. 선·점과 +Z·기운 돌출 방향은 전과 같은 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, DimensionEntity, Entity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerAnnot2Misc } from '../../src/app/annot2-misc';
import { type QdimGeometry, qdimGeometry } from '../../src/edit/annot/qdim';
import { dimAssocOf, regenAssociations } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, arc, circle, line, lw, poly2d } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerAnnot2Misc(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const xy = (p: { x: number; y: number }) => [Number(p.x.toFixed(9)) + 0, Number(p.y.toFixed(9)) + 0];
/** 치수보조선 원점 둘(13·14) */
const origins = (d: DimensionEntity) => [...xy(d.defPoint2), ...xy(d.defPoint3)];
const pts = (g: QdimGeometry) => g.points.map(xy);
const circs = (g: QdimGeometry) => g.circles.map((c) => [...xy(c.c), Number(c.r.toFixed(9))]);
/** 치수마다 연관 참조 수가 n이고, 지금 형상으로 다시 맞춰도(DIMREGEN) 치수가 움직이지 않는다 */
function expectAssocHolds(h: H, ds: readonly DimensionEntity[], n: number) {
  for (const d of ds) {
    const a = dimAssocOf(h.doc, d);
    expect(a).not.toBeNull();
    expect(a!.data.refs.filter((r) => r)).toHaveLength(n);
  }
  expect(regenAssociations(h.doc, () => h.st.session.newHandle()).dims.size).toBe(0);
}
function insert(x: number, y: number, ext?: { x: number; y: number; z: number }): Entity {
  return {
    type: 'INSERT',
    ...entityDefaults(),
    handle: `I${x}_${y}`,
    block: 'B',
    insert: { x, y, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: [],
    extrusion: ext,
  } as Entity;
}

describe('QDIM 치수 점: −Z 객체는 평면도 자리', () => {
  it('−Z 호는 OCS 시작·끝 각도의 점을 평면도 (−34, 5)·(−30, 9)로, 원 중심 (−30, 5) / −Z 폴리선 볼록도 세그먼트 원은 평면도 중심 (−20, 5)', () => {
    const g = qdimGeometry([arc(30, 5, 4, 0, 90, NEG_Z), lw([[0, 0], [20, 0, 1], [20, 10]], false, NEG_Z)]);
    expect(pts(g)).toEqual([
      [-34, 5],
      [-30, 9],
      [0, 0],
      [-20, 0],
      [-20, 10],
    ]);
    expect(circs(g)).toEqual([
      [-30, 5, 4],
      [-20, 5, 5],
    ]);
  });

  it('−Z 블록 참조 삽입점·−Z 2D 폴리선 정점은 평면도 자리, POINT 위치(WCS)는 그대로', () => {
    const pl = { ...poly2d([[2, 0], [8, 0]]), extrusion: NEG_Z } as Entity;
    const pt = { type: 'POINT', ...entityDefaults(), handle: 'P1', position: { x: 5, y: 5, z: 0 }, angle: 0, extrusion: NEG_Z } as Entity;
    expect(pts(qdimGeometry([insert(3, 1, NEG_Z), pl, pt]))).toEqual([
      [-3, 1],
      [-2, 0],
      [-8, 0],
      [5, 5],
    ]);
  });
});

describe('QDIM 명령: −Z 원·호·폴리선', () => {
  it('연속(C) −Z 원·호: 평면도 원 중심 (−10, 5)과 호 끝점 (−34, 5)·(−30, 9) 사이 두 치수, 모두 연관, 호를 옮기면 따라간다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    const a = h.add(arc(30, 5, 4, 0, 90, NEG_Z)) as ArcEntity;
    await h.run('QDIM', [{ sel: [c.handle, a.handle] }, '-20,20']);
    const ds = dims(h);
    expect(ds).toHaveLength(2);
    expect(ds.map(origins)).toEqual([
      [-34, 5, -30, 9],
      [-30, 9, -10, 5],
    ]);
    expect(ds.map((d) => Number(d.measurement.toFixed(9)))).toEqual([4, 20]);
    expect(ds.every((d) => d.rotation === 0)).toBe(true);
    expectAssocHolds(h, ds, 2);
    // OCS 중심 (32, 5) = 평면도 (−32, 5)로 옮기면 호 끝점의 원점이 따라간다
    h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before: a, after: { ...a, center: { x: 32, y: 5, z: 0 } } }] });
    const m = regenAssociations(h.doc, () => h.st.session.newHandle()).dims;
    expect(origins(m.get(ds[0]!.handle)!)).toEqual([-36, 5, -32, 9]);
    expect(origins(m.get(ds[1]!.handle)!)).toEqual([-32, 9, -10, 5]);
  });

  it('기준선(B) −Z 폴리선: 평면도 꼭짓점 (−20, 11)에서 (−14, 5)·(−6, 5)까지, 연관, 폴리선을 옮기면 따라간다', async () => {
    const h = harness();
    const p0 = lw([[6, 5], [14, 5], [14, 11], [20, 11]], false, NEG_Z) as LwPolylineEntity;
    p0.elevation = 2;
    const p = h.add(p0) as LwPolylineEntity;
    await h.run('QDIM', [{ sel: [p.handle] }, 'B', '-10,20']);
    const ds = dims(h);
    expect(ds.map(origins)).toEqual([
      [-20, 11, -14, 5],
      [-20, 11, -6, 5],
    ]);
    expect(ds.map((d) => Number(d.measurement.toFixed(9)))).toEqual([6, 14]);
    expectAssocHolds(h, ds, 2);
    // OCS X로 +2 옮기면(WCS −2) 같은 꼭짓점을 따라간다
    const moved = lw([[8, 5], [16, 5], [16, 11], [22, 11]], false, NEG_Z) as LwPolylineEntity;
    h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before: p, after: { ...p, verts: moved.verts } }] });
    const m = regenAssociations(h.doc, () => h.st.session.newHandle()).dims;
    expect(origins(m.get(ds[0]!.handle)!)).toEqual([-22, 11, -16, 5]);
    expect(origins(m.get(ds[1]!.handle)!)).toEqual([-22, 11, -8, 5]);
  });

  it('세로좌표(O) −Z 원과 선: 원의 평면도 중심 (−10, 5)과 선 끝점 (0, 0)이 지형지물 점, 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    const l = h.add(line(0, 0, 0, 10));
    await h.run('QDIM', [{ sel: [c.handle, l.handle] }, 'O', '-5,20']);
    const ds = dims(h);
    expect(ds.map((d) => [...xy(d.defPoint2), ...xy(d.defPoint3)])).toEqual([
      [-10, 5, -10, 20],
      [0, 0, 0, 20],
    ]);
    expect(ds.every((d) => (d.dimType & 64) !== 0)).toBe(true);
    // 세로좌표는 지형지물 점(13)만 잇는다
    expectAssocHolds(h, ds, 1);
  });

  it('반지름(R)·지름(D): −Z 원·호·폴리선 호 세그먼트의 평면도 중심에, 두 점 모두 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    await h.run('QDIM', [{ sel: [c.handle] }, 'R', '-10,12']);
    let d = dims(h).at(-1)!;
    expect(d.dimType & 7).toBe(4);
    expect(xy(d.defPoint)).toEqual([-10, 5]);
    expect(xy(d.defPoint4)).toEqual([-10, 9]);
    expect(d.measurement).toBeCloseTo(4, 9);
    const a = h.add(arc(30, 5, 4, 0, 90, NEG_Z));
    await h.run('QDIM', [{ sel: [a.handle] }, 'R', '-34,9']);
    d = dims(h).at(-1)!;
    expect(xy(d.defPoint)).toEqual([-30, 5]);
    expect(d.defPoint4.x).toBeCloseTo(-30 - 2 * Math.SQRT2, 9);
    expect(d.defPoint4.y).toBeCloseTo(5 + 2 * Math.SQRT2, 9);
    const p = h.add(lw([[0, 40], [20, 40, 1], [20, 50]], false, NEG_Z));
    await h.run('QDIM', [{ sel: [p.handle] }, 'R', '-30,45']);
    d = dims(h).at(-1)!;
    expect(xy(d.defPoint)).toEqual([-20, 45]);
    expect(xy(d.defPoint4)).toEqual([-25, 45]);
    expect(d.measurement).toBeCloseTo(5, 9);
    const c2 = h.add(circle(10, 25, 4, NEG_Z));
    await h.run('QDIM', [{ sel: [c2.handle] }, 'D', '-20,25']);
    d = dims(h).at(-1)!;
    expect(d.dimType & 7).toBe(3);
    expect(xy(d.defPoint4)).toEqual([-14, 25]);
    expect(xy(d.defPoint)).toEqual([-6, 25]);
    expect(d.measurement).toBeCloseTo(8, 9);
    expectAssocHolds(h, dims(h), 2);
  });

  it('편집(E): 평면도 원 중심 (−10, 5)을 찍어 치수 점에서 지운다', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4, NEG_Z));
    const l = h.add(line(0, 0, 20, 0));
    await h.run('QDIM', [{ sel: [c.handle, l.handle] }, 'E', '-10,5', 'X', '10,10']);
    expect(h.printed).toContain('치수 점 하나가 제거됨');
    const ds = dims(h);
    expect(ds.map(origins)).toEqual([[0, 0, 20, 0]]);
  });
});

describe('선·점과 +Z·기운 돌출 방향은 전과 같은 값', () => {
  it('qdimGeometry: (0, 0, 1) 원·+Z 호·고도 있는 +Z 폴리선·+Z 2D 폴리선·+Z 블록 참조·기운 돌출 방향 원은 OCS 값 그대로', () => {
    const p0 = lw([[6, 5], [14, 5, 1], [14, 11]]) as LwPolylineEntity;
    p0.elevation = 2;
    const g = qdimGeometry([circle(10, 5, 4, { x: 0, y: 0, z: 1 }), arc(30, 5, 4, 0, 90), p0, poly2d([[2, -10], [8, -10]]), insert(3, 1), circle(50, 5, 4, { x: 1, y: 0, z: 0 })]);
    expect(pts(g)).toEqual([
      [10, 5],
      [34, 5],
      [30, 9],
      [6, 5],
      [14, 5],
      [14, 11],
      [2, -10],
      [8, -10],
      [3, 1],
      [50, 5],
    ]);
    expect(circs(g)).toEqual([
      [10, 5, 4],
      [30, 5, 4],
      [14, 8, 3],
      [50, 5, 4],
    ]);
  });

  it('QDIM 연속(C) +Z 원·호: 원 중심 (10, 5)과 호 끝점 (30, 9)·(34, 5) 사이 두 치수, 모두 연관', async () => {
    const h = harness();
    const c = h.add(circle(10, 5, 4));
    const a = h.add(arc(30, 5, 4, 0, 90));
    await h.run('QDIM', [{ sel: [c.handle, a.handle] }, '20,20']);
    const ds = dims(h);
    expect(ds.map(origins)).toEqual([
      [10, 5, 30, 9],
      [30, 9, 34, 5],
    ]);
    expectAssocHolds(h, ds, 2);
  });
});
