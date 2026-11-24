/**
 * OCS(객체 좌표계) 도우미. 편집은 WCS 평면도에서 하고, OCS 객체는 extrusion으로 WCS를 구한다.
 * (0, 0, -1)이면 OCS X = WCS −X, Y = WCS Y, Z = WCS −Z다(임의 축 알고리즘).
 */
import type { Entity, LwPolylineEntity, LwVertex, Vec2, Vec3 } from '../../core/model';
import { lwVertices } from '../../core/lwpoly';
import { ocsMatrix } from '../../geom/matrix';
import { type Affine, add3, cross3, dot3, len3, mul3, norm3 } from './math';

export interface Frame {
  ax: Vec3;
  ay: Vec3;
  n: Vec3;
}

const WORLD: Frame = Object.freeze({ ax: { x: 1, y: 0, z: 0 }, ay: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } }) as Frame;

/** extrusion이 없거나 (0, 0, +1)에 가까우면 참 */
export function isNaturalExt(ext: Vec3 | undefined): boolean {
  if (!ext) return true;
  const l = len3(ext);
  if (!(l > 0)) return true;
  return Math.abs(ext.x / l) < 1e-12 && Math.abs(ext.y / l) < 1e-12 && ext.z > 0;
}

/** Z축과 평행(±Z)인지 */
export function isPlanarExt(ext: Vec3 | undefined): boolean {
  if (!ext) return true;
  const l = len3(ext);
  if (!(l > 0)) return true;
  return Math.abs(ext.x / l) < 1e-9 && Math.abs(ext.y / l) < 1e-9;
}

/** OCS 축(WCS 단위 벡터) */
export function frameOf(ext: Vec3 | undefined): Frame {
  const m = ocsMatrix(ext);
  if (!m) return WORLD;
  return {
    ax: { x: m[0]!, y: m[4]!, z: m[8]! },
    ay: { x: m[1]!, y: m[5]!, z: m[9]! },
    n: { x: m[2]!, y: m[6]!, z: m[10]! },
  };
}

export function ocsToWcs(p: Vec3, ext: Vec3 | undefined): Vec3 {
  const f = frameOf(ext);
  return add3(add3(mul3(f.ax, p.x), mul3(f.ay, p.y)), mul3(f.n, p.z));
}

export function wcsToOcs(p: Vec3, ext: Vec3 | undefined): Vec3 {
  const f = frameOf(ext);
  return { x: dot3(p, f.ax), y: dot3(p, f.ay), z: dot3(p, f.n) };
}

/** OCS 방향 벡터 → WCS */
export function ocsDirToWcs(v: Vec3, ext: Vec3 | undefined): Vec3 {
  return ocsToWcs(v, ext);
}

/** 고도 z인 OCS 평면의 (x, y) → WCS 평면도 (x, y) */
export function planProj(ext: Vec3 | undefined, z = 0): Affine {
  const f = frameOf(ext);
  return [f.ax.x, f.ax.y, f.ay.x, f.ay.y, f.n.x * z, f.n.y * z];
}

/** 고도 z인 OCS 평면의 WCS Z(평면이 XY와 평행할 때의 높이) */
export function planZ(ext: Vec3 | undefined, z = 0): number {
  const f = frameOf(ext);
  return f.n.z * z;
}

/**
 * 돌출 방향이 Z축과 평행하고 자연 +Z가 아닌(−Z) OCS 평면의 평면도 사상. 자연 +Z와 돌출 방향이 기운 객체는 null(OCS 값 그대로 쓴다).
 * 아래 두 도우미와 함께 치수·중심 표식 명령(174~176차 — `app/dimcmds.ts`에서 옮겼다, 같은 값)과 QDIM(177차, `edit/annot/qdim.ts`)이 쓴다
 */
export function ocsPlan(ext: Vec3 | undefined, z: number): Affine | null {
  return !isNaturalExt(ext) && isPlanarExt(ext) ? planProj(ext, z) : null;
}

/**
 * 폴리선(LWPOLYLINE)의 평면도 꼭짓점과 평면의 WCS Z(<객체 선택> 원점·CENTERLINE·CENTERMARK가 함께 씀 — 176차, 177차부터 QDIM).
 * 꼭짓점(10)·고도(38)는 객체 OCS 값이다(DXF 참조서 OCS). 돌출 방향이 −Z면 OCS X = WCS −X라 편집 기하 커널과 같은 평면 사상(planProj)으로
 * 옮기고, 뒤집힌 평면이면 볼록도 부호를 뒤집는다(175차 CENTERMARK의 폴리선 갈래와 같은 식). 자연 +Z와 돌출 방향이 기운 폴리선은 OCS 값 그대로
 */
export function lwPlanVertices(e: LwPolylineEntity): { vs: LwVertex[]; z: number } {
  const ext = e.extrusion;
  const m = ocsPlan(ext, e.elevation);
  if (!m) return { vs: lwVertices(e), z: e.elevation };
  const flip = m[0] * m[3] - m[1] * m[2] < 0;
  const vs = lwVertices(e).map((v) => ({ ...v, x: m[0] * v.x + m[2] * v.y + m[4], y: m[1] * v.x + m[3] * v.y + m[5], bulge: flip ? -v.bulge : v.bulge }));
  return { vs, z: planZ(ext, e.elevation) || 0 };
}

/**
 * 호·원의 평면도 중심·반지름·호 범위와 평면의 WCS Z(DIMRADIUS·DIMDIAMETER·DIMARC·DIMCENTER, 175차부터 DIMANGULAR 호·원과 CENTERMARK, 177차부터 QDIM).
 * CIRCLE·ARC의 중심(10)·각도(50·51)는 객체 OCS 값이다(DXF 참조서 OCS). 돌출 방향이 −Z(대칭으로 뒤집힌 원·호)면 OCS X = WCS −X라
 * 편집 기하 커널과 같은 평면 사상(planProj)으로 평면도에 옮긴다 — 중심은 X 거울상 자리에서 돌아오고, 호는 돌아가는 방향이 뒤집혀
 * 평면도의 반시계 시작·끝이 OCS 끝·시작이 된다(174차 — 전에는 치수·중심 표식이 X 거울상 자리에 생겼다).
 * 자연 +Z는 전과 같은 값, 돌출 방향이 Z축과 평행하지 않은 원·호(평면도에서 타원)는 전처럼 OCS 값 그대로 둔다
 */
export function circleOf(e: Entity | undefined): { c: Vec2; r: number; a0?: number; a1?: number; z: number } | null {
  if (!e || (e.type !== 'CIRCLE' && e.type !== 'ARC')) return null;
  const ext = e.extrusion;
  if (isNaturalExt(ext) || !isPlanarExt(ext)) {
    if (e.type === 'CIRCLE') return { c: e.center, r: e.radius, z: e.center.z };
    return { c: e.center, r: e.radius, a0: e.startAngle, a1: e.endAngle, z: e.center.z };
  }
  const m = planProj(ext, e.center.z);
  const c = { x: m[0] * e.center.x + m[2] * e.center.y + m[4], y: m[1] * e.center.x + m[3] * e.center.y + m[5] };
  const z = planZ(ext, e.center.z) || 0;
  if (e.type === 'CIRCLE') return { c, r: e.radius, z };
  const dir = (a: number) => {
    const t = Math.atan2(m[1] * Math.cos(a) + m[3] * Math.sin(a), m[0] * Math.cos(a) + m[2] * Math.sin(a));
    return t < 0 ? t + 2 * Math.PI : t;
  };
  const flip = m[0] * m[3] - m[1] * m[2] < 0;
  return { c, r: e.radius, a0: dir(flip ? e.endAngle : e.startAngle), a1: dir(flip ? e.startAngle : e.endAngle), z };
}

export interface PlaneMap {
  /** 원래 OCS 평면 좌표 → 새 OCS 평면 좌표 */
  A: Affine;
  /** 새 extrusion(자연스러운 +Z면 undefined) */
  ext: Vec3 | undefined;
  /** 새 고도 */
  z: number;
}

/**
 * 평면 객체(OCS)에 평면도 아핀 m(Z는 dz만 이동)을 적용할 때, 새 OCS와 평면 안의 2D 아핀을 구한다.
 * 결과 평면이 XY와 평행하면 늘 +Z(자연스러운 객체)로 쓰고, 그 대신 A가 뒤집힐 수 있다(det < 0).
 */
export function planeMap(ext: Vec3 | undefined, z: number, m: Affine, dz = 0): PlaneMap {
  const f = frameOf(ext);
  const L = (v: Vec3): Vec3 => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y, z: v.z });
  const lax = L(f.ax);
  const lay = L(f.ay);
  let nn = cross3(lax, lay);
  const nl = len3(nn);
  if (!(nl > 1e-300)) nn = f.n;
  else nn = mul3(nn, 1 / nl);
  if (Math.abs(nn.x) < 1e-9 && Math.abs(nn.y) < 1e-9) nn = { x: 0, y: 0, z: 1 };
  const nf = frameOf(nn);
  const o = add3(L(mul3(f.n, z)), { x: m[4], y: m[5], z: dz });
  const A: Affine = [dot3(nf.ax, lax), dot3(nf.ay, lax), dot3(nf.ax, lay), dot3(nf.ay, lay), dot3(nf.ax, o), dot3(nf.ay, o)];
  const newExt = isNaturalExt(nn) ? undefined : norm3(nn);
  return { A, ext: newExt, z: dot3(nf.n, o) };
}

/** extrusion 값을 원래 객체의 길이(보통 1)로 정리 */
export function cleanExt(ext: Vec3 | undefined): Vec3 | undefined {
  if (!ext || isNaturalExt(ext)) return undefined;
  return norm3(ext);
}
