/**
 * 고도가 0이 아닌 −Z 폴리선(과 2D POLYLINE)의 높이(178차).
 * LWPOLYLINE의 고도(38)와 2D POLYLINE의 고도는 객체 OCS 값이다(DXF 참조서 OCS) — 돌출 방향이 (0, 0, −1)이면 WCS Z = −고도.
 * 편집 기하 커널(entityPath)·OVERKILL 선 갈래·JOIN은 이 WCS 높이(planZ)로 견준다.
 * - OVERKILL 겹친 호: 폴리선 호 세그먼트 높이를 OCS 고도 그대로 써, 다른 높이(+고도)의 호를 덮인 것으로 지우고 같은 높이의 겹친 호는 남겼다.
 * - PEDIT 다중 결합 퍼지(추가·모두): 잇는 선을 OCS 고도(2D POLYLINE은 0)에 두어 JOIN이 높이가 다르다고 보아 3D 폴리선·스플라인을 만들었다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LwPolylineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { overkill } from '../../src/edit/geom/overkill';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { NEG_Z, P, arc, line, lw, poly2d } from '../edit/make';
import { makeHarness } from '../cmds2/harness';
import { perCommandGroups } from '../drawmod/groups';

/** 고도 z인 폴리선(돌출 방향 ext) */
const elevLw = (pts: [number, number, number?][], z: number, ext = NEG_Z): Entity => ({ ...lw(pts, false, ext), elevation: z }) as Entity;
const at = <T extends Entity>(e: T, patch: Partial<T>): T => ({ ...e, ...patch });
const r9 = (v: number) => +v.toFixed(9) + 0;

describe('OVERKILL 겹친 호: −Z 폴리선 호 세그먼트의 높이', () => {
  // OCS (0,0)→(10,0) 볼록도 1(반원)·(10,0)→(20,0) 직선, 고도 2, −Z → 평면도 (0,0)→(−10,0) 아래 반원(중심 (−5,0), 180°~360°)·(−10,0)→(−20,0), WCS Z −2
  const negPl = () => elevLw([[0, 0, 1], [10, 0], [20, 0]], 2);

  it('다른 높이(WCS Z +2)의 호는 덮인 것이 아니라 지우지 않는다(같은 높이의 선처럼)', () => {
    const pl = negPl();
    const a = at(arc(-5, 0, 5, 200, 340) as Extract<Entity, { type: 'ARC' }>, { center: P(-5, 0, 2) });
    const l = at(line(-12, 0, -18, 0) as Extract<Entity, { type: 'LINE' }>, { start: P(-12, 0, 2), end: P(-18, 0, 2) });
    const r = overkill([pl, a, l]);
    expect(r.result.remove ?? []).toEqual([]);
    expect(r.overlaps).toBe(0);
  });

  it('같은 높이(WCS Z −2)의 겹친 호는 지운다 — 같은 −Z OCS·고도 2의 호도', () => {
    const pl = negPl();
    // −Z 호 OCS 중심 (5,0,2)·OCS 200°~340° → 평면도 중심 (−5,0)·200°~340°, WCS Z −2
    const a = at(arc(5, 0, 5, 200, 340, NEG_Z) as Extract<Entity, { type: 'ARC' }>, { center: P(5, 0, 2) });
    const l = at(line(-12, 0, -18, 0) as Extract<Entity, { type: 'LINE' }>, { start: P(-12, 0, -2), end: P(-18, 0, -2) });
    const r = overkill([pl, a, l]);
    expect([...(r.result.remove ?? [])].sort()).toEqual([a.handle, l.handle].sort());
    expect(r.overlaps).toBe(2);
  });

  it('+Z 폴리선(고도 2)과 고도 0인 −Z 폴리선은 전과 같다', () => {
    // +Z: (0,0)→(−10,0) 볼록도 −1 → 같은 아래 반원, WCS Z 2
    const pos = elevLw([[0, 0, -1], [-10, 0]], 2, { x: 0, y: 0, z: 1 });
    const up = at(arc(-5, 0, 5, 200, 340) as Extract<Entity, { type: 'ARC' }>, { center: P(-5, 0, 2) });
    const down = at(arc(-5, 0, 5, 200, 340) as Extract<Entity, { type: 'ARC' }>, { center: P(-5, 0, -2) });
    expect(overkill([pos, up]).result.remove).toEqual([up.handle]);
    expect(overkill([pos, down]).result.remove ?? []).toEqual([]);
    const flat = elevLw([[0, 0, 1], [10, 0]], 0);
    const a0 = arc(-5, 0, 5, 200, 340);
    expect(overkill([flat, a0]).result.remove).toEqual([a0.handle]);
  });
});

describe('PEDIT 다중 결합 퍼지: 잇는 선의 높이', () => {
  const harness = () => {
    const h = perCommandGroups(makeHarness());
    registerDrawCommands(h.app);
    registerModifyCommands(h.app);
    registerPeditCommands(h.app);
    return h;
  };
  type H = ReturnType<typeof harness>;
  const ents = (h: H) => h.doc.blocks.get(MODEL_SPACE)!.entities;
  const pts = (e: Entity) => lwVertices(e as LwPolylineEntity).map((v) => [r9(v.x), r9(v.y)]);

  it('추가: 고도 2인 −Z 폴리선 둘이 WCS Z −2의 폴리선 하나가 된다(3D 폴리선이 아니다)', async () => {
    const h = harness();
    // 평면도 (0,0)→(−10,0)와 (−10.3,0.3)→(−10.3,10), WCS Z −2
    const a = h.add(elevLw([[0, 0], [10, 0]], 2));
    const b = h.add(elevLw([[10.3, 0.3], [10.3, 10]], 2));
    await h.run('PEDIT', ['M', { sel: [a.handle, b.handle] }, 'J', 'J', 'A', '1', '']);
    const all = ents(h);
    expect(all.length).toBe(1);
    const e = all[0]! as LwPolylineEntity;
    expect(e.type).toBe('LWPOLYLINE');
    expect(e.handle).toBe(a.handle);
    expect(e.elevation).toBe(-2);
    expect(e.extrusion).toBeUndefined();
    expect(pts(e)).toEqual([
      [0, 0],
      [-10, 0],
      [-10.3, 0.3],
      [-10.3, 10],
    ]);
  });

  it('모두: 끝이 호인 고도 2 −Z 폴리선도 폴리선 하나(스플라인이 아니다, 뒤집힌 평면의 볼록도)', async () => {
    const h = harness();
    const a = h.add(elevLw([[0, 0], [10, 0, 0.5], [12, 2]], 2));
    const b = h.add(elevLw([[12.5, 2.5], [12.5, 10]], 2));
    await h.run('PEDIT', ['M', { sel: [a.handle, b.handle] }, 'J', 'J', 'B', '1', '']);
    const all = ents(h);
    expect(all.length).toBe(1);
    const e = all[0]! as LwPolylineEntity;
    expect(e.type).toBe('LWPOLYLINE');
    expect(e.elevation).toBe(-2);
    expect(pts(e)).toEqual([
      [0, 0],
      [-10, 0],
      [-12, 2],
      [-12.5, 2.5],
      [-12.5, 10],
    ]);
    const bulges = lwVertices(e).map((v) => v.bulge);
    expect(bulges[1]).toBeCloseTo(-0.5, 12);
    expect(bulges.filter((_, i) => i !== 1).every((v) => v === 0)).toBe(true);
  });

  it('추가: 고도 3인 2D POLYLINE 둘이 고도 3의 2D POLYLINE 하나가 된다', async () => {
    const h = harness();
    const a = h.add({ ...poly2d([[0, 0], [10, 0]]), elevation: 3 } as Entity);
    const b = h.add({ ...poly2d([[10.3, 0.3], [10.3, 10]]), elevation: 3 } as Entity);
    await h.run('PEDIT', ['M', { sel: [a.handle, b.handle] }, 'J', 'J', 'A', '1', '']);
    const all = ents(h);
    expect(all.length).toBe(1);
    const e = all[0]! as PolylineEntity;
    expect(e.type).toBe('POLYLINE');
    expect(e.kind).toBe('2d');
    expect(e.handle).toBe(a.handle);
    expect(e.elevation).toBe(3);
  });

  it('+Z 폴리선(고도 2)의 추가와 −Z 폴리선의 연장은 전과 같다', async () => {
    const h = harness();
    const a = h.add(elevLw([[0, 0], [10, 0]], 2, { x: 0, y: 0, z: 1 }));
    const b = h.add(elevLw([[10.3, 0.3], [10.3, 10]], 2, { x: 0, y: 0, z: 1 }));
    await h.run('PEDIT', ['M', { sel: [a.handle, b.handle] }, 'J', 'J', 'A', '1', '']);
    expect(ents(h).length).toBe(1);
    expect(ents(h)[0]).toMatchObject({ type: 'LWPOLYLINE', handle: a.handle, elevation: 2 });
    const h2 = harness();
    const c = h2.add(elevLw([[0, 0], [10, 0]], 2));
    const d = h2.add(elevLw([[10.3, 0.3], [10.3, 10]], 2));
    await h2.run('PEDIT', ['M', { sel: [c.handle, d.handle] }, 'J', '1', '']);
    expect(ents(h2).length).toBe(1);
    const e = ents(h2)[0]! as LwPolylineEntity;
    expect(e).toMatchObject({ type: 'LWPOLYLINE', handle: c.handle, elevation: -2 });
    expect(pts(e)).toEqual([
      [0, 0],
      [-10.3, 0],
      [-10.3, 10],
    ]);
  });
});
