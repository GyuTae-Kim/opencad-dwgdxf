/**
 * 35차: 파일 안의 작은 값 하나로 그리기가 끝나지 않거나 메모리를 다 쓰던 자리.
 * 고치기 전에는 블록 중첩·다중 삽입·먼 해치 무늬가 30초 안에 끝나지 않았고, 짧은 대시 선 2만 개는 12GB를 썼다.
 */
import { describe, expect, it } from 'vitest';
import { MINSERT_LIMIT, SCENE_PIECE_LIMIT, blockWorkLimit, minsertGrid } from '../../src/core/limits';
import { MODEL_SPACE, type CadDocument, type InsertEntity } from '../../src/core/model';
import { countRows } from '../../src/edit/count';
import { edgeBox } from '../../src/edit/geom/edges';
import { clampedKnots, interpolateFitPoints, nurbsPoints } from '../../src/geom/curves';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { type BuildOptions, buildSpace } from '../../src/render/build';
import { patternSegments } from '../../src/render/hatch';
import { dashInterval } from '../../src/render/linetype';
import { TextEngine } from '../../src/text/layout';
import { BLOCK_B, bytesOf, dashedLine, dxfText, hatch, insertOf, ltypeTable, minsert, nestedBlocks, spline } from './corrupt35';

const within2s = <T>(f: () => T): T => {
  const t0 = performance.now();
  const r = f();
  expect(performance.now() - t0).toBeLessThan(2000);
  return r;
};
const load = (ents: string[][], blocks: string[][] = [], tables: string[] = []): CadDocument => readDxf(bytesOf(dxfText(ents, blocks, tables)));
const scene = (doc: CadDocument, opt: Partial<BuildOptions> = {}) => buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null), ...opt });
const codes = (s: ReturnType<typeof scene>) => s.warnings.map((w) => w.code);
const segs = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);

describe('블록 펼침', () => {
  // 시간은 작은 한도로 본다. 기본 한도는 정상 도면을 자르지 않으려고 커서 몇 초가 걸린다
  const SMALL = { blockWorkLimit: 4_000_000 };

  it('블록 안의 블록이 곱으로 늘어도(선 10억 개) 한도에서 멈추고 경고한다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(9, 10));
    const s = within2s(() => scene(doc, SMALL));
    expect(codes(s)).toContain('block.expansion_limit');
    expect(segs(s)).toBeGreaterThan(100000);
  });

  it('기본 한도에서도 끝나고 경고한다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(9, 10));
    const t0 = performance.now();
    const s = scene(doc);
    expect(performance.now() - t0).toBeLessThan(60000);
    expect(codes(s)).toContain('block.expansion_limit');
  });

  it('기본 한도는 객체가 적어도 흔한 큰 꼴의 일을 넘는다', () => {
    // 다중 삽입 칸 한도 × 블록 객체 10개: 칸 1 + 객체 방문 10 + 조각 10
    expect(blockWorkLimit(1 + 10)).toBeGreaterThan(MINSERT_LIMIT * (1 + 10 + 10));
    // 객체 500개 블록(객체당 선분 50개)을 500번: 삽입마다 객체 방문 500 + 조각 500 × 50
    expect(blockWorkLimit(500 + 500)).toBeGreaterThan(500 * (500 + 500 * 50));
    expect(500 * 500 * 50).toBeLessThan(SCENE_PIECE_LIMIT);
  });

  it('다중 삽입 30000 × 30000도 경고와 함께 끝나고 도면 값은 그대로 저장한다', () => {
    const doc = load([minsert(30000, 30000)], [BLOCK_B]);
    const s = within2s(() => scene(doc, SMALL));
    expect(codes(s)).toContain('block.expansion_limit');
    const back = readDxf(writeDxf(doc, { version: 'AC1018' }).data);
    const ins = [...back.blocks.get(MODEL_SPACE)!.entities].find((e) => e.type === 'INSERT') as InsertEntity;
    expect([ins.columnCount, ins.rowCount]).toEqual([30000, 30000]);
  });

  it('다중 삽입 안의 블록 중첩도 칸 수와 곱해 센다', () => {
    const doc = load([minsert(100, 100, '1A', 'N0')], nestedBlocks(3, 100));
    expect(codes(within2s(() => scene(doc, SMALL)))).toContain('block.expansion_limit');
  });

  it('한도 안의 블록·다중 삽입은 하나도 빠지지 않는다', () => {
    const inserts: string[][] = [];
    for (let i = 0; i < 1000; i++) inserts.push(insertOf('B', (0x1000 + i).toString(16)));
    const s = scene(load([...inserts, minsert(30, 40)], [BLOCK_B]));
    expect(codes(s)).not.toContain('block.expansion_limit');
    expect(segs(s)).toBe(1000 + 30 * 40);
  });

  it('한도를 넘어도 최상위 객체는 모두 그린다', () => {
    const lines: string[][] = [];
    for (let i = 0; i < 500; i++) lines.push(['0', 'LINE', '8', '0', '10', '0', '20', String(i), '30', '0', '11', '1', '21', String(i), '31', '0']);
    const doc = load([insertOf('N0'), ...lines], nestedBlocks(4, 10));
    const s = scene(doc, { blockWorkLimit: 100 });
    expect(codes(s)).toContain('block.expansion_limit');
    expect(segs(s)).toBeGreaterThanOrEqual(500);
    expect(segs(s)).toBeLessThan(600);
  });

  it('한도는 도면 객체 수와 함께 늘어나고 칸 수는 비율을 지켜 줄인다', () => {
    expect(blockWorkLimit(0)).toBeLessThan(blockWorkLimit(100000));
    expect(blockWorkLimit(1e9)).toBe(blockWorkLimit(2e9));
    expect(minsertGrid({ rowCount: 3, columnCount: 4 })).toEqual({ rows: 3, cols: 4, cut: false });
    expect(minsertGrid({ rowCount: 0, columnCount: -5 })).toEqual({ rows: 1, cols: 1, cut: false });
    const g = minsertGrid({ rowCount: 32767, columnCount: 32767 });
    expect(g.rows * g.cols).toBeLessThanOrEqual(MINSERT_LIMIT);
    expect(g.rows).toBe(g.cols);
    const line = minsertGrid({ rowCount: 1, columnCount: 3e9 });
    expect(line).toEqual({ rows: 1, cols: MINSERT_LIMIT, cut: true });
  });

  it('COUNT도 칸 수 한도까지만 센다', () => {
    const doc = load([minsert(30000, 30000)], [BLOCK_B]);
    const rows = within2s(() => countRows(doc, doc.blocks.get(MODEL_SPACE)!.entities));
    expect(rows[0]!.handles.length).toBeLessThanOrEqual(MINSERT_LIMIT);
  });

  it('모서리 범위는 모서리 조각이 펼치는 칸과 같다', () => {
    const big = load([minsert(30000, 30000)], [BLOCK_B]);
    const e = big.blocks.get(MODEL_SPACE)!.entities[0]!;
    // 1000 × 1000칸, 간격 2, 블록은 (0, 0)-(1, 0)
    expect(within2s(() => edgeBox(e, big))).toEqual({ minX: 0, minY: 0, maxX: 1999, maxY: 1998 });
    const small = load([minsert(3, 4)], [BLOCK_B]);
    expect(edgeBox(small.blocks.get(MODEL_SPACE)!.entities[0]!, small)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 6 });
  });
});

describe('해치 무늬', () => {
  const square = [[0, 0, 100, 0, 100, 100, 0, 100]];

  it('대시가 아주 짧으면 구간 하나를 펼치기 전에 멈춘다(경계는 그린다)', () => {
    const s = within2s(() => scene(load([hatch({ size: 1000, spacing: 100, dashes: [1e-7, -1e-7] })])));
    expect(codes(s)).toContain('hatch.pattern_truncated');
    expect(codes(s)).not.toContain('entity.failed');
    expect(segs(s)).toBe(4);
  });

  it('틈만 있는 무늬도 구간을 쪼개며 돌지 않는다', () => {
    const line = { angle: 0, base: { x: 0, y: 0.5 }, offset: { x: 0, y: 1000 }, dashes: [-1e-9] };
    expect(within2s(() => patternSegments([line], square))).toBeNull();
  });

  it('펼친 수가 한도 안이면 예전과 같고 넘으면 null이다', () => {
    const line = { angle: 0, base: { x: 0, y: 0.5 }, offset: { x: 0, y: 1000 }, dashes: [0.5, -0.5] };
    expect(patternSegments([line], square, 20)!.length / 4).toBe(100);
    expect(patternSegments([line], square, 10)).toBeNull();
  });

  it('무늬 원점이 아주 멀면(선 번호 2^53 넘음) 끝나지 않던 고리를 벗어난다', () => {
    for (const h of [hatch({ size: 1000, y: 5, spacing: 1, baseY: 1e17 }), hatch({ size: 1000, spacing: 1, baseY: 1e17 })]) {
      const s = within2s(() => scene(load([h])));
      expect(codes(s)).toContain('hatch.pattern_truncated');
    }
  });

  it('대시 번호가 2^53을 넘는 구간은 실선 하나로 낸다', () => {
    const got: [number, number][] = [];
    within2s(() => dashInterval(1e17, 1e17 + 64, [1, -1], 2, (a, b) => got.push([a, b])));
    expect(got).toEqual([[1e17, 1e17 + 64]]);
    const scene1 = within2s(() => scene(load([hatch({ size: 100, x: 1e17, spacing: 10, dashes: [1, -1] })])));
    expect(codes(scene1)).not.toContain('entity.failed');
  });
});

describe('장면 조각 한도', () => {
  it('넘은 뒤의 해치는 경계만 그리고 경고한다', () => {
    const doc = load([0, 1, 2].map((i) => hatch({ size: 100, x: i * 200, spacing: 0.1 }, (0x100 + i).toString(16))));
    const s = scene(doc, { scenePieceLimit: 1500 });
    expect(codes(s)).toContain('scene.piece_limit');
    expect(codes(s)).toContain('hatch.pattern_truncated');
    expect(segs(s)).toBe(1000 + 1000 + 4);
  });

  it('넘은 뒤의 선은 실선으로 그린다', () => {
    const ents = [0, 1, 2, 3].map((i) => dashedLine(i, 100));
    const doc = load(ents, [], ltypeTable(0.5));
    expect(segs(scene(doc))).toBe(400);
    const s = scene(doc, { scenePieceLimit: 150 });
    expect(codes(s)).toContain('scene.piece_limit');
    expect(segs(s)).toBe(200 + 1 + 1);
  });

  it('기본 한도는 실제 도면의 가장 큰 장면(130만 조각)보다 훨씬 크다', () => {
    expect(SCENE_PIECE_LIMIT).toBeGreaterThan(1_335_000 * 10);
    expect(blockWorkLimit(225005)).toBeGreaterThan(1_335_000 * 10);
  });
});

describe('스플라인', () => {
  it('차수 1000 조정점 4000개도 차수 25로 2초 안에 그리고 경고한다', () => {
    const s = within2s(() => scene(load([spline(1000, 4000)])));
    expect(codes(s)).toContain('spline.degree_limited');
    expect(segs(s)).toBeGreaterThan(1000);
  });

  it('차수 25까지는 파일의 매듭 그대로다', () => {
    const ctrl = Array.from({ length: 30 }, (_, i) => ({ x: i, y: (i * 7) % 5, z: 0 }));
    const knots = clampedKnots(30, 25).map((k) => k * 2);
    const a = nurbsPoints(25, knots, ctrl, undefined, 1);
    const b = nurbsPoints(25, clampedKnots(30, 25), ctrl, undefined, 1);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 6);
    expect(scene(load([spline(25, 30)])).warnings).toEqual([]);
  });

  it('맞춤점이 아주 많으면 제곱 행렬을 풀지 않고 점을 잇는다', () => {
    const fit = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: (i * 7) % 5, z: 0 }));
    const many = within2s(() => interpolateFitPoints(fit(6000)));
    expect(many.degree).toBe(1);
    expect(many.ctrl.length).toBe(6000);
    expect(interpolateFitPoints(fit(5)).degree).toBe(3);
  });

  it('스플라인 지시선 정점 6000개도 2초 안에 그린다', () => {
    const v: string[] = [];
    for (let i = 0; i < 6000; i++) v.push('10', String(i), '20', String((i * 7) % 5), '30', '0');
    const leader = ['0', 'LEADER', '5', '8A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbLeader', '3', 'Standard', '71', '1', '72', '1', '73', '3', '76', '6000', ...v];
    const s = within2s(() => scene(load([leader])));
    expect(segs(s)).toBeGreaterThanOrEqual(5999);
  });
});
