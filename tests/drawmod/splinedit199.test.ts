/**
 * 199차: SPLINEDIT로 스플라인 맞춤 폴리선(PEDIT 스플라인)을 고르면 스플라인으로 바꾼다.
 * 근거 — Autodesk SPLINEDIT 도움말(2026) 「스플라인 선택」: 스플라인 맞춤 폴리선을 고르면 고른 뒤 바로 끝내도 스플라인으로 바꾼다.
 * 바꾸는 꼴은 SPLINE 객체(O)와 같은 `splineFromFitPolyline`(틀 정점 = 조정점, 2차·3차 균일 B 스플라인)이다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, PolylineEntity, SplineEntity } from '../../src/core/model';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { polyVertices } from '../../src/core/polyverts';
import { splineFromFitPolyline } from '../../src/edit/geom/drawgeom';
import { entityPath } from '../../src/edit/geom/path';
import { pathEnd, pathNearest, pathStart } from '../../src/edit/geom/curve';
import { splinePolyline } from '../../src/edit/geom/pedit';
import { isSplineClosed } from '../../src/edit/geom/splinedit';
import { lw, poly2d } from '../edit/make';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from './groups';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

function harness() {
  const h = perCommandGroups(makeHarness());
  registerPeditCommands(h.app);
  return h;
}

/** 스플라인 맞춤 2D 폴리선(type 5 = 2차, 6 = 3차) */
function fitPoly(pts: [number, number][], type: 5 | 6, closed = false, extra: Partial<PolylineEntity> = {}): Entity {
  return { ...splinePolyline(poly2d(pts, closed) as never, type), handle: '', layer: '0', ...extra } as Entity;
}

/** 폴리선이 그린 근사 정점(VERTEX 70 비트 8)이 모두 스플라인 위에 있는지 */
function onCurve(s: SplineEntity, pl: PolylineEntity): void {
  const path = entityPath(s)!;
  const gen = polyVertices(pl).filter((v) => v.flags & 8);
  expect(gen.length).toBeGreaterThan(4);
  for (const v of gen) expect(pathNearest(path, v.location).d).toBeLessThan(1e-7);
}

describe('SPLINEDIT — 스플라인 맞춤 폴리선을 고르면 스플라인으로(199차)', () => {
  it('3차 스플라인 맞춤 폴리선을 고르고 바로 끝내도 같은 곡선의 SPLINE이 된다', async () => {
    const h = harness();
    const pl = h.add(fitPoly([[0, 0], [5, 5], [10, 0], [15, 5]], 6)) as PolylineEntity;
    const want = splineFromFitPolyline(pl)!;
    await h.run('SPLINEDIT', [{ pick: pl.handle, at: [0, 0] }, '']);
    expect(h.printed).not.toContain('스플라인이 아닙니다.');
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(0);
    const [s] = modelEntities(h.doc, 'SPLINE');
    expect(s).toBeTruthy();
    expect(s!.degree).toBe(3);
    expect(s!.knots).toEqual(want.knots);
    expect([...s!.controlVerts]).toEqual([...want.controlVerts]);
    expect(isSplineClosed(s!)).toBe(false);
    const path = entityPath(s!)!;
    close(pathStart(path).x, 0);
    close(pathStart(path).y, 0);
    close(pathEnd(path).x, 15);
    close(pathEnd(path).y, 5);
    onCurve(s!, pl);
    // 명령 전체는 U 한 번으로 되돌린다(폴리선이 돌아온다)
    h.st.session.undo();
    expect(modelEntities(h.doc, 'SPLINE').length).toBe(0);
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(1);
  });

  it('바꾼 스플라인을 이어서 편집한다 — 반전(R) 뒤 명령 취소(U)는 반전만 되돌리고 변환은 남는다', async () => {
    const h = harness();
    const pl = h.add(fitPoly([[0, 0], [5, 5], [10, 0], [15, 5]], 6));
    await h.run('SPLINEDIT', [{ pick: pl.handle, at: [0, 0] }, 'R', 'X']);
    let [s] = modelEntities(h.doc, 'SPLINE');
    let path = entityPath(s!)!;
    close(pathStart(path).x, 15);
    close(pathStart(path).y, 5);
    const h2 = harness();
    const pl2 = h2.add(fitPoly([[0, 0], [5, 5], [10, 0], [15, 5]], 6));
    await h2.run('SPLINEDIT', [{ pick: pl2.handle, at: [0, 0] }, 'R', 'U', 'U', '']);
    expect(h2.printed).toContain('명령 취소할 것이 없습니다.');
    expect(modelEntities(h2.doc, 'POLYLINE').length).toBe(0);
    [s] = modelEntities(h2.doc, 'SPLINE');
    path = entityPath(s!)!;
    close(pathStart(path).x, 0);
    close(pathStart(path).y, 0);
  });

  it('닫힌 2차 스플라인 맞춤 폴리선은 닫힌 2차 SPLINE', async () => {
    const h = harness();
    const pl = h.add(fitPoly([[0, 0], [10, 0], [10, 10], [0, 10]], 5, true)) as PolylineEntity;
    await h.run('SPLINEDIT', [{ pick: pl.handle, at: [5, 1] }, '']);
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(0);
    const [s] = modelEntities(h.doc, 'SPLINE');
    expect(s!.degree).toBe(2);
    expect(isSplineClosed(s!)).toBe(true);
    onCurve(s!, pl);
  });

  // −Z·기운 2D 스플라인 맞춤 폴리선은 200차부터 같은 자리의 스플라인으로 바꾼다(tests/drawmod/spline200.test.ts)
  it('전과 같은 꼴: 맞춤 아닌 2D 폴리선·경량 폴리선은 「스플라인이 아닙니다.」', async () => {
    const h = harness();
    const plain = h.add({ ...poly2d([[0, 0], [5, 5], [10, 0]]), handle: '' });
    const light = h.add({ ...lw([[0, 20], [5, 25], [10, 20]]), handle: '' });
    for (const e of [plain, light]) {
      h.printed.length = 0;
      await h.run('SPLINEDIT', [{ pick: e.handle, at: [0, 0] }, '']);
      expect(h.printed).toContain('스플라인이 아닙니다.');
    }
    expect(modelEntities(h.doc, 'SPLINE').length).toBe(0);
    expect(modelEntities(h.doc, 'POLYLINE').length).toBe(1);
    expect(modelEntities(h.doc, 'LWPOLYLINE').length).toBe(1);
  });
});
