/** 아주 촘촘한 해치: 경계와 성긴 무늬(전에는 아무것도 그리지 않았다), 확대한 영역(세부 장면)에서는 원래 간격 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, HatchEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { createHatch } from '../../src/edit/hatch/create';

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

