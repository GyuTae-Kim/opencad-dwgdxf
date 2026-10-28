/**
 * 해치 모서리 경계 평탄 자료: 경로의 모서리(선·호·타원호·스플라인)를 객체 배열 대신 수 배열 하나(HatchPath.edgeData)로 둔다
 * (큰 도면의 문서 메모리·GC를 줄인다 — 경량 폴리선 src/core/lwpoly.ts와 같은 방식).
 *
 * 모서리마다 종류 번호로 시작하는 기록을 이어 쓴다.
 * - 1 선: [1, 시작 x, 시작 y, 끝 x, 끝 y]
 * - 2 호: [2, 중심 x, 중심 y, 반지름, 시작각, 끝각, 반시계(1·0)]
 * - 3 타원호: [3, 중심 x, 중심 y, 장축 x, 장축 y, 비, 시작각, 끝각, 반시계(1·0)]
 * - 4 스플라인: [4, 차수, 유리(1·0), 주기(1·0), 매듭 수, 매듭…, 조정점 수, (x, y)…, 가중치 수(없으면 -1), 가중치…,
 *   맞춤점 수(없으면 -1), (x, y)…, 시작 접선 있음(1·0), (x, y), 끝 접선 있음(1·0), (x, y)]
 * 그리기·쓰기·편집은 hatchEdges로 풀어 쓴 모서리 객체를 보고, 고친 뒤 packEdges로 되돌린다.
 */
import type { HatchEdge, HatchPath, HatchSplineEdge, Vec2 } from './model';

export const EDGE_LINE = 1;
export const EDGE_ARC = 2;
export const EDGE_ELLIPSE = 3;
export const EDGE_SPLINE = 4;

const pushPts = (out: number[], pts: readonly Vec2[]): void => {
  for (const p of pts) out.push(p.x, p.y);
};

/** 모서리 하나를 기록으로 이어 쓴다 */
export function packEdge(e: HatchEdge, out: number[]): void {
  switch (e.type) {
    case 'line':
      out.push(EDGE_LINE, e.start.x, e.start.y, e.end.x, e.end.y);
      return;
    case 'arc':
      out.push(EDGE_ARC, e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle, e.ccw ? 1 : 0);
      return;
    case 'ellipse':
      out.push(EDGE_ELLIPSE, e.center.x, e.center.y, e.majorAxis.x, e.majorAxis.y, e.ratio, e.startAngle, e.endAngle, e.ccw ? 1 : 0);
      return;
    case 'spline': {
      out.push(EDGE_SPLINE, e.degree, e.rational ? 1 : 0, e.periodic ? 1 : 0, e.knots.length);
      for (const k of e.knots) out.push(k);
      out.push(e.controlPoints.length);
      pushPts(out, e.controlPoints);
      if (e.weights) {
        out.push(e.weights.length);
        for (const w of e.weights) out.push(w);
      } else out.push(-1);
      if (e.fitPoints) {
        out.push(e.fitPoints.length);
        pushPts(out, e.fitPoints);
      } else out.push(-1);
      if (e.startTangent) out.push(1, e.startTangent.x, e.startTangent.y);
      else out.push(0);
      if (e.endTangent) out.push(1, e.endTangent.x, e.endTangent.y);
      else out.push(0);
      return;
    }
  }
}

/** 모서리들 → 수 배열 */
export function packEdges(edges: readonly HatchEdge[]): number[] {
  const out: number[] = [];
  for (const e of edges) packEdge(e, out);
  return out.slice();
}

/** 기록 하나를 풀어 쓴다. 돌려주는 next는 다음 기록의 자리 */
function unpackAt(d: readonly number[], i: number): { edge: HatchEdge; next: number } | null {
  const t = d[i];
  if (t === EDGE_LINE) return { edge: { type: 'line', start: { x: d[i + 1]!, y: d[i + 2]! }, end: { x: d[i + 3]!, y: d[i + 4]! } }, next: i + 5 };
  if (t === EDGE_ARC) return { edge: { type: 'arc', center: { x: d[i + 1]!, y: d[i + 2]! }, radius: d[i + 3]!, startAngle: d[i + 4]!, endAngle: d[i + 5]!, ccw: d[i + 6] !== 0 }, next: i + 7 };
  if (t === EDGE_ELLIPSE)
    return {
      edge: { type: 'ellipse', center: { x: d[i + 1]!, y: d[i + 2]! }, majorAxis: { x: d[i + 3]!, y: d[i + 4]! }, ratio: d[i + 5]!, startAngle: d[i + 6]!, endAngle: d[i + 7]!, ccw: d[i + 8] !== 0 },
      next: i + 9,
    };
  if (t === EDGE_SPLINE) {
    let k = i + 1;
    const degree = d[k++]!;
    const rational = d[k++] !== 0;
    const periodic = d[k++] !== 0;
    const nk = d[k++]!;
    const knots: number[] = [];
    for (let j = 0; j < nk; j++) knots.push(d[k++]!);
    const nc = d[k++]!;
    const controlPoints: Vec2[] = [];
    for (let j = 0; j < nc; j++, k += 2) controlPoints.push({ x: d[k]!, y: d[k + 1]! });
    const sp: HatchSplineEdge = { type: 'spline', degree, rational, periodic, knots, controlPoints };
    const nw = d[k++]!;
    if (nw >= 0) {
      const weights: number[] = [];
      for (let j = 0; j < nw; j++) weights.push(d[k++]!);
      sp.weights = weights;
    }
    const nf = d[k++]!;
    if (nf >= 0) {
      const fitPoints: Vec2[] = [];
      for (let j = 0; j < nf; j++, k += 2) fitPoints.push({ x: d[k]!, y: d[k + 1]! });
      sp.fitPoints = fitPoints;
    }
    if (d[k++]) {
      sp.startTangent = { x: d[k]!, y: d[k + 1]! };
      k += 2;
    }
    if (d[k++]) {
      sp.endTangent = { x: d[k]!, y: d[k + 1]! };
      k += 2;
    }
    return { edge: sp, next: k };
  }
  return null;
}

/** 수 배열 → 모서리들(새 객체 — 고쳐도 문서는 그대로) */
export function unpackEdges(d: readonly number[]): HatchEdge[] {
  const out: HatchEdge[] = [];
  for (let i = 0; i < d.length; ) {
    const r = unpackAt(d, i);
    if (!r) break;
    out.push(r.edge);
    i = r.next;
  }
  return out;
}

/** 경로의 모서리들(모서리 경로가 아니면 빈 배열) — 예전 `p.edges ?? []` */
export function hatchEdges(p: Pick<HatchPath, 'edgeData'>): HatchEdge[] {
  return p.edgeData ? unpackEdges(p.edgeData) : [];
}

/** 경로의 첫 모서리 */
export function firstEdge(p: Pick<HatchPath, 'edgeData'>): HatchEdge | undefined {
  return p.edgeData && p.edgeData.length ? (unpackAt(p.edgeData, 0)?.edge ?? undefined) : undefined;
}

/** 경로의 모서리 수 */
export function edgeCount(p: Pick<HatchPath, 'edgeData'>): number {
  const d = p.edgeData;
  if (!d) return 0;
  let n = 0;
  for (let i = 0; i < d.length; ) {
    const r = unpackAt(d, i);
    if (!r) break;
    n++;
    i = r.next;
  }
  return n;
}
