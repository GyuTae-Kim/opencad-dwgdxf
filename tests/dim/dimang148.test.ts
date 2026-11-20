/**
 * 148차: 각도 치수에서 사용자가 옮긴 문자(DXF 70의 128, DIMTMOVE 1)가 치수 호 위에 놓이면 AutoCAD는 보조선 사이 호를 문자 상자에서 끊는다.
 * 실제 도면의 사용자 위치 DIMTMOVE 1 각도 치수에서 MTEXT 삽입점(= 문자 중간점)이 호 위에 놓인 7개(도면 7개 — 두 선 6·세 점 1)는 모두
 * AutoCAD 블록의 호가 둘이고 끊긴 틈의 현 길이가 문자 폭 + 2·DIMGAP이다(예: 3.071 ↔ 3.047·3.107 ↔ 3.069·2.159 ↔ 2.175 DIMASZ).
 * 이 앱은 옮긴 문자를 맞춤에서만 빼고 호를 끊지 않아 호가 하나였다. 문자가 호에서 떨어지면(반지름 비 1.125 등) AutoCAD도 끊지 않고,
 * 바깥 꼬리 호에 걸친 여러 줄 문자(실물 1개)는 꼬리를 끊지 않았다. DIMTMOVE 2·회전한 문자는 호에 걸친 실물이 없어 그대로 둔다.
 * 아래 시험은 실물 하나(두 선 각도 53.13°, 호 반지름 7.944 DIMASZ, 문자 26.66°)의 값을 DIMASZ 1로 옮겨 만든다.
 */
import { describe, expect, it } from 'vitest';
import type { ArcEntity, CadDocument, DimensionEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { createAngular2LineDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { measureText } from '../../src/edit/dim/textbox';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const D = Math.PI / 180;
const at = (r: number, deg: number) => V(r * Math.cos(deg * D), r * Math.sin(deg * D));

/** 실물 치수 스타일 값(DIMASZ 1 단위): DIMGAP 0.643, DIMTXT 0.893, DIMTAD 1, 문자 정렬, DIMATFIT 1, DIMTOFL 0, DIMTMOVE tmove */
function dim(doc: CadDocument, sweep: number, R: number, tmove: number, textDeg: number | null, ratio = 1): DimensionEntity {
  const d = createAngular2LineDimension(doc, V(0, 0), at(100, 0), V(0, 0), at(100, sweep), at(R, sweep / 2));
  d.overrides = { ...(d.overrides ?? {}), 41: 1, 147: 0.643, 140: 0.893, 77: 1, 73: 0, 74: 0, 279: tmove, 289: 1, 172: 0, 174: 0 };
  if (textDeg !== null) {
    d.dimType |= 128;
    d.textMid = at(R * ratio, textDeg);
  }
  return d;
}

/** 호 조각(도, 시작 변 0° 기준 (-180, 180]) */
function arcs(doc: CadDocument, d: DimensionEntity): number[][] {
  const n = (a: number) => {
    let x = (a / D) % 360;
    if (x > 180) x -= 360;
    if (x <= -180) x += 360;
    return Math.round(x * 1e4) / 1e4;
  };
  return generateDimensionGeometry(doc, d)
    .entities.filter((e): e is ArcEntity => e.type === 'ARC')
    .map((e) => [n(e.startAngle), n(e.endAngle)])
    .sort((a, b) => a[0]! - b[0]!);
}

describe('각도 치수의 옮긴 문자가 치수 호를 끊기(148차 — AutoCAD 블록 실물)', () => {
  it('사용자 위치 DIMTMOVE 1 문자가 호 위에 있으면 보조선 사이 호를 문자 폭 + 2·DIMGAP만큼 끊는다', () => {
    const doc = createNewDocument('metric');
    const R = 7.944;
    const sweep = 53.13;
    // 문자를 옮기지 않으면(제자리) 호 하나 — 화살촉 길이(DIMASZ 1)를 현으로 양 끝에서 뗀다
    const trim = (2 * Math.asin(1 / (2 * R))) / D;
    const base = arcs(doc, dim(doc, sweep, R, 1, null));
    expect(base).toHaveLength(1);
    expect(base[0]![0]).toBeCloseTo(trim, 3);
    expect(base[0]![1]).toBeCloseTo(sweep - trim, 3);

    const d = dim(doc, sweep, R, 1, 26.66);
    const got = arcs(doc, d);
    // AutoCAD 블록: [7.22°, 15.52°]·[37.81°, 45.91°] — 틈 가운데 26.665°가 문자 자리
    expect(got).toHaveLength(2);
    expect(got[0]![0]).toBeCloseTo(trim, 3);
    expect(got[1]![1]).toBeCloseTo(sweep - trim, 3);
    expect((got[0]![1] + got[1]![0]) / 2).toBeCloseTo(26.66, 2);
    // 틈의 현 길이 = 이 앱의 문자 폭 + 2·DIMGAP(문자 상자가 호 위에 접선으로 놓여 옆 변에서 끊긴다)
    const m = generateDimensionGeometry(doc, d).entities.find((e): e is MTextEntity => e.type === 'MTEXT')!;
    const w = measureText(m.text, m.height, dimVars(doc, d).textStyle).w;
    const chord = 2 * R * Math.sin(((got[1]![0] - got[0]![1]) * D) / 2);
    expect(chord).toBeCloseTo(w + 2 * 0.643, 4);
  });

  it('문자가 호에서 떨어지거나 DIMTMOVE 2·회전한 문자면 호를 끊지 않는다', () => {
    const doc = createNewDocument('metric');
    // 호에서 떨어진 문자(실물: 45.02°, 호 반지름 14.797, 문자 22.9°·반지름 비 1.125 — 호까지 1.85 DIMASZ, AutoCAD 호 하나)
    expect(arcs(doc, dim(doc, 45.02, 14.797, 1, 22.9, 1.125))).toEqual(arcs(doc, dim(doc, 45.02, 14.797, 1, null)));
    const R = 7.944;
    const one = arcs(doc, dim(doc, 53.13, R, 1, null));
    // DIMTMOVE 2(지시선 없이 옮김): 호에 걸친 실물이 없어 그대로
    expect(arcs(doc, dim(doc, 53.13, R, 2, 26.66))).toEqual(one);
    // 문자 회전(53)이 그 자리 접선과 나란하지 않으면 그대로
    const r = dim(doc, 53.13, R, 1, 26.66);
    r.textRotation = 26.66 * D;
    expect(arcs(doc, r)).toEqual(one);
  });

  it('화살촉이 바깥이면 꼬리 호는 문자가 걸쳐도 끊지 않는다', () => {
    const doc = createNewDocument('metric');
    // 보조선 사이 8 × 10° = 1.40 < 화살촉 둘 → 화살촉·꼬리 바깥(DIMTOFL 0이라 보조선 사이 호 없음)
    const far = arcs(doc, dim(doc, 10, 8, 1, -120, 3));
    expect(far).toHaveLength(2);
    // 끝 쪽 꼬리 호 위에 옮긴 문자(실물: 여러 줄 문자가 꼬리 끝에 걸친 치수 — AutoCAD는 꼬리를 그대로 그림)
    expect(arcs(doc, dim(doc, 10, 8, 1, 10 + 1.5 / 8 / D))).toEqual(far);
  });
});
