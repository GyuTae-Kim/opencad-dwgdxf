/**
 * 9차 그리기 붙잡기: 지연된 접점을 PLINE 시작점·XLINE 첫 점·CIRCLE 3P로, 접점 대상에 폴리선 호 구간
 * (CIRCLE Ttr·TTT는 접점 스냅 점 요청), 점·접선을 섞은 원(circleThrough)
 */
import { describe, expect, it } from 'vitest';
import type { CircleEntity, LwPolylineEntity, XLineEntity } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerDrawCommands } from '../../src/app/draw';
import { circleThrough } from '../../src/edit/geom/drawgeom';
import { entityPath } from '../../src/edit/geom/path';
import { circle, line, lw } from '../edit/make';
import { type Harness, makeHarness, modelEntities } from '../cmds2/harness';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function draw(): Harness {
  const h = makeHarness();
  registerDrawCommands(h.app);
  return h;
}

/** 아래로 볼록한 반원(중심 (5,0), 반지름 5)이 가운데 있는 폴리선: (−10,0) → (0,0) ⌒ (10,0) → (10,−10) */
const archPoly = () => lw([[-10, 0], [0, 0, 1], [10, 0], [10, -10]]);

/** 원 c에 접하는지(반지름 ⟂ 선분) */
function tangentAt(c: Pt, r: number, t: Pt, other: Pt): void {
  expect(d2(c, t)).toBeCloseTo(r, 9);
  expect((t.x - c.x) * (other.x - t.x) + (t.y - c.y) * (other.y - t.y)).toBeCloseTo(0, 9);
}

describe('점·접선을 섞은 원(circleThrough)', () => {
  it('두 점을 지나고 선에 접하는 원: 고른 자리 쪽 해', () => {
    const piece = entityPath(line(-20, 0, 20, 0))!.pieces[0]!;
    const k = circleThrough([{ point: P(0, 2) }, { point: P(0, 8) }, { piece, pick: P(4, 0) }])!;
    expect(k.c.x).toBeCloseTo(4, 9);
    expect(k.c.y).toBeCloseTo(5, 9);
    expect(k.r).toBeCloseTo(5, 9);
    const k2 = circleThrough([{ point: P(0, 2) }, { piece, pick: P(-4, 0) }, { point: P(0, 8) }])!;
    expect(k2.c.x).toBeCloseTo(-4, 9);
  });

  it('두 점을 지나고 원에 접하는 원, 세 점이면 세 점을 지나는 원', () => {
    const piece = entityPath(circle(0, 0, 2))!.pieces[0]!;
    const k = circleThrough([{ piece, pick: P(Math.SQRT2, Math.SQRT2) }, { point: P(6, 0) }, { point: P(0, 6) }])!;
    expect(d2(k.c, P(6, 0))).toBeCloseTo(k.r, 9);
    expect(d2(k.c, P(0, 6))).toBeCloseTo(k.r, 9);
    // 고른 자리(1사분면)에서 바깥으로 접한다
    expect(Math.hypot(k.c.x, k.c.y)).toBeCloseTo(k.r + 2, 9);
    const t = circleThrough([{ point: P(0, 0) }, { point: P(10, 0) }, { point: P(5, 5) }])!;
    expect(t.c.x).toBeCloseTo(5, 9);
    expect(t.c.y).toBeCloseTo(0, 9);
    expect(t.r).toBeCloseTo(5, 9);
  });
});

describe('CIRCLE 3P·Ttr의 지연된 접점', () => {
  it('3P: 두 점과 선 위 지연된 접점', async () => {
    const h = draw();
    const l = h.add(line(-20, 0, 20, 0));
    await h.run('CIRCLE', ['3P', '0,2', '0,8', { pick: l.handle, at: [4, 0] }]);
    const c = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(c.center.x).toBeCloseTo(4, 9);
    expect(c.center.y).toBeCloseTo(5, 9);
    expect(c.radius).toBeCloseTo(5, 9);
    // 마지막 점 미리보기도 접하는 원
    expect(h.ghosts).toBeGreaterThan(0);
  });

  it('3P: 첫 점이 원의 지연된 접점, 해가 없으면 알린다', async () => {
    const h = draw();
    const c0 = h.add(circle(0, 0, 2));
    await h.run('CIRCLE', ['3P', { pick: c0.handle, at: [Math.SQRT2, Math.SQRT2] }, '6,0', '0,6']);
    const c = modelEntities(h.doc, 'CIRCLE').find((x) => x.handle !== c0.handle)!;
    expect(Math.hypot(c.center.x - 6, c.center.y)).toBeCloseTo(c.radius, 9);
    expect(Math.hypot(c.center.x, c.center.y)).toBeCloseTo(c.radius + 2, 9);
    // 원 안의 두 점(중심 근처)과 그 원에 접하는 작은 원은 있지만, 원 안·밖에 걸친 두 점이면 없다
    const h2 = draw();
    const c1 = h2.add(circle(0, 0, 2));
    await h2.run('CIRCLE', ['3P', { pick: c1.handle, at: [2, 0] }, '0,0', '10,0']);
    expect(h2.printed).toContain('원이 존재하지 않습니다.');
  });

  it('Ttr: 폴리선 호 구간과 선에 접하는 원(접점 스냅 점 요청)', async () => {
    const h = draw();
    const pl = h.add(archPoly());
    const l = h.add(line(-20, -8, 20, -8));
    await h.run('CIRCLE', ['T', { pick: pl.handle, at: [5, -5] }, { pick: l.handle, at: [5, -8] }, '1.5']);
    const c = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(c.center.x).toBeCloseTo(5, 9);
    expect(c.center.y).toBeCloseTo(-6.5, 9);
    expect(h.prompts[1]).toBe('원의 첫 번째 접점에 대한 객체 위의 점 지정:');
  });

  it('Ttr: 좌표로 준 점(스크립트)은 그 점에 걸친 객체, 없으면 다시 묻는다', async () => {
    const h = draw();
    h.add(line(0, 0, 10, 0));
    h.add(line(0, 0, 0, 10));
    await h.run('CIRCLE', ['T', '50,50', '5,0', '0,5', '2']);
    expect(h.printed).toContain('선, 호, 원을 선택하십시오.');
    const c = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(c.center.x).toBeCloseTo(2, 9);
    expect(c.center.y).toBeCloseTo(2, 9);
  });
});

describe('PLINE 시작점의 지연된 접점', () => {
  it('다음 점에서 원에 그은 접선의 접점이 첫 정점, 그 뒤는 보통 선분', async () => {
    const h = draw();
    const c0 = h.add(circle(0, 0, 5));
    await h.run('PLINE', [{ pick: c0.handle, at: [0, 5] }, '20,0', '20,10', '']);
    const vs = lwVertices(modelEntities(h.doc, 'LWPOLYLINE')[0] as LwPolylineEntity);
    expect(vs.length).toBe(3);
    expect(vs[0]!.y).toBeGreaterThan(0);
    tangentAt(P(0, 0), 5, vs[0]!, vs[1]!);
    expect(vs[1]).toMatchObject({ x: 20, y: 0 });
    expect(vs[2]).toMatchObject({ x: 20, y: 10 });
  });

  it('다음 점도 지연된 접점이면 두 원의 공통 접선, 원 안의 점이면 다시 묻는다', async () => {
    const h = draw();
    const a = h.add(circle(0, 0, 2));
    const b = h.add(circle(20, 0, 3));
    await h.run('PLINE', [{ pick: a.handle, at: [0, -2] }, '0.5,0.5', { pick: b.handle, at: [20, -3] }, '']);
    expect(h.printed).toContain('그 점에서는 접선을 그을 수 없습니다. 다시 지정하십시오.');
    const vs = lwVertices(modelEntities(h.doc, 'LWPOLYLINE')[0] as LwPolylineEntity);
    expect(vs.length).toBe(2);
    tangentAt(P(0, 0), 2, vs[0]!, vs[1]!);
    tangentAt(P(20, 0), 3, vs[1]!, vs[0]!);
    expect(vs[0]!.y).toBeLessThan(0);
    expect(vs[1]!.y).toBeLessThan(0);
  });

  it('폴리선 호 구간에도 접한다', async () => {
    const h = draw();
    const pl = h.add(archPoly());
    await h.run('PLINE', [{ pick: pl.handle, at: [5, -5] }, '20,-5', '']);
    const vs = lwVertices(modelEntities(h.doc, 'LWPOLYLINE').find((x) => x.handle !== pl.handle)!);
    expect(vs[0]!.x).toBeCloseTo(5, 9);
    expect(vs[0]!.y).toBeCloseTo(-5, 9);
  });

  it('호(A) 등 다른 옵션을 고르면 찍은 자리 그대로 시작한다', async () => {
    const h = draw();
    const c0 = h.add(circle(0, 0, 5));
    await h.run('PLINE', [{ pick: c0.handle, at: [0, 5] }, 'L', '3', '']);
    const vs = lwVertices(modelEntities(h.doc, 'LWPOLYLINE')[0] as LwPolylineEntity);
    expect(vs[0]).toMatchObject({ x: 0, y: 5 });
  });
});

describe('XLINE 첫 점의 지연된 접점', () => {
  it('통과점마다 그 점에서 원에 그은 접선, 원 안이면 알린다', async () => {
    const h = draw();
    const c0 = h.add(circle(0, 0, 5));
    await h.run('XLINE', [{ pick: c0.handle, at: [0, 5] }, '20,0', '3,20', '1,1', '']);
    expect(h.printed).toContain('그 점에서는 접선을 그을 수 없습니다. 다시 지정하십시오.');
    const xs = modelEntities(h.doc, 'XLINE') as XLineEntity[];
    expect(xs.length).toBe(2);
    for (const x of xs) {
      // 중심에서 구성선까지 거리 = 반지름
      const dist = Math.abs((0 - x.base.x) * x.direction.y - (0 - x.base.y) * x.direction.x);
      expect(dist).toBeCloseTo(5, 9);
    }
    expect(Math.hypot(xs[0]!.base.x, xs[0]!.base.y)).toBeCloseTo(5, 9);
  });
});

