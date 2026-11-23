/**
 * 149차: 반지름 치수에서 사용자가 옮긴 문자(DXF 70의 128, DIMTMOVE 1)의 중간점이 지시선 위에 있으면 AutoCAD는 문자를 지시선 위(DIMTAD 쪽)로 비켜 놓는다.
 * 실제 도면의 사용자 위치 DIMTMOVE 1 반지름 치수 12개(도면 6개 — 모두 DIMTAD 1, 문자 정렬, 중간점이 지시선 위, 원 안 11·밖 1)에서
 * AutoCAD 블록의 MTEXT 가운데는 선 방향으로 중간점 그대로, 선과 수직으로 1.095~1.357 DIMASZ 비켜 있다 — 133차 선형 치수와 같은 꼴
 * (중간점 = 문자 밑 자리, 문자 가운데 = 중간점 + DIMTAD 쪽 DIMGAP + 높이/2 — 이 앱 셈 1.090~1.448). 이 앱은 문자 가운데를 중간점에 두어
 * 지시선이 문자 한가운데를 지났다. 지시선은 둘 다 문자 먼 끝 + DIMGAP까지 그대로 긋는다(남은 차이는 문자 폭 짐작).
 * 지름 치수·DIMTMOVE 2·지시선에서 떨어진 중간점·수평 문자는 실물이 없어 그대로 둔다.
 * 아래 시험은 실물 두 치수(원 안: 반지름 7.143, 중간점 2.906 / 원 밖: 반지름 4.762, 중간점 9.747 — DIMASZ 1 단위)의 값을 쓴다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, LineEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { createDiameterDimension, createRadialDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { measureText } from '../../src/edit/dim/textbox';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const D = Math.PI / 180;
const dirOf = (deg: number) => ({ x: Math.cos(deg * D), y: Math.sin(deg * D) });

/** 실물 치수 스타일 값(DIMASZ 1 단위): DIMGAP 0.643, DIMTXT 0.893, DIMTAD tad, 문자 정렬(DIMTIH·DIMTOH 0), DIMATFIT 1, DIMTOFL 0, DIMCEN 0 */
function styled(d: DimensionEntity, tmove: number, tad = 1, toh = 0): DimensionEntity {
  d.overrides = { ...(d.overrides ?? {}), 41: 1, 147: 0.643, 140: 0.893, 77: tad, 73: 0, 74: toh, 279: tmove, 289: 1, 172: 0, 174: 0, 141: 0 };
  return d;
}

/** 반지름 R, 호 위 점 방향 deg(도)의 반지름 치수에 문자 중간점을 중심에서 along, 옆으로 side만큼(사용자 위치 128) */
function radius(doc: CadDocument, R: number, deg: number, along: number, side: number, tmove: number, tad = 1, toh = 0): DimensionEntity {
  const d = styled(createRadialDimension(doc, V(0, 0), R, deg * D), tmove, tad, toh);
  const u = dirOf(deg);
  d.dimType |= 128;
  d.textMid = V(u.x * along - u.y * side, u.y * along + u.x * side);
  return d;
}

function parts(doc: CadDocument, d: DimensionEntity) {
  const g = generateDimensionGeometry(doc, d);
  const m = g.entities.find((e): e is MTextEntity => e.type === 'MTEXT')!;
  const lines = g.entities.filter((e): e is LineEntity => e.type === 'LINE');
  const v = dimVars(doc, d);
  const box = measureText(m.text, v.txt, v.textStyle);
  return { m, lines, v, box };
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('반지름 치수의 옮긴 문자(DIMTMOVE 1)가 지시선 위면 DIMTAD 쪽으로 비키기(149차 — AutoCAD 블록 실물)', () => {
  it('중간점이 지시선 위: 문자 가운데 = 중간점 + DIMTAD 쪽 DIMGAP + 높이/2, 지시선은 그대로 문자 끝 + DIMGAP까지', () => {
    const doc = createNewDocument('metric');
    // 원 안(실물: 반지름 7.143, 중간점 2.906 — AutoCAD 문자는 선에서 1.174 비킴, 선은 중심 쪽 0.668까지)과
    // 원 밖(실물: 반지름 4.762, 중간점 9.747 — AutoCAD 1.153 비킴, 선은 바깥 11.899까지), 문자를 뒤집지 않는 방향(30°)과 뒤집는 방향(210°)
    for (const [R, along] of [
      [7.143, 2.906],
      [4.762, 9.747],
    ] as const) {
      for (const deg of [30, 210]) {
        const { m, lines, v, box } = parts(doc, radius(doc, R, deg, along, 0, 1));
        const u = dirOf(deg);
        const up = dirOf(m.rotation / D + 90);
        // 문자는 선과 나란하고 읽는 방향(뒤집으면 위쪽이 반대)
        expect(Math.abs(Math.sin(m.rotation - deg * D))).toBeLessThan(1e-9);
        const off = v.gap + box.h / 2;
        near(m.insert, { x: u.x * along + up.x * off, y: u.y * along + up.y * off });
        // 지시선(문자 쪽 선 하나): 원 안이면 문자의 중심 쪽 끝 − DIMGAP에서 화살촉 밑동(호 안쪽 DIMASZ)까지, 원 밖이면 문자의 바깥 끝 + DIMGAP에서 호 바깥 밑동까지
        const inside = along < R;
        const end = inside ? along - box.w / 2 - v.gap : along + box.w / 2 + v.gap;
        const base = inside ? R - 1 : R + 1;
        const leader = lines.find((l) => Math.abs((l.start.x - u.x * end) ** 2 + (l.start.y - u.y * end) ** 2) < 1e-12);
        expect(leader).toBeDefined();
        near(leader!.end, { x: u.x * base, y: u.y * base });
        // 문자 상자 밑변이 지시선에서 DIMGAP 떨어져 선이 문자를 지나지 않는다
        const sideOfText = Math.abs((m.insert.x - u.x * along) * -u.y + (m.insert.y - u.y * along) * u.x);
        expect(sideOfText - box.h / 2).toBeCloseTo(v.gap, 9);
      }
    }
  });

  it('DIMTAD 4(아래)는 아래로, DIMTAD 0은 그대로 중간점에', () => {
    const doc = createNewDocument('metric');
    const below = parts(doc, radius(doc, 7.143, 30, 2.906, 0, 1, 4));
    const up = dirOf(below.m.rotation / D + 90);
    const u = dirOf(30);
    const off = below.v.gap + below.box.h / 2;
    near(below.m.insert, { x: u.x * 2.906 - up.x * off, y: u.y * 2.906 - up.y * off });
    near(parts(doc, radius(doc, 7.143, 30, 2.906, 0, 1, 0)).m.insert, { x: u.x * 2.906, y: u.y * 2.906 });
  });

  it('실물이 없는 것은 그대로: DIMTMOVE 2, 지시선에서 떨어진 중간점, 수평 문자(DIMTOH 1), 지름 치수', () => {
    const doc = createNewDocument('metric');
    const u = dirOf(30);
    const at = (along: number, side: number) => ({ x: u.x * along - u.y * side, y: u.y * along + u.x * side });
    // DIMTMOVE 2(지시선 없이 옮김)
    near(parts(doc, radius(doc, 7.143, 30, 2.906, 0, 2)).m.insert, at(2.906, 0));
    // 중간점이 지시선에서 떨어짐(옆 2 DIMASZ)
    near(parts(doc, radius(doc, 7.143, 30, 2.906, 2, 1)).m.insert, at(2.906, 2));
    // 수평 문자
    near(parts(doc, radius(doc, 7.143, 30, 9.747, 0, 1, 1, 1)).m.insert, at(9.747, 0));
    // 지름 치수(사용자 위치 DIMTMOVE 1 실물 0개)
    const dia = styled(createDiameterDimension(doc, V(0, 0), 7.143, 30 * D), 1);
    dia.dimType |= 128;
    dia.textMid = V(u.x * 2.906, u.y * 2.906);
    near(parts(doc, dia).m.insert, at(2.906, 0));
  });
});
