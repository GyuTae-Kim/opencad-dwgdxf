/**
 * 59차: 명령이 닿는 블록 재귀(객체 범위·모서리·곡선 묶기·객체 스냅)의 펼침 몫.
 * 고치기 전에는 깊이 한도만 있어 블록 안에 블록을 넣은 작은 파일(깊이 6에 10개씩)로 객체 범위가 8초, 깊이 9면 몇 시간이 걸렸고,
 * 블록 객체 400개씩 세 겹을 스냅하면 6,400만 점을 만들었다. 보장은 몫(펼친 객체 수)과 결과로 본다.
 * 몫(25만)을 다 쓰는 시험은 로컬 약 1초라 시간은 끝나지 않는 꼴만 가른다(timed.ts의 beforeHang).
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_EXPAND_BASE, SNAP_EXPAND_LIMIT, expandBudget } from '../../src/core/limits';
import { MODEL_SPACE, type CadDocument, type Entity } from '../../src/core/model';
import { entitySnaps, type SnapPoint } from '../../src/app/snap';
import { edgePieces } from '../../src/edit/geom/edges';
import { boundsOf, entityBounds } from '../../src/edit/geom/query';
import { entitiesToCurves } from '../../src/edit/hatch/curves';
import { identity } from '../../src/geom/matrix';
import { readDxf } from '../../src/io/dxf/reader';
import { BLOCK_B, bytesOf, dxfText, insertOf, minsert, nestedBlocks } from './corrupt35';
import { beforeHang, within2s } from './timed';

const load = (ents: string[][], blocks: string[][] = []): CadDocument => readDxf(bytesOf(dxfText(ents, blocks)));
const top = (doc: CadDocument): Entity => doc.blocks.get(MODEL_SPACE)!.entities[0]!;
/** 깊이 depth에 fan개씩 넣은 블록: 맨 아래 블록에 (0,0)-(1,0) 선, 단마다 x = 0..fan-1로 옮긴다 */
const nest = (depth: number, fan: number) => load([insertOf('N0')], nestedBlocks(depth, fan));

describe('객체 범위', () => {
  it('깊이 한도(8)를 넘게 겹친 블록도 몫 안에서 끝나고 정확한 범위를 낸다', () => {
    const doc = nest(9, 10);
    // 단마다 0..9칸씩 옮기므로 오른쪽 끝은 9 × 9 + 1
    expect(beforeHang(() => entityBounds(top(doc), doc))).toEqual({ minX: 0, minY: 0, maxX: 82, maxY: 0 });
  });

  it('몫을 넘는 블록 참조는 블록 상자를 옮긴 범위로 낸다(회전하면 넓어질 뿐 정확한 범위를 덮는다)', () => {
    const doc = load([['0', 'INSERT', '5', '6A', '8', '0', '2', 'N0', '10', '5', '20', '7', '30', '0', '50', '30']], nestedBlocks(3, 4));
    const e = top(doc);
    const exact = entityBounds(e, doc)!;
    const b = expandBudget(0, 3);
    const loose = entityBounds(e, doc, 0, b)!;
    expect(b.cut).toBe(true);
    expect(loose.minX).toBeLessThanOrEqual(exact.minX + 1e-9);
    expect(loose.minY).toBeLessThanOrEqual(exact.minY + 1e-9);
    expect(loose.maxX).toBeGreaterThanOrEqual(exact.maxX - 1e-9);
    expect(loose.maxY).toBeGreaterThanOrEqual(exact.maxY - 1e-9);
    // 회전이 없으면 같다
    const flat = nest(3, 4);
    expect(entityBounds(top(flat), flat, 0, expandBudget(0, 3))).toEqual(entityBounds(top(flat), flat));
  });

  it('분해를 허용하지 않는 블록의 참조도 블록 상자로 범위를 낸다(전에는 삽입점뿐)', () => {
    const doc = load([['0', 'INSERT', '5', '6A', '8', '0', '2', 'B', '10', '10', '20', '20', '30', '0', '41', '3', '42', '3']], [BLOCK_B]);
    doc.blockRecords.set('B', { name: 'B', handle: 'B1', flags: 0, insertUnits: 0, explodable: false, scalable: true });
    expect(entityBounds(top(doc), doc)).toEqual({ minX: 10, minY: 20, maxX: 13, maxY: 20 });
  });

  it('칸 한도까지 펼치는 다중 삽입도 분해하지 않고 같은 범위를 낸다', () => {
    const doc = load([minsert(1000, 1000)], [BLOCK_B]);
    // 칸 간격 2씩 1000칸, 블록의 선 길이 1
    expect(within2s(() => entityBounds(top(doc), doc))).toEqual({ minX: 0, minY: 0, maxX: 1999, maxY: 1998 });
  });

  it('여러 객체의 범위는 몫 하나를 함께 쓴다', () => {
    const many = Array.from({ length: 50 }, (_, i) => ['0', 'INSERT', '5', (0x100 + i).toString(16).toUpperCase(), '8', '0', '2', 'N0', '10', String(i * 100), '20', '0', '30', '0']);
    const doc = load(many, nestedBlocks(5, 10));
    expect(beforeHang(() => boundsOf(doc.blocks.get(MODEL_SPACE)!.entities, doc))).toEqual({ minX: 0, minY: 0, maxX: 4900 + 46, maxY: 0 });
  });
});

describe('모서리·곡선 묶기·스냅', () => {
  it('모서리 조각은 몫만큼 분해하고 넘는 참조는 모서리를 내지 않는다', () => {
    const doc = nest(4, 400);
    const b = expandBudget(doc.entityIndex.size);
    const pcs = beforeHang(() => edgePieces(top(doc), doc, 0, b));
    expect(b.cut).toBe(true);
    expect(pcs.length).toBeGreaterThan(0);
    expect(pcs.length).toBeLessThanOrEqual(COMMAND_EXPAND_BASE + doc.entityIndex.size);
    // 몫 안이면 전과 같다
    const small = nest(3, 10);
    expect(edgePieces(top(small), small)).toHaveLength(1000);
  });

  it('곡선 묶기도 몫만큼만 펼치고 잘렸다고 알린다', () => {
    const doc = nest(6, 10);
    const r = beforeHang(() => entitiesToCurves(doc, [top(doc)]));
    expect(r.cut).toBe(true);
    expect(r.curves.length).toBeLessThanOrEqual(COMMAND_EXPAND_BASE + doc.entityIndex.size);
    const small = nest(3, 10);
    const s = entitiesToCurves(small, [top(small)]);
    expect(s.cut).toBe(false);
    expect(s.curves).toHaveLength(1000);
  });

  it('스냅은 펼침 몫(블록 객체 400개씩 세 겹이면 6,400만 점)을 넘지 않는다', () => {
    const doc = nest(3, 400);
    const out: SnapPoint[] = [];
    within2s(() => entitySnaps(doc, top(doc), identity(), out));
    expect(out.length).toBeLessThanOrEqual(SNAP_EXPAND_LIMIT + 1);
    const small = nest(2, 10);
    const pts: SnapPoint[] = [];
    entitySnaps(small, top(small), identity(), pts);
    // 삽입점 1 + 10 + 100, 맨 아래 블록 참조(깊이 2)의 선 끝점·중간점은 깊이 3까지
    expect(pts.length).toBeGreaterThan(111);
  });
});
