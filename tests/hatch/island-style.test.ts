/**
 * 95차: 해치 섬 감지 스타일(DXF 75 = 1 Outer·2 Ignore).
 * 예전에는 75 = 1도 홀짝으로 채워 섬 안의 섬을 채웠고, 75 = 2는 경로 깃발(External·Outermost)로 고리를 골라 첫 겹 섬을 구멍으로 남겼다.
 * 고리 깊이로 Outer는 깊이 1 이하, Ignore는 깊이 0만 남기는지, 남긴 고리의 홀짝 채움이 "점을 품은 고리 수 c가 1"(Outer)·"c ≥ 1"(Ignore)
 * 영역과 같은지(넓이·점 표본), 깃발과 상관없는지, 0·고리 하나·섬이 얕은 해치는 받은 배열 그대로인지,
 * 장면(채우기·무늬·채우기를 끈 윤곽)·면적(AREA)·분해가 같은 고리를 쓰는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { hatchArea } from '../../src/app/inquiry';
import { packBulge } from '../../src/core/lwpoly';
import { MODEL_SPACE, entityDefaults, type HatchEntity, type LineEntity } from '../../src/core/model';
import { explodeEntity } from '../../src/edit/geom/explode';
import { readDxf } from '../../src/io/dxf/reader';
import { buildSpace } from '../../src/render/build';
import { SEG_STRIDE, TRI_STRIDE } from '../../src/render/displaylist';
import { hatchLoops, hatchRings, islandLoops, patternSegments, triangulateLoops } from '../../src/render/hatch';
import { TextEngine } from '../../src/text/layout';
import { bytesOf, dxfText } from '../robust/corrupt35';

const square = (x: number, y: number, s: number): number[] => [x, y, x + s, y, x + s, y + s, x, y + s];
const circle = (n: number, r: number, cx = 0, cy = 0): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI));
  return out;
};
const triArea = (t: readonly number[]): number => {
  let a = 0;
  for (let i = 0; i + 5 < t.length; i += 6) a += Math.abs((t[i + 2]! - t[i]!) * (t[i + 5]! - t[i + 1]!) - (t[i + 4]! - t[i]!) * (t[i + 3]! - t[i + 1]!)) / 2;
  return a;
};
const pointInRing = (x: number, y: number, c: readonly number[]): boolean => {
  let inside = false;
  for (let i = 0, n = c.length, j = n - 2; i < n; j = i, i += 2) {
    const [xi, yi, xj, yj] = [c[i]!, c[i + 1]!, c[j]!, c[j + 1]!];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inTris = (x: number, y: number, t: readonly number[]): boolean => {
  for (let i = 0; i + 5 < t.length; i += 6) {
    const d = (a: number, b: number) => (t[i + b]! - t[i + a]!) * (y - t[i + a + 1]!) - (t[i + b + 1]! - t[i + a + 1]!) * (x - t[i + a]!);
    const [d1, d2, d3] = [d(0, 2), d(2, 4), d(4, 0)];
    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
  }
  return false;
};
/** 스타일의 기대 영역: 점을 품은 고리 수 c로 */
const wanted = (style: number) => (c: number): boolean => (style === 1 ? c === 1 : style === 2 ? c >= 1 : c % 2 === 1);
/** 상자 안 g × g 점 표본에서 채운 삼각형과 기대 영역이 어긋난 점 수 */
function sampleMismatch(rings: readonly number[][], style: number, tris: readonly number[], g = 40): number {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (let i = 0; i < r.length; i += 2) [x0, x1, y0, y1] = [Math.min(x0, r[i]!), Math.max(x1, r[i]!), Math.min(y0, r[i + 1]!), Math.max(y1, r[i + 1]!)];
  let bad = 0;
  for (let a = 0; a < g; a++)
    for (let b = 0; b < g; b++) {
      const x = x0 + ((a + 0.37) / g) * (x1 - x0);
      const y = y0 + ((b + 0.61) / g) * (y1 - y0);
      const c = rings.filter((r) => pointInRing(x, y, r)).length;
      if (wanted(style)(c) !== inTris(x, y, tris)) bad++;
    }
  return bad;
}
const hatch = (rings: number[][], style: number, flags: number[] = rings.map(() => 2), solid = true): HatchEntity => ({
  type: 'HATCH',
  ...entityDefaults(),
  handle: 'H',
  patternName: solid ? 'SOLID' : 'ANSI31',
  solid,
  associative: false,
  hatchStyle: style,
  patternType: 1,
  patternAngle: 0,
  patternScale: 1,
  patternDouble: false,
  elevation: 0,
  paths: rings.map((r, i) => {
    const vs: { x: number; y: number; bulge: number }[] = [];
    for (let k = 0; k < r.length; k += 2) vs.push({ x: r[k]!, y: r[k + 1]!, bulge: 0 });
    return { flags: flags[i]!, polyline: { closed: true, verts: packBulge(vs) } };
  }),
  patternLines: solid ? [] : [{ angle: Math.PI / 4, base: { x: 0, y: 0 }, offset: { x: -0.35, y: 0.35 }, dashes: [] }],
  pixelSize: 0,
  seedPoints: [],
});
/** 겹겹이 든 사각형 n개(바깥 40, 4씩 안으로) */
const nested = (n: number): number[][] => Array.from({ length: n }, (_, i) => square(4 * i, 4 * i, 40 - 8 * i));
const sqArea = (s: number) => s * s;

describe('섬 감지 스타일로 고리 고르기(islandLoops)', () => {
  it('Outer는 깊이 1 이하, Ignore는 깊이 0만 남기고 차례는 그대로다(섬 안의 섬 · 그 안의 섬)', () => {
    const rings = nested(4);
    expect(islandLoops(rings, 1)).toEqual([rings[0], rings[1]]);
    expect(islandLoops(rings, 2)).toEqual([rings[0]]);
    // 홀짝(0)과 그 밖의 값은 받은 배열 그대로
    expect(islandLoops(rings, 0)).toBe(rings);
    expect(islandLoops(rings, 7)).toBe(rings);
    // 넓이: Outer = 바깥 - 첫 겹 섬, Ignore = 바깥 전체, Normal = 홀짝
    expect(triArea(triangulateLoops(islandLoops(rings, 1)))).toBeCloseTo(sqArea(40) - sqArea(32), 9);
    expect(triArea(triangulateLoops(islandLoops(rings, 2)))).toBeCloseTo(sqArea(40), 9);
    expect(triArea(triangulateLoops(rings))).toBeCloseTo(sqArea(40) - sqArea(32) + sqArea(24) - sqArea(16), 9);
  });

  it('고리가 하나뿐이거나 모든 고리가 남으면(섬이 첫 겹뿐인 Outer) 받은 배열 그대로라 예전 채움과 같다', () => {
    const one = [square(0, 0, 10)];
    expect(islandLoops(one, 1)).toBe(one);
    expect(islandLoops(one, 2)).toBe(one);
    const shallow = [square(0, 0, 30), square(2, 2, 5), square(10, 10, 5), circle(24, 3, 22, 22)];
    expect(islandLoops(shallow, 1)).toBe(shallow);
    // 따로 떨어진 바깥 경계 여럿(Separate Hatches가 아닌 해치 하나)은 Ignore에서도 모두 남는다
    const apart = [square(0, 0, 10), square(20, 0, 10), square(40, 0, 10)];
    expect(islandLoops(apart, 2)).toBe(apart);
  });

  it('고른 고리의 홀짝 채움이 기대 영역(Outer c = 1, Ignore c ≥ 1)과 같다(넓이·점 표본, 무작위 섬 묶음)', () => {
    let seed = 95;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 40; t++) {
      // 바깥 원 안에 서로 겹치지 않는 섬 몇 개, 섬마다 그 안에 섬과 또 그 안의 섬
      const R = 100;
      const rings: number[][] = [circle(48, R)];
      const k = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * 2 * Math.PI + rnd() * 0.3;
        const cx = 55 * Math.cos(a);
        const cy = 55 * Math.sin(a);
        const r = 10 + rnd() * 15;
        rings.push(circle(12 + Math.floor(rnd() * 20), r, cx, cy));
        if (rnd() < 0.7) rings.push(square(cx - r * 0.5, cy - r * 0.5, r));
        if (rnd() < 0.5) rings.push(circle(10, r * 0.2, cx, cy));
      }
      if (rnd() < 0.5) rings.push(square(-8, -8, 16), square(-4, -4, 8));
      // 고리 차례를 섞는다(깊이는 차례와 상관없다)
      for (let i = rings.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [rings[i], rings[j]] = [rings[j]!, rings[i]!];
      }
      for (const style of [0, 1, 2]) {
        const tris = triangulateLoops(islandLoops(rings, style));
        expect(sampleMismatch(rings, style, tris)).toBe(0);
      }
    }
  });

  it('경로 깃발(92)과 상관없이 고리 깊이로 고른다(점을 집은 해치의 7·22·6과 객체를 고른 해치의 1·1·1, Ignore의 Outermost 섬)', () => {
    const rings = nested(3);
    const picked = hatch(rings, 1, [7, 22, 6]);
    const selected = hatch(rings, 1, [1, 1, 1]);
    expect(hatchLoops(picked, 1e-3)).toEqual(hatchLoops(selected, 1e-3));
    expect(hatchLoops(picked, 1e-3)).toHaveLength(2);
    // 예전 Ignore는 External·Outermost 고리를 남겨 첫 겹 섬이 구멍이었다 — 지금은 바깥 경계 전체를 채운다
    const ignore = hatch(rings, 2, [1, 16, 0]);
    expect(triArea(triangulateLoops(hatchLoops(ignore, 1e-3)))).toBeCloseTo(sqArea(40), 9);
    // 맞닿은 고리(94차 판정)는 서로 품지 않으므로 Ignore에서도 둘 다 바깥 경계다(깃발 3·18 — 실제 도면 꼴)
    const touch = [square(0, 0, 10), circle(32, 2, 5, -2).map((v, i) => (i % 2 ? Math.min(v, 0) : v))];
    const both = hatchLoops(hatch(touch, 2, [3, 18]), 1e-3);
    expect(both).toHaveLength(2);
  });

  it('포함 관계 일이 채우기 한도를 넘으면 모든 고리를 돌려주고(채우기도 한도에 걸린다) 든 일을 센다', () => {
    const rings = Array.from({ length: 4000 }, (_, i) => circle(32, 10 + i));
    const work = { n: 0 };
    expect(islandLoops(rings, 1, work)).toBe(rings);
    expect(work.n).toBeGreaterThan(0);
    const small = { n: 0 };
    expect(islandLoops(rings.slice(0, 50), 1, small)).toHaveLength(2);
    expect(small.n).toBeGreaterThan(0);
    // 0과 고리 하나는 일이 없다
    const none = { n: 0 };
    islandLoops(rings, 0, none);
    islandLoops(rings.slice(0, 1), 1, none);
    expect(none.n).toBe(0);
  });
});

describe('면적·분해', () => {
  it('AREA(해치 면적)는 고른 고리로 잰다', () => {
    const rings = nested(4);
    expect(hatchArea(hatch(rings, 0))).toBeCloseTo(sqArea(40) - sqArea(32) + sqArea(24) - sqArea(16), 6);
    expect(hatchArea(hatch(rings, 1))).toBeCloseTo(sqArea(40) - sqArea(32), 6);
    expect(hatchArea(hatch(rings, 2))).toBeCloseTo(sqArea(40), 6);
  });

  it('무늬 해치 분해와 무늬 선분은 Outer에서 섬 안의 섬에 선을 두지 않는다', () => {
    const rings = nested(3);
    const doc = readDxf(bytesOf(dxfText([])));
    for (const style of [0, 1, 2]) {
      const h = hatch(rings, style, [7, 22, 6], false);
      const segs = patternSegments(h.patternLines, hatchLoops(h, 1e-3))!;
      const r = explodeEntity(h, doc);
      const lines = r.add as LineEntity[];
      expect(lines.length).toBe(segs.length / 4);
      for (const l of lines) {
        const x = (l.start.x + l.end.x) / 2;
        const y = (l.start.y + l.end.y) / 2;
        expect(wanted(style)(rings.filter((c) => pointInRing(x, y, c)).length)).toBe(true);
      }
      // 섬 안의 섬(가운데 16 × 16)에 선이 있는지
      const inDeep = lines.some((l) => pointInRing((l.start.x + l.end.x) / 2, (l.start.y + l.end.y) / 2, rings[2]!));
      expect(inDeep).toBe(style !== 1);
    }
  });
});

/** 다각형 경로 해치 DXF(스타일·깃발을 준다) */
const hatchDxf = (paths: number[][], style: number, flags: number[], lines: string[][] | null): string[] => [
  '0', 'HATCH', '5', '5A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbHatch', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1',
  '2', lines ? 'P' : 'SOLID', '70', lines ? '0' : '1', '71', '0', '91', String(paths.length),
  ...paths.flatMap((p, k) => ['92', String(flags[k]), '72', '0', '73', '1', '93', String(p.length / 2), ...p.flatMap((v, i) => [i % 2 ? '20' : '10', String(v)]), '97', '0']),
  '75', String(style), '76', '1', ...(lines ? ['52', '0', '41', '1', '77', '0', '78', String(lines.length), ...lines.flat()] : []), '98', '0',
];
const scene = (text: string) => buildSpace(readDxf(bytesOf(text)), MODEL_SPACE, { text: new TextEngine(null) });
/** 장면 삼각형 [x, y, …](정점 [x, y, depth, style] — 묶음 원점 기준 float32) */
const sceneTris = (s: ReturnType<typeof scene>): number[] => {
  const out: number[] = [];
  for (const c of s.list.chunks) {
    const f = new Float32Array(c.tris);
    for (let i = 0; i + 3 < f.length; i += TRI_STRIDE) out.push(f[i]! + c.ox, f[i + 1]! + c.oy);
  }
  return out;
};
const sceneSegs = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);
/** 장면 선분 길이 합(선분 [x0, y0, x1, y1, depth, style]) */
const segLength = (s: ReturnType<typeof scene>): number => {
  let len = 0;
  for (const c of s.list.chunks) {
    const f = new Float32Array(c.segs);
    for (let i = 0; i + 3 < f.length; i += SEG_STRIDE) len += Math.hypot(f[i + 2]! - f[i]!, f[i + 3]! - f[i + 1]!);
  }
  return len;
};

describe('장면', () => {
  it('채우기 해치: Outer는 바깥과 첫 겹 섬 사이, Ignore는 바깥 전체, Normal은 홀짝(깃발 7·22·6·6)', () => {
    const rings = nested(4);
    const flags = [7, 22, 6, 6];
    const areas = [0, 1, 2].map((style) => triArea(sceneTris(scene(dxfText([hatchDxf(rings, style, flags, null)])))));
    expect(areas[0]).toBeCloseTo(sqArea(40) - sqArea(32) + sqArea(24) - sqArea(16), 3);
    expect(areas[1]).toBeCloseTo(sqArea(40) - sqArea(32), 3);
    expect(areas[2]).toBeCloseTo(sqArea(40), 3);
  });

  it('무늬 해치: 선분 길이 합이 채울 넓이에 비례한다(Outer는 섬 안의 섬을 비우고, Ignore는 섬을 가로지른다)', () => {
    // 45도 선, 선 사이 간격 0.7 × √2 ≈ 0.99
    const lines = [['53', '45', '43', '0', '44', '0', '45', '-0.7', '46', '0.7', '79', '0']];
    const gap = 0.7 * Math.SQRT2;
    const want = [sqArea(40) - sqArea(32) + sqArea(24), sqArea(40) - sqArea(32), sqArea(40)];
    [0, 1, 2].forEach((style) => {
      const len = segLength(scene(dxfText([hatchDxf(nested(3), style, [7, 22, 6], lines)])));
      expect(Math.abs(len * gap - want[style]!) / want[style]!).toBeLessThan(0.03);
    });
  });

  it('채우기를 끄면(FILLMODE 0) 스타일과 상관없이 모든 경로의 윤곽을 그린다', () => {
    for (const style of [0, 1, 2]) {
      const text = dxfText([hatchDxf(nested(4), style, [7, 22, 6, 6], null)]);
      const s = scene(text.replace('$ACADVER\n1\nAC1018\n', '$ACADVER\n1\nAC1018\n9\n$FILLMODE\n70\n0\n'));
      expect(text).toContain('$ACADVER\n1\nAC1018\n');
      expect(sceneTris(s)).toHaveLength(0);
      expect(sceneSegs(s)).toBe(16);
    }
  });

  it('MPOLYGON 테두리는 모든 경로, 채우기 색은 고른 고리로', () => {
    // hatchRings는 스타일과 상관없이 경로마다 고리다
    const h = { ...hatch(nested(3), 1), type: 'MPOLYGON' as const };
    expect(hatchRings(h, 1e-3)).toHaveLength(3);
    expect(hatchLoops(h, 1e-3)).toHaveLength(2);
  });
});
