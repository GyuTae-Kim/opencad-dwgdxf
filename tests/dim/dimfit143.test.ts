/**
 * 143차: 문자가 없는(숨긴 문자 ' ') 선형 치수의 화살촉 맞춤. 132차 규칙(화살촉만 안에 둘 때도 화살촉 두 개 + 2·DIMGAP)이
 * 문자 없는 치수에는 빠져 있었다 — 둘 다 들어감을 문자 자리 0 + 화살촉 둘로 세어 보조선 사이가 2·DIMASZ만 되면 화살촉을 안에 두었다.
 * 실제 도면의 문자 없는 선형 치수 132개에서 AutoCAD 블록은 (보조선 사이 − 2·DIMASZ)/DIMGAP이 1.981 이하면 모두 바깥(22개),
 * 2.143 이상이면 모두 안쪽(59개)이다 — 문자 있는 치수의 경계(1.998 바깥·2.18 안)와 같다.
 * 아래 시험은 새 미터 도면(ISO-25: DIMASZ 2.5, DIMGAP 0.625)에 수평 치수를 만들어 화살촉 몸통 쪽을 본다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, FaceEntity, LineEntity, Vec3 } from '../../src/core/model';
import { createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 보조선 사이 L의 수평 치수(첫 발 x = 0, 둘째 발 x = L, 치수선 y = 10). ov: 치수 재지정(DXF 코드 → 값) */
function dim(doc: CadDocument, L: number, ov: Record<number, number> = {}, text = ' '): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(L, 0), V(L / 2, 10), { rotation: 0 });
  d.overrides = { ...(d.overrides ?? {}), ...ov };
  d.text = text;
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

/** 치수선 위(y = 10) 선 조각의 x 구간 */
function dimLineSegs(doc: CadDocument, d: DimensionEntity): number[][] {
  return generateDimensionGeometry(doc, d)
    .entities.filter((e): e is LineEntity => e.type === 'LINE' && Math.abs(e.start.y - 10) < 1e-9 && Math.abs(e.end.y - 10) < 1e-9)
    .map((e) => [Math.min(e.start.x, e.end.x), Math.max(e.start.x, e.end.x)].map((x) => Math.round(x * 1e6) / 1e6))
    .sort((a, b) => a[0]! - b[0]!);
}

describe('문자 없는 선형 치수의 맞춤(143차 — AutoCAD 블록 실물 규칙)', () => {
  it('화살촉은 보조선 사이가 2·DIMASZ + 2·DIMGAP 이상일 때만 안 — DIMATFIT 0~3, DIMTIX 모두', () => {
    const doc = createNewDocument('metric');
    const v = dimVars(doc, dim(doc, 10));
    expect([v.asz, v.gap]).toEqual([2.5, 0.625]);
    const ovs: Record<number, number>[] = [{ 289: 0 }, { 289: 1 }, { 289: 2 }, { 289: 3 }, { 289: 3, 174: 1 }];
    for (const ov of ovs) {
      // 2·asz = 5 ≤ 5.6 < 6.25 = 2·asz + 2·gap: 전에는 안, 이제 바깥
      expect(layout(doc, dim(doc, 5.6, ov))).toBe('oo');
      expect(layout(doc, dim(doc, 6.2, ov))).toBe('oo');
      // 6.3 ≥ 6.25: 안
      expect(layout(doc, dim(doc, 6.3, ov))).toBe('ii');
    }
    // 사용자 위치(DXF 70의 128)라도 문자가 없으면 같다(실물 10개 모두 사용자 위치)
    const u = dim(doc, 5.6, { 289: 1, 279: 1 });
    u.dimType |= 128;
    u.textMid = V(2.8, 14);
    expect(layout(doc, u)).toBe('oo');
  });

  it('바깥 화살촉은 꼬리선과 DIMTOFL 치수선을 AutoCAD 블록처럼 긋는다', () => {
    const doc = createNewDocument('metric');
    // 실물 블록의 꼴(DIMTOFL 1): 꼬리 [−2, −1]·[L+1, L+2] DIMASZ와 보조선 사이 [0, L] — 보조선 사이 5.6 = 2.24 DIMASZ
    expect(dimLineSegs(doc, dim(doc, 5.6, { 172: 1 }))).toEqual([
      [-5, -2.5],
      [0, 5.6],
      [8.1, 10.6],
    ]);
    // DIMTOFL 0이면 보조선 사이 선이 없다(실물 1개)
    expect(dimLineSegs(doc, dim(doc, 5.6, { 172: 0 }))).toEqual([
      [-5, -2.5],
      [8.1, 10.6],
    ]);
  });

  it('문자가 있는 치수는 그대로다(문자 자리에 2·DIMGAP이 이미 든다)', () => {
    const doc = createNewDocument('metric');
    // 치수선을 끊는 문자(DIMTAD 0): 문자 + 2·DIMGAP + 화살촉 둘이 들어가야 둘 다 안
    expect(layout(doc, dim(doc, 6.3, { 289: 3, 77: 0 }, 'X'))).toBe('oo');
    expect(layout(doc, dim(doc, 12, { 289: 3, 77: 0 }, 'X'))).toBe('ii');
    // 치수선 위 문자(DIMTAD 1)는 132차처럼 문자와 화살촉이 저마다
    expect(layout(doc, dim(doc, 6.3, { 289: 3 }, 'X'))).toBe('ii');
  });
});
