/**
 * 61차: 파일 크기의 제곱으로 느려지던 최상위 해치와 다중 지시선.
 * 고치기 전에는 채운 해치의 구멍 4만 개(DXF 3.2MB)가 271초(고리마다 모든 고리를 판정하고, earcut이 구멍을 이을 때마다 이어 둔 구멍을 모두 훑었다),
 * 무늬 선 2,000개 × 변 2만 개(DXF 0.5MB)가 5초, 선종류 2만 개 도면의 다중 지시선 2만 개가 2.3초였다.
 * 보장은 예전 식과 같은 삼각형·넓이·일·경고로 보고, 시간은 끝나지 않는 꼴만 가른다(timed.ts).
 */
import earcut from 'earcut';
import { describe, expect, it } from 'vitest';
import { HATCH_FILL_WORK_BASE, hatchFillWorkLimit } from '../../src/core/limits';
import { MODEL_SPACE, entityDefaults, type CadDocument, type HatchPatternLine } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { type BuildOptions, buildSpace } from '../../src/render/build';
import { type LoopWork, STRIP_HOLES, patternSegments, triangulateLoops } from '../../src/render/hatch';
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

  it('가로 틈이 없으면 세로로 먼저, 어느 축에도 틈이 없으면 한 번에 채운다', () => {
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
