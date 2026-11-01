/**
 * 해치: 경계 고리 만들기, 채우기 삼각분할, 무늬 선 자르기.
 * 좌표는 해치 OCS(2D)다. 호출한 쪽이 월드로 옮긴다.
 */
import earcut from 'earcut';
import { LINETYPE_ELEMENTS } from '../core/limits';
import type { HatchEntity, HatchPath, HatchPatternLine } from '../core/model';
import { type FitWork, arcPoints, bulgeFlatPoints, ccwSweep, ellipsePoints, interpolateFitPoints, nurbsPoints } from '../geom/curves';
import { type DashWork, dashInterval } from './linetype';
import { hatchEdges } from '../core/hatchedges';

/** 경로 하나 → 닫힌 고리 [x, y, …]. fit이 있으면 맞춤점 보간의 일을 더한다 */
export function pathLoop(p: HatchPath, tol: number, fit?: FitWork): number[] {
  if (p.polyline) return bulgeFlatPoints(p.polyline.verts, true, tol);
  const out: number[] = [];
  const push = (x: number, y: number) => {
    const n = out.length;
    if (n >= 2 && Math.abs(out[n - 2]! - x) < 1e-12 && Math.abs(out[n - 1]! - y) < 1e-12) return;
    out.push(x, y);
  };
  for (const e of hatchEdges(p)) {
    switch (e.type) {
      case 'line':
        push(e.start.x, e.start.y);
        push(e.end.x, e.end.y);
        break;
      case 'arc': {
        const sweep = ccwSweep(e.startAngle, e.endAngle);
        const pts = arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, sweep, tol);
        if (!e.ccw) reversePairs(pts);
        for (let i = 0; i < pts.length; i += 2) push(pts[i]!, pts[i + 1]!);
        break;
      }
      case 'ellipse': {
        // 해치 타원 경계의 각도는 기하 각도 → 매개변수로
        const toParam = (a: number) => Math.atan2(Math.sin(a) / (e.ratio || 1), Math.cos(a));
        const p0 = toParam(e.startAngle);
        let p1 = toParam(e.endAngle);
        const full = Math.abs(ccwSweep(e.startAngle, e.endAngle) - Math.PI * 2) < 1e-9;
        if (full) p1 = p0 + Math.PI * 2;
        const pts = ellipsePoints(e.center.x, e.center.y, e.majorAxis.x, e.majorAxis.y, e.ratio, p0, p1, tol);
        if (!e.ccw) reversePairs(pts);
        for (let i = 0; i < pts.length; i += 2) push(pts[i]!, pts[i + 1]!);
        break;
      }
      case 'spline': {
        let ctrl = e.controlPoints.map((q) => ({ x: q.x, y: q.y, z: 0 }));
        let knots = e.knots;
        let degree = e.degree;
        if (ctrl.length < 2 && e.fitPoints && e.fitPoints.length >= 2) {
          const s = interpolateFitPoints(
            e.fitPoints.map((q) => ({ x: q.x, y: q.y, z: 0 })),
            e.startTangent ? { x: e.startTangent.x, y: e.startTangent.y, z: 0 } : undefined,
            e.endTangent ? { x: e.endTangent.x, y: e.endTangent.y, z: 0 } : undefined,
            fit,
          );
          ctrl = s.ctrl;
          knots = s.knots;
          degree = s.degree;
        }
        const pts = nurbsPoints(degree, knots, ctrl, e.rational ? e.weights : undefined, tol);
        for (let i = 0; i < pts.length; i += 3) push(pts[i]!, pts[i + 1]!);
        break;
      }
    }
  }
  // 닫힘점 제거
  const n = out.length;
  if (n >= 4 && Math.abs(out[0]! - out[n - 2]!) < 1e-9 && Math.abs(out[1]! - out[n - 1]!) < 1e-9) out.length = n - 2;
  return out;
}

function reversePairs(a: number[]): void {
  for (let i = 0, j = a.length - 2; i < j; i += 2, j -= 2) {
    const x = a[i]!;
    const y = a[i + 1]!;
    a[i] = a[j]!;
    a[i + 1] = a[j + 1]!;
    a[j] = x;
    a[j + 1] = y;
  }
}

function pointInRing(x: number, y: number, c: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, n = c.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = c[i]!;
    const yi = c[i + 1]!;
    const xj = c[j]!;
    const yj = c[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 해치 스타일에 따라 쓸 고리를 고른다(2 = 가장 바깥만). */
export function hatchLoops(h: HatchEntity, tol: number, fit?: FitWork): number[][] {
  let loops = h.paths.map((p) => ({ p, ring: pathLoop(p, tol, fit) })).filter((l) => l.ring.length >= 6);
  if (h.hatchStyle === 2) {
    const outer = loops.filter((l) => l.p.flags & 1 || l.p.flags & 16);
    if (outer.length) loops = outer;
  }
  return loops.map((l) => l.ring);
}

/** 경계 고리를 만들고 고리 사이 포함 관계를 따지는 일(고리 수 × 정점 수). 곱이 2^31을 넘을 수 있어 비트 연산으로 나누지 않는다 */
export function hatchLoopWork(loops: number, verts: number): number {
  return verts + Math.floor(((loops - 1) * verts) / 32);
}

/** 고리들을 홀짝 규칙으로 삼각분할 */
export function triangulateLoops(loops: number[][]): number[] {
  const depth = loops.map((c, i) => {
    let d = 0;
    // 고리 안쪽 점: 첫 변의 중점을 조금 안으로
    const x = (c[0]! + c[2]!) / 2;
    const y = (c[1]! + c[3]!) / 2;
    for (let j = 0; j < loops.length; j++) if (j !== i && pointInRing(x, y, loops[j]!)) d++;
    return d;
  });
  const out: number[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depth[i]! % 2 !== 0) continue;
    const outer = loops[i]!;
    const flat = [...outer];
    const holes: number[] = [];
    for (let j = 0; j < loops.length; j++) {
      if (j === i || depth[j] !== depth[i]! + 1) continue;
      const h = loops[j]!;
      if (!pointInRing((h[0]! + h[2]!) / 2, (h[1]! + h[3]!) / 2, outer)) continue;
      holes.push(flat.length / 2);
      flat.push(...h);
    }
    const idx = earcut(flat, holes, 2);
    for (const k of idx) out.push(flat[k * 2]!, flat[k * 2 + 1]!);
  }
  return out;
}

/** 한 해치를 그릴 무늬 선 수의 상한(넘으면 성기게 그리고, 확대하면 보이는 곳만 원래 간격으로 — build.ts) */
export const HATCH_LINE_LIMIT = 200000;

/** 해치를 만들 때 무늬 선 수의 상한(AutoCAD HPMAXLINES 기본값) */
export const HATCH_CREATE_LIMIT = 1000000;

/** 무늬 선 간격을 f배로(너무 촘촘한 해치를 멀리서 볼 때 성기게 그린다) */
export function spreadPattern(lines: readonly HatchPatternLine[], f: number): HatchPatternLine[] {
  return lines.map((l) => ({ ...l, offset: { x: l.offset.x * f, y: l.offset.y * f } }));
}

/** 고리(평평한 [x, y, …])들을 사각형으로 자른다(서덜랜드-호지먼 — 홀짝 채우기에 그대로 쓸 수 있다) */
export function clipLoopsToRect(loops: number[][], r: readonly [number, number, number, number]): number[][] {
  const out: number[][] = [];
  for (const loop of loops) {
    let pts: number[] = loop;
    const sides: [number, number, number][] = [
      [0, r[0], 1],
      [0, r[2], -1],
      [1, r[1], 1],
      [1, r[3], -1],
    ];
    for (const [axis, v, sign] of sides) {
      const next: number[] = [];
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]!;
        const ay = pts[i * 2 + 1]!;
        const j = (i + 1) % n;
        const bx = pts[j * 2]!;
        const by = pts[j * 2 + 1]!;
        const ia = ((axis ? ay : ax) - v) * sign >= 0;
        const ib = ((axis ? by : bx) - v) * sign >= 0;
        if (ia !== ib) {
          const t = (v - (axis ? ay : ax)) / ((axis ? by : bx) - (axis ? ay : ax));
          next.push(ax + (bx - ax) * t, ay + (by - ay) * t);
        }
        if (ib) next.push(bx, by);
      }
      pts = next;
      if (pts.length < 6) break;
    }
    if (pts.length >= 6) out.push(pts);
  }
  return out;
}

/**
 * 무늬 선을 경계로 자른다. 결과: 선분 [x0, y0, x1, y1, …], 너무 많으면 null
 *
 * 무늬 선 하나마다 모든 경계 변을 보면 선 수 × 변 수라, 촘촘한 해치(선 20만 개)에 변이 많으면(곡선 경계) 몇 초가 걸린다.
 * 변마다 지나는 선 번호(k) 범위를 미리 구해 k 순으로 쓸어 가며 그 선에 걸칠 수 있는 변만 본다(교차 판정·순서는 그대로).
 * work가 있으면 들인 일을 더한다(무늬가 조각을 내지 않아도 시간이 드는 것을 블록 펼침 한도가 센다).
 */
export function patternSegments(lines: readonly HatchPatternLine[], loops: number[][], limit = HATCH_LINE_LIMIT, work?: DashWork): number[] | null {
  const out: number[] = [];
  if (!loops.length) return out;
  // 조각 한도(선 하나당 8)까지 형식 안의 무늬(요소 12개)가 밟는 수. 구간 하나는 조각 하나에 주기 4개까지 세므로(주기 2개 길이에 대시 하나 + 2) 4배를 둔다
  const stepLimit = limit * 8 * LINETYPE_ELEMENTS * 4;
  let steps = 0;
  // 경계 상자
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let edgeCount = 0;
  for (const l of loops) {
    edgeCount += l.length >> 1;
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i]!);
      maxX = Math.max(maxX, l[i]!);
      minY = Math.min(minY, l[i + 1]!);
      maxY = Math.max(maxY, l[i + 1]!);
    }
  }
  // 변 끝점(고리마다 마지막 점 → 첫 점으로 닫힌다)
  const ax = new Float64Array(edgeCount);
  const ay = new Float64Array(edgeCount);
  const bx = new Float64Array(edgeCount);
  const by = new Float64Array(edgeCount);
  {
    let e = 0;
    for (const l of loops) {
      const n = l.length;
      for (let i = 0; i < n; i += 2, e++) {
        const j = (i + 2) % n;
        ax[e] = l[i]!;
        ay[e] = l[i + 1]!;
        bx[e] = l[j]!;
        by[e] = l[j + 1]!;
      }
    }
  }
  const corners = [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
  const kLo = new Float64Array(edgeCount);
  const kHi = new Float64Array(edgeCount);
  const order = new Int32Array(edgeCount);
  const active = new Int32Array(edgeCount);
  let count = 0;
  for (const pl of lines) {
    const ux = Math.cos(pl.angle);
    const uy = Math.sin(pl.angle);
    // 선 사이 간격 = 오프셋의 법선 성분
    const nx = -uy;
    const ny = ux;
    const spacing = pl.offset.x * nx + pl.offset.y * ny;
    if (Math.abs(spacing) < 1e-12) continue;
    // 상자 꼭짓점의 법선 방향 거리로 k 범위
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const d = (corners[i]! - pl.base.x) * nx + (corners[i + 1]! - pl.base.y) * ny;
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
    }
    let k0 = Math.ceil(dMin / spacing);
    let k1 = Math.floor(dMax / spacing);
    if (k0 > k1) [k0, k1] = [k1, k0];
    if (k1 - k0 > limit) return null;
    // 번호가 2^53을 넘으면(기준점이 아주 멀거나 간격이 아주 작은 자료) k++가 값을 바꾸지 못해 아래 고리가 끝나지 않는다.
    // 간격을 넓히면(spreadPattern) 번호가 작아지므로 "너무 촘촘함"으로 돌려준다
    if (Math.abs(k0) >= Number.MAX_SAFE_INTEGER || Math.abs(k1) >= Number.MAX_SAFE_INTEGER) return null;
    if (work) work.n += edgeCount >> 2;
    // 변마다 걸칠 수 있는 선 번호 범위(반올림 오차만큼 한 칸씩 넉넉히 — 실제 교차는 아래에서 예전 식 그대로 판정)
    for (let e = 0; e < edgeCount; e++) {
      const ka = ((ax[e]! - pl.base.x) * nx + (ay[e]! - pl.base.y) * ny) / spacing;
      const kb = ((bx[e]! - pl.base.x) * nx + (by[e]! - pl.base.y) * ny) / spacing;
      kLo[e] = Math.floor(Math.min(ka, kb)) - 1;
      kHi[e] = Math.ceil(Math.max(ka, kb)) + 1;
      order[e] = e;
    }
    order.sort((p, q) => kLo[p]! - kLo[q]!);
    let next = 0;
    let nActive = 0;
    const dashes = pl.dashes;
    const period = dashes.reduce((a, b) => a + Math.abs(b), 0);
    const onDashes = dashes.filter((d) => d >= 0).length;
    const ts: number[] = [];
    for (let k = k0; k <= k1; k++) {
      // 이 선에 걸칠 수 있는 변: 새로 들어온 변을 더하고 지나간 변은 뺀다
      while (next < edgeCount && kLo[order[next]!]! <= k) active[nActive++] = order[next++]!;
      if (!nActive) {
        // 다음 변이 시작하는 선까지 건너뛴다
        if (next >= edgeCount) break;
        const skip = Math.max(k, Math.floor(kLo[order[next]!]!) - 1);
        if (skip > k) k = skip;
        continue;
      }
      if (work) work.n += 1 + (nActive >> 2);
      // 선 k의 원점(무늬 시작)
      const ox = pl.base.x + pl.offset.x * k;
      const oy = pl.base.y + pl.offset.y * k;
      ts.length = 0;
      let w = 0;
      for (let r = 0; r < nActive; r++) {
        const e = active[r]!;
        if (kHi[e]! < k) continue;
        active[w++] = e;
        const da = (ax[e]! - ox) * nx + (ay[e]! - oy) * ny;
        const db = (bx[e]! - ox) * nx + (by[e]! - oy) * ny;
        if ((da > 0) === (db > 0)) continue;
        if (da === db) continue;
        const s = da / (da - db);
        const px = ax[e]! + (bx[e]! - ax[e]!) * s;
        const py = ay[e]! + (by[e]! - ay[e]!) * s;
        ts.push((px - ox) * ux + (py - oy) * uy);
      }
      nActive = w;
      if (ts.length < 2) continue;
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const t0 = ts[i]!;
        const t1 = ts[i + 1]!;
        if (t1 - t0 < 1e-12) continue;
        // 한도는 구간 뒤에 보므로 대시가 아주 짧으면 구간 하나가 수십억 조각을 만든다. 펼치기 전에 세어 같은 결과(null)를 돌려준다
        if (dashes.length && period > 0 && (t1 - t0) / period - 2 > (limit * 8 - count) / Math.max(1, onDashes)) return null;
        // 틈은 조각을 내지 않아 위의 조각 수가 못 본다. 요소를 밟는 수가 예산을 넘으면 이 구간은 실선으로
        const intervalSteps = dashes.length && period > 0 ? ((t1 - t0) / period + 2) * dashes.length : 0;
        steps += intervalSteps;
        if (steps > stepLimit) {
          if (work) work.limited = true;
          dashInterval(t0, t1, [], 0, (a, b) => {
            out.push(ox + ux * a, oy + uy * a, ox + ux * b, oy + uy * b);
            count++;
          });
        } else {
          if (work) work.n += Math.floor(intervalSteps / 8);
          dashInterval(t0, t1, dashes, period, (a, b) => {
            out.push(ox + ux * a, oy + uy * a, ox + ux * b, oy + uy * b);
            count++;
          });
        }
        if (count > limit * 8) return null;
      }
    }
  }
  return out;
}

/** 사용자 정의 무늬(_USER 등)가 선 정의 없이 왔을 때 각도·간격으로 만든다. */
export function userPattern(h: HatchEntity): HatchPatternLine[] {
  const a = h.patternAngle;
  const s = h.patternScale || 1;
  const off = { x: -Math.sin(a) * s, y: Math.cos(a) * s };
  const lines: HatchPatternLine[] = [{ angle: a, base: { x: 0, y: 0 }, offset: off, dashes: [] }];
  if (h.patternDouble) lines.push({ angle: a + Math.PI / 2, base: { x: 0, y: 0 }, offset: { x: -Math.cos(a) * s, y: -Math.sin(a) * s }, dashes: [] });
  return lines;
}
