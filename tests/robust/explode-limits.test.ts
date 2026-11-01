/**
 * 35차: 칸 한도를 넘는 다중 삽입의 분해. 편집은 잘린 칸을 잃으므로 거부하고, 도면을 바꾸지 않는 조회는 한도까지 펼친다.
 * 한도(100만 칸)까지 펼치는 시간을 들이지 않게 칸 계산만 바꿔 작은 도면으로 본다.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/limits', async (orig) => {
  const mod = (await orig()) as typeof import('../../src/core/limits');
  return { ...mod, minsertGrid: () => ({ rows: 2, cols: 2, cut: true }) };
});

import type { CadDocument, InsertEntity } from '../../src/core/model';
import { edgePieces } from '../../src/edit/geom/edges';
import { explodeEntity } from '../../src/edit/geom/explode';
import { entityBounds } from '../../src/edit/geom/query';
import { readDxf } from '../../src/io/dxf/reader';
import { BLOCK_B, bytesOf, dxfText, minsert } from './corrupt35';

const big = (): { doc: CadDocument; e: InsertEntity } => {
  const doc = readDxf(bytesOf(dxfText([minsert(9, 9)], [BLOCK_B])));
  return { doc, e: doc.entityIndex.get('1A') as InsertEntity };
};

describe('잘리는 다중 삽입', () => {
  it('분해는 원본을 남기고 까닭을 돌려준다', () => {
    const { doc, e } = big();
    const r = explodeEntity(e, doc);
    expect(r.remove).toBeUndefined();
    expect(r.add).toBeUndefined();
    expect(r.message).toContain('분해하지 않았습니다');
  });

  it('모서리 조각과 범위는 한도까지 펼친 칸으로 구한다', () => {
    const { doc, e } = big();
    expect(edgePieces(e, doc).length).toBe(4);
    const b = entityBounds(e, doc)!;
    // 칸 간격 2씩 2칸, 블록의 선 길이 1
    expect(b.maxX - b.minX).toBeGreaterThan(1);
  });
});
