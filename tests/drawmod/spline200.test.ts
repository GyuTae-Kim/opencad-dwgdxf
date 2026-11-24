/**
 * 200차: SPLINE 객체(O)·SPLINEDIT가 돌출 방향이 +Z가 아닌 2D 스플라인 맞춤 폴리선을 화면의 같은 자리에 있는 스플라인으로 바꾼다.
 * 근거 — Autodesk SPLINE 도움말 「객체」·SPLINEDIT 도움말 「스플라인 선택」: 스플라인 맞춤 폴리선을 같은 곡선의 스플라인으로 바꾼다.
 * DXF 참조서: 2D 폴리선의 정점·고도는 객체 좌표계(OCS) 값이고, SPLINE의 조정점은 WCS 값이다.
 * 전에는 OCS 틀 정점을 WCS 조정점으로 그대로 써서 −Z 폴리선이면 X 거울상 자리·고도 부호가 반대인 곳에 스플라인이 생겼다.
 * 돌출 방향 (1, 0, 0)의 OCS 축(임의 축 알고리즘)은 X = WCS Y, Y = WCS Z, Z = WCS X라 OCS (x, y, 고도) = WCS (고도, x, y)다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, PolylineEntity, SplineEntity } from '../../src/core/model';
import { registerDrawCommands } from '../../src/app/draw';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { unpack3 } from '../../src/core/flat3';
import { packPoly, polyVertices } from '../../src/core/polyverts';
import { splineFromFitPolyline } from '../../src/edit/geom/drawgeom';
import { nurbsPoint } from '../../src/edit/geom/nurbs';
import { entityPath, splineNurbs } from '../../src/edit/geom/path';
import { pathNearest } from '../../src/edit/geom/curve';
import { splinePolyline } from '../../src/edit/geom/pedit';
import { poly2d } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from './groups';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

function harness() {
  const h = perCommandGroups(makeHarness());
  registerDrawCommands(h.app);
  registerPeditCommands(h.app);
  return h;
}

const FRAME: [number, number][] = [
  [1, 40],
  [5, 45],
  [10, 40],
  [15, 45],
];

/** 3차 스플라인 맞춤 2D 폴리선(돌출 방향·고도를 따로 줌) */
function fitPoly(extra: Partial<PolylineEntity> = {}): Entity {
  return { ...splinePolyline(poly2d(FRAME) as never, 6), handle: '', layer: '0', ...extra } as Entity;
}

/** 조정점이 기대한 WCS 점과 같은지 */
function ctrlIs(s: SplineEntity, want: { x: number; y: number; z: number }[]): void {
  const got = unpack3(s.controlVerts);
  expect(got.length).toBe(want.length);
  got.forEach((q, i) => {
    close(q.x, want[i]!.x);
    close(q.y, want[i]!.y);
    close(q.z, want[i]!.z);
  });
}

describe('SPLINE 객체(O) — −Z·기운 2D 스플라인 맞춤 폴리선(200차)', () => {
  it('−Z 폴리선은 화면에 그려진 자리(X 거울상 OCS → WCS)·고도 부호대로 스플라인이 된다', async () => {
    const h = harness();
    const pl = h.add(fitPoly({ extrusion: { x: 0, y: 0, z: -1 }, elevation: 2 })) as PolylineEntity;
    const flat = splineFromFitPolyline({ ...pl, extrusion: undefined, elevation: 2 } as Entity)!;
    await h.run('SPLINE', ['O', { sel: [pl.handle] }]);
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(0);
    const [s] = modelEntities(h.doc, 'SPLINE');
    expect(s).toBeTruthy();
    expect(s!.degree).toBe(3);
    expect(s!.knots).toEqual(flat.knots);
    ctrlIs(s!, FRAME.map(([x, y]) => ({ x: -x, y, z: -2 })));
    expect(s!.flags & 8).toBe(8);
    const n = splineNurbs(s!)!;
    const p0 = nurbsPoint(n, n.knots[n.degree]!);
    close(p0.x, -1);
    close(p0.y, 40);
    close(p0.z, -2);
    // 폴리선이 그린 근사 정점(OCS)을 WCS 평면도로 옮기면 모두 스플라인 위
    const path = entityPath(s!)!;
    const gen = polyVertices(pl).filter((v) => v.flags & 8);
    expect(gen.length).toBeGreaterThan(4);
    for (const v of gen) expect(pathNearest(path, { x: -v.location.x, y: v.location.y }).d).toBeLessThan(1e-7);
  });

  it('돌출 방향 (1, 0, 0)의 폴리선은 OCS → WCS 3D 변환으로 세운 평면 위에 놓인다', async () => {
    const h = harness();
    const pl = h.add(fitPoly({ extrusion: { x: 1, y: 0, z: 0 }, elevation: 3 })) as PolylineEntity;
    await h.run('SPLINE', ['O', { sel: [pl.handle] }]);
    const [s] = modelEntities(h.doc, 'SPLINE');
    expect(s).toBeTruthy();
    ctrlIs(s!, FRAME.map(([x, y]) => ({ x: 3, y: x, z: y })));
    // 조정점 Z가 달라 평면 비트(8)는 3D 폴리선 갈래와 같이 지운다
    expect(s!.flags & 8).toBe(0);
  });

  it('전과 같은 값: +Z 2D 폴리선(고도 포함)과 3D 폴리선', async () => {
    const h = harness();
    const pl = h.add(fitPoly({ elevation: 2 })) as PolylineEntity;
    await h.run('SPLINE', ['O', { sel: [pl.handle] }]);
    const [s] = modelEntities(h.doc, 'SPLINE');
    expect([...s!.controlVerts]).toEqual(FRAME.flatMap(([x, y]) => [x, y, 2]));
    expect(s!.flags & 8).toBe(8);
    const z = [0, 1, 3, 2];
    const p3 = { ...poly2d(FRAME), kind: '3d', flags: 8, ...packPoly(FRAME.map(([x, y], i) => ({ location: { x, y, z: z[i]! }, bulge: 0, startWidth: 0, endWidth: 0, flags: 32 }))) } as PolylineEntity;
    const h3 = harness();
    const pl3 = h3.add({ ...splinePolyline(p3 as never, 6), handle: '' } as Entity) as PolylineEntity;
    await h3.run('SPLINE', ['O', { sel: [pl3.handle] }]);
    const [s3] = modelEntities(h3.doc, 'SPLINE');
    expect([...s3!.controlVerts]).toEqual(FRAME.flatMap(([x, y], i) => [x, y, z[i]!]));
    expect(s3!.flags & 8).toBe(0);
  });
});

describe('SPLINEDIT — −Z·기운 2D 스플라인 맞춤 폴리선도 스플라인으로(200차, 199차의 「+Z만」 막음을 걷음)', () => {
  it('−Z·(1, 0, 0) 폴리선을 고르고 바로 끝내면 SPLINE 객체(O)와 같은 자리의 SPLINE', async () => {
    const h = harness();
    const neg = h.add(fitPoly({ extrusion: { x: 0, y: 0, z: -1 }, elevation: 2 })) as PolylineEntity;
    await h.run('SPLINEDIT', [{ pick: neg.handle, at: [-1, 40] }, '']);
    expect(h.printed).not.toContain('스플라인이 아닙니다.');
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(0);
    let [s] = modelEntities(h.doc, 'SPLINE');
    expect(s).toBeTruthy();
    ctrlIs(s!, FRAME.map(([x, y]) => ({ x: -x, y, z: -2 })));
    // 명령 전체는 U 한 번으로 되돌린다
    h.st.session.undo();
    expect(modelEntities(h.doc, 'SPLINE').length).toBe(0);
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(1);
    const h2 = harness();
    const side = h2.add(fitPoly({ extrusion: { x: 1, y: 0, z: 0 }, elevation: 3 })) as PolylineEntity;
    await h2.run('SPLINEDIT', [{ pick: side.handle, at: [3, 1] }, '']);
    expect(h2.printed).not.toContain('스플라인이 아닙니다.');
    [s] = modelEntities(h2.doc, 'SPLINE');
    expect(s).toBeTruthy();
    ctrlIs(s!, FRAME.map(([x, y]) => ({ x: 3, y: x, z: y })));
  });
});
