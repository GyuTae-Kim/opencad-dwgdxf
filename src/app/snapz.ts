/**
 * 객체 스냅 점의 Z(AutoCAD OSNAPZ 0 — 도움말 "About Using Object Snaps in 3D": 객체 스냅 위치의 Z는 객체의 3D 위치가 정한다).
 * 끝점·중간점·중심·사분점·노드·삽입점은 객체 정의점이라 snap.ts가 그 Z를 바로 단다.
 * 교차점·근처점·수직·접점처럼 평면도의 선분에서 구한 점은 여기서 그 점이 놓인 객체 위의 Z를 구한다:
 *  - 선·구성선·광선·3D 폴리선·3D 면 모서리: 평면도에서 같은 자리인 선분 위 점의 Z(선분을 따라 고르게)
 *  - 원·호·타원·경량·2D 폴리선·솔리드·해치처럼 평면에 놓인 객체: 그 평면 위의 Z(고도, 기운 평면이면 그 자리의 높이)
 *  - 스플라인: 곡선을 잘게 나눈 꺾은선 위의 Z
 * 블록 참조 안의 객체·문자·치수처럼 모르는 것은 undefined(명령이 지금 고도를 쓴다 — 전과 같다).
 */
import type { Entity, Vec3 } from '../core/model';
import { apply, identity, withOcs } from '../geom/matrix';
import { fitPointsCurve, nurbsPoints } from '../geom/curves';
import { polyVertices } from '../core/polyverts';
import type { Pt } from './view';
import { fitCount, splineCtrl, splineFit } from '../core/flat3';

/** 평면도에서 길이가 없는 선분으로 볼 길이의 제곱 */
const FLAT2 = 1e-24;

/** 3D 선분 a-b에서 평면도의 점 q에 가장 가까운 점의 Z와 평면 거리. 평면에서 길이가 없고 두 Z가 다르면 Z는 undefined */
function segZ(a: Vec3, b: Vec3, q: Pt): { z: number | undefined; d: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < FLAT2) return { z: Math.abs(a.z - b.z) < 1e-12 ? a.z : undefined, d: Math.hypot(q.x - a.x, q.y - a.y) };
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
  return { z: a.z + (b.z - a.z) * t, d: Math.hypot(q.x - (a.x + dx * t), q.y - (a.y + dy * t)) };
}

/** 꺾은선(3D 점들)에서 평면도의 q에 가장 가까운 선분 위의 Z */
function polyZ(pts: readonly Vec3[], closed: boolean, q: Pt): number | undefined {
  if (pts.length === 1) return pts[0]!.z;
  let best: { z: number | undefined; d: number } | null = null;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const s = segZ(pts[i]!, pts[(i + 1) % pts.length]!, q);
    if (!best || s.d < best.d - 1e-12) best = s;
  }
  return best?.z;
}

/** 점 p0를 지나고 법선이 n인 평면 위에서 평면도의 q 자리 Z. 평면이 Z축과 나란하면(옆에서 본 평면) undefined */
function planeZ(p0: Vec3, n: Vec3, q: Pt): number | undefined {
  const len = Math.hypot(n.x, n.y, n.z);
  if (!(len > 0)) return p0.z;
  const nz = n.z / len;
  if (Math.abs(nz) < 1e-9) return undefined;
  return p0.z - ((n.x / len) * (q.x - p0.x) + (n.y / len) * (q.y - p0.y)) / nz;
}

const Z_UP: Vec3 = { x: 0, y: 0, z: 1 };

/** 객체 좌표(OCS)의 점 하나가 놓인 평면(법선 = extrusion)의 q 자리 Z */
function ocsPlaneZ(e: Entity, x: number, y: number, z: number, q: Pt): number | undefined {
  const p0 = apply(withOcs(identity(), e.extrusion), x, y, z);
  return planeZ(p0, e.extrusion ?? Z_UP, q);
}

/** 점들의 범위 상자 대각선 길이 */
function spanOf(pts: readonly Vec3[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
    z1 = Math.max(z1, p.z);
  }
  return Math.hypot(x1 - x0, y1 - y0, z1 - z0);
}

/** 스플라인의 3D 꺾은선(맞춤점만 있으면 맞춤 곡선). 높이를 읽을 만큼 잘게(크기의 10만분의 1 — 매듭 구간마다 64칸까지) */
function splinePoints(e: Entity & { type: 'SPLINE' }): Vec3[] {
  let flat: number[];
  const ctrl = splineCtrl(e);
  if (ctrl.length >= 2) flat = nurbsPoints(e.degree, e.knots, ctrl, e.weights, Math.max(1e-9, spanOf(ctrl) * 1e-5));
  else if (fitCount(e) >= 2) {
    const s = fitPointsCurve(e);
    flat = nurbsPoints(s.degree, s.knots, s.ctrl, undefined, Math.max(1e-9, spanOf(s.ctrl) * 1e-5));
  } else return splineFit(e);
  const out: Vec3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push({ x: flat[i]!, y: flat[i + 1]!, z: flat[i + 2]! });
  return out;
}

/** 평면도의 점 q(객체 위 — 교차점·근처점·수직·접점이 구한 자리)에서 객체 e의 WCS Z. 모르면(블록 참조 등) undefined */
export function entityZAt(e: Entity, q: Pt): number | undefined {
  switch (e.type) {
    case 'LINE':
      return segZ(e.start, e.end, q).z;
    case 'XLINE':
    case 'RAY': {
      const d = e.direction;
      const l2 = d.x * d.x + d.y * d.y;
      if (l2 < FLAT2) return Math.abs(d.z) < 1e-12 ? e.base.z : undefined;
      const t = ((q.x - e.base.x) * d.x + (q.y - e.base.y) * d.y) / l2;
      return e.base.z + d.z * (e.type === 'RAY' ? Math.max(0, t) : t);
    }
    case 'CIRCLE':
    case 'ARC':
      return ocsPlaneZ(e, e.center.x, e.center.y, e.center.z, q);
    case 'ELLIPSE':
      // 타원의 중심·장축은 WCS, 평면의 법선은 extrusion
      return planeZ(e.center, e.extrusion ?? Z_UP, q);
    case 'LWPOLYLINE':
      return ocsPlaneZ(e, 0, 0, e.elevation, q);
    case 'HATCH':
      return ocsPlaneZ(e, 0, 0, e.elevation, q);
    case 'POLYLINE': {
      if (e.kind === '2d') return ocsPlaneZ(e, 0, 0, e.elevation, q);
      if (e.kind !== '3d') return undefined;
      const vs = polyVertices(e)
        .filter((v) => !(v.flags & 16))
        .map((v) => v.location);
      return vs.length ? polyZ(vs, (e.flags & 1) !== 0, q) : undefined;
    }
    case 'SOLID':
    case 'TRACE': {
      const p = e.points[0];
      return ocsPlaneZ(e, p.x, p.y, p.z, q);
    }
    case '3DFACE': {
      const [a, b, c, d] = e.points;
      const tri = Math.abs(c.x - d.x) < 1e-12 && Math.abs(c.y - d.y) < 1e-12 && Math.abs(c.z - d.z) < 1e-12;
      return polyZ(tri ? [a, b, c] : [a, b, c, d], true, q);
    }
    case 'SPLINE': {
      const pts = splinePoints(e);
      if (!pts.length) return undefined;
      // 모든 조정점이 한 높이면 그 높이(평면 스플라인 — 꺾은선 오차 없이)
      const zs = (e.controlVerts.length ? splineCtrl(e) : splineFit(e)).map((p) => p.z);
      if (zs.every((z) => Math.abs(z - zs[0]!) < 1e-12) && (!e.normal || (Math.abs(e.normal.x) < 1e-12 && Math.abs(e.normal.y) < 1e-12))) return zs[0];
      return polyZ(pts, (e.flags & 1) !== 0, q);
    }
    default:
      return undefined;
  }
}

/** 두 객체가 평면도의 q에서 같은 Z를 지나면(3D에서도 만나면) 그 Z, 아니면 undefined */
export function intersectionZ(z1: number | undefined, z2: number | undefined): number | undefined {
  if (z1 === undefined || z2 === undefined) return undefined;
  return Math.abs(z1 - z2) <= 1e-6 * Math.max(1, Math.abs(z1), Math.abs(z2)) ? (z1 + z2) / 2 : undefined;
}
