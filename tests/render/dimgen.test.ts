/**
 * 치수 블록이 없는 치수(다른 프로그램이 만든 DXF 등): 전에는 선 몇 개로 대신 그렸다.
 * 이제 치수를 만들 때와 같은 생성기로 치수 스타일(DIMLUNIT·DIMZIN·DIMPOST·공차 등)대로 다시 만들어,
 * 블록이 있는 같은 치수와 같은 그림을 그린다(파일에는 블록을 넣지 않는다).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { ISO25, makeDoc } from '../dim/doc';

const V = (x: number, y: number) => ({ x, y, z: 0 });
/** 치수 시험용 빈 도면에 모형 공간 블록 */
function docWith(styles?: Parameters<typeof makeDoc>[0]): CadDocument {
  const doc = makeDoc(styles);
  if (!doc.blocks.has(MODEL_SPACE)) doc.blocks.set(MODEL_SPACE, { name: '*Model_Space', handle: '', recordHandle: '', basePoint: V(0, 0), flags: 0, entities: [] });
  return doc;
}

function scene(doc: CadDocument) {
  return buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
}
const box = (s: ReturnType<typeof scene>, h: string) => s.list.entities.find((b) => b.handle === h)!;

describe('치수 블록 없이 그리기', () => {
  it('블록이 있는 같은 치수와 범위·화살촉·글자 수가 같다', () => {
    const doc = docWith();
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const a = createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20));
    a.handle = 'A1';
    const g = generateDimensionGeometry(doc, a);
    doc.blocks.set('*D1', { name: '*D1', handle: '', recordHandle: '', basePoint: V(0, 0), flags: 1, entities: g.entities });
    const withBlock: DimensionEntity = { ...a, handle: 'A2', block: '*D1', textMid: g.textMid };
    ms.entities.push(a, withBlock);
    const s = scene(doc);
    expect(s.warnings.map((w) => w.code)).toContain('dimension.generated');
    const ga = box(s, 'A1');
    const gb = box(s, 'A2');
    for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(ga[k]).toBeCloseTo(gb[k], 6);
    // 채운 화살촉(삼각형)과 글자 "100"
    expect(ga.tri?.[1]).toBe(gb.tri?.[1]);
    expect(ga.tri?.[1]).toBeGreaterThan(0);
    expect(ga.glyphs?.length).toBe(gb.glyphs?.length);
    expect(ga.glyphs?.length).toBe(3);
  });
  it('치수 스타일의 DIMPOST·DIMLUNIT을 따른다', () => {
    const doc = docWith({ POSTED: { ...ISO25, DIMPOST: '<> mm', DIMLUNIT: 2, DIMDEC: 1, DIMZIN: 0 } });
    const d = createLinearDimension(doc, V(0, 0), V(42, 0), V(21, 10), { style: 'POSTED' });
    d.handle = 'B1';
    doc.blocks.get(MODEL_SPACE)!.entities.push(d);
    const s = scene(doc);
    // "42.0 mm" — 숫자 4글자 + 공백 뺀 단위 2글자
    expect(box(s, 'B1').glyphs?.length).toBe(6);
  });
});
