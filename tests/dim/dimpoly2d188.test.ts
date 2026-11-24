/**
 * 188차: 폴리선 세그먼트를 받는 치수 명령(182~184차 `polyArcOf`·`polyLineOf`)이 2D POLYLINE(무거운 폴리선)도 받기.
 * Autodesk DIMRADIUS·DIMDIAMETER·DIMARC·DIMJOGGED·DIMANGULAR 도움말은 「폴리선 호 세그먼트」(DIMANGULAR 선 선택은 「폴리선 세그먼트」)를 적고
 * 폴리선 종류를 가르지 않는다. 고치기 전에는 세그먼트 고르기(`polySegment`)가 경량 폴리선(LWPOLYLINE)만 받아, 2D POLYLINE을 고르면
 * 호 세그먼트여도 알림만 하고 끝났다. 이제 맞춤·스플라인 맞춤이 아닌 2D POLYLINE(다기능 그립과 같은 `isPlainPoly2d`)은
 * 같은 꼭짓점·볼록도·닫힘·고도·돌출 방향의 경량 폴리선과 같은 치수를 만든다(연관은 182~184차처럼 붙이지 않음 — DIMARC는 193차부터
 * 경량 폴리선과 같이 시작·끝 끝점과 중심 세 참조를 붙인다, `tests/dim/dimpolyarc182.test.ts` 193차 절).
 * 곡선 맞춤·스플라인 맞춤 2D POLYLINE과 3D 폴리선은 전과 같은 알림, 경량 폴리선은 전과 같은 값이다.
 * MEASUREGEOM 반지름(187차)은 `tests/settings/measurepolyarc187.test.ts`에서 본다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { dimAssocOf } from '../../src/edit/dim/assoc';
import { makeDoc } from './doc';
import { makeHarness } from '../cmds2/harness';
import { NEG_Z, line, lw, poly2d } from '../edit/make';

const V = (x: number, y: number) => ({ x, y, z: 0 });

function harness(setup?: (doc: CadDocument) => void) {
  const h = makeHarness((d0) => {
    Object.assign(d0, makeDoc());
    if (!d0.blocks.has(MODEL_SPACE)) d0.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: 'M1', recordHandle: 'M2', basePoint: V(0, 0), flags: 0, entities: [] });
    setup?.(d0);
  });
  registerDimCommands(h.app);
  registerAnnot2Commands(h.app);
  return h;
}
type H = ReturnType<typeof harness>;
const dims = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const lastDim = (h: H) => dims(h).at(-1)!;
const r9 = (v: number) => Number(v.toFixed(9)) + 0;
const xy = (p: { x: number; y: number }) => [r9(p.x), r9(p.y)];
const xyz = (p: Vec3) => [r9(p.x), r9(p.y), r9(p.z)];
const DEFS = ['defPoint', 'defPoint2', 'defPoint3', 'defPoint4'] as const;

/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) */
const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];
const heavy = (h: H, pts = HALF, closed = false, ext?: Vec3, elevation = 0) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  p.elevation = elevation;
  return h.add(p) as PolylineEntity;
};

describe('2D POLYLINE 호 세그먼트: 같은 모양의 경량 폴리선과 같은 치수', () => {
  it('DIMRADIUS·DIMDIAMETER: 중심 (15, 0)·현 위 점 (15, −5), 값 5·10, 연관 없음 — 정의점이 경량 폴리선과 같다', async () => {
    const h = harness();
    const p = heavy(h);
    const q = h.add(lw(HALF));
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [15, -5] }, '15,-10']);
    const dp = lastDim(h);
    await h.run('DIMRADIUS', [{ pick: q.handle, at: [15, -5] }, '15,-10']);
    const dq = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(dp.dimType & 7).toBe(4);
    expect(xy(dp.defPoint)).toEqual([15, 0]);
    expect(xy(dp.defPoint4)).toEqual([15, -5]);
    expect(dp.measurement).toBeCloseTo(5, 9);
    expect(dimAssocOf(h.doc, dp)).toBeNull();
    for (const k of ['defPoint', 'defPoint4'] as const) expect(xyz(dp[k])).toEqual(xyz(dq[k]));
    await h.run('DIMDIAMETER', [{ pick: p.handle, at: [15, -5] }, '15,-10']);
    const dd = lastDim(h);
    expect(dd.dimType & 7).toBe(3);
    expect(xy(dd.defPoint4)).toEqual([15, -5]);
    expect(xy(dd.defPoint)).toEqual([15, 5]);
    expect(dd.measurement).toBeCloseTo(10, 9);
  });

  it('DIMARC: 반시계 세그먼트는 시작 (10, 0)·끝 (20, 0)·중심 (15, 0)·5π, 닫힌 2D POLYLINE의 닫는 호 세그먼트도 — 193차부터 경량 폴리선처럼 연관 셋', async () => {
    const h = harness();
    const p = heavy(h);
    await h.run('DIMARC', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    expect(d.subtype).toBe('ARC_DIMENSION');
    expect(xy(d.defPoint4)).toEqual([15, 0]);
    expect(xy(d.defPoint2)).toEqual([10, 0]);
    expect(xy(d.defPoint3)).toEqual([20, 0]);
    expect(d.measurement).toBeCloseTo(5 * Math.PI, 9);
    // 188차에는 연관 없음이었다 — 193차부터 시작·끝 끝점과 중심(DIMASSOC 참조 칸 넷 가운데 빈 칸은 거른다)
    expect(dimAssocOf(h.doc, d)!.data.refs.filter((r) => r).map((r) => r!.ids[0])).toEqual([p.handle, p.handle, p.handle]);
    // 닫힘(70 비트 1): (0,30)→(10,30) 직선, 닫는 (10,30)→(0,30) 볼록도 1(중심 (5,30), (5,35)를 지난다)
    const c = heavy(h, [[0, 30], [10, 30, 1]], true);
    await h.run('DIMARC', [{ pick: c.handle, at: [5, 35] }, '5,38']);
    const dc = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(xy(dc.defPoint4)).toEqual([5, 30]);
    expect(xy(dc.defPoint2)).toEqual([10, 30]);
    expect(xy(dc.defPoint3)).toEqual([0, 30]);
    expect(dc.measurement).toBeCloseTo(5 * Math.PI, 9);
    // 닫는 세그먼트(번호 1)의 두 끝점 (10,30)·(0,30)과 중심 — 첫 꼭짓점도 닫는 세그먼트의 끝점으로 붙는다
    expect(dimAssocOf(h.doc, dc)!.data.refs.filter((r) => r)).toHaveLength(3);
  });

  it('DIMJOGGED: 고도 2인 −Z 2D POLYLINE은 평면도 중심 (−15, 0)·현 위 점 (−15, −5)에 WCS Z −2 — 경량 폴리선과 같다', async () => {
    const h = harness();
    const p = heavy(h, HALF, false, NEG_Z, 2);
    const q0 = lw(HALF, false, NEG_Z) as LwPolylineEntity;
    q0.elevation = 2;
    const q = h.add(q0);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [-15, -5] }, '-25,-15', '-15,-8', '-16,-10']);
    const dp = lastDim(h);
    await h.run('DIMJOGGED', [{ pick: q.handle, at: [-15, -5] }, '-25,-15', '-15,-8', '-16,-10']);
    const dq = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(dp.subtype).toBe('LARGE_RADIAL_DIMENSION');
    expect(xyz(dp.defPoint)).toEqual([-15, 0, -2]);
    expect(xy(dp.defPoint4)).toEqual([-15, -5]);
    expect(dp.measurement).toBeCloseTo(5, 9);
    expect(dimAssocOf(h.doc, dp)).toBeNull();
    for (const k of DEFS) expect(xyz(dp[k])).toEqual(xyz(dq[k]));
  });

  it('DIMANGULAR 호 선택: 꼭짓점은 호 중심 (15, 0), 끝점 (10, 0)·(20, 0), 값 180°, 연관 없음', async () => {
    const h = harness();
    const p = heavy(h);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [15, -5] }, '15,-8']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(5);
    expect(xy(d.defPoint4)).toEqual([15, 0]);
    expect(xy(d.defPoint2)).toEqual([10, 0]);
    expect(xy(d.defPoint3)).toEqual([20, 0]);
    expect(d.measurement).toBeCloseTo(Math.PI, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
  });

  it('DIMANGULAR 선 선택: 2D POLYLINE의 두 직선 세그먼트는 모서리 (10, 0)에서 90°, LINE과 섞으면 LINE 쪽만 연관', async () => {
    const h = harness();
    const p = heavy(h, [[0, 0], [10, 0], [10, 10]]);
    await h.run('DIMANGULAR', [{ pick: p.handle, at: [5, 0] }, { pick: p.handle, at: [10, 5] }, '7,3']);
    const d = lastDim(h);
    expect(d.dimType & 7).toBe(2);
    expect(xy(d.defPoint2)).toEqual([0, 0]);
    expect(xy(d.defPoint3)).toEqual([10, 0]);
    expect(xy(d.defPoint4)).toEqual([10, 0]);
    expect(xy(d.defPoint)).toEqual([10, 10]);
    expect(d.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(dimAssocOf(h.doc, d)).toBeNull();
    const l = h.add(line(0, 20, 10, 20));
    const p2 = heavy(h, [[0, 20], [0, 30]]);
    await h.run('DIMANGULAR', [{ pick: l.handle, at: [5, 20] }, { pick: p2.handle, at: [0, 25] }, '3,23']);
    const dm = lastDim(h);
    expect(dims(h)).toHaveLength(2);
    expect(xy(dm.defPoint4)).toEqual([0, 20]);
    expect(xy(dm.defPoint)).toEqual([0, 30]);
    expect(dm.measurement).toBeCloseTo(Math.PI / 2, 9);
    expect(dimAssocOf(h.doc, dm)!.data.refs.map((r) => !!r)).toEqual([true, true, false, false]);
    // 직선 세그먼트 다음 둘째로 호 세그먼트(가장 가까운 세그먼트 기준)를 고르면 경량 폴리선(184차)과 같은 알림만
    const half = heavy(h);
    await h.run('DIMANGULAR', [{ pick: half.handle, at: [5, 0] }, { pick: half.handle, at: [15, -5] }]);
    expect(h.printed).toContain('선을 선택하십시오.');
    expect(dims(h)).toHaveLength(2);
  });
});

describe('전과 같은 꼴', () => {
  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE과 3D 폴리선은 전과 같은 알림만 하고 치수를 만들지 않는다', async () => {
    const h = harness();
    const fit = heavy(h);
    fit.flags |= 2;
    const spl = heavy(h);
    spl.flags |= 4;
    const p3 = heavy(h);
    p3.kind = '3d';
    p3.flags |= 8;
    for (const e of [fit, spl, p3]) await h.run('DIMRADIUS', [{ pick: e.handle, at: [15, -5] }]);
    expect(h.printed.filter((t) => t === '호 또는 원을 선택하십시오.')).toHaveLength(3);
    await h.run('DIMARC', [{ pick: fit.handle, at: [15, -5] }]);
    expect(h.printed).toContain('호를 선택하십시오.');
    await h.run('DIMANGULAR', [{ pick: p3.handle, at: [15, -5] }]);
    expect(h.printed).toContain('호, 원, 선을 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });

  it('2D POLYLINE의 직선 세그먼트는 경량 폴리선과 같은 알림(DIMRADIUS·DIMARC·DIMJOGGED)', async () => {
    const h = harness();
    const p = heavy(h);
    await h.run('DIMRADIUS', [{ pick: p.handle, at: [5, 0] }]);
    await h.run('DIMJOGGED', [{ pick: p.handle, at: [5, 0] }]);
    await h.run('DIMARC', [{ pick: p.handle, at: [5, 0] }]);
    expect(h.printed.filter((t) => t === '호 또는 원을 선택하십시오.')).toHaveLength(2);
    expect(h.printed).toContain('호를 선택하십시오.');
    expect(dims(h)).toHaveLength(0);
  });
});
