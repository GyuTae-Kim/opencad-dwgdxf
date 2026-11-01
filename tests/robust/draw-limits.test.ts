/**
 * 35차: 파일 안의 작은 값 하나로 그리기가 끝나지 않거나 메모리를 다 쓰던 자리.
 * 고치기 전에는 블록 중첩·다중 삽입·먼 해치 무늬가 30초 안에 끝나지 않았고, 짧은 대시 선 2만 개는 12GB를 썼다.
 */
import { describe, expect, it, vi } from 'vitest';
import { MINSERT_LIMIT, PEAK_BYTES_BASE, PEAK_BYTES_PER_WORK, SCENE_PIECE_LIMIT, blockWorkLimit, minsertGrid } from '../../src/core/limits';
import { MODEL_SPACE, type CadDocument, type InsertEntity } from '../../src/core/model';
import { countRows } from '../../src/edit/count';
import { edgeBox } from '../../src/edit/geom/edges';
import { clampedKnots, interpolateFitPoints, nurbsPoints } from '../../src/geom/curves';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { type BuildOptions, buildSpace } from '../../src/render/build';
import { DisplayListBuilder } from '../../src/render/displaylist';
import { hatchLoopWork, patternSegments } from '../../src/render/hatch';
import { dashInterval } from '../../src/render/linetype';
import { TextEngine } from '../../src/text/layout';
import { BLOCK_B, bytesOf, dashedLine, dxfText, hatch, insertOf, ltypeTable, minsert, nestedBlocks, spline } from './corrupt35';
import { beforeHang, beforeHangAtDefaultLimit, within2s } from './timed';

const load = (ents: string[][], blocks: string[][] = [], tables: string[] = []): CadDocument => readDxf(bytesOf(dxfText(ents, blocks, tables)));
const scene = (doc: CadDocument, opt: Partial<BuildOptions> = {}) => buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null), ...opt });
const codes = (s: ReturnType<typeof scene>) => s.warnings.map((w) => w.code);
const segs = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);

/** 일은 한도를 객체 하나 몫(slack)까지만 넘고, 조각은 일 안에 있고, 표시 목록 할당은 일에 비례한다 */
const bounded = (s: ReturnType<typeof scene>, limit: number, slack = 2) => {
  expect(codes(s)).toContain('block.expansion_limit');
  expect(s.stats.blockWork).toBeLessThanOrEqual(limit + slack);
  expect(s.stats.pieces).toBeLessThanOrEqual(limit + slack);
  expect(s.stats.peakBytes).toBeLessThanOrEqual(PEAK_BYTES_PER_WORK * limit + PEAK_BYTES_BASE);
};

describe('블록 펼침', () => {
  // 결정적 보장은 일·조각·할당 바이트로 본다. 시간은 끝나지 않는 꼴만 가른다(timed.ts)
  const SMALL = { blockWorkLimit: 4_000_000 };

  it('블록 안의 블록이 곱으로 늘어도(선 10억 개) 한도에서 멈추고 경고한다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(9, 10));
    const s = beforeHang(() => scene(doc, SMALL));
    bounded(s, SMALL.blockWorkLimit);
    expect(segs(s)).toBeGreaterThan(100000);
  });

  it('기본 한도에서도 끝나고 경고한다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(9, 10));
    const s = beforeHangAtDefaultLimit(() => scene(doc));
    const entities = [...doc.blocks.values()].reduce((a, b) => a + b.entities.length, 0);
    bounded(s, blockWorkLimit(entities));
  });

  it('작은 입력: 한도가 작으면 그만큼에서 멈춘다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(3, 10));
    bounded(scene(doc, { blockWorkLimit: 100 }), 100);
    const all = scene(doc, { blockWorkLimit: 1e9 });
    expect(all.warnings).toEqual([]);
    expect(segs(all)).toBe(1000);
  });

  it('다중 삽입 30000 × 30000도 경고와 함께 끝나고 도면 값은 그대로 저장한다', () => {
    const doc = load([minsert(30000, 30000)], [BLOCK_B]);
    const s = beforeHang(() => scene(doc, SMALL));
    expect(codes(s)).toContain('block.expansion_limit');
    // 칸 한도까지 펼친다: 칸 1 + 객체 1 + 조각 1
    expect(s.stats.blockWork).toBe(3 * MINSERT_LIMIT);
    expect(segs(s)).toBe(MINSERT_LIMIT);
    expect(s.stats.peakBytes).toBeLessThanOrEqual(PEAK_BYTES_PER_WORK * s.stats.blockWork + PEAK_BYTES_BASE);
    const back = readDxf(writeDxf(doc, { version: 'AC1018' }).data);
    const ins = [...back.blocks.get(MODEL_SPACE)!.entities].find((e) => e.type === 'INSERT') as InsertEntity;
    expect([ins.columnCount, ins.rowCount]).toEqual([30000, 30000]);
  });

  it('다중 삽입 안의 블록 중첩도 칸 수와 곱해 센다', () => {
    const doc = load([minsert(100, 100, '1A', 'N0')], nestedBlocks(3, 100));
    bounded(beforeHang(() => scene(doc, SMALL)), SMALL.blockWorkLimit);
  });

  it('장면 조각 한도를 넘으면 블록도 더 펼치지 않는다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(4, 10));
    const s = scene(doc, { scenePieceLimit: 500 });
    expect(codes(s)).toContain('block.expansion_limit');
    expect(s.stats.pieces).toBeLessThanOrEqual(501);
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

describe('정상 도면 보호', () => {
  /** 블록 객체 objects개(객체마다 선분 pieces개) */
  const blockOf = (objects: number, pieces: number): string[] => {
    const body: string[] = [];
    for (let i = 0; i < objects; i++) {
      body.push('0', 'LWPOLYLINE', '8', '0', '100', 'AcDbEntity', '100', 'AcDbPolyline', '90', String(pieces + 1), '70', '0');
      for (let k = 0; k <= pieces; k++) body.push('10', String(k), '20', String(i + (k % 2) * 0.5));
    }
    return ['0', 'BLOCK', '8', '0', '2', 'B', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'B', ...body, '0', 'ENDBLK', '8', '0'];
  };
  const minsertDoc = (cells: number, objects: number) => load([minsert(cells, cells)], [blockOf(objects, 1)]);
  const insertsDoc = (n: number, objects: number, pieces: number) => {
    const es: string[][] = [];
    for (let i = 0; i < n; i++) es.push(insertOf('B', (0x1000 + i).toString(16)));
    return load(es, [blockOf(objects, pieces)]);
  };
  const LIMIT_OFF = { blockWorkLimit: 1e12 };

  it('일 계산이 꼴의 식과 맞는다', () => {
    // 칸 1 + 객체 방문 10 + 조각 10
    expect(scene(minsertDoc(30, 10), LIMIT_OFF).stats.blockWork).toBe(30 * 30 * (1 + 10 + 10));
    // 삽입마다 칸 1 + 객체 방문 5 + 조각 5 × 50
    expect(scene(insertsDoc(7, 5, 50), LIMIT_OFF).stats.blockWork).toBe(7 * (1 + 5 + 5 * 50));
  });

  it('같은 식으로 기본 한도는 흔한 큰 꼴을 넘는다', () => {
    expect(blockWorkLimit(1 + 10)).toBeGreaterThanOrEqual(MINSERT_LIMIT * (1 + 10 + 10));
    expect(blockWorkLimit(500 + 500)).toBeGreaterThanOrEqual(500 * (1 + 500 + 500 * 50));
    expect(500 * 500 * 50).toBeLessThan(SCENE_PIECE_LIMIT);
  });

  for (const [name, doc, pieces] of [
    ['다중 삽입', minsertDoc(20, 10), 20 * 20 * 10],
    ['블록 참조', insertsDoc(6, 4, 30), 6 * 4 * 30],
  ] as const) {
    it(`${name}: 필요한 일과 같은 한도면 경고 없이 모두 그리고, 1 작으면 경고한다`, () => {
      const need = scene(doc, LIMIT_OFF).stats.blockWork;
      const exact = scene(doc, { blockWorkLimit: need });
      expect(exact.warnings).toEqual([]);
      expect(segs(exact)).toBe(pieces);
      expect(exact.stats.blockWork).toBe(need);
      const less = scene(doc, { blockWorkLimit: need - 1 });
      expect(codes(less)).toContain('block.expansion_limit');
    });
  }
});

describe('블록 펼침이 세는 일', () => {
  /** 잎 블록 L에 객체 하나를 두고 L을 넣는 블록을 fan번 겹친 도면 */
  const nestedLeaf = (leaf: string[], fan = 10) => {
    const blk = (n: string, body: string[]) => ['0', 'BLOCK', '8', '0', '2', n, '70', '0', '10', '0', '20', '0', '30', '0', '3', n, ...body, '0', 'ENDBLK', '8', '0'];
    const body: string[] = [];
    for (let k = 0; k < fan; k++) body.push('0', 'INSERT', '8', '0', '2', 'L', '10', String(k), '20', '0', '30', '0');
    return load([insertOf('M')], [blk('M', body), blk('L', leaf)]);
  };
  const OFF = { blockWorkLimit: 1e12, scenePieceLimit: 1e12 };
  const LINE = ['0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0'];
  /** 칸 1 + 객체 1씩의 일 외에 instance마다 at least만큼 더 세는지 */
  const charged = (doc: CadDocument, atLeast: number, fan = 10) => {
    const s = scene(doc, OFF);
    expect(s.stats.blockWork).toBeGreaterThanOrEqual(fan * atLeast);
    return s;
  };

  it('글자가 없는 긴 문자의 배치를 센다', () => {
    charged(nestedLeaf(['0', 'TEXT', '8', '0', '10', '0', '20', '0', '30', '0', '40', '1', '1', ' '.repeat(2000) + 'x']), 1000);
    charged(nestedLeaf(['0', 'MTEXT', '8', '0', '10', '0', '20', '0', '30', '0', '40', '1', '41', '100', '1', ' '.repeat(2000) + 'x']), 1000);
  });

  it('글리프는 메모리만큼 조각 세 개로 센다', () => {
    const s = charged(nestedLeaf(['0', 'TEXT', '8', '0', '10', '0', '20', '0', '30', '0', '40', '1', '1', 'ABCDEFGHIJ']), 10 * 3);
    expect(s.stats.pieces).toBe(100);
  });

  it('조각을 내지 않는 해치 계산을 센다', () => {
    // 무늬 선 200개가 사각 경계를 지나지 않는다
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) lines.push('53', '0', '43', '0', '44', '1000', '45', '0', '46', '100000', '79', '0');
    const h = hatch({ size: 100, spacing: 1 }).join('\n').replace(/\n78\n1\n[\s\S]*\n98\n0$/, '').split('\n');
    const s = charged(nestedLeaf([...h, '78', '200', ...lines, '98', '0']), 4);
    expect(segs(s)).toBe(0);
  });

  it('고리 포함 관계와 삼각분할을 센다', () => {
    const square = (x: number) => [[x, 0, x + 1, 0], [x + 1, 0, x + 1, 1], [x + 1, 1, x, 1], [x, 1, x, 0]].flatMap(([a, b, c, d]) => ['72', '1', '10', String(a), '20', String(b), '11', String(c), '21', String(d)]);
    const paths: string[] = [];
    for (let i = 0; i < 40; i++) paths.push('92', '1', '93', '4', ...square(i * 3), '97', '0');
    const leaf = ['0', 'HATCH', '8', '0', '100', 'AcDbEntity', '100', 'AcDbHatch', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1', '2', 'SOLID', '70', '1', '71', '0', '91', '40', ...paths, '75', '0', '76', '1', '98', '0'];
    const s = scene(nestedLeaf(leaf), OFF);
    // 고리 40개 × 정점 160개 / 32 + 정점 160개 × 5, 조각(삼각형 80개)을 뺀 나머지
    expect(s.stats.blockWork).toBeGreaterThanOrEqual(10 * (Math.floor((39 * 160) / 32) + 160 * 5));
  });

  it('고리 수 × 정점 수가 2^31을 넘어도 일이 줄지 않는다', () => {
    // 곱을 32비트로 자르면 음수가 되어 이 해치의 일이 통째로 빠진다
    expect(hatchLoopWork(50_001, 60_000)).toBe(60_000 + 93_750_000);
    // 곱이 정확히 2^31
    expect(hatchLoopWork(65_537, 32_768)).toBe(32_768 + 2 ** 26);
    expect(hatchLoopWork(40, 160)).toBe(160 + 195);
    expect(hatchLoopWork(1, 1_000)).toBe(1_000);
  });

  it('프록시 그림 해석을 센다', () => {
    const doc = nestedLeaf(LINE);
    const g = new Uint8Array(8 + 4000 * 8);
    const dv = new DataView(g.buffer);
    dv.setUint32(0, g.length, true);
    dv.setUint32(4, 4000, true);
    for (let i = 0; i < 4000; i++) {
      dv.setUint32(8 + i * 8, 8, true);
      dv.setUint32(12 + i * 8, 1, true);
    }
    const L = doc.blocks.get('L')!;
    L.entities[0] = { ...L.entities[0]!, type: 'UNKNOWN', originalType: 'X', graphics: g } as never;
    charged(doc, g.length >> 8);
  });

  it('치수 변수 훑기와 치수 만들기를 센다', () => {
    const leader = ['0', 'LEADER', '8', '0', '100', 'AcDbEntity', '100', 'AcDbLeader', '3', 'Standard', '71', '0', '72', '0', '73', '3', '76', '2', '10', '0', '20', '0', '30', '0', '10', '5', '20', '5', '30', '0'];
    const doc = nestedLeaf(leader);
    for (let i = 0; i < 4000; i++) doc.header.set(`$DIMX${i}`, i);
    charged(doc, 2000);
    const dim = ['0', 'DIMENSION', '8', '0', '100', 'AcDbEntity', '100', 'AcDbDimension', '2', '', '10', '10', '20', '5', '30', '0', '11', '5', '21', '5', '31', '0', '70', '32', '1', '', '100', 'AcDbAlignedDimension', '13', '0', '23', '0', '33', '0', '14', '10', '24', '0', '34', '0'];
    charged(nestedLeaf(dim), 150);
  });

  it('차수가 높은 스플라인은 점마다 계산을 더 센다', () => {
    const s = scene(nestedLeaf(spline(25, 60)), OFF);
    expect(s.stats.blockWork).toBeGreaterThan(5 * s.stats.pieces);
    // 차수 3은 조각 수 그대로: 맨 위 칸 1 + (객체 방문 1 + 칸 1 + 안쪽 객체 방문 1) × 10
    const plain = scene(nestedLeaf(spline(3, 60)), OFF);
    expect(plain.stats.blockWork).toBe(plain.stats.pieces + 1 + 3 * 10);
  });

  it('블록 안 참조의 속성을 센다(빈 속성이어도)', () => {
    const doc = nestedLeaf(LINE);
    const L = doc.blocks.get('L')!;
    const a = { ...L.entities[0]!, type: 'ATTRIB', text: '', tag: 'T', height: 1, insert: { x: 0, y: 0, z: 0 }, attFlags: 0, style: 'Standard', rotation: 0, widthFactor: 1, oblique: 0, generation: 0, halign: 0, valign: 0 };
    const inner = { ...(doc.blocks.get('M')!.entities[0] as InsertEntity), block: 'A', attribs: Array.from({ length: 500 }, () => ({ ...a, handle: '' })) } as InsertEntity;
    doc.blocks.set('A', { name: 'A', handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [] });
    L.entities[0] = inner;
    charged(doc, 500);
    const limited = scene(doc, { blockWorkLimit: 100 });
    expect(codes(limited)).toContain('block.expansion_limit');
    expect(limited.stats.blockWork).toBeLessThanOrEqual(102);
  });

  const clipped = (noFrame: boolean, r: number) => {
    const doc = nestedLeaf(LINE);
    const L = doc.blocks.get('L')!;
    L.entities[0] = { ...(doc.blocks.get('M')!.entities[0] as InsertEntity), block: 'C', xdict: 'D1' } as InsertEntity;
    doc.blocks.set('C', { name: 'C', handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [{ ...(doc.blocks.get('M')!.entities[0] as InsertEntity), type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as never] });
    const boundary = Array.from({ length: 400 }, (_, i) => ({ x: 900 + Math.cos((i / 400) * 6.283) * r, y: 900 + Math.sin((i / 400) * 6.283) * r }));
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    doc.objects.set('D1', { type: 'DICTIONARY', handle: 'D1', entries: new Map([['ACAD_FILTER', 'D2']]) } as never);
    doc.objects.set('D2', { type: 'DICTIONARY', handle: 'D2', entries: new Map([['SPATIAL', 'D3']]) } as never);
    doc.objects.set('D3', { type: 'SPATIAL_FILTER', handle: 'D3', boundary, normal: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 }, displayBoundary: true, inverseBlockTransform: id, clipTransform: id } as never);
    if (noFrame) doc.header.set('$XCLIPFRAME', 0);
    return doc;
  };

  it('자르기로 조각이 다 빠져도 경계 계산과 빠진 조각을 센다', () => {
    const s = charged(clipped(true, 1), 400 + 50);
    expect(s.stats.pieces).toBe(0);
  });

  it('좌표가 유한하지 않아 버린 조각도 센다', () => {
    const doc = nestedLeaf(LINE);
    const L = doc.blocks.get('L')!;
    (L.entities[0] as unknown as { end: { x: number } }).end.x = Infinity;
    const s = scene(doc, OFF);
    expect(s.stats.pieces).toBe(0);
    // 맨 위 칸 1 + (객체 방문 1 + 칸 1 + 안쪽 객체 방문 1 + 버린 조각 1) × 10
    expect(s.stats.blockWork).toBe(1 + 4 * 10);
  });
});

describe('표시 목록 메모리', () => {
  const MB = 1048576;
  /** 버퍼를 늘릴 때 메모리가 모자란 것처럼 한다 */
  const failTransfer = (fail: (bytes: number) => boolean) => {
    const proto = ArrayBuffer.prototype as unknown as { transfer(n?: number): ArrayBuffer };
    const tr = proto.transfer;
    return vi.spyOn(proto, 'transfer').mockImplementation(function (this: ArrayBuffer, n?: number) {
      if (fail(n ?? 0)) throw new RangeError('Array buffer allocation failed');
      return tr.call(this, n);
    });
  };

  it('조각이 쪽 경계를 넘어도 들어온 순서 그대로 묶음에 들어간다', () => {
    const b = new DisplayListBuilder(() => false);
    const n = 2 * (1 << 20) + 5000;
    // 스타일 칸에 순번을 넣어 순서를 본다
    for (let i = 0; i < n; i++) b.segment(0, 0, 1, 1, i + 1);
    b.endEntity('A');
    const { chunks } = b.finish();
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.segCount).toBe(n);
    const u = new Uint32Array(chunks[0]!.segs);
    let wrong = 0;
    for (let i = 0; i < n; i++) if (u[i * 6 + 5] !== i + 1) wrong++;
    expect(wrong).toBe(0);
  });

  it('아주 큰 객체 하나의 임시 그림은 두 배로 늘지 않고 쪽만큼만 남는다', () => {
    const b = new DisplayListBuilder(() => false);
    // 2^22를 조금 넘긴 수: 두 배로 늘리면 임시 그림 자리가 조각 수의 두 배가 된다
    const n = (1 << 22) + 10;
    for (let i = 0; i < n; i++) b.segment(0, 0, 1, 1, 1);
    // 임시 44바이트 + 묶음 24바이트, 남는 자리는 쪽 하나 안쪽
    b.endEntity('A');
    expect(b.peakBytes).toBeLessThanOrEqual(n * (44 + 24) + 50 * MB);
  });

  it('임시 그림을 늘릴 메모리가 없으면 그린 데까지 남기고 경고한다', () => {
    const doc = load([insertOf('N0')], nestedBlocks(5, 10));
    // 200KB를 넘게 늘리지 못한다
    const spy = failTransfer((n) => n > 200000);
    try {
      const s = scene(doc);
      expect(codes(s)).toContain('block.expansion_limit');
      expect(s.stats.pieces).toBeGreaterThan(1000);
      expect(segs(s)).toBeLessThan(100000);
    } finally {
      spy.mockRestore();
    }
  });

  it('묶음을 늘릴 메모리가 없으면 그 객체만 버리고 다음 객체를 그린다', () => {
    const lines = (n: number, y: number, h: string) => {
      const p = ['0', 'LWPOLYLINE', '5', h, '8', '0', '100', 'AcDbEntity', '100', 'AcDbPolyline', '90', String(n), '70', '0'];
      for (let k = 0; k < n; k++) p.push('10', String(k), '20', String(y + (k % 2)));
      return p;
    };
    const doc = load([lines(30000, 0, '1F'), lines(3, 100000, '2F')]);
    // 선분 29999개를 묶음으로 옮길 자리(24바이트씩)만 못 잡는다
    const spy = failTransfer((n) => n === 29999 * 24);
    try {
      const s = scene(doc);
      expect(codes(s)).toContain('entity.failed');
      expect(segs(s)).toBe(2);
    } finally {
      spy.mockRestore();
    }
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
  it('차수 1000 조정점 4000개도 차수 25로 그리고 경고한다', () => {
    const s = beforeHang(() => scene(load([spline(1000, 4000)])));
    expect(codes(s)).toContain('spline.degree_limited');
    expect(segs(s)).toBeGreaterThan(1000);
  });

  it('차수 25를 넘으면 차수 25로 계산한 곡선과 같다', () => {
    const ctrl = Array.from({ length: 60 }, (_, i) => ({ x: i, y: (i * 7) % 5, z: 0 }));
    expect(nurbsPoints(40, [], ctrl, undefined, 1)).toEqual(nurbsPoints(25, [], ctrl, undefined, 1));
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
