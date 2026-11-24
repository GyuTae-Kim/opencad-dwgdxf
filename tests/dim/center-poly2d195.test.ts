/**
 * 195차: CENTERMARK(중심 표식)·CENTERLINE(중심선)이 2D POLYLINE(무거운 폴리선)의 호·직선 세그먼트도 받기(`app/annot2-misc.ts` `roundOf`·`straightOf`).
 * Autodesk 「Create Associative Center Marks and Centerlines」(Have You Tried 도움말, 2026 판에도 같은 글): 폴리선의 호는 낱낱의 호 세그먼트로 보아
 * 세그먼트마다 중심 표식을 두고, 중심선을 만들 때 폴리선은 낱낱의 선 세그먼트로 본다. CENTERLINE 도움말(2026): 두 선 또는 직선 폴리선 세그먼트를 고른다.
 * 두 글 모두 폴리선 종류를 가르지 않는다. 이 앱은 경량 폴리선(LWPOLYLINE)의 세그먼트를 전부터 받았지만, 2D POLYLINE을 고르면 호·직선 세그먼트여도
 * 「원 또는 호를 선택하십시오.」·「선 또는 폴리선의 직선 세그먼트를 선택하십시오.」만 알렸다. 이제 188차 `segmentShape`(맞춤·스플라인 맞춤이 아닌
 * 2D POLYLINE을 같은 꼭짓점·볼록도·닫힘·고도·돌출 방향의 경량 꼴로)로 보아 경량 폴리선과 같은 규칙으로 고른다.
 * 곡선 맞춤·스플라인 맞춤 2D POLYLINE과 3D 폴리선은 전과 같은 알림이고, 선·경량 폴리선은 전과 같은 값이다(원·호는 `dimang-centermark-ocs175.test.ts`).
 * 이 앱의 중심 표식·중심선은 익명 블록 참조 하나이고 원·호·선에도 연관을 붙이지 않는다(175차에 적은 한계 그대로 — 자리·Z만 본다).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, LineEntity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { registerAnnot2Misc } from '../../src/app/annot2-misc';
import { makeDoc } from './doc';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { NEG_Z, line, lw, poly2d } from '../edit/make';

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
const r9 = (v: number) => Number(v.toFixed(9)) + 0;
const seg = (l: LineEntity) => [r9(l.start.x), r9(l.start.y), r9(l.end.x), r9(l.end.y)];
const inserts = (h: H) => modelEntities(h.doc, 'INSERT').length;
/** n번째(0부터) 중심 표식·중심선 블록 참조의 선 */
function blockLines(h: H, n: number): LineEntity[] {
  const ins = modelEntities(h.doc, 'INSERT');
  expect(ins.length).toBeGreaterThan(n);
  const def = h.doc.blocks.get(tableKey(ins[n]!.block))!;
  return def.entities.filter((e): e is LineEntity => e.type === 'LINE');
}
const zs = (ls: LineEntity[]) => [...new Set(ls.flatMap((l) => [l.start.z, l.end.z]))];

/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) — 188차 시험과 같은 모양 */
const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];
const heavy = (h: H, pts = HALF, closed = false, ext?: Vec3, elevation = 0) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  p.elevation = elevation;
  return h.add(p) as PolylineEntity;
};
const light = (h: H, pts = HALF, closed = false, ext?: Vec3, elevation = 0) => {
  const p = lw(pts, closed, ext) as LwPolylineEntity;
  p.elevation = elevation;
  return h.add(p) as LwPolylineEntity;
};

describe('CENTERMARK: 2D POLYLINE 호 세그먼트', () => {
  it('반원 세그먼트: 십자는 중심 (15, 0)에 반 길이 0.5(지름 10의 0.1x), 중심각 180°라 연장선 없이 선 둘 — 같은 모양의 경량 폴리선과 같다', async () => {
    const h = harness();
    const p = heavy(h);
    await h.run('CENTERMARK', [{ pick: p.handle, at: [15, -5] }, '']);
    expect(inserts(h)).toBe(1);
    const a = blockLines(h, 0);
    expect(a.map(seg)).toEqual([
      [14.5, 0, 15.5, 0],
      [15, -0.5, 15, 0.5],
    ]);
    expect(zs(a)).toEqual([0]);
    const q = light(h);
    await h.run('CENTERMARK', [{ pick: q.handle, at: [15, -5] }, '']);
    expect(blockLines(h, 1).map(seg)).toEqual(a.map(seg));
  });

  it('고도 2인 −Z 2D POLYLINE: 십자는 평면도 중심 (−15, 0)에 WCS Z −2 — 같은 모양의 −Z 경량 폴리선과 같다', async () => {
    const h = harness();
    const p = heavy(h, HALF, false, NEG_Z, 2);
    await h.run('CENTERMARK', [{ pick: p.handle, at: [-15, -5] }, '']);
    expect(inserts(h)).toBe(1);
    const a = blockLines(h, 0);
    expect(a.map(seg)).toEqual([
      [-15.5, 0, -14.5, 0],
      [-15, -0.5, -15, 0.5],
    ]);
    expect(zs(a)).toEqual([-2]);
    const q = light(h, HALF, false, NEG_Z, 2);
    await h.run('CENTERMARK', [{ pick: q.handle, at: [-15, -5] }, '']);
    const b = blockLines(h, 1);
    expect(b.map(seg)).toEqual(a.map(seg));
    expect(zs(b)).toEqual([-2]);
  });

  it('닫힌 2D POLYLINE(70 비트 1)의 닫는 호 세그먼트 (10, 30)→(0, 30) 볼록도 1: 십자는 중심 (5, 30)에', async () => {
    const h = harness();
    const p = heavy(h, [[0, 30], [10, 30, 1]], true);
    await h.run('CENTERMARK', [{ pick: p.handle, at: [5, 35] }, '']);
    expect(inserts(h)).toBe(1);
    expect(blockLines(h, 0).map(seg)).toEqual([
      [4.5, 30, 5.5, 30],
      [5, 29.5, 5, 30.5],
    ]);
  });
});

describe('CENTERLINE: 2D POLYLINE 직선 세그먼트', () => {
  it('선 (0, 0)→(20, 0)과 2D POLYLINE (2, 10)→(18, 10)→(18, 20): 중심선은 y 5, x −2.5~22.5 — 같은 모양의 경량 폴리선과 같다', async () => {
    const h = harness();
    const l = h.add(line(0, 0, 20, 0));
    const p = heavy(h, [[2, 10], [18, 10], [18, 20]]);
    await h.run('CENTERLINE', [{ pick: l.handle, at: [10, 0] }, { pick: p.handle, at: [10, 10] }]);
    expect(inserts(h)).toBe(1);
    const a = blockLines(h, 0);
    // 대응하는 끝의 가운데 (1, 5)~(19, 5)에 연장 3.5(CENTEREXE 미터 기본)
    expect(a.map(seg)).toEqual([[-2.5, 5, 22.5, 5]]);
    const q = light(h, [[2, 10], [18, 10], [18, 20]]);
    await h.run('CENTERLINE', [{ pick: l.handle, at: [10, 0] }, { pick: q.handle, at: [10, 10] }]);
    expect(blockLines(h, 1).map(seg)).toEqual(a.map(seg));
  });

  it('고도 3인 −Z 2D POLYLINE OCS (2, 10)→(18, 10)(평면도 (−2, 10)→(−18, 10))과 선 (−20, 0)→(0, 0): 중심선은 y 5, x −22.5~2.5, Z 0(경량 폴리선과 같은 규칙)', async () => {
    const h = harness();
    const l = h.add(line(-20, 0, 0, 0));
    const p = heavy(h, [[2, 10], [18, 10], [18, 20]], false, NEG_Z, 3);
    await h.run('CENTERLINE', [{ pick: l.handle, at: [-10, 0] }, { pick: p.handle, at: [-10, 10] }]);
    expect(inserts(h)).toBe(1);
    const a = blockLines(h, 0);
    expect(a.map(seg)).toEqual([[-22.5, 5, 2.5, 5]]);
    expect(zs(a)).toEqual([0]);
  });

  it('닫힌 2D POLYLINE 직사각형의 닫는 세그먼트 (0, 10)→(0, 0)과 마주 보는 (20, 0)→(20, 10): 중심선은 x 10, y 13.5→−3.5', async () => {
    const h = harness();
    const p = heavy(h, [[0, 0], [20, 0], [20, 10], [0, 10]], true);
    await h.run('CENTERLINE', [{ pick: p.handle, at: [0, 5] }, { pick: p.handle, at: [20, 5] }]);
    expect(inserts(h)).toBe(1);
    // 첫 선 방향(0, −1) 축에서 대응하는 끝의 가운데 (10, 10)~(10, 0)에 연장 3.5
    expect(blockLines(h, 0).map(seg)).toEqual([[10, 13.5, 10, -3.5]]);
  });
});

describe('전과 같은 꼴', () => {
  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE·3D 폴리선·직선뿐인 2D POLYLINE은 CENTERMARK에서 전과 같은 알림만 하고 표식을 만들지 않는다', async () => {
    const h = harness();
    const fit = heavy(h);
    fit.flags |= 2;
    const spl = heavy(h);
    spl.flags |= 4;
    const p3 = heavy(h);
    p3.kind = '3d';
    p3.flags |= 8;
    const straight = heavy(h, [[0, 0], [10, 0], [10, 10]]);
    for (const e of [fit, spl, p3, straight]) await h.run('CENTERMARK', [{ pick: e.handle, at: [15, -5] }, '']);
    expect(h.printed.filter((t) => t === '원 또는 호를 선택하십시오.')).toHaveLength(4);
    expect(inserts(h)).toBe(0);
  });

  it('곡선 맞춤·스플라인 맞춤 2D POLYLINE·3D 폴리선·호뿐인 2D POLYLINE은 CENTERLINE에서 전과 같은 알림만 하고 중심선을 만들지 않는다', async () => {
    const h = harness();
    const fit = heavy(h, [[0, 0], [10, 0], [10, 10]]);
    fit.flags |= 2;
    const spl = heavy(h, [[0, 0], [10, 0], [10, 10]]);
    spl.flags |= 4;
    const p3 = heavy(h, [[0, 0], [10, 0], [10, 10]]);
    p3.kind = '3d';
    p3.flags |= 8;
    const arcs = heavy(h, [[10, 0, 1], [20, 0]]);
    for (const e of [fit, spl, p3, arcs]) await h.run('CENTERLINE', [{ pick: e.handle, at: [5, 0] }, '']);
    expect(h.printed.filter((t) => t === '선 또는 폴리선의 직선 세그먼트를 선택하십시오.')).toHaveLength(4);
    expect(inserts(h)).toBe(0);
  });

  it('선 둘과 경량 폴리선 둘(호 세그먼트는 건너뜀)은 전과 같은 중심선', async () => {
    const h = harness();
    const l1 = h.add(line(0, 0, 20, 0));
    const l2 = h.add(line(2, 10, 18, 10));
    await h.run('CENTERLINE', [{ pick: l1.handle, at: [10, 0] }, { pick: l2.handle, at: [10, 10] }]);
    expect(blockLines(h, 0).map(seg)).toEqual([[-2.5, 5, 22.5, 5]]);
    // (0, 40)→(20, 40) 직선, (20, 40)→(20, 50) 반원 / (2, 50)→(18, 50) — 176차 −Z 시험의 +Z 꼴
    const p1 = light(h, [[0, 40], [20, 40, 1], [20, 50]]);
    const p2 = light(h, [[2, 50], [18, 50]]);
    await h.run('CENTERLINE', [{ pick: p1.handle, at: [10, 40] }, { pick: p2.handle, at: [10, 50] }]);
    expect(blockLines(h, 1).map(seg)).toEqual([[-2.5, 45, 22.5, 45]]);
  });
});
