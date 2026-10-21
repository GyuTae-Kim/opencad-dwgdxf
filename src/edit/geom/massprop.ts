/**
 * MASSPROP(2D 영역의 질량 특성): 면적·둘레·범위·도심·관성 모멘트(원점 기준)·관성 곱·회전 반경·도심 기준 주 모멘트와 방향.
 * 영역은 닫힌 고리들(평면 [x, y, …])로 받는다. 다른 고리 안에 홀수 번 든 고리는 구멍이다(REGION의 섬).
 */

export interface MassProps {
  area: number;
  perimeter: number;
  box: [number, number, number, number];
  centroid: [number, number];
  /** 원점 기준 ∫y² dA, ∫x² dA */
  ix: number;
  iy: number;
  /** 원점 기준 ∫xy dA */
  ixy: number;
  /** 회전 반경 √(I/A) */
  rx: number;
  ry: number;
  /** 도심 기준 주 모멘트와 축 방향(단위 벡터) */
  principal: { i: number; dir: [number, number] }[];
}

/** 고리 하나의 (부호 면적, ∫x dA, ∫y dA, ∫x² dA, ∫y² dA, ∫xy dA, 둘레) — 반시계 +. 그린 정리 */
function ringIntegrals(r: readonly number[]): number[] {
  let a = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let per = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = r[i * 2]!;
    const y0 = r[i * 2 + 1]!;
    const j = (i + 1) % n;
    const x1 = r[j * 2]!;
    const y1 = r[j * 2 + 1]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    sx += (x0 + x1) * c;
    sy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
    per += Math.hypot(x1 - x0, y1 - y0);
  }
  return [a / 2, sx / 6, sy / 6, sxx / 12, syy / 12, sxy / 24, per];
}

function inside(px: number, py: number, r: readonly number[]): boolean {
  let c = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2]!;
    const yi = r[i * 2 + 1]!;
    const xj = r[j * 2]!;
    const yj = r[j * 2 + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** 닫힌 고리들의 질량 특성(구멍은 빼고). 고리가 없으면 null */
export function massProps(rings: readonly number[][]): MassProps | null {
  const list = rings.filter((r) => r.length >= 6);
  if (!list.length) return null;
  let A = 0;
  let SX = 0;
  let SY = 0;
  let SXX = 0;
  let SYY = 0;
  let SXY = 0;
  let P = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  list.forEach((r, k) => {
    // 구멍인가: 첫 꼭짓점이 다른 고리 안에 든 횟수
    let depth = 0;
    for (let m = 0; m < list.length; m++) if (m !== k && inside(r[0]!, r[1]!, list[m]!)) depth++;
    const v = ringIntegrals(r);
    // 고리 방향과 관계없이 바깥 = +, 구멍 = −
    const s = (v[0]! >= 0 ? 1 : -1) * (depth % 2 ? -1 : 1);
    A += s * v[0]!;
    SX += s * v[1]!;
    SY += s * v[2]!;
    SXX += s * v[3]!;
    SYY += s * v[4]!;
    SXY += s * v[5]!;
    P += v[6]!;
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]!);
      maxX = Math.max(maxX, r[i]!);
      minY = Math.min(minY, r[i + 1]!);
      maxY = Math.max(maxY, r[i + 1]!);
    }
  });
  if (!(Math.abs(A) > 0)) return null;
  const cx = SX / A;
  const cy = SY / A;
  // 도심 기준(평행축 정리)
  const icx = SYY - A * cy * cy;
  const icy = SXX - A * cx * cx;
  const icxy = SXY - A * cx * cy;
  // 축 방향 d(단위)에 대한 모멘트 = Qd·d, Q = [[icx, −icxy], [−icxy, icy]] — 주 모멘트는 Q의 고윳값(작은 것 I, 큰 것 J)
  const avg = (icx + icy) / 2;
  const rad = Math.hypot((icx - icy) / 2, icxy);
  const dirOf = (lam: number): [number, number] => {
    if (Math.abs(icxy) > 1e-12 * Math.max(1, Math.abs(icx), Math.abs(icy))) {
      const l = Math.hypot(icxy, icx - lam);
      return [icxy / l, (icx - lam) / l];
    }
    return Math.abs(lam - icx) <= Math.abs(lam - icy) ? [1, 0] : [0, 1];
  };
  const principal: MassProps['principal'] = [avg - rad, avg + rad].map((lam) => ({ i: lam, dir: dirOf(lam) }));
  return {
    area: A,
    perimeter: P,
    box: [minX, minY, maxX, maxY],
    centroid: [cx, cy],
    ix: SYY,
    iy: SXX,
    ixy: SXY,
    rx: Math.sqrt(Math.abs(SYY / A)),
    ry: Math.sqrt(Math.abs(SXX / A)),
    principal,
  };
}

/** REGION의 모서리 선(순서 없는 열린 선들)을 끝점끼리 이어 닫힌 고리들로 */
export function wiresToRings(wires: readonly { x: number; y: number }[][], tol = 1e-6): number[][] {
  const left = wires.filter((w) => w.length >= 2).map((w) => w.map((p) => [p.x, p.y] as [number, number]));
  const rings: number[][] = [];
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol * Math.max(1, Math.abs(a[0]), Math.abs(a[1]));
  while (left.length) {
    const chain = left.shift()!;
    for (let guard = 0; guard < 100000 && !near(chain[0]!, chain[chain.length - 1]!); guard++) {
      const end = chain[chain.length - 1]!;
      const i = left.findIndex((w) => near(w[0]!, end) || near(w[w.length - 1]!, end));
      if (i < 0) break;
      const w = left.splice(i, 1)[0]!;
      const seg = near(w[0]!, end) ? w : [...w].reverse();
      chain.push(...seg.slice(1));
    }
    if (chain.length >= 4 && near(chain[0]!, chain[chain.length - 1]!)) rings.push(chain.slice(0, -1).flat());
  }
  return rings;
}
