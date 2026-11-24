/**
 * 비연관 배열(ARRAYRECT·ARRAYPOLAR, 연관 = 아니오): 원본은 그대로 두고 복사본을 add로 돌려준다.
 * - 직사각형: 열은 +X, 행은 +Y 방향(angle만큼 돌린다). 간격이 음수면 반대쪽.
 * - 원형: fillAngle이 360°(±2π)면 간격 = 채울 각도 / 개수, 아니면 / (개수 − 1). 양수 = 반시계.
 *   rotateItems가 거짓이면 항목은 돌리지 않고 기준점(기본: 선택 범위의 중심)이 원을 따라 옮겨 간 만큼 이동한다.
 */
import type { CadDocument, Entity, Vec2 } from '../../core/model';
import { createDocument } from '../../core/model';
import { pathStart } from './curve';
import { type Affine, TAU, affRotate, affTranslate } from './math';
import { ocsToWcs } from './ocs';
import { entityPath } from './path';
import { boundsOf, copyEntity } from './query';
import { type EditResult, mergeResults } from './types';

/**
 * 클래식 원형 배열(-ARRAY·ARRAYCLASSIC)에서 항목을 돌리지 않을 때 원을 따라 옮기는 객체의 기본 기준점(166차).
 * Autodesk Array 대화 상자 도움말의 "객체 기본값으로 설정" 표: 호·원·타원은 중심, 선·폴리선·3D 폴리선·광선·스플라인(도넛·다각형·직사각형도
 * 폴리선이라 첫 정점)은 시작점, 블록·여러 줄 문자·한 줄 문자는 삽입점, 구성선은 중간점(첫 점). 여러 객체를 고르면 마지막으로 고른 객체의
 * 기준점을 모두에 쓴다(-ARRAY 도움말도 같다 — 부르는 쪽이 마지막 객체를 넘긴다). 표에 없는 종류는 null(부르는 쪽이 선택 범위 가운데).
 */
export function polarArrayBasePoint(e: Entity): Vec2 | null {
  const xy = (p: { x: number; y: number }): Vec2 => ({ x: p.x, y: p.y });
  switch (e.type) {
    case 'ARC':
    case 'CIRCLE':
      return xy(ocsToWcs(e.center, e.extrusion));
    case 'ELLIPSE':
      return xy(e.center);
    case 'LINE':
      return xy(e.start);
    case 'RAY':
    case 'XLINE':
      return xy(e.base);
    case 'LWPOLYLINE':
    case 'POLYLINE':
    case 'SPLINE': {
      if (e.type === 'POLYLINE' && e.kind !== '2d' && e.kind !== '3d') return null;
      const path = entityPath(e);
      return path?.pieces.length ? pathStart(path) : null;
    }
    case 'INSERT':
      return xy(ocsToWcs(e.insert, e.extrusion));
    case 'MTEXT':
      return xy(e.insert);
    case 'TEXT': {
      // 삽입점: 맞춘 문자는 맞춤점(정렬·맞춤 두 점 문자와 왼쪽 문자는 첫 점) — 삽입점 스냅과 같다
      const p = e.alignPoint && (e.halign !== 0 || e.valign !== 0) && e.halign !== 3 && e.halign !== 5 ? e.alignPoint : e.insert;
      return xy(ocsToWcs(p, e.extrusion));
    }
    default:
      return null;
  }
}

function copies(list: readonly Entity[], mats: Affine[], doc: CadDocument): EditResult {
  const parts: EditResult[] = [];
  for (const m of mats) for (const e of list) parts.push(copyEntity(e, m, doc));
  return mergeResults(parts);
}

/** 직사각형 배열(첫 항목 = 원본은 빼고 복사본만) */
export function arrayRectangular(list: Entity[], rows: number, cols: number, rowSpacing: number, colSpacing: number, angle = 0, doc: CadDocument = createDocument()): EditResult {
  const R = Math.max(1, Math.floor(rows));
  const C = Math.max(1, Math.floor(cols));
  if (R * C > 100000) return { message: '배열 항목이 너무 많습니다.' };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const mats: Affine[] = [];
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      if (i === 0 && j === 0) continue;
      const x = j * colSpacing;
      const y = i * rowSpacing;
      mats.push(affTranslate(c * x - s * y, s * x + c * y));
    }
  return copies(list, mats, doc);
}

/** 원형 배열(fillAngle 라디안, 양수 = 반시계). base는 회전하지 않는 항목의 기준점 */
export function arrayPolar(list: Entity[], center: Vec2, count: number, fillAngle: number, rotateItems: boolean, doc: CadDocument = createDocument(), base?: Vec2): EditResult {
  const n = Math.max(1, Math.floor(count));
  if (n > 100000) return { message: '배열 항목이 너무 많습니다.' };
  if (n < 2 || !(Math.abs(fillAngle) > 0)) return {};
  const full = Math.abs(Math.abs(fillAngle) - TAU) < 1e-9 || Math.abs(fillAngle) > TAU;
  const step = full ? (Math.sign(fillAngle) * TAU) / n : fillAngle / (n - 1);
  let b = base;
  if (!rotateItems && !b) {
    const bx = boundsOf(list, doc);
    b = bx ? { x: (bx.minX + bx.maxX) / 2, y: (bx.minY + bx.maxY) / 2 } : center;
  }
  const mats: Affine[] = [];
  for (let k = 1; k < n; k++) {
    const R = affRotate(step * k, center);
    if (rotateItems) mats.push(R);
    else {
      const ca = Math.cos(step * k);
      const sa = Math.sin(step * k);
      const dx = b!.x - center.x;
      const dy = b!.y - center.y;
      const nx = center.x + ca * dx - sa * dy;
      const ny = center.y + sa * dx + ca * dy;
      mats.push(affTranslate(nx - b!.x, ny - b!.y));
    }
  }
  return copies(list, mats, doc);
}
