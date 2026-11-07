/**
 * 61차: 파일 크기의 제곱으로 느려지던 최상위 해치와 다중 지시선.
 * 고치기 전에는 채운 해치의 구멍 4만 개(DXF 3.2MB)가 271초(고리마다 모든 고리를 판정하고, earcut이 구멍을 이을 때마다 이어 둔 구멍을 모두 훑었다),
 * 무늬 선 2,000개 × 변 2만 개(DXF 0.5MB)가 5초, 선종류 2만 개 도면의 다중 지시선 2만 개가 2.3초였다.
 * 보장은 예전 식과 같은 삼각형·넓이·일·경고로 보고, 시간은 끝나지 않는 꼴만 가른다(timed.ts).
 * 91차: 어느 축에도 구멍 사이 틈이 없는 구멍 많은 해치는 earcut 한 번이라 모양에 따라 일로 셀 수 없이 느렸다(서로 감싼 ㄱ자 구멍 1,200개 35초).
 * 구멍을 가로질러 칸으로 자른 삼각형이 넓이와 점 표본으로 원래 홀짝 영역과 같은지 본다.
 * 92차: 구멍 상자가 서로 덮는 꼴은 고리 포함 관계(상자 격자)가 고리 수의 제곱이라 ㄱ자 구멍 2,400개·기운 막대 4,000개가 칸 자르기 전에 한도를 넘었고,
 * 구멍 512개 이하는 한 번에 earcut이라 ㄱ자 구멍 500개가 2~4초였다. 변 훑기로 갈아탄 깊이·구멍이 모든 고리를 판정한 식과 같은지,
 * 일이 해치 크기에 비례하는지, 정상 꼴은 갈아타지 않는지(일까지 같다), 구멍 상자가 서로 덮는 512개 이하 꼴을 칸으로 잘라도 영역이 같은지 본다.
 * 93차: earcut 3.2.4가 돌린 타공판·육각 원 구멍(구멍 변과 다리가 거의 한 줄에 놓인다)에서 구멍을 덮어 넓이가 2~32% 많은 꼴을
 * 넓이 검사가 잡아 칸으로 다시 채우는지, 정상 꼴과 신발끈 식이 맞지 않는 꼴(겹친 구멍 등)은 예전 삼각형 그대로인지, 검사 일을 세는지 본다.
 * 94차: 이웃 고리와 변을 함께 쓰는 고리는 판정 점(첫 변 중점)이 이웃의 경계 위라 이웃의 구멍으로 분류됐다(맞붙은 사각형 12개 가운데 6개).
 * 맞닿은 쌍만 안쪽 점과 넓이로 판정해 맞붙은 고리·벽돌·바둑판이 모두 채워지고, 바깥 변에 닿은 구멍은 구멍으로 남는지, 세 길이 같은지 본다.
 * 95차: 칸 조각(cellFill) 안의 포함 관계는 예전 판정이라 바깥 변에 닿은 구멍·서로 변을 함께 쓰는 구멍이 칸 안에서 채워졌다.
 * 고리가 원래 역할(바깥·구멍)을 물려받아 구멍마다 품는 조각만 찾는지(넓이·점 표본), 일이 줄어드는지 본다.
 */
import earcut from 'earcut';
import { describe, expect, it } from 'vitest';
import { HATCH_FILL_WORK_BASE, hatchFillWorkLimit } from '../../src/core/limits';
import { MODEL_SPACE, entityDefaults, type CadDocument, type HatchPatternLine } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { type BuildOptions, buildSpace } from '../../src/render/build';
import { type LoopWork, STRIP_HOLES, cutLoops, interiorPoint, loopNesting, patternSegments, triangulateLoops } from '../../src/render/hatch';
import { TextEngine } from '../../src/text/layout';
import { bytesOf, dxfText } from './corrupt35';
import { beforeHang, within2s } from './timed';

const scene = (doc: CadDocument, opt: Partial<BuildOptions> = {}) => buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null), ...opt });
const codes = (s: ReturnType<typeof scene>) => s.warnings.map((w) => w.code);
const segs = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);
const tris = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.triCount, 0);

const square = (x: number, y: number, s: number): number[] => [x, y, x + s, y, x + s, y + s, x, y + s];
const circle = (n: number, r: number, cx = 0, cy = 0): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI));
  return out;
};
/** 삼각형 넓이의 합 */
const area = (t: number[]): number => {
  let a = 0;
  for (let i = 0; i < t.length; i += 6) a += Math.abs((t[i + 2]! - t[i]!) * (t[i + 5]! - t[i + 1]!) - (t[i + 4]! - t[i]!) * (t[i + 3]! - t[i + 1]!)) / 2;
  return a;
};
/** 바깥 고리 하나와 구멍들의 넓이(구멍은 겹치지 않는다) */
const ringArea = (c: number[]): number => {
  let a = 0;
  for (let i = 0; i < c.length; i += 2) {
    const j = (i + 2) % c.length;
    a += c[i]! * c[j + 1]! - c[j]! * c[i + 1]!;
  }
  return Math.abs(a / 2);
};
/** 바깥 사각형 안에 g × g 격자 구멍(크기 5, 간격 10) */
const gridHoles = (g: number): number[][] => {
  const loops = [square(0, 0, g * 10 + 10)];
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) loops.push(square(10 + i * 10, 10 + j * 10, 5));
  return loops;
};

/** 고치기 전의 식: 고리마다 모든 고리에 점 포함을 묻고, 바깥 고리마다 earcut 한 번 */
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
/** 94차까지의 판정에 쓰는 식(src와 같은 식을 따로 적는다): 상자로 거를 수 있는 좌표, 점과 변의 여유, 신발끈 넓이 */
const safeV = (v: number): boolean => v === 0 || (Math.abs(v) >= 1e-100 && Math.abs(v) <= 1e100);
const goodLoop = (c: readonly number[]): boolean => c.length >= 6 && c.length % 2 === 0 && c.every(safeV);
function nearEdgeRef(x: number, y: number, ax: number, ay: number, bx: number, by: number): boolean {
  const tol = 1e-9 * (Math.abs(ax) + Math.abs(ay) + Math.abs(bx) + Math.abs(by));
  const [dx, dy, px, py] = [bx - ax, by - ay, x - ax, y - ay];
  const ll = dx * dx + dy * dy;
  const t = ll > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / ll)) : 0;
  const [ex, ey] = [px - t * dx, py - t * dy];
  return ex * ex + ey * ey <= tol * tol;
}
function loopAreaRef(c: readonly number[]): number {
  const [ox, oy] = [c[0]!, c[1]!];
  let a = 0;
  for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) a += (c[j]! - ox) * (c[i + 1]! - oy) - (c[i]! - ox) * (c[j + 1]! - oy);
  return Math.abs(a / 2);
}
/** 점이 고리 o의 변에서 여유 안이면 0, 아니면 안 1·밖 -1 */
const sideRef = (x: number, y: number, o: readonly number[]): number => {
  for (let a = 0, b = o.length - 2; a < o.length; b = a, a += 2) if (nearEdgeRef(x, y, o[b]!, o[b + 1]!, o[a]!, o[a + 1]!)) return 0;
  return pointInRing(x, y, o) ? 1 : -1;
};
/**
 * 고리 k가 고리 i를 품는지(모든 고리를 판정하는 기준 식): 판정 점은 i의 첫 변 중점(61차). 94차부터 그 점이 k의 변에서 여유 안이면(맞닿은 고리)
 * k 넓이 > i 넓이이고 i의 안쪽 점이 k 안일 때만 품는다. 안쪽 점이 없거나 넓이가 0인 i, 넓이가 같고 안쪽 점이 k 안인 쌍(같은 고리),
 * 답과 i의 정점이 어긋나는 쌍(품는데 k 밖 정점, 아닌데 k 안 정점 — 엇갈린 고리)은 예전 그대로
 */
function containsRef(loops: readonly number[][], k: number, i: number): boolean {
  const c = loops[i]!;
  const o = loops[k]!;
  const x = (c[0]! + c[2]!) / 2;
  const y = (c[1]! + c[3]!) / 2;
  if (goodLoop(c) && goodLoop(o) && safeV(x) && safeV(y) && sideRef(x, y, o) === 0) {
    const p = interiorPoint(c);
    const ai = loopAreaRef(c);
    if (p && ai > 0) {
      const ak = loopAreaRef(o);
      const same = Math.abs(ak - ai) <= 1e-9 * ai;
      const inside = (same || ak > ai) && sideRef(p[0], p[1], o) > 0;
      let ok = !(same && inside);
      for (let v = 0; v < c.length && ok; v += 2) {
        const s = sideRef(c[v]!, c[v + 1]!, o);
        ok = inside ? s >= 0 : s <= 0;
      }
      if (ok) return inside;
    }
  }
  return pointInRing(x, y, o);
}
/** 61차 식(94차 맞닿은 쌍 포함): 고리마다 모든 고리에 포함을 묻고, 바깥 고리마다 earcut 한 번 */
function before(loops: number[][]): number[] {
  const depth = loops.map((_, i) => loops.filter((_o, k) => k !== i && containsRef(loops, k, i)).length);
  const out: number[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depth[i]! % 2 !== 0) continue;
    const flat = [...loops[i]!];
    const holes: number[] = [];
    for (let j = 0; j < loops.length; j++) {
      if (j === i || depth[j] !== depth[i]! + 1 || !containsRef(loops, i, j)) continue;
      holes.push(flat.length / 2);
      flat.push(...loops[j]!);
    }
    for (const k of earcut(flat, holes, 2)) out.push(flat[k * 2]!, flat[k * 2 + 1]!);
  }
  return out;
}

describe('채운 해치의 고리 포함 관계', () => {
  it('상자 격자로 걸러도 모든 고리를 판정하던 예전 삼각형과 같다(겹친 고리·같은 고리·NaN·1e300·1e-300·정점 많은 고리)', () => {
    let seed = 61;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const poly = (cx: number, cy: number, r: number, n: number, jag: number) => {
      const p: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (1 - jag * rnd());
        p.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
      }
      return p;
    };
    for (let t = 0; t < 60; t++) {
      const scale = 10 ** Math.round(rnd() * 60 - 30);
      const loops: number[][] = [];
      for (let k = 0, L = 17 + Math.floor(rnd() * 60); k < L; k++) {
        const kind = rnd();
        const n = 3 + Math.floor(rnd() * (rnd() < 0.2 ? 200 : 10));
        if (kind < 0.25) loops.push(poly(rnd() * 100, rnd() * 100, 1 + rnd() * 50, n, rnd()));
        else if (kind < 0.45) loops.push(poly(50, 50, 1 + k * 0.7, n, 0.1));
        else if (kind < 0.6) loops.push(square(Math.floor(rnd() * 10), Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 5)));
        else if (kind < 0.65) loops.push(poly(rnd() * 1e300, rnd() * 1e300, 1e299, n, 0.5));
        else if (kind < 0.7) loops.push(poly(rnd() * 1e-300, 0, 1e-301, n, 0.5));
        else if (kind < 0.73) {
          const p = poly(50, 50, 30, n, 0.3);
          p[Math.floor(rnd() * p.length)] = NaN;
          loops.push(p);
        } else if (kind < 0.8 && loops.length) loops.push([...loops[Math.floor(rnd() * loops.length)]!]);
        else loops.push(poly(rnd() * 100, rnd() * 100, rnd() * 3, n, 0));
      }
      const scaled = loops.map((l) => l.map((v) => v * scale));
      expect(triangulateLoops(scaled)).toEqual(before(scaled));
    }
  });

  it('구멍 1만 개를 칸으로 나눠 채우고 넓이가 맞다(예전 5.3초)', () => {
    const loops = gridHoles(100);
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(40_004) };
    const t = within2s(() => triangulateLoops(loops, w));
    expect(w.limited).toBeUndefined();
    expect(area(t)).toBeCloseTo(1010 ** 2 - 10_000 * 25, 6);
  });

  it('구멍 4만 개도 끝나고 넓이가 맞다(예전 171초)', () => {
    const t = beforeHang(() => triangulateLoops(gridHoles(200)));
    expect(area(t)).toBeCloseTo(2010 ** 2 - 40_000 * 25, 5);
  });

  it('칸이 오목한 바깥 고리를 둘로 갈라도 넓이가 맞다', () => {
    // U자: 양 팔(가로 100, 세로 200)과 바닥(300 × 100)에 크기 2, 간격 5의 구멍. 팔을 지나는 가로 칸은 바깥 고리를 둘로 가른다
    const outer = [0, 0, 300, 0, 300, 300, 200, 300, 200, 100, 100, 100, 100, 300, 0, 300];
    const loops = [outer];
    for (let x = 1; x < 300; x += 5)
      for (let y = 1; y < 300; y += 5) if (y < 97 || x < 97 || x > 201) loops.push(square(x, y, 2));
    expect(loops.length - 1).toBeGreaterThan(STRIP_HOLES);
    const t = triangulateLoops(loops);
    expect(area(t)).toBeCloseTo(ringArea(outer) - (loops.length - 1) * 4, 6);
  });

  it('구멍이 많은 무작위 별꼴 바깥 고리도 넓이가 맞다', () => {
    let seed = 4242;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const crosses = (a: number[], i: number, b: number[], p: number) => {
      const [ax, ay, bx, by] = [a[i]!, a[i + 1]!, a[(i + 2) % a.length]!, a[(i + 3) % a.length]!];
      const [cx, cy, dx, dy] = [b[p]!, b[p + 1]!, b[(p + 2) % b.length]!, b[(p + 3) % b.length]!];
      const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      return d1 * d2 <= 0 && d3 * d4 <= 0;
    };
    let cases = 0;
    for (let t = 0; t < 20; t++) {
      const n = 8 + Math.floor(rnd() * 60);
      const outer: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 1000 * (0.25 + 0.75 * rnd());
        outer.push(r * Math.cos(a), r * Math.sin(a));
      }
      const holes: number[][] = [];
      const sp = 10 + rnd() * 15;
      const sz = sp * (0.2 + 0.5 * rnd());
      for (let x = -1000; x < 1000; x += sp)
        for (let y = -1000; y < 1000; y += sp) {
          const h = square(x, y, sz);
          let ok = true;
          for (let i = 0; ok && i < 8; i += 2) ok = pointInRing(h[i]!, h[i + 1]!, outer);
          for (let i = 0; ok && i < 8; i += 2) for (let p = 0; ok && p < outer.length; p += 2) ok = !crosses(h, i, outer, p);
          if (ok) holes.push(h);
        }
      if (holes.length <= STRIP_HOLES) continue;
      cases++;
      expect(area(triangulateLoops([outer, ...holes]))).toBeCloseTo(ringArea(outer) - holes.length * sz * sz, 3);
    }
    expect(cases).toBeGreaterThan(10);
  });

  it('가로 틈이 없으면 세로로 먼저, 어느 축에도 틈이 없으면 구멍을 가로질러 칸으로 자른다', () => {
    // 벽돌: 줄마다 엇갈려 세로 틈이 없다. 눕힌 것(가로 띠 → 세로 칸)과 세운 것(가로 틈이 없어 세로 띠 → 가로 칸)
    const bricks = [square(0, 0, 4000)];
    for (let j = 0; j < 40; j++) for (let i = 0; i < 100; i++) bricks.push([10 + i * 39 + (j % 2) * 19, 10 + j * 9.9, 40 + i * 39 + (j % 2) * 19, 10 + j * 9.9, 40 + i * 39 + (j % 2) * 19, 15 + j * 9.9, 10 + i * 39 + (j % 2) * 19, 15 + j * 9.9]);
    expect(area(triangulateLoops(bricks))).toBeCloseTo(4000 ** 2 - 4000 * 150, 4);
    const standing = bricks.map((l) => l.map((_, i) => l[i ^ 1]!));
    expect(area(triangulateLoops(standing))).toBeCloseTo(4000 ** 2 - 4000 * 150, 4);
    // 기운 막대: 어느 축으로 비춰도 모든 구멍이 겹친다
    const n = STRIP_HOLES + 8;
    const slanted = [[-10, -10, 2 * n + 1020, -10, 2 * n + 1020, 1010, -10, 1010]];
    for (let i = 0; i < n; i++) slanted.push([2 * i, 0, 2 * i + 1, 0, 2 * i + 1001, 1000, 2 * i + 1000, 1000]);
    expect(area(triangulateLoops(slanted))).toBeCloseTo((2 * n + 1030) * 1020 - n * 1000, 4);
  });

  it('고리가 겹겹이 든 해치는 일 한도를 넘으면 채우지 않는다(한도 + 판정 한 번 몫 안에서 멈춘다)', () => {
    const loops = Array.from({ length: 40_000 }, (_, i) => circle(32, 10 + i));
    const verts = 40_000 * 32;
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
    expect(beforeHang(() => triangulateLoops(loops, w))).toEqual([]);
    expect(w.limited).toBe(true);
    expect(w.n).toBeGreaterThan(w.limit!);
    expect(w.n).toBeLessThanOrEqual(w.limit! + loops.length + verts);
    // 동심 고리 1,000개는 한도 안
    const few = Array.from({ length: 1000 }, (_, i) => circle(32, 10 + i));
    const fw: LoopWork = { n: 0, limit: hatchFillWorkLimit(32_000) };
    expect(triangulateLoops(few, fw)).toEqual(before(few));
    expect(fw.limited).toBeUndefined();
    expect(fw.n).toBeGreaterThan(HATCH_FILL_WORK_BASE / 4);
  });
});

/** 서로 감싼 ㄱ자 구멍 n개: 구멍 i는 (i, i)에서 오른쪽 끝까지, 위로 끝까지 폭 0.5라 어느 축으로 비춰도 모든 구멍이 겹친다 */
const nestedL = (n: number): number[][] => {
  const W = n * 2 + 400;
  const loops = [square(-10, -10, W + 20)];
  for (let i = 0; i < n; i++) loops.push([i, i, W, i, W, i + 0.5, i + 0.5, i + 0.5, i + 0.5, W, i, W]);
  return loops;
};
/** 기운 막대 n개 */
const slantedBars = (n: number): number[][] => {
  const loops = [[-10, -10, 2 * n + 1020, -10, 2 * n + 1020, 1010, -10, 1010]];
  for (let i = 0; i < n; i++) loops.push([2 * i, 0, 2 * i + 1, 0, 2 * i + 1001, 1000, 2 * i + 1000, 1000]);
  return loops;
};
/** 30도 돌린 격자의 네모 구멍 g × g개(간격 10, 크기 6) — 돌린 타공판 */
const rotatedGrid = (g: number): number[][] => {
  const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  const holes: number[][] = [];
  for (let i = 0; i < g; i++)
    for (let j = 0; j < g; j++)
      holes.push(square(i * 10, j * 10, 6).flatMap((_, k, a) => (k % 2 ? [] : [a[k]! * c - a[k + 1]! * s, a[k]! * s + a[k + 1]! * c])));
  const r = g * 10 * 1.5;
  return [[-r, -10, r, -10, r, r, -r, r], ...holes];
};
/** 육각 배치의 16각 원 구멍 rows × cols개(지름 = 간격 × 0.9): 줄 사이에도 칸 사이에도 틈이 없다 */
const hexHoles = (rows: number, cols: number): number[][] => {
  const holes: number[][] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) holes.push(circle(16, 4.5, i * 10 + (j % 2) * 5, (j * 10 * Math.sqrt(3)) / 2));
  return [[-10, -10, cols * 10 + 10, -10, cols * 10 + 10, rows * 9 + 10, -10, rows * 9 + 10], ...holes];
};
/** 점 (x, y)를 안쪽에 두는 삼각형 수 */
const cover = (t: number[], x: number, y: number): number => {
  let n = 0;
  for (let i = 0; i < t.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [t[i]!, t[i + 1]!, t[i + 2]!, t[i + 3]!, t[i + 4]!, t[i + 5]!];
    if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || y < Math.min(ay, by, cy) || y > Math.max(ay, by, cy)) continue;
    const d1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const d2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
    const d3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    if ((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0)) n++;
  }
  return n;
};
const evenOdd = (loops: readonly number[][], x: number, y: number): boolean => loops.reduce((a, l) => a + (pointInRing(x, y, l) ? 1 : 0), 0) % 2 === 1;
const boxOf = (l: readonly number[]): [number, number, number, number] => {
  const xs = l.filter((_, i) => i % 2 === 0);
  const ys = l.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
/** 삼각형이 바깥 고리 하나와 구멍들의 홀짝 영역을 덮는지: 넓이, 영역 상자와 구멍 상자 안 점 표본(구멍 안은 비고 채움 안은 한 번만 덮는다) */
function expectRegion(loops: number[][], t: number[]): void {
  const want = ringArea(loops[0]!) - loops.slice(1).reduce((a, l) => a + ringArea(l), 0);
  expect(Math.abs(area(t) - want) / want).toBeLessThan(1e-9);
  let seed = 91;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const boxes = [boxOf(loops[0]!), ...Array.from({ length: 60 }, () => boxOf(loops[1 + Math.floor(rnd() * (loops.length - 1))]!))];
  for (const [x0, y0, x1, y1] of boxes)
    for (let k = 0; k < 3; k++) {
      const x = x0 + (x1 - x0) * rnd();
      const y = y0 + (y1 - y0) * rnd();
      const c = cover(t, x, y);
      expect(c).toBeLessThanOrEqual(1);
      expect(c === 1).toBe(evenOdd(loops, x, y));
    }
}

describe('어느 축에도 구멍 사이 틈이 없는 구멍 많은 채우기 해치(91차)', () => {
  it('서로 감싼 ㄱ자 구멍 1,200개를 구멍을 가로질러 칸으로 잘라 채운다(예전 35초)', () => {
    const loops = nestedL(1200);
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(4 + 1200 * 6) };
    const t = within2s(() => triangulateLoops(loops, w));
    expect(w.limited).toBeUndefined();
    // 일은 한도 안쪽이다(91차에는 ㄱ자 상자가 모두 겹쳐 고리 포함 관계가 대부분이었고, 92차부터 변 훑기로 갈아타 칸 자르기와 채우기가 대부분이다)
    expect(w.n).toBeLessThan(w.limit! / 2);
    expectRegion(loops, t);
  });

  it('기운 막대·돌린 타공판·육각 원 구멍도 칸마다 채우고 영역이 같다', () => {
    for (const loops of [slantedBars(1000), rotatedGrid(40), hexHoles(30, 30)]) {
      expect(loops.length - 1).toBeGreaterThan(STRIP_HOLES);
      const verts = loops.reduce((a, l) => a + l.length / 2, 0);
      const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
      const t = beforeHang(() => triangulateLoops(loops, w));
      expect(w.limited).toBeUndefined();
      expectRegion(loops, t);
    }
  });

  it('구멍이 512개 이하면 틈이 없어도 구멍 상자가 서로 덮지 않는 한 예전처럼 한 번에 채운다', () => {
    // 22 × 22는 earcut 한 번이 구멍을 덮어 넓이 검사가 다시 채운다(93차 — 아래)
    const loops = rotatedGrid(20);
    expect(loops.length - 1).toBeLessThanOrEqual(STRIP_HOLES);
    expect(triangulateLoops(loops)).toEqual(before(loops));
  });

  it('직선으로 가른 두 쪽은 원래 홀짝 영역을 반평면으로 자른 것과 같다(무작위 고리 묶음)', () => {
    let seed = 9101;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const star = (cx: number, cy: number, r: number, n: number, jag: number): number[] => {
      const p: number[] = [];
      const a0 = rnd() * 7;
      for (let i = 0; i < n; i++) {
        const rr = r * (1 - jag * rnd());
        p.push(cx + rr * Math.cos(a0 + (i / n) * Math.PI * 2), cy + rr * Math.sin(a0 + (i / n) * Math.PI * 2));
      }
      return p;
    };
    for (let t = 0; t < 40; t++) {
      // 오목한 바깥 고리 안에 칸마다 별꼴 구멍(가끔 그 안에 섬)
      const g = 3 + Math.floor(rnd() * 10);
      const loops = [star(g * 5, g * 5, g * 8, 40 + Math.floor(rnd() * 60), 0.3)];
      for (let i = 0; i < g; i++)
        for (let j = 0; j < g; j++) {
          if (Math.hypot(i * 10 + 5 - g * 5, j * 10 + 5 - g * 5) > g * 5) continue;
          loops.push(star(i * 10 + 5, j * 10 + 5, 4.5, 3 + Math.floor(rnd() * 12), rnd() * 0.6));
          if (rnd() < 0.2) loops.push(star(i * 10 + 5, j * 10 + 5, 1, 5, 0));
        }
      const [x0, y0, x1, y1] = boxOf(loops[0]!);
      const axis = rnd() < 0.5 ? 0 : 1;
      const c = axis === 0 ? x0 + (x1 - x0) * rnd() : y0 + (y1 - y0) * rnd();
      const [below, above] = cutLoops(loops, axis, c);
      for (let k = 0; k < 200; k++) {
        const x = x0 + (x1 - x0) * rnd();
        const y = y0 + (y1 - y0) * rnd();
        const lower = (axis === 0 ? x : y) < c;
        expect(evenOdd(lower ? below : above, x, y)).toBe(evenOdd(loops, x, y));
        expect(evenOdd(lower ? above : below, x, y)).toBe(false);
      }
    }
  });

  it('칸 자르기도 일을 세어 한도를 넘으면 멈춘다(자르기 한 번 몫 안에서)', () => {
    // 돌린 타공판 1만 개: 상자가 작아 고리 포함 관계 일은 적고 칸 자르기와 채우기 일이 대부분이다(예전에는 구멍 수의 제곱으로 세어 경계만)
    const loops = rotatedGrid(100);
    const verts = loops.reduce((a, l) => a + l.length / 2, 0);
    const full: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
    expect(triangulateLoops(loops, full).length).toBeGreaterThan(0);
    expect(full.limited).toBeUndefined();
    const w: LoopWork = { n: 0, limit: Math.floor(full.n / 2) };
    expect(triangulateLoops(loops, w)).toEqual([]);
    expect(w.limited).toBe(true);
    // 칸을 자르다 멈췄다(포함 관계 일보다 훨씬 많이 했다)
    expect(w.n).toBeGreaterThan(full.n / 4);
    expect(w.n).toBeLessThanOrEqual(w.limit! + verts * 3);
  });

  it('장면: 서로 감싼 ㄱ자 구멍 1,200개 해치를 채운다', () => {
    const doc = readDxf(bytesOf(dxfText([hatchOf(nestedL(1200), null)])));
    const s = beforeHang(() => scene(doc));
    expect(codes(s)).not.toContain('hatch.fill_limited');
    expect(tris(s)).toBeGreaterThan(1200 * 4);
  });
});

/** 61차 식(94차 맞닿은 쌍 포함): 고리마다 모든 고리에 포함을 물은 깊이와 짝수 깊이 고리의 구멍(번호 순) */
function nestingBefore(loops: number[][]): { depth: number[]; holesOf: number[][] } {
  const depth = loops.map((_, i) => loops.filter((_o, k) => k !== i && containsRef(loops, k, i)).length);
  const holesOf = loops.map((_, i) => (depth[i]! % 2 ? [] : loops.flatMap((_h, j) => (j !== i && depth[j] === depth[i]! + 1 && containsRef(loops, i, j) ? [j] : []))));
  return { depth, holesOf };
}
/** 93차까지의 깊이(판정 점 = 첫 변 중점만) */
const midDepth = (loops: number[][]): number[] =>
  loops.map((c, i) => loops.filter((o, k) => k !== i && pointInRing((c[0]! + c[2]!) / 2, (c[1]! + c[3]!) / 2, o)).length);
/** 고리 포함 관계에 든 일 */
const nestWork = (loops: number[][], mode?: 'auto' | 'grid'): number => {
  const w: LoopWork = { n: 0 };
  loopNesting(loops, w, mode);
  return w.n;
};

describe('구멍 상자가 서로 덮는 채우기 해치(92차)', () => {
  it('변 훑기와 상자 격자의 깊이·구멍이 모든 고리를 판정한 61차 식과 같다(겹친 고리·같은 고리·서로 감싼 고리·NaN·1e300·1e-300·홀수 길이·수평 변뿐)', () => {
    let seed = 92;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const poly = (cx: number, cy: number, r: number, n: number, jag: number): number[] => {
      const p: number[] = [];
      const a0 = rnd() * 7;
      for (let i = 0; i < n; i++) {
        const rr = r * (1 - jag * rnd());
        p.push(cx + rr * Math.cos(a0 + (i / n) * Math.PI * 2), cy + rr * Math.sin(a0 + (i / n) * Math.PI * 2));
      }
      return p;
    };
    for (let t = 0; t < 60; t++) {
      const scale = rnd() < 0.5 ? 1 : 10 ** Math.round(rnd() * 60 - 30);
      const loops: number[][] = [];
      for (let k = 0, L = 17 + Math.floor(rnd() * 80); k < L; k++) {
        const kind = rnd();
        const n = 3 + Math.floor(rnd() * (rnd() < 0.2 ? 200 : 10));
        if (kind < 0.2) loops.push(poly(rnd() * 100, rnd() * 100, 1 + rnd() * 50, n, rnd()));
        else if (kind < 0.35) loops.push(poly(50, 50, 1 + k * 0.7, n, 0.1));
        else if (kind < 0.5) loops.push(square(Math.floor(rnd() * 10), Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 5)));
        else if (kind < 0.6) loops.push(Array.from({ length: 2 * (3 + Math.floor(rnd() * 8)) }, () => Math.floor(rnd() * 12)));
        else if (kind < 0.63) loops.push(poly(rnd() * 1e300, rnd() * 1e300, 1e299, n, 0.5));
        else if (kind < 0.66) loops.push(poly(rnd() * 1e-300, 0, 1e-301, n, 0.5));
        else if (kind < 0.68) {
          const p = poly(50, 50, 30, n, 0.3);
          p[Math.floor(rnd() * p.length)] = rnd() < 0.5 ? NaN : Infinity;
          loops.push(p);
        } else if (kind < 0.7) loops.push([rnd() * 100, rnd() * 100, rnd() * 100]);
        else if (kind < 0.72) loops.push([5, 5, 9, 5, 2, 5]);
        else if (kind < 0.8 && loops.length) loops.push([...loops[Math.floor(rnd() * loops.length)]!]);
        else if (kind < 0.85) {
          const i = Math.floor(rnd() * 50);
          loops.push([i, i, 100, i, 100, i + 0.5, i + 0.5, i + 0.5, i + 0.5, 100, i, 100]);
        } else if (kind < 0.9) {
          const i = Math.floor(rnd() * 50);
          loops.push([2 * i, 0, 2 * i + 1, 0, 2 * i + 101, 100, 2 * i + 100, 100]);
        } else loops.push(poly(rnd() * 100, rnd() * 100, rnd() * 3, n, 0));
      }
      const scaled = loops.map((l) => l.map((v) => v * scale));
      const want = nestingBefore(scaled);
      for (const mode of ['grid', 'sweep', 'auto'] as const) {
        const got = loopNesting(scaled, undefined, mode)!;
        expect([...got.depth]).toEqual(want.depth);
        expect(got.holesOf).toEqual(want.holesOf);
      }
    }
  });

  it('서로 감싼 ㄱ자 구멍 2,400개를 채운다(예전 고리 포함 관계에서 한도를 넘어 경계만)', () => {
    const loops = nestedL(2400);
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(4 + 2400 * 6) };
    const t = beforeHang(() => triangulateLoops(loops, w));
    expect(w.limited).toBeUndefined();
    expectRegion(loops, t);
  });

  it('고리 포함 관계 일이 해치 크기에 비례한다(ㄱ자 구멍 2,400 → 4,800 → 2만, 기운 막대 2,000 → 4,000)', () => {
    const [a, b, c] = [2400, 4800, 20_000].map((n) => nestWork(nestedL(n)));
    expect(b / a).toBeLessThan(2 * 1.25);
    expect(c / b).toBeLessThan((20_000 / 4800) * 1.25);
    // 2만 개도 한도의 3분의 1 안쪽(상자 격자로 끝까지 하면 32억)
    expect(c).toBeLessThan(hatchFillWorkLimit(4 + 20_000 * 6) / 3);
    const [s, t] = [2000, 4000].map((n) => nestWork(slantedBars(n)));
    expect(t / s).toBeLessThan(2 * 1.25);
  });

  it('정상 꼴은 상자 격자 그대로다(갈아탄 판과 일까지 같다 — 격자·돌린 타공판·육각 원 구멍, 일 대부분이 품은 고리인 동심 고리)', () => {
    const rings = Array.from({ length: 500 }, (_, i) => circle(32, 10 + i));
    for (const loops of [gridHoles(100), rotatedGrid(40), hexHoles(30, 30), rings]) expect(nestWork(loops)).toBe(nestWork(loops, 'grid'));
  });

  it('구멍이 512개 이하라도 구멍 상자가 서로 덮으면 칸으로 잘라 채운다(서로 감싼 ㄱ자 구멍 500개 예전 2~4초)', () => {
    for (const loops of [nestedL(500), slantedBars(300)]) {
      const holes = loops.length - 1;
      expect(holes).toBeLessThanOrEqual(STRIP_HOLES);
      const verts = loops.reduce((a, l) => a + l.length / 2, 0);
      const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
      const t = beforeHang(() => triangulateLoops(loops, w));
      expect(w.limited).toBeUndefined();
      // 한 번에 earcut이면 삼각형이 정점 수 + 2 × 구멍 수 - 2개다. 칸 경계만큼 는다
      expect(t.length / 6).toBeGreaterThan(verts + 2 * holes - 2);
      expectRegion(loops, t);
    }
    // 덮지 않으면 그대로(육각 배치 원 구멍 500개)
    const hex = hexHoles(20, 25);
    expect(triangulateLoops(hex)).toEqual(before(hex));
  });
});

/** 돌린 타공판: g × g 네모 구멍(간격 sp, 크기 sz, 각 deg도), 바깥은 구멍 상자를 간격만큼 넓힌 사각형 */
const rotatedPlate = (g: number, deg: number, sp: number, sz: number): number[][] => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const holes: number[][] = [];
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) holes.push(square(i * sp, j * sp, sz).flatMap((_, k, a) => (k % 2 ? [] : [a[k]! * c - a[k + 1]! * s, a[k]! * s + a[k + 1]! * c])));
  const [x0, y0, x1, y1] = boxOf(holes.flat());
  return [[x0 - sp, y0 - sp, x1 + sp, y0 - sp, x1 + sp, y1 + sp, x0 - sp, y1 + sp], ...holes];
};
/** 육각 배치 6각 구멍(지름 = 간격 × 0.9)을 deg도 돌린 것 */
const rotatedHex = (g: number, deg: number): number[][] => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const holes: number[][] = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) holes.push(circle(6, 4.5, i * 10 + (j % 2) * 5, (j * 10 * Math.sqrt(3)) / 2).flatMap((_, k, a) => (k % 2 ? [] : [a[k]! * c - a[k + 1]! * s, a[k]! * s + a[k + 1]! * c])));
  const [x0, y0, x1, y1] = boxOf(holes.flat());
  return [[x0 - 10, y0 - 10, x1 + 10, y0 - 10, x1 + 10, y1 + 10, x0 - 10, y1 + 10], ...holes];
};
/** 바깥 고리 하나와 구멍들의 홀짝 넓이 */
const plateArea = (loops: number[][]): number => ringArea(loops[0]!) - loops.slice(1).reduce((a, l) => a + ringArea(l), 0);

describe('earcut이 잘못 채운 꼴의 넓이 검사(93차)', () => {
  it('돌린 타공판·육각 구멍을 earcut 한 번은 구멍을 덮어 넓이가 많은데, 넓이 검사가 잡아 칸으로 다시 채운다', () => {
    // 30도 22 × 22(구멍 484개)는 +2.3%, 5·40·55도 4 × 4·5 × 5와 55도 육각 12 × 12는 +1.5~4%
    for (const loops of [rotatedGrid(22), rotatedPlate(4, 5, 7.5, 4.5), rotatedPlate(4, 40, 12, 3), rotatedPlate(5, 5, 10, 6), rotatedPlate(4, 55, 10, 6), rotatedHex(12, 55)]) {
      const want = plateArea(loops);
      expect((area(before(loops)) - want) / want).toBeGreaterThan(0.01);
      const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(loops.reduce((a, l) => a + l.length / 2, 0)) };
      const t = triangulateLoops(loops, w);
      expect(w.limited).toBeUndefined();
      expect(w.mismatched).toBeGreaterThanOrEqual(1);
      expect(w.refilled).toBeGreaterThanOrEqual(1);
      expectRegion(loops, t);
    }
  });

  it('정상 꼴은 검사에 걸리지 않아 예전 삼각형 그대로다(격자·돌린 타공판 20 × 20·육각 원 구멍·별꼴)', () => {
    let seed = 93;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const star = (n: number, r: number): number[] =>
      Array.from({ length: n }, (_, i) => {
        const rr = r * (0.4 + 0.6 * rnd());
        return [rr * Math.cos((i / n) * 2 * Math.PI), rr * Math.sin((i / n) * 2 * Math.PI)];
      }).flat();
    for (const loops of [gridHoles(20), rotatedGrid(20), hexHoles(20, 25), [star(300, 100)], [circle(64, 100), circle(32, 50)], [square(1e6, 1e6, 1e-3), square(1e6 + 2e-4, 1e6 + 2e-4, 5e-4)]]) {
      const w: LoopWork = { n: 0 };
      expect(triangulateLoops(loops, w)).toEqual(before(loops));
      expect(w.mismatched).toBeUndefined();
    }
  });

  it('신발끈 식이 홀짝 넓이와 다른 꼴(스스로 엇갈린 고리·겹친 구멍·바깥을 넘는 구멍)은 걸려도 다시 채운 넓이가 맞지 않아 예전 삼각형 그대로다', () => {
    // 8자, 서로 겹친 두 구멍(둘 다 바깥 고리의 구멍 — 겹친 곳은 홀짝으로 채움), 바깥 고리를 넘어 나간 구멍
    const eight = [0, 0, 10, 10, 10, 0, 0, 10];
    const overlap = [square(0, 0, 100), square(10, 10, 30), square(30, 5, 30)];
    const outside = [square(0, 0, 100), [90, 40, 95, 40, 110, 60, 90, 60], square(10, 10, 5)];
    for (const loops of [[eight], overlap, outside]) {
      const w: LoopWork = { n: 0 };
      expect(triangulateLoops(loops, w)).toEqual(before(loops));
      expect(w.mismatched).toBeGreaterThanOrEqual(1);
      expect(w.refilled).toBeUndefined();
    }
  });

  it('넓이 검사의 일(정점 수 + 삼각형 수 상한)을 센다', () => {
    const work = (n: number): number => {
      const w: LoopWork = { n: 0 };
      triangulateLoops([circle(n, 100)], w);
      return w.n;
    };
    // earcut 정점 1 + 검사 정점 1 + 삼각형 1(구멍 없음)
    expect(work(2000) - work(1000)).toBe(3 * 1000);
  });

  it('다시 채울 일이 남은 한도 안에 없으면 earcut 결과를 그대로 쓰고 경계만으로 바꾸지 않는다', () => {
    const loops = rotatedGrid(22);
    const n = loops.reduce((a, l) => a + l.length / 2, 0);
    const h = loops.length - 1;
    const nest: LoopWork = { n: 0 };
    loopNesting(loops, nest);
    // 포함 관계 + earcut 한 번과 검사까지 꼭 맞는 한도, 다시 채우다 멈추는 한도
    const once = nest.n + n + h * h + 2 * (n + h);
    for (const limit of [once, once + 20_000]) {
      const w: LoopWork = { n: 0, limit };
      expect(triangulateLoops(loops, w)).toEqual(before(loops));
      expect(w.limited).toBeUndefined();
      expect(w.mismatched).toBeGreaterThanOrEqual(1);
      expect(w.refilled).toBeUndefined();
      expect(w.n).toBeLessThanOrEqual(limit + 4 * n);
    }
    // 한도가 넉넉하면 다시 채운다
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(n) };
    expectRegion(loops, triangulateLoops(loops, w));
    expect(w.n).toBeGreaterThan(once + 20_000);
  });
});

describe('변 훑기가 기운 변을 점 차례 띠로 자르기(93차)', () => {
  it('기운 막대 4,000개를 채운다(예전 고리 포함 관계 1,620만으로 한도를 넘어 경계만)', () => {
    const loops = slantedBars(4000);
    const verts = loops.reduce((a, l) => a + l.length / 2, 0);
    // 포함 관계 일이 한도의 10분의 1 안쪽(예전에는 점마다 왼쪽 막대 500개의 긴 변을 꺼냈다)
    expect(nestWork(loops)).toBeLessThan(hatchFillWorkLimit(verts) / 10);
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
    const t = beforeHang(() => triangulateLoops(loops, w));
    expect(w.limited).toBeUndefined();
    expectRegion(loops, t);
  });

  it('첫 정점을 돌려 점의 y가 흩어진 기운 막대·평행사변형·돌린 사각형도 깊이·구멍이 모든 고리를 판정한 식과 같다', () => {
    let seed = 931;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const roll = (l: number[], k: number): number[] => [...l.slice(2 * k), ...l.slice(0, 2 * k)];
    for (let t = 0; t < 20; t++) {
      const loops: number[][] = [[-50, -50, 2000, -50, 2000, 1100, -50, 1100]];
      for (let i = 0, L = 40 + Math.floor(rnd() * 300); i < L; i++) {
        const x = rnd() * 1500;
        const y = rnd() * 900;
        const h = 1 + rnd() * 100;
        const dx = (rnd() - 0.5) * 3 * h;
        const kind = rnd();
        const bar = kind < 0.5 ? [x, y, x + 1 + rnd() * 3, y, x + dx + 3, y + h, x + dx, y + h] : rotatedPlate(1, rnd() * 90, 0, 1 + rnd() * 20)[1]!.map((v, k) => v + (k % 2 ? y : x));
        loops.push(roll(bar, Math.floor(rnd() * 4)));
        // 가끔 막대 안에 작은 섬
        if (rnd() < 0.1) loops.push(square(x + 0.2, y + 0.2, 0.1));
      }
      const want = nestingBefore(loops);
      for (const mode of ['sweep', 'auto'] as const) {
        const got = loopNesting(loops, undefined, mode)!;
        expect([...got.depth]).toEqual(want.depth);
        expect(got.holesOf).toEqual(want.holesOf);
      }
    }
  });
});

/** 고리를 (cx, cy) 둘레로 deg도 돌린다 */
const rotate = (l: number[], deg: number, cx = 0, cy = 0): number[] => {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return l.flatMap((_, k, a) => (k % 2 ? [] : [cx + (a[k]! - cx) * c - (a[k + 1]! - cy) * s, cy + (a[k]! - cx) * s + (a[k + 1]! - cy) * c]));
};
/** 세로 3칸(긴 칸·네모 칸·긴 칸) × 가로 4줄로 맞붙은 사각형 12개(실도면 꼴을 본뜸: 칸마다 닫힘 정점을 한 번 더 적고 조금 돌림) */
const stackedCells = (deg: number): number[][] => {
  const loops: number[][] = [];
  for (let col = 0; col < 4; col++) {
    const x = col * 14.5;
    for (const [y0, y1] of [[0, 6], [6, 7.2], [7.2, 13.2]] as const) {
      const r = [x, -y0, x - 1.2, -y0, x - 1.2, -y1, x, -y1];
      // 칸마다 시작 정점과 돌림 방향이 다르다(위 칸은 이웃과 함께 쓰는 변에서 시작)
      const l = col % 2 ? [...r.slice(4), ...r.slice(0, 4)] : r;
      const rot = rotate(l, deg);
      loops.push([...rot, rot[0]!, rot[1]!]);
    }
  }
  return loops;
};
/** 벽돌 쌓기 rows × cols(줄마다 반 장 밀림 — 위 벽돌 모서리가 아래 벽돌 윗변 가운데에 닿는다) */
const bricks = (rows: number, cols: number, deg = 0): number[][] => {
  const loops: number[][] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = i * 2 + (j % 2);
      loops.push(rotate([x, j, x + 2, j, x + 2, j + 1, x, j + 1], deg));
    }
  return loops;
};
/** 바둑판 g × g(맞붙은 네모 칸) */
const tiles = (g: number, deg = 0): number[][] => {
  const loops: number[][] = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) loops.push(rotate(square(i * 3, j * 3, 3), deg, 1.5 * g, 1.5 * g));
  return loops;
};
/** 삼각형이 고리들의 홀짝 영역을 덮는지: 넓이(want)와 고리 상자마다 점 표본 */
function expectEvenOdd(loops: number[][], t: number[], want: number): void {
  expect(Math.abs(area(t) - want) / want).toBeLessThan(1e-9);
  let seed = 94;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const boxes = [boxOf(loops.flat()), ...Array.from({ length: 40 }, () => boxOf(loops[Math.floor(rnd() * loops.length)]!))];
  for (const [x0, y0, x1, y1] of boxes)
    for (let k = 0; k < 4; k++) {
      const x = x0 + (x1 - x0) * rnd();
      const y = y0 + (y1 - y0) * rnd();
      const c = cover(t, x, y);
      expect(c).toBeLessThanOrEqual(1);
      expect(c === 1).toBe(evenOdd(loops, x, y));
    }
}
const sumArea = (loops: number[][]): number => loops.reduce((a, l) => a + ringArea(l), 0);

describe('변을 함께 쓰는 고리의 포함 판정(94차)', () => {
  it('맞붙은 사각형 12개를 모두 채운다(예전에는 판정 점이 이웃 변 위라 6개가 이웃의 구멍이 돼 넓이가 반)', () => {
    for (const deg of [0, 0.19, -0.19, 30, 90]) {
      const loops = stackedCells(deg);
      expect(midDepth(loops).filter((d) => d > 0).length).toBeGreaterThan(0);
      const w: LoopWork = { n: 0 };
      const t = triangulateLoops(loops, w);
      expect(w.mismatched).toBeUndefined();
      expect([...loopNesting(loops)!.depth]).toEqual(loops.map(() => 0));
      expectEvenOdd(loops, t, sumArea(loops));
    }
  });

  it('직사각형과 아래 원이 짧은 변을 함께 써도 둘 다 채운다(예전에는 원이 직사각형의 구멍이라 비었다)', () => {
    // 직사각형 아랫변의 한 토막을 원의 첫 변이 거꾸로 지난다
    const rect = [0, 0, -0.26, 0, -0.26, -0.033, -0.134, -0.033, -0.131, -0.033, 0, -0.033, 0, 0];
    const arc: number[] = [-0.131, -0.033, -0.134, -0.033];
    for (let k = 1; k < 16; k++) {
      const a = Math.PI / 2 + (k / 16) * 2 * Math.PI;
      arc.push(-0.1325 + 0.0315 * Math.cos(a) - 0.0015 * Math.sign(Math.cos(a)), -0.0645 + 0.0315 * Math.sin(a));
    }
    const loops = [rect, arc];
    expect(midDepth(loops)).toEqual([0, 1]);
    const w: LoopWork = { n: 0 };
    const t = triangulateLoops(loops, w);
    expect(w.mismatched).toBeUndefined();
    expectEvenOdd(loops, t, ringArea(rect) + ringArea(arc));
  });

  it('바깥 고리 변에 닿은 구멍은 구멍으로, 그 안의 섬은 섬으로 남는다(어느 쪽 고리의 판정 점이 닿아도)', () => {
    const outer = [0, 0, 10, 0, 10, 10, 0, 10];
    // 구멍의 첫 변이 바깥 고리 아랫변 위(구멍 쪽 점), 바깥 고리의 첫 변 가운데(5, 0)가 구멍 변 위(바깥 쪽 점)
    const hole = [2, 0, 8, 0, 8, 4, 2, 4];
    const island = [4, 1, 6, 1, 6, 2, 4, 2];
    const topHole = [8, 10, 2, 10, 2, 6, 8, 6];
    // 예전: 위쪽 변(반열림 규칙으로 밖)에 닿은 구멍은 구멍이 아니라 바깥 고리와 겹쳐 채웠다
    expect(midDepth([outer, topHole])).toEqual([0, 0]);
    for (const deg of [0, 17, 45]) {
      const loops = [outer, hole, island].map((l) => rotate(l, deg, 5, 5));
      const nest = loopNesting(loops)!;
      expect([...nest.depth]).toEqual([0, 1, 2]);
      expect(nest.holesOf[0]).toEqual([1]);
      const t = triangulateLoops(loops);
      expectEvenOdd(loops, t, 100 - 24 + 2);
      const top = [outer, topHole].map((l) => rotate(l, deg, 5, 5));
      expect([...loopNesting(top)!.depth]).toEqual([0, 1]);
      expect(loopNesting(top)!.holesOf[0]).toEqual([1]);
    }
    // earcut은 바깥 고리와 변을 통째로 함께 쓰는 구멍을 돌린 꼴에서 덮기도 해(넓이 검사에 걸린다) 돌리지 않은 꼴만 영역을 본다
    expectEvenOdd([outer, topHole], triangulateLoops([outer, topHole]), 100 - 24);
  });

  it('벽돌 쌓기와 바둑판(고리 16개 넘게 — 상자 격자·변 훑기·찾기 훑기)도 모두 채우고 세 길의 깊이·구멍이 기준 식과 같다', () => {
    for (const loops of [bricks(6, 8), bricks(9, 9, 23), tiles(12), tiles(10, 37), bricks(3, 4, 60)]) {
      const want = nestingBefore(loops);
      expect(want.depth).toEqual(loops.map(() => 0));
      for (const mode of ['grid', 'sweep', 'auto'] as const) {
        const got = loopNesting(loops, undefined, mode)!;
        expect([...got.depth]).toEqual(want.depth);
        expect(got.holesOf).toEqual(want.holesOf);
      }
      const w: LoopWork = { n: 0 };
      const t = triangulateLoops(loops, w);
      expect(w.mismatched).toBeUndefined();
      expectEvenOdd(loops, t, sumArea(loops));
    }
  });

  it('바둑판 칸 안의 구멍·바깥 틀에 닿은 칸이 섞여도 세 길이 기준 식과 같다(무작위)', () => {
    let seed = 940;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 30; t++) {
      const g = 3 + Math.floor(rnd() * 9);
      const deg = rnd() < 0.5 ? 0 : rnd() * 90;
      const roll = (l: number[], k: number): number[] => [...l.slice(2 * k), ...l.slice(0, 2 * k)];
      const loops: number[][] = [];
      if (rnd() < 0.5) loops.push(rotate([0, 0, g * 3, 0, g * 3, g * 3, 0, g * 3], deg, 1.5 * g, 1.5 * g));
      for (let j = 0; j < g; j++)
        for (let i = 0; i < g; i++) {
          if (rnd() < 0.2) continue;
          const kind = rnd();
          const cell = kind < 0.6 ? square(i * 3, j * 3, 3) : kind < 0.8 ? square(i * 3 + 1, j * 3 + 1, 1) : [i * 3, j * 3, i * 3 + 3, j * 3, i * 3 + 1.5, j * 3 + 3];
          loops.push(roll(rotate(cell, deg, 1.5 * g, 1.5 * g), Math.floor(rnd() * (cell.length / 2))));
          if (rnd() < 0.15) loops.push(rotate(square(i * 3, j * 3, 1.5), deg, 1.5 * g, 1.5 * g));
        }
      const want = nestingBefore(loops);
      for (const mode of ['grid', 'sweep', 'auto'] as const) {
        const got = loopNesting(loops, undefined, mode)!;
        expect([...got.depth]).toEqual(want.depth);
        expect(got.holesOf).toEqual(want.holesOf);
      }
      expect(triangulateLoops(loops)).toEqual(before(loops));
    }
  });

  it('맞닿은 쌍을 찾는 일이 해치 크기에 비례하고 맞닿지 않은 꼴은 판정이 예전 그대로다', () => {
    const [a, b] = [30, 60].map((g) => nestWork(tiles(g)));
    expect(b / a).toBeLessThan(4 * 1.25);
    expect(b).toBeLessThan(hatchFillWorkLimit(60 * 60 * 4) / 10);
    for (const loops of [gridHoles(20), rotatedGrid(12), hexHoles(10, 10), nestedL(300), slantedBars(300)]) expect([...loopNesting(loops)!.depth]).toEqual(midDepth(loops));
  });

  it('안쪽 점은 그 고리 안(pointInRing)이고 넓이가 없는 고리는 없다', () => {
    let seed = 941;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 300; t++) {
      const n = 3 + Math.floor(rnd() * 40);
      const l: number[] = [];
      const a0 = rnd() * 7;
      for (let i = 0; i < n; i++) {
        const r = 1 + rnd() * 50;
        l.push(r * Math.cos(a0 + (i / n) * 2 * Math.PI), r * Math.sin(a0 + (i / n) * 2 * Math.PI));
      }
      const p = interiorPoint(l)!;
      expect(pointInRing(p[0], p[1], l)).toBe(true);
    }
    expect(interiorPoint([0, 0, 1, 0, 2, 0])).toBeNull();
    expect(interiorPoint([0, 0, 1, 1])).toBeNull();
  });

  it('장면: 맞붙은 사각형 12개 채우기 해치를 모두 채운다', () => {
    const doc = readDxf(bytesOf(dxfText([hatchOf(stackedCells(0.19), null)])));
    const s = scene(doc);
    expect(codes(s)).not.toContain('hatch.fill_limited');
    // 칸마다 닫힘 정점을 한 번 더 적은 사각형(정점 5개)은 earcut이 삼각형 2~3개로 채운다
    expect(tris(s)).toBeGreaterThanOrEqual(24);
  });
});

/** 바깥 200 × 100 안에 기운 막대 n개(폭 0.5, 높이 80, 간격 1.3): 막대의 첫 변이 바깥 고리 위쪽(top) 또는 아래쪽 변 위라 바깥 고리와 변을 함께 쓴다 */
const touchBars = (n: number, top: boolean, deg: number): number[][] => {
  const [W, H, w, h, g] = [200, 100, 0.5, 80, 1.3];
  const loops: number[][] = [[0, 0, W, 0, W, H, 0, H]];
  for (let k = 0; k < n; k++) {
    const x0 = 85 + g * k;
    loops.push(top ? [x0, H, x0 + w, H, x0 + w - h, H - h, x0 - h, H - h] : [x0 - h, 0, x0 - h + w, 0, x0 + w, h, x0, h]);
  }
  return loops.map((l) => rotate(l, deg, 100, 50));
};
/** 바깥 200 × 100 안에 긴 변을 함께 쓰는 기운 막대 쌍 35쌍(구멍 70개, 바깥에 닿지 않음). 오른쪽 막대의 첫 변이 함께 쓰는 변이다 */
const pairedBars = (deg: number): number[][] => {
  const [w, h] = [0.5, 70];
  const loops: number[][] = [[0, 0, 200, 0, 200, 100, 0, 100]];
  for (let k = 0; k < 35; k++) {
    const x0 = 85 + 2.6 * k;
    loops.push([x0, 85, x0 + w, 85, x0 + w - h, 85 - h, x0 - h, 85 - h], [x0 + w - h, 85 - h, x0 + w, 85, x0 + 2 * w, 85, x0 + 2 * w - h, 85 - h]);
  }
  return loops.map((l) => rotate(l, deg, 100, 50));
};

describe('칸 조각 안의 고리 포함 관계(95차)', () => {
  it('구멍이 64개 넘게 서로 덮어 칸으로 자르는 해치에서 바깥 변에 닿은 구멍이 칸 안에서도 구멍이다(예전 17·60·120·150·300도에서 넓이 +1~21%)', () => {
    // [각도, 위쪽 변]: 앞 여섯은 예전에 칸 안에서 구멍이 채워졌고 뒤 넷은 예전에도 맞았다.
    // 17도 위쪽·45도 위쪽·135도 위쪽·333도 아래쪽은 칸 안 earcut이 바깥 고리와 변을 함께 쓰는 구멍을 덮어(포함 관계는 맞고 넓이 검사에 걸린다) 아직 맞지 않는다
    const cases: [number, boolean][] = [[17, false], [60, false], [120, true], [120, false], [150, false], [300, false], [0, true], [0, false], [90, true], [271, false]];
    for (const [deg, top] of cases) {
      const loops = touchBars(70, top, deg);
      // 맨 위 포함 관계(94차)는 막대 70개 모두 구멍이다
      expect(loopNesting(loops)!.holesOf[0]).toHaveLength(70);
      expectRegion(loops, triangulateLoops(loops));
    }
  });

  it('서로 긴 변을 함께 쓰는 구멍 쌍도 칸 안에서 둘 다 구멍이다(예전 0.19·200·271도에서 한쪽이 다른 쪽 안으로 들어 채워져 넓이 +0.4~7%)', () => {
    for (const deg of [0, 0.19, 17, 30, 90, 200, 271]) {
      const loops = pairedBars(deg);
      expect(loopNesting(loops)!.holesOf[0]).toHaveLength(70);
      expectRegion(loops, triangulateLoops(loops));
    }
  });

  it('기운 막대 4,000개의 채우기 일이 줄어든다(칸 안에서 구멍마다 품는 조각만 찾는다 — 예전 2,424만)', () => {
    const loops = slantedBars(4000);
    const verts = loops.reduce((a, l) => a + (l.length >> 1), 0);
    const w: LoopWork = { n: 0, limit: hatchFillWorkLimit(verts) };
    const t = triangulateLoops(loops, w);
    expect(w.limited).toBeFalsy();
    expect(t.length).toBeGreaterThan(0);
    expect(w.n).toBeLessThan(hatchFillWorkLimit(verts) / 2);
  });
});

/** 다각형 경로 해치(채우기 또는 무늬 선) */
const hatchOf = (paths: number[][], lines: string[][] | null): string[] => [
  '0', 'HATCH', '5', '5A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbHatch', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1',
  '2', lines ? 'P' : 'SOLID', '70', lines ? '0' : '1', '71', '0', '91', String(paths.length),
  ...paths.flatMap((p) => ['92', '2', '72', '0', '73', '1', '93', String(p.length / 2), ...p.flatMap((v, i) => [i % 2 ? '20' : '10', String(v)]), '97', '0']),
  '75', '0', '76', '1', ...(lines ? ['52', '0', '41', '1', '77', '0', '78', String(lines.length), ...lines.flat()] : []), '98', '0',
];

describe('최상위 해치 그리기', () => {
  it('채우기 일이 한도를 넘은 해치는 경계만 그리고 알린다', () => {
    // 동심 고리 4,000개(DXF 3MB): 고치기 전에는 1.4초 걸려 채웠다
    const rings = Array.from({ length: 4000 }, (_, i) => circle(32, 10 + i).map((v) => Math.round(v * 1000) / 1000));
    const s = beforeHang(() => scene(readDxf(bytesOf(dxfText([hatchOf(rings, null)])))));
    expect(codes(s)).toContain('hatch.fill_limited');
    expect(tris(s)).toBe(0);
    expect(segs(s)).toBe(4000 * 32);
    // 고리가 적으면 채운다
    const ok = scene(readDxf(bytesOf(dxfText([hatchOf(rings.slice(0, 100), null)]))));
    expect(codes(ok)).not.toContain('hatch.fill_limited');
    expect(tris(ok)).toBe(100 * 32);
  });

  it('무늬 선 수 × 변 수가 장면에 남은 일과 꼬리를 넘으면 무늬를 멈추고 경계를 그린다', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => ['53', String(i * 0.04), '43', String(i * 0.01), '44', '0', '45', '0', '46', '50', '79', '0']);
    const doc = readDxf(bytesOf(dxfText([hatchOf([circle(20_000, 1000).map((v) => Math.round(v * 1e4) / 1e4)], lines)])));
    const s = beforeHang(() => scene(doc, { scenePieceLimit: 1_000_000 }));
    expect(codes(s)).toContain('hatch.pattern_truncated');
    expect(codes(s)).toContain('scene.piece_limit');
    expect(segs(s)).toBe(20_000);
  });

  it('무늬 자르기는 일이 몫을 넘으면 선 하나 몫 안에서 멈춘다', () => {
    const lines: HatchPatternLine[] = Array.from({ length: 100 }, (_, i) => ({ angle: i * 0.03, base: { x: 0, y: 0 }, offset: { x: 0, y: 5 }, dashes: [] }));
    const loop = circle(4000, 1000);
    const full = { n: 0 };
    expect(patternSegments(lines, [loop], undefined, full)).not.toBeNull();
    const work = { n: 0 };
    expect(patternSegments(lines, [loop], undefined, work, full.n / 2)).toBeNull();
    expect(work.n).toBeGreaterThan(full.n / 2);
    expect(work.n).toBeLessThanOrEqual(full.n / 2 + 4000);
  });
});

describe('다중 지시선', () => {
  it('선종류를 핸들 표로 찾는다(선종류 2만 개 도면의 다중 지시선 2만 개가 2.3초였다)', () => {
    const doc = readDxf(bytesOf(dxfText([])));
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const name = `LT${i}`;
      const el = (length: number) => ({ length, flags: 0, scale: 1, rotation: 0, offset: { x: 0, y: 0 } });
      doc.linetypes.set(name.toUpperCase(), { name, handle: (0x1000 + i).toString(16).toUpperCase(), flags: 0, description: '', patternLength: 2, elements: [el(1), el(-1)] } as never);
    }
    const ents = doc.blocks.get(MODEL_SPACE)!.entities;
    for (let i = 0; i < n; i++) {
      const vertices = [{ x: 0, y: i, z: 0 }, { x: 10, y: i, z: 0 }];
      // 표의 마지막 선종류(1, -1): 길이 10이 대시 5개
      ents.push({ ...entityDefaults(), type: 'MULTILEADER', handle: (0x100000 + i).toString(16), leaderLineColor: { aci: 0 }, leaderLineTypeHandle: (0x1000 + n - 1).toString(16).toUpperCase(), leaderLineType: 1, arrowSize: 1, dogleg: false, doglegLength: 0, context: { arrowSize: 1, leaders: [{ lines: [{ vertices }] }] } } as never);
    }
    const s = within2s(() => scene(doc));
    expect(segs(s)).toBe(n * 5);
  });
});
