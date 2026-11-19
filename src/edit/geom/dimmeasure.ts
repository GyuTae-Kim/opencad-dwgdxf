/**
 * 치수의 실제 측정값(DXF 42)을 정의점으로 잰다(136차).
 *
 * R2000 전 DWG에는 이 값의 칸이 없고, AutoCAD가 쓴 R13·R14 DXF에도 42가 없다. 그런 치수(측정값 NaN)를 특성 창·치수 문자 편집·
 * AutoLISP·R2000+ DWG 저장이 이 셈 하나로 잰다(늘이기·그립이 다시 재는 각도 측정값도 — 137차). 셈은 AutoCAD가 저장한 값과 견주어 정했다 — 실제 도면 838개의 R2000+ 치수
 * (두 선 각도 89/89, 세 점 각도 10/10, 반지름 29/29, 세로좌표 34/34, 호 길이 6/6, 회전·정렬은 136차에 낡은 값으로 본 저장 값을 빼고 같음 —
 * 145차: 그 가운데 278개는 이 값 × DIMLFAC였다, dimMeasurementOf)와
 * 같은 도면을 AutoCAD가 R13·R14와 R2000+로 쓴 짝의 치수 49개(모두 같음):
 * - 회전(0): 두 보조선 원점(13·14)의 차를 치수선 방향(50)에 투영한 크기
 * - 정렬(1): 13·14 사이의 평면(OCS XY) 거리 — Z가 다른 원점도 AutoCAD는 평면 거리로 잰다
 * - 지름(3)·반지름(4, 꺾기 반지름 포함): 10과 15 사이 평면 거리
 * - 두 선 각도(2): 두 선(13→14, 15→10)의 교점에서 호 자리(16)가 든 부채꼴의 각도 — 두 선 사이 작은 쪽 각이 아니다(실제 도면 89개 중 36개)
 * - 세 점 각도(5): 꼭짓점(15)에서 13·14로 가는 두 방향 사이에서 호 자리(10)가 든 쪽의 각도
 * - 세로좌표(6): 원점(10)에서 지형지물(13)까지 X(70 비트 64) 또는 Y 거리의 크기(51이 있으면 그 반대 각도가 재는 X축 — stretch.ts·ordinate.ts와 같다)
 * - 호 길이: 호 반지름 × 끼인각
 * 각도는 라디안. 정의점으로 잴 수 없으면(평행한 두 선 등) NaN.
 */
import type { CadDocument, DimensionEntity, Vec3 } from '../../core/model';
import { measureScaleOf } from '../dim/vars';
import { isNaturalExt, wcsToOcs } from './ocs';

const TAU = Math.PI * 2;
const norm = (a: number) => {
  const t = a % TAU;
  return t < 0 ? t + TAU : t;
};
const dir = (from: Vec3, to: Vec3) => Math.atan2(to.y - from.y, to.x - from.x);

export function dimGeomMeasurement(d: DimensionEntity): number {
  if (d.subtype === 'ARC_DIMENSION') {
    const a = d.arc;
    if (!a) return NaN;
    return Math.hypot(a.start.x - a.center.x, a.start.y - a.center.y) * norm(a.endAngle - a.startAngle);
  }
  // 꺾기 반지름(LARGE_RADIAL_DIMENSION)은 종류 4 — 중심(10)과 현 위 점(15)
  const nat = isNaturalExt(d.extrusion);
  // 10·13·14·15는 WCS, 16은 OCS — 치수 평면(OCS)에서 잰다
  const P = (p: Vec3): Vec3 => (nat ? p : wcsToOcs(p, d.extrusion));
  const p10 = P(d.defPoint);
  const p13 = P(d.defPoint2);
  const p14 = P(d.defPoint3);
  const p15 = P(d.defPoint4);
  switch (d.dimType & 7) {
    case 0:
      return Math.abs((p14.x - p13.x) * Math.cos(d.rotation) + (p14.y - p13.y) * Math.sin(d.rotation));
    case 1:
      return Math.hypot(p14.x - p13.x, p14.y - p13.y);
    case 3:
    case 4:
      return Math.hypot(p15.x - p10.x, p15.y - p10.y);
    case 2: {
      const ux = p14.x - p13.x;
      const uy = p14.y - p13.y;
      const vx = p10.x - p15.x;
      const vy = p10.y - p15.y;
      const den = ux * vy - uy * vx;
      if (!(Math.abs(den) > 1e-12 * Math.hypot(ux, uy) * Math.hypot(vx, vy))) return NaN;
      const t = ((p15.x - p13.x) * vy - (p15.y - p13.y) * vx) / den;
      const c = { x: p13.x + ux * t, y: p13.y + uy * t, z: 0 };
      const ap = dir(c, d.defPoint5);
      const a1 = Math.atan2(uy, ux);
      const a2 = Math.atan2(vy, vx);
      // 네 부채꼴(한 선의 방향에서 다른 선의 방향까지, π 미만) 가운데 호 자리가 든 것
      for (const r1 of [a1, a1 + Math.PI])
        for (const r2 of [a2, a2 + Math.PI]) {
          const s12 = norm(r2 - r1);
          if (s12 < Math.PI && norm(ap - r1) <= s12) return s12;
          const s21 = norm(r1 - r2);
          if (s21 < Math.PI && norm(ap - r2) <= s21) return s21;
        }
      return NaN;
    }
    case 5: {
      const a1 = dir(p15, p13);
      const a2 = dir(p15, p14);
      const s = norm(a2 - a1);
      // 호 자리(10)가 꼭짓점에 있으면 작은 쪽
      if (p10.x === p15.x && p10.y === p15.y) return s > Math.PI ? TAU - s : s;
      return norm(dir(p15, p10) - a1) <= s ? s : TAU - s;
    }
    case 6: {
      const dx = p13.x - p10.x;
      const dy = p13.y - p10.y;
      const a = -(d.horizontalDirection || 0);
      return Math.abs(d.dimType & 64 ? dx * Math.cos(a) + dy * Math.sin(a) : -dx * Math.sin(a) + dy * Math.cos(a));
    }
    default:
      return NaN;
  }
}

/**
 * 파일의 측정값이 있으면 그 값, 없으면(NaN) 정의점으로 잰 값. 길이 치수의 42는 AutoCAD가 DIMLFAC 몫을 곱해 적으므로(145차 — edit/dim/vars.ts measureScaleOf)
 * doc을 주면 잰 값에도 그 몫을 곱한다(치수 스타일·재지정·공간으로 정해지므로 doc이 없으면 곱하지 않는다)
 */
export function dimMeasurementOf(d: DimensionEntity, doc?: CadDocument): number {
  if (Number.isFinite(d.measurement)) return d.measurement;
  const g = dimGeomMeasurement(d);
  return doc ? g * measureScaleOf(doc, d) : g;
}
