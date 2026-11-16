/**
 * 133차: 사용자 위치 문자 + DIMTMOVE 1(지시선과 함께)의 문자 자리와 지시선을 실제 도면 840개의 AutoCAD 치수 블록과 견주어 고친 것.
 * 도움말("Fit Tab")은 문자가 치수선에 너무 가까우면 지시선을 생략한다고만 한다. 문자가 치수선과 나란한 실물 블록에서 읽은 꼴:
 *  - 문자 중간점(DXF 11)은 문자 밑 자리다. 문자 가운데는 그 위로 치수선 위 문자와 같은 DIMGAP + 문자 높이/2만큼 비킨다(DIMTAD 1).
 *  - 중간점이 치수선에서 DIMGAP + 1.1 × 문자 높이 안이면 지시선이 없고 문자 가운데의 치수선 방향 자리는 중간점과 같다(2,787개).
 *  - 더 멀면(31개) 치수선 가운데에서 (중간점 − DIMGAP)까지 지시선, 거기서 문자 밑으로 문자 폭 + 2·DIMGAP 밑줄을 긋고
 *    문자는 중간점에서 치수선 가운데의 반대쪽으로 뻗는다.
 * 아래 시험은 새 미터 도면(ISO-25: DIMASZ 2.5, DIMGAP 0.625, DIMTAD 1)에 보조선 사이 20의 수평 치수(치수선 y = 10)를 만든다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, LineEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { measureText } from '../../src/edit/dim/textbox';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** 보조선 사이 20, 치수선 y = 10의 수평 치수, 문자를 (x, y)로 옮김(사용자 위치 128). ov: 치수 재지정(DXF 코드 → 값) */
function moved(doc: CadDocument, x: number, y: number, ov: Record<number, number> = { 279: 1 }): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(20, 0), V(10, 10), { rotation: 0 });
  d.overrides = { ...(d.overrides ?? {}), ...ov };
  d.dimType |= 128;
  d.textMid = V(x, y);
  return d;
}

/** 다시 만든 블록의 문자, 문자 상자, 보조선(x = 0·20 세로)과 치수선(y = 10)이 아닌 선 */
function parts(doc: CadDocument, d: DimensionEntity) {
  const g = generateDimensionGeometry(doc, d);
  const m = g.entities.find((e): e is MTextEntity => e.type === 'MTEXT')!;
  const v = dimVars(doc, d);
  const box = measureText(m.text, v.txt, v.textStyle);
  const extra = g.entities
    .filter((e): e is LineEntity => e.type === 'LINE')
    .filter((e) => !(Math.abs(e.start.x - e.end.x) < 1e-9 && (Math.abs(e.start.x) < 1e-9 || Math.abs(e.start.x - 20) < 1e-9)))
    .filter((e) => !(Math.abs(e.start.y - 10) < 1e-9 && Math.abs(e.end.y - 10) < 1e-9));
  return { m, v, box, extra };
}

const near = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 9);
  expect(a.y).toBeCloseTo(y, 9);
};

describe('DIMTMOVE 1 문자 자리와 지시선(133차 — AutoCAD 블록 실물)', () => {
  it('치수선에 가까운 문자 중간점: 지시선 없이 문자를 중간점 위(DIMGAP + 높이/2)에', () => {
    const doc = createNewDocument('metric');
    for (const y of [10, 10.4, 8.6, 12.5]) {
      const { m, v, box, extra } = parts(doc, moved(doc, 13, y));
      expect(extra).toHaveLength(0);
      near(m.insert, 13, y + v.gap + box.h / 2);
    }
  });

  it('먼 문자 중간점: 치수선 가운데에서 지시선, 문자 밑 밑줄, 문자는 가운데의 반대쪽으로', () => {
    const doc = createNewDocument('metric');
    // 오른쪽 위
    let r = parts(doc, moved(doc, 30, 20));
    near(r.m.insert, 30 + r.box.w / 2, 20 + r.v.gap + r.box.h / 2);
    expect(r.extra).toHaveLength(2);
    near(r.extra[0]!.start, 10, 10);
    near(r.extra[0]!.end, 30 - r.v.gap, 20);
    near(r.extra[1]!.start, 30 - r.v.gap, 20);
    near(r.extra[1]!.end, 30 + r.box.w + r.v.gap, 20);
    // 왼쪽 아래(문자가 치수선 쪽으로 서도 멀면 지시선)
    r = parts(doc, moved(doc, 4, 4));
    near(r.m.insert, 4 - r.box.w / 2, 4 + r.v.gap + r.box.h / 2);
    expect(r.extra).toHaveLength(2);
    near(r.extra[0]!.start, 10, 10);
    near(r.extra[0]!.end, 4 + r.v.gap, 4);
    near(r.extra[1]!.end, 4 - r.box.w - r.v.gap, 4);
  });

  it('경계는 치수선에서 DIMGAP + 1.1 × 문자 높이(위·아래 같음)', () => {
    const doc = createNewDocument('metric');
    const { v, box } = parts(doc, moved(doc, 13, 10));
    const T = v.gap + 1.1 * box.h;
    for (const s of [1, -1]) {
      expect(parts(doc, moved(doc, 13, 10 + s * (T - 0.01))).extra).toHaveLength(0);
      expect(parts(doc, moved(doc, 13, 10 + s * (T + 0.01))).extra).toHaveLength(2);
    }
  });

  it('DIMTMOVE 2와 문자가 치수선과 나란하지 않은 DIMTMOVE 1은 전과 같다', () => {
    const doc = createNewDocument('metric');
    const two = parts(doc, moved(doc, 13, 10.4, { 279: 2 }));
    near(two.m.insert, 13, 10.4);
    expect(two.extra).toHaveLength(0);
    // 문자 회전 90°: 문자 가운데 = 중간점, 치수선 가운데에서 착지선을 거친 지시선
    const d = moved(doc, 30, 20);
    d.textRotation = Math.PI / 2;
    const r = parts(doc, d);
    near(r.m.insert, 30, 20);
    expect(r.extra).toHaveLength(2);
    near(r.extra[0]!.start, 10, 10);
  });
});
