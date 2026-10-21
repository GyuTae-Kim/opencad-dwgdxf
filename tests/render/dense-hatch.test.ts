/**
 * 아주 촘촘한 해치: 경계와 성긴 무늬(전에는 아무것도 그리지 않았다), 확대한 영역(세부 장면)에서는 원래 간격.
 * 무늬 자르기는 변을 선 번호 순으로 쓸어 보아(선 수 × 변 수가 아니다) 곡선 경계에서도 빠르고, 결과는 모든 변을 보던 때와 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, HatchEntity, HatchPatternLine } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { createHatch } from '../../src/edit/hatch/create';
import { patternSegments } from '../../src/render/hatch';
import { dashInterval } from '../../src/render/linetype';

let seq = 0x4000;
const H = () => (seq++).toString(16).toUpperCase();

describe('아주 촘촘한 해치', () => {
  function denseDoc(): { doc: CadDocument; h: HatchEntity } {
    const doc = createNewDocument('metric');
    const h = createHatch(doc, [{ flags: 1, polyline: { closed: true, verts: [0, 0, 0, 10000, 0, 0, 10000, 10000, 0, 0, 10000, 0] } } as never], { pattern: 'ANSI31', scale: 0.01 });
    h.handle = H();
    doc.blocks.get(MODEL_SPACE)!.entities.push(h);
    return { doc, h };
  }
  const segCount = (s: ReturnType<typeof buildSpace>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);
  it('멀리서: 경계와 성긴 무늬(전에는 아무것도 그리지 않았다)', () => {
    const { doc } = denseDoc();
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(s.warnings.map((w) => w.code)).toContain('hatch.pattern_truncated');
    expect(segCount(s)).toBeGreaterThan(4);
  });
  it('확대한 영역: 원래 간격으로 그 영역만', () => {
    const { doc } = denseDoc();
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null), hatchRegion: [100, 100, 110, 110] });
    expect(s.warnings.map((w) => w.code)).not.toContain('hatch.pattern_truncated');
    const n = segCount(s);
    // ANSI31 축척 0.01: 간격 0.03175 → 10×10 영역의 대각선 무늬 약 10·√2/0.03175 ≈ 445 줄
    expect(n).toBeGreaterThan(300);
    expect(n).toBeLessThan(1000);
  });
});


/** 예전 방식(무늬 선마다 모든 변): 결과 비교용 */
function naiveSegments(lines: readonly HatchPatternLine[], loops: number[][]): number[] {
  const out: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of loops)
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i]!);
      maxX = Math.max(maxX, l[i]!);
      minY = Math.min(minY, l[i + 1]!);
      maxY = Math.max(maxY, l[i + 1]!);
    }
  const corners = [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
  for (const pl of lines) {
    const ux = Math.cos(pl.angle);
    const uy = Math.sin(pl.angle);
    const nx = -uy;
    const ny = ux;
    const spacing = pl.offset.x * nx + pl.offset.y * ny;
    if (Math.abs(spacing) < 1e-12) continue;
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
    const period = pl.dashes.reduce((a, b) => a + Math.abs(b), 0);
    for (let k = k0; k <= k1; k++) {
      const ox = pl.base.x + pl.offset.x * k;
      const oy = pl.base.y + pl.offset.y * k;
      const ts: number[] = [];
      for (const l of loops)
        for (let i = 0; i < l.length; i += 2) {
          const j = (i + 2) % l.length;
          const da = (l[i]! - ox) * nx + (l[i + 1]! - oy) * ny;
          const db = (l[j]! - ox) * nx + (l[j + 1]! - oy) * ny;
          if (da > 0 === db > 0 || da === db) continue;
          const s = da / (da - db);
          ts.push((l[i]! + (l[j]! - l[i]!) * s - ox) * ux + (l[i + 1]! + (l[j + 1]! - l[i + 1]!) * s - oy) * uy);
        }
      if (ts.length < 2) continue;
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        if (ts[i + 1]! - ts[i]! < 1e-12) continue;
        dashInterval(ts[i]!, ts[i + 1]!, pl.dashes, period, (a, b) => out.push(ox + ux * a, oy + uy * a, ox + ux * b, oy + uy * b));
      }
    }
  }
  return out;
}

describe('무늬 자르기(변을 선 번호 순으로 쓸기)', () => {
  const circle = (cx: number, cy: number, r: number, n: number) => Array.from({ length: n * 2 }, (_, i) => (i % 2 ? cy + r * Math.sin((Math.floor(i / 2) / n) * 2 * Math.PI) : cx + r * Math.cos((Math.floor(i / 2) / n) * 2 * Math.PI)));
  const PATTERNS: HatchPatternLine[][] = [
    [{ angle: Math.PI / 4, base: { x: 0, y: 0 }, offset: { x: -0.7, y: 0.7 }, dashes: [] }],
    [
      { angle: 0, base: { x: 0.3, y: 0.1 }, offset: { x: 0.2, y: 1.3 }, dashes: [2, -0.5] },
      { angle: Math.PI / 2, base: { x: 0, y: 0 }, offset: { x: -1.1, y: 0 }, dashes: [0, -0.4, 1.5, -0.2] },
    ],
    // 간격이 음수(오프셋이 법선 반대쪽)
    [{ angle: -0.3, base: { x: 5, y: -2 }, offset: { x: 0.4, y: -0.9 }, dashes: [] }],
  ];
  const SHAPES: number[][][] = [
    [[0, 0, 50, 0, 50, 40, 0, 40], circle(20, 20, 8, 37), [35, 5, 45, 5, 45, 15, 35, 15]],
    [circle(0, 0, 30, 500)],
    // 꼭짓점이 무늬 선 위에 놓이는 경계(정수 좌표)와 자기 교차 별
    [[0, 0, 7, 0, 7, 7, 0, 7], [1, 1, 6, 3, 2, 6, 4, 0, 5, 6]],
  ];
  it('모든 변을 보던 예전 결과와 같다(구멍·곡선 경계·점선·음수 간격)', () => {
    for (const loops of SHAPES)
      for (const lines of PATTERNS) {
        const got = patternSegments(lines, loops)!;
        expect(got.length).toBeGreaterThan(0);
        expect(got).toEqual(naiveSegments(lines, loops));
      }
  });
  it('곡선 경계(4,000변)의 촘촘한 해치도 빠르다(예전 3초 남짓)', () => {
    const doc = createNewDocument('metric');
    const h = createHatch(doc, [{ flags: 1, polyline: { closed: true, verts: circle(5000, 5000, 5000, 4000).flatMap((v, i) => (i % 2 ? [v, 0] : [v])) } } as never], { pattern: 'ANSI31', scale: 0.02 });
    h.handle = H();
    doc.blocks.get(MODEL_SPACE)!.entities.push(h);
    const t0 = performance.now();
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    const ms = performance.now() - t0;
    expect(s.list.chunks.reduce((a, c) => a + c.segCount, 0)).toBeGreaterThan(50000);
    expect(ms).toBeLessThan(1500);
  });
});
