import { describe, expect, it } from 'vitest';
import type { HatchEdge } from '../../src/core/model';
import { edgeCount, firstEdge, hatchEdges, packEdges, unpackEdges } from '../../src/core/hatchedges';

describe('해치 모서리 경계 평탄 자료', () => {
  const edges: HatchEdge[] = [
    { type: 'line', start: { x: 0, y: -0 }, end: { x: 10, y: 0 } },
    { type: 'arc', center: { x: 10, y: 5 }, radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, ccw: true },
    { type: 'ellipse', center: { x: 5, y: 10 }, majorAxis: { x: 5, y: 0 }, ratio: 0.4, startAngle: 0, endAngle: Math.PI, ccw: false },
    { type: 'spline', degree: 3, rational: false, periodic: false, knots: [0, 0, 0, 0, 1, 1, 1, 1], controlPoints: [{ x: 0, y: 10 }, { x: -1, y: 7 }, { x: 1, y: 3 }, { x: 0, y: 0 }] },
    {
      type: 'spline',
      degree: 2,
      rational: true,
      periodic: true,
      knots: [0, 1, 2],
      controlPoints: [{ x: 1, y: 2 }],
      weights: [],
      fitPoints: [{ x: 3, y: 4 }],
      startTangent: { x: 1, y: 0 },
      endTangent: { x: 0, y: -1 },
    },
    { type: 'spline', degree: 3, rational: true, periodic: false, knots: [], controlPoints: [], weights: [0.5, 2], fitPoints: [] },
  ];

  it('선·호·타원호·스플라인(가중치·맞춤점·접선 있음과 없음)이 그대로 돌아온다', () => {
    const d = packEdges(edges);
    expect(d.slice(0, 5)).toEqual([1, 0, -0, 10, 0]);
    expect(Object.is(d[2], -0)).toBe(true);
    const back = unpackEdges(d);
    expect(back).toEqual(edges);
    // 키 순서도 읽기가 만들던 것과 같다(지문을 JSON으로 만드는 곳이 있다)
    expect(back.map((e) => Object.keys(e))).toEqual(edges.map((e) => Object.keys(e)));
    expect(Object.is((back[0] as Extract<HatchEdge, { type: 'line' }>).start.y, -0)).toBe(true);
    expect(edgeCount({ edgeData: d })).toBe(6);
    expect(firstEdge({ edgeData: d })).toEqual(edges[0]);
  });

  it('모서리 경로가 아니면 빈 목록, 모서리 없는 경로는 빈 배열 그대로', () => {
    expect(hatchEdges({})).toEqual([]);
    expect(edgeCount({})).toBe(0);
    expect(firstEdge({})).toBeUndefined();
    expect(packEdges([])).toEqual([]);
    expect(firstEdge({ edgeData: [] })).toBeUndefined();
  });
});
