/**
 * 61차: 파일 크기의 제곱으로 느려지던 최상위 해치와 다중 지시선.
 * 고치기 전에는 채운 해치의 구멍 4만 개(DXF 3.2MB)가 271초(고리마다 모든 고리를 판정하고, earcut이 구멍을 이을 때마다 이어 둔 구멍을 모두 훑었다),
 * 무늬 선 2,000개 × 변 2만 개(DXF 0.5MB)가 5초, 선종류 2만 개 도면의 다중 지시선 2만 개가 2.3초였다.
 * 보장은 예전 식과 같은 삼각형·넓이·일·경고로 보고, 시간은 끝나지 않는 꼴만 가른다(timed.ts).
 * 91차: 어느 축에도 구멍 사이 틈이 없는 구멍 많은 해치는 earcut 한 번이라 모양에 따라 일로 셀 수 없이 느렸다(서로 감싼 ㄱ자 구멍 1,200개 35초).
 * 구멍을 가로질러 칸으로 자른 삼각형이 넓이와 점 표본으로 원래 홀짝 영역과 같은지 본다.
 */
import earcut from 'earcut';
import { describe, expect, it } from 'vitest';
import { HATCH_FILL_WORK_BASE, hatchFillWorkLimit } from '../../src/core/limits';
import { MODEL_SPACE, entityDefaults, type CadDocument, type HatchPatternLine } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { type BuildOptions, buildSpace } from '../../src/render/build';
import { type LoopWork, STRIP_HOLES, cutLoops, patternSegments, triangulateLoops } from '../../src/render/hatch';
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
function before(loops: number[][]): number[] {
  const mid = (c: number[]) => [(c[0]! + c[2]!) / 2, (c[1]! + c[3]!) / 2] as const;
  const depth = loops.map((c, i) => loops.filter((o, j) => j !== i && pointInRing(...mid(c), o)).length);
  const out: number[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depth[i]! % 2 !== 0) continue;
    const flat = [...loops[i]!];
    const holes: number[] = [];
    for (let j = 0; j < loops.length; j++) {
      if (j === i || depth[j] !== depth[i]! + 1 || !pointInRing(...mid(loops[j]!), loops[i]!)) continue;
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
    // 일은 한도 안쪽이다(ㄱ자 상자가 모두 겹쳐 고리 포함 관계가 대부분이고 칸 자르기와 채우기는 약 80만)
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

  it('구멍이 512개 이하면 틈이 없어도 예전처럼 한 번에 채운다', () => {
    const loops = rotatedGrid(22);
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
