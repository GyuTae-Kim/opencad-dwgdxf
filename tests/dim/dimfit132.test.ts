/**
 * 132차: 선형 치수의 맞춤 판단(화살촉 안쪽·바깥)을 실제 도면 840개의 AutoCAD 치수 블록과 견주어 고친 것.
 * 도움말("Fit Tab", DIMATFIT·DIMTMOVE)은 자리가 모자랄 때 무엇을 먼저 밖으로 내는지만 말한다. 실물 블록에서 가른 규칙:
 *  ① 화살촉만 안에 둘 때도 보조선 사이가 화살촉 두 개 + 2·DIMGAP이어야 한다(문자가 들어가지 않는 치수의 경계가 정확히 2 + 2·DIMGAP/DIMASZ),
 *  ② 제자리 문자가 치수선 위(DIMTAD)에 있으면 문자와 화살촉이 저마다 들어가면 둘 다 안이다(문자 폭을 화살촉 자리에 더하지 않는다),
 *  ③ 옮긴 문자(사용자 위치 + DIMTMOVE 1, 또는 DIMTMOVE 2에 DIMATFIT 3이 아닌 것)는 치수선 자리를 차지하지 않고,
 *     DIMATFIT 0·1이면서 문자 중간점이 보조선 밖이면 화살촉도 밖이다. DIMTMOVE 2 + DIMATFIT 3은 전처럼 문자 폭으로 센다.
 * 아래 시험은 새 미터 도면(ISO-25: DIMASZ 2.5, DIMGAP 0.625, DIMTAD 1)에 수평 치수를 만들어 화살촉 몸통 쪽을 본다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, FaceEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { measureText } from '../../src/edit/dim/textbox';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 보조선 사이 L의 수평 치수(첫 발 x = 0, 둘째 발 x = L, 치수선 y = 10). ov: 치수 재지정(DXF 코드 → 값) */
function dim(doc: CadDocument, L: number, ov: Record<number, number> = {}, text?: string): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(L, 0), V(L / 2, 10), { rotation: 0 });
  d.overrides = { ...(d.overrides ?? {}), ...ov };
  if (text !== undefined) d.text = text;
  return d;
}

/** 사용자 위치 문자(DXF 70의 128)로 옮긴다 */
function userAt(d: DimensionEntity, x: number, y: number): DimensionEntity {
  d.dimType |= 128;
  d.textMid = V(x, y);
  return d;
}

/** 두 화살촉의 몸통 쪽: 'i' 안쪽, 'o' 바깥 */
function layout(doc: CadDocument, d: DimensionEntity): string {
  const g = generateDimensionGeometry(doc, d);
  const L = d.defPoint3.x - d.defPoint2.x;
  return g.entities
    .filter((e): e is FaceEntity => e.type === 'SOLID')
    .map((e) => {
      const tip = e.points[2].x;
      const base = (e.points[0].x + e.points[1].x) / 2;
      const inward = tip < L / 2 ? base > tip : base < tip;
      return [tip, inward ? 'i' : 'o'] as const;
    })
    .sort((a, b) => a[0] - b[0])
    .map((a) => a[1])
    .join('');
}

/** 이 앱이 잰 치수선 방향 문자 폭(수평 치수 · 수평 문자) */
function textWidth(doc: CadDocument, d: DimensionEntity): number {
  const v = dimVars(doc, d);
  const m = generateDimensionGeometry(doc, d).entities.find((e): e is MTextEntity => e.type === 'MTEXT')!;
  return measureText(m.text, v.txt, v.textStyle).w;
}

describe('선형 치수 맞춤(132차 — AutoCAD 블록 실물 규칙)', () => {
  it('① 문자가 들어가지 않는 치수: 화살촉은 보조선 사이가 2·DIMASZ + 2·DIMGAP 이상일 때만 안(DIMATFIT 3·2)', () => {
    const doc = createNewDocument('metric');
    const v = dimVars(doc, dim(doc, 10));
    expect([v.asz, v.gap]).toEqual([2.5, 0.625]);
    for (const atfit of [3, 2]) {
      // 2·asz = 5 ≤ 5.6 < 6.25 = 2·asz + 2·gap: 전에는 안, 이제 바깥
      const a = dim(doc, 5.6, { 289: atfit }, 'WIDE DIMENSION TEXT');
      expect(textWidth(doc, a) + 2 * v.gap).toBeGreaterThan(5.6);
      expect(layout(doc, a)).toBe('oo');
      // 6.3 ≥ 6.25: 안
      expect(layout(doc, dim(doc, 6.3, { 289: atfit }, 'WIDE DIMENSION TEXT'))).toBe('ii');
    }
  });

  it('② 치수선 위 문자(DIMTAD 1): 문자와 화살촉이 저마다 들어가면 둘 다 안 — 치수선을 끊는 문자(DIMTAD 0)는 전처럼 폭을 더한다', () => {
    const doc = createNewDocument('metric');
    const probe = dim(doc, 7, { 289: 1 });
    const w = textWidth(doc, probe);
    // 문자 폭 + 2·gap ≤ 7, 화살촉 6.25 ≤ 7, 그러나 문자 + 화살촉(w + 1.25 + 5)은 7보다 크다
    expect(w + 1.25).toBeLessThanOrEqual(7);
    expect(w + 1.25 + 5).toBeGreaterThan(7);
    expect(layout(doc, dim(doc, 7, { 289: 1 }))).toBe('ii');
    expect(layout(doc, dim(doc, 7, { 289: 3 }))).toBe('ii');
    expect(layout(doc, dim(doc, 7, { 289: 1, 77: 0 }))).toBe('oo');
    // 화살촉 자리(6.25)가 모자라면 바깥
    expect(layout(doc, dim(doc, 6.2, { 289: 1 }))).toBe('oo');
  });

  it('③ 옮긴 문자(DIMTMOVE 1): 문자 폭을 세지 않고 2·DIMASZ + 2·DIMGAP이면 화살촉 안', () => {
    const doc = createNewDocument('metric');
    const ov = { 289: 1, 279: 1 };
    const w = textWidth(doc, dim(doc, 7, ov));
    expect(w + 1.25 + 5).toBeGreaterThan(7);
    // 보조선 사이 위쪽으로 옮긴 문자: 안
    expect(layout(doc, userAt(dim(doc, 7, ov), 3.5, 16))).toBe('ii');
    expect(layout(doc, userAt(dim(doc, 7, { 289: 3, 279: 1 }), 3.5, 16))).toBe('ii');
    // 화살촉 자리 6.25가 모자라면 바깥
    expect(layout(doc, userAt(dim(doc, 6.2, ov), 3.1, 16))).toBe('oo');
    // DIMATFIT 1: 문자 중간점이 보조선 밖이면 화살촉도 밖(DIMATFIT 3이면 안)
    expect(layout(doc, userAt(dim(doc, 9, ov), -8, 16))).toBe('oo');
    expect(layout(doc, userAt(dim(doc, 9, { ...ov, 289: 0 }), 15, 16))).toBe('oo');
    expect(layout(doc, userAt(dim(doc, 9, { 289: 3, 279: 1 }), -8, 16))).toBe('ii');
  });

  it('③ DIMTMOVE 2: DIMATFIT 1은 옮긴 문자처럼, DIMATFIT 3은 전처럼 문자 폭으로', () => {
    const doc = createNewDocument('metric');
    const w = textWidth(doc, dim(doc, 7, { 289: 3, 279: 2 }));
    expect(w + 1.25).toBeLessThanOrEqual(7);
    expect(layout(doc, userAt(dim(doc, 7, { 289: 1, 279: 2 }), 3.5, 16))).toBe('ii');
    // 문자가 들어가므로 best fit은 화살촉을 밖으로(전과 같음)
    expect(layout(doc, userAt(dim(doc, 7, { 289: 3, 279: 2 }), 3.5, 16))).toBe('oo');
  });

  it('사용자 위치 문자 DIMTMOVE 0은 전과 같다(문자 폭을 더한다)', () => {
    const doc = createNewDocument('metric');
    expect(layout(doc, userAt(dim(doc, 7, { 289: 1 }), 3.5, 10))).toBe('oo');
    expect(layout(doc, userAt(dim(doc, 7, { 289: 3 }), 3.5, 10))).toBe('oo');
  });
});
