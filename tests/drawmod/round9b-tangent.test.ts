/**
 * 9차 후속: 타원·타원호·스플라인의 지연된 접점(LINE·XLINE·PLINE·CIRCLE 3P·Ttr·TTT).
 * 하네스의 { pick, at }은 그 객체 위 at을 지연된 접점 스냅으로 찍은 것이다.
 */
import { describe, expect, it } from 'vitest';
import type { CircleEntity, Entity, LineEntity, LwPolylineEntity, XLineEntity } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerDrawCommands } from '../../src/app/draw';
import { type Piece, pieceAt, pieceD1 } from '../../src/edit/geom/curve';
import { entityPath } from '../../src/edit/geom/path';
import { circle, ellipse, line, spline } from '../edit/make';
import { type Harness, makeHarness, modelEntities } from '../cmds2/harness';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

function draw(): Harness {
  const h = makeHarness();
  registerDrawCommands(h.app);
  return h;
}

/** 직선 a→b가 곡선에 접하는지: 곡선 위 가장 가까운 점이 직선 위에 있고, 거기서 곡선 도함수가 직선과 나란하다 */
function touches(e: Entity, a: Pt, b: Pt): void {
  const pc: Piece = entityPath(e)!.pieces[0]!;
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const L = Math.hypot(dir.x, dir.y);
  // 곡선 위에서 직선까지 거리가 가장 작은 점
  let best = { t: 0, d: Infinity };
  const N = 40000;
  for (let i = 0; i <= N; i++) {
    const q = pieceAt(pc, i / N);
    const d = Math.abs(cross(dir, { x: q.x - a.x, y: q.y - a.y })) / L;
    if (d < best.d) best = { t: i / N, d };
  }
  expect(best.d).toBeLessThan(1e-4);
  const D = pieceD1(pc, best.t);
  expect(Math.abs(cross(D, dir)) / (Math.hypot(D.x, D.y) * L)).toBeLessThan(1e-3);
}

/** 타원 x²/16 + y²/4 = 1 */
const ell = () => ellipse(0, 0, 4, 0, 0.5);
/** S자 3차 스플라인 */
const wave = () => spline([[0, 0], [5, 10], [10, -6], [15, 8], [20, 0]]);

describe('LINE의 지연된 접점: 타원·스플라인', () => {
  it('타원 위 지연된 접점 → 점: 그 점에서 그은 접선(찍은 자리 쪽 접점)', async () => {
    const h = draw();
    const e = h.add(ell());
    await h.run('LINE', [{ pick: e.handle, at: [0, 2] }, '8,0', '']);
    const l = modelEntities(h.doc, 'LINE')[0] as LineEntity;
    expect(l.start.x).toBeCloseTo(2, 9);
    expect(l.start.y).toBeCloseTo(Math.sqrt(3), 9);
    expect(l.end).toMatchObject({ x: 8, y: 0 });
    // 아래를 찍으면 아래 접점
    const h2 = draw();
    const e2 = h2.add(ell());
    await h2.run('LINE', [{ pick: e2.handle, at: [0, -2] }, '8,0', '']);
    expect((modelEntities(h2.doc, 'LINE')[0] as LineEntity).start.y).toBeCloseTo(-Math.sqrt(3), 9);
  });

  it('타원 → 원: 공통 접선, 타원 안의 점이면 다시 묻는다', async () => {
    const h = draw();
    const e = h.add(ell());
    const c = h.add(circle(20, 0, 3));
    await h.run('LINE', [{ pick: e.handle, at: [0, 2] }, '1,0', { pick: c.handle, at: [20, 3] }, '']);
    expect(h.printed).toContain('그 점에서는 접선을 그을 수 없습니다. 다시 지정하십시오.');
    const l = modelEntities(h.doc, 'LINE')[0] as LineEntity;
    touches(e, l.start, l.end);
    expect(d2(l.end, P(20, 0))).toBeCloseTo(3, 9);
    expect(l.start.y).toBeGreaterThan(0);
    expect(l.end.y).toBeGreaterThan(0);
  });

  it('스플라인 → 점, 타원호 범위 밖의 접점은 없다', async () => {
    const h = draw();
    const s = h.add(wave());
    await h.run('LINE', [{ pick: s.handle, at: [4, 5] }, '10,20', '']);
    const l = modelEntities(h.doc, 'LINE')[0] as LineEntity;
    touches(s, l.start, l.end);
    expect(l.end).toMatchObject({ x: 10, y: 20 });
    // 위쪽 반 타원호(0 → π): 아래에서는 접점이 호 밖
    const h2 = draw();
    const a = h2.add(ellipse(0, 0, 4, 0, 0.5, 0, Math.PI));
    await h2.run('LINE', [{ pick: a.handle, at: [3, 1.3] }, '8,-1', '8,1', '']);
    expect(h2.printed).toContain('그 점에서는 접선을 그을 수 없습니다. 다시 지정하십시오.');
    const l2 = modelEntities(h2.doc, 'LINE')[0] as LineEntity;
    expect(l2.start.y).toBeGreaterThan(0);
    touches(a, l2.start, l2.end);
  });
});

describe('XLINE·PLINE의 지연된 접점: 타원·스플라인', () => {
  it('XLINE: 스플라인에 접하는 구성선, 통과점도 원의 지연된 접점이면 공통 접선', async () => {
    const h = draw();
    const s = h.add(wave());
    const c = h.add(circle(10, 20, 2));
    await h.run('XLINE', [{ pick: s.handle, at: [4, 5] }, '-5,15', { pick: c.handle, at: [8, 20] }, '']);
    const xs = modelEntities(h.doc, 'XLINE') as XLineEntity[];
    expect(xs.length).toBe(2);
    for (const x of xs) touches(s, x.base, { x: x.base.x + x.direction.x, y: x.base.y + x.direction.y });
    const x2 = xs[1]!;
    expect(Math.abs((10 - x2.base.x) * x2.direction.y - (20 - x2.base.y) * x2.direction.x)).toBeCloseTo(2, 7);
  });

  it('PLINE: 타원 위 시작점은 다음 점에서 그은 접선의 접점', async () => {
    const h = draw();
    const e = h.add(ell());
    await h.run('PLINE', [{ pick: e.handle, at: [0, 2] }, '8,0', '8,6', '']);
    const vs = lwVertices(modelEntities(h.doc, 'LWPOLYLINE')[0] as LwPolylineEntity);
    expect(vs.length).toBe(3);
    expect(vs[0]!.x).toBeCloseTo(2, 9);
    expect(vs[0]!.y).toBeCloseTo(Math.sqrt(3), 9);
  });
});

describe('CIRCLE의 지연된 접점: 타원·스플라인', () => {
  it('Ttr: 타원과 선에 접하는 원', async () => {
    const h = draw();
    const e = h.add(ell());
    const l = h.add(line(-20, -5, 20, -5));
    await h.run('CIRCLE', ['T', { pick: e.handle, at: [2, -1.7] }, { pick: l.handle, at: [2, -5] }, '1']);
    const c = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(c.center.y).toBeCloseTo(-4, 9);
    expect(c.center.x).toBeGreaterThan(0);
    expect(c.radius).toBe(1);
  });

  it('TTT: 스플라인 맨 아래와 두 선, 3P: 두 점과 타원', async () => {
    const h = draw();
    const s = h.add(spline([[-10, 10], [-5, -10], [5, -10], [10, 10]]));
    const a = h.add(line(-20, -8, 20, -8));
    const b = h.add(line(-3, -20, -3, 20));
    await h.run('CIRCLE', [{ pick: s.handle, at: [-1.5, -4.8] }, { pick: a.handle, at: [-2, -8] }, { pick: b.handle, at: [-3, -6] }], 'TTT');
    const c = modelEntities(h.doc, 'CIRCLE')[0] as CircleEntity;
    expect(c.center.y + 8).toBeCloseTo(c.radius, 9);
    expect(c.center.x + 3).toBeCloseTo(c.radius, 9);
    const h2 = draw();
    const e = h2.add(ell());
    await h2.run('CIRCLE', ['3P', '8,0', '8,6', { pick: e.handle, at: [3.5, 1] }]);
    const k = modelEntities(h2.doc, 'CIRCLE')[0] as CircleEntity;
    expect(Math.hypot(k.center.x - 8, k.center.y)).toBeCloseTo(k.radius, 9);
    expect(k.center.y).toBeCloseTo(3, 9);
  });
});
