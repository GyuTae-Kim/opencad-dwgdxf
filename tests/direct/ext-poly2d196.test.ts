/**
 * 196차: 연장(EXT) 객체 스냅의 획득점(`app/snap.ts` `extAnchorsOf`)이 2D POLYLINE(무거운 폴리선)의 끝 세그먼트도 받기.
 * Autodesk 「Object Snap Tab (Drafting Settings Dialog Box)」(2026 판): 연장은 객체의 끝점 위를 지나가면 임시 연장선 또는 연장 호를 보여
 * 그 위의 점을 지정하게 한다 — 받는 객체 종류를 나열하지 않고 폴리선 종류도 가르지 않는다(끝점 스냅도 기하 객체의 가장 가까운 끝점이라고만 적는다).
 * 이 앱은 열린 경량 폴리선(LWPOLYLINE)의 두 끝 세그먼트(직선은 바깥 방향, 호는 그 호가 놓인 원)를 획득점으로 받았지만, 2D POLYLINE은 끝점 스냅은
 * 같은데도 획득점이 없어 연장선 스냅이 나오지 않았다. 이제 188차 `segmentShape`(맞춤·스플라인 맞춤이 아닌 2D POLYLINE을 같은 꼭짓점·볼록도·닫힘·
 * 고도·돌출 방향의 경량 꼴로)를 거쳐 경량 폴리선 갈래를 그대로 쓴다 — 같은 모양의 경량 폴리선과 같은 획득점·같은 스냅 점이 되는 것뿐이다.
 * 닫힌 폴리선·곡선 맞춤·스플라인 맞춤 2D POLYLINE·3D 폴리선은 전처럼 획득점이 없다(선·호는 `pure.test.ts`, 마우스를 올린 획득은 `app.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LwPolylineEntity, PolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { type ExtAnchor, extAnchorsOf, extSnaps, findExtAnchor } from '../../src/app/snap';
import type { Picker } from '../../src/app/pick';
import { NEG_Z, lw, newDoc, poly2d } from '../edit/make';
import { FakePicker } from './fakes';

type Pt = { x: number; y: number };
/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) — 188·195차 시험과 같은 모양 */
const HALF: [number, number, number?][] = [[0, 0], [10, 0, 1], [20, 0]];
const heavy = (pts = HALF, closed = false, ext?: Vec3, elevation = 0) => {
  const p = poly2d(pts, closed) as PolylineEntity;
  p.extrusion = ext;
  p.elevation = elevation;
  return p;
};
const light = (pts = HALF, closed = false, ext?: Vec3, elevation = 0) => {
  const p = lw(pts, closed, ext) as LwPolylineEntity;
  p.elevation = elevation;
  return p;
};
const close = (p: Pt | undefined, x: number, y: number) => {
  expect(p).toBeDefined();
  expect(p!.x).toBeCloseTo(x, 9);
  expect(p!.y).toBeCloseTo(y, 9);
};
const arcOf = (a: ExtAnchor | undefined, cx: number, cy: number, r: number, sweep: number) => {
  expect(a?.arc).toBeDefined();
  close({ x: a!.arc!.cx, y: a!.arc!.cy }, cx, cy);
  expect(a!.arc!.r).toBeCloseTo(r, 9);
  expect(a!.arc!.sweep).toBeCloseTo(sweep, 9);
};
const snapsAt = (e: Entity, x: number, y: number) => extSnaps(extAnchorsOf(e), { x, y }, 1);

describe('연장(EXT) 획득점: 열린 2D POLYLINE', () => {
  it('직선 끝 (0, 0)은 바깥 방향 (−1, 0), 호 끝 (20, 0)은 그 원(중심 (15, 0)·반지름 5·사잇각 180°) — 같은 모양의 경량 폴리선과 같은 획득점', () => {
    const a = extAnchorsOf(heavy());
    expect(a).toHaveLength(2);
    close(a[0]?.p, 0, 0);
    close(a[0]?.dir, -1, 0);
    expect(a[0]?.arc).toBeUndefined();
    close(a[1]?.p, 20, 0);
    expect(a[1]?.dir).toBeUndefined();
    arcOf(a[1], 15, 0, 5, Math.PI);
    expect(a).toEqual(extAnchorsOf(light()));
  });

  it('직선뿐인 2D POLYLINE: 두 끝의 바깥 방향 (1, 0)·(0, 1)과 두 연장선이 만나는 (20, 0) — 경량 폴리선과 같다', () => {
    const pts: [number, number][] = [[10, 0], [0, 0], [0, -10], [20, -10], [20, -5]];
    const a = extAnchorsOf(heavy(pts));
    expect(a).toHaveLength(2);
    close(a[0]?.p, 10, 0);
    close(a[0]?.dir, 1, 0);
    close(a[1]?.p, 20, -5);
    close(a[1]?.dir, 0, 1);
    expect(a).toEqual(extAnchorsOf(light(pts)));
    const s = snapsAt(heavy(pts), 20.3, 0.2);
    const both = s.filter((q) => q.lines?.length === 2);
    expect(both).toHaveLength(1);
    close(both[0], 20, 0);
    expect(s).toEqual(snapsAt(light(pts), 20.3, 0.2));
  });

  it('연장선 스냅: 직선 끝의 바깥 연장 (−8, 0)과 호의 원 위 (15, 5)(호 밖)는 잡고, 호 위 (15, −5)와 폴리선 안쪽은 잡지 않는다 — 경량 폴리선과 같다', () => {
    const left = snapsAt(heavy(), -8, 0.4);
    expect(left).toHaveLength(1);
    close(left[0], -8, 0);
    expect(left[0]?.kind).toBe('ext');
    expect(left[0]?.lines).toHaveLength(1);
    close(left[0]?.lines?.[0]?.from, 0, 0);
    close(left[0]?.lines?.[0]?.dir, -1, 0);
    const top = snapsAt(heavy(), 15, 5.3);
    expect(top).toHaveLength(1);
    close(top[0], 15, 5);
    expect(top[0]?.kind).toBe('ext');
    expect(snapsAt(heavy(), 15, -5.2)).toEqual([]);
    expect(snapsAt(heavy(), 5, 0.3)).toEqual([]);
    for (const [x, y] of [[-8, 0.4], [15, 5.3], [15, -5.2], [5, 0.3]] as const) expect(snapsAt(heavy(), x, y)).toEqual(snapsAt(light(), x, y));
  });

  it('고도 2인 −Z 2D POLYLINE: 평면도 끝 (0, 0)은 바깥 방향 (1, 0), (−20, 0)은 원 (−15, 0)·반지름 5 위 연장 — 같은 −Z 경량 폴리선과 같다', () => {
    const hv = heavy(HALF, false, NEG_Z, 2);
    const a = extAnchorsOf(hv);
    expect(a).toHaveLength(2);
    close(a[0]?.p, 0, 0);
    close(a[0]?.dir, 1, 0);
    close(a[1]?.p, -20, 0);
    arcOf(a[1], -15, 0, 5, Math.PI);
    expect(a).toEqual(extAnchorsOf(light(HALF, false, NEG_Z, 2)));
    const right = snapsAt(hv, 8, -0.4);
    expect(right).toHaveLength(1);
    close(right[0], 8, 0);
    const top = snapsAt(hv, -15, 5.3);
    expect(top).toHaveLength(1);
    close(top[0], -15, 5);
    // 평면도 호는 (−15, −5)를 지난다 — 호 위는 연장이 아니다
    expect(snapsAt(hv, -15, -5.2)).toEqual([]);
  });

  it('마우스를 올린 자리의 획득점 고르기(findExtAnchor): 2D POLYLINE 끝 (20, 0)·(0, 0) 근처에서 그 끝의 획득점 — 같은 모양의 경량 폴리선과 같다', () => {
    const pickIn = (e: Entity) => {
      const doc = newDoc();
      doc.blocks.get(MODEL_SPACE)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      return new FakePicker(doc) as unknown as Picker;
    };
    const hv = heavy();
    const ph = pickIn(hv);
    const pl = pickIn(light());
    const end = findExtAnchor(ph, { x: 20.2, y: 0.2 }, 1);
    expect(end).toEqual(extAnchorsOf(hv)[1]);
    arcOf(end ?? undefined, 15, 0, 5, Math.PI);
    expect(end).toEqual(findExtAnchor(pl, { x: 20.2, y: 0.2 }, 1));
    const start = findExtAnchor(ph, { x: 0.3, y: -0.2 }, 1);
    close(start?.p, 0, 0);
    close(start?.dir, -1, 0);
    expect(start).toEqual(findExtAnchor(pl, { x: 0.3, y: -0.2 }, 1));
  });
});

describe('전과 같은 꼴', () => {
  it('닫힌 2D POLYLINE·곡선 맞춤·스플라인 맞춤 2D POLYLINE·3D 폴리선은 획득점이 없다(닫힌 경량 폴리선도 없음)', () => {
    const fit = heavy();
    fit.flags |= 2;
    const spl = heavy();
    spl.flags |= 4;
    const p3 = heavy();
    p3.kind = '3d';
    p3.flags |= 8;
    for (const e of [heavy(HALF, true), fit, spl, p3, light(HALF, true)]) expect(extAnchorsOf(e)).toEqual([]);
  });
});
