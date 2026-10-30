/**
 * SPLINE의 DXF 70 ↔ DWG R2013+ 값(첫 값·플래그·매듭 매개변수). AutoCAD가 같은 도면을 DWG와 DXF로 쓴 실물 짝으로 확인했다.
 *
 * - DWG R2013+: 첫 값(1·2), 플래그(1 맞춤점 방식, 4 닫힘, 8은 맞춤점 방식과 늘 같이), 매듭 매개변수(0 현 길이, 1 제곱근, 2 균일, 15 사용자 지정).
 *   맞춤점 방식이면 맞춤점 자료만, 매듭 매개변수 15면 조정점 자료만 담는다.
 * - DXF 70: 1 닫힘, 2 주기, 4 유리, 8 평면, 16 직선. 첫 값이 1인 맞춤점 스플라인은 1024와 매듭 매개변수 비트(32 현 길이·64 제곱근·128 균일)를
 *   함께 쓴다(예: 1064·1160). 첫 값이 2인 맞춤점 스플라인과 조정점 스플라인에는 이 비트가 없고, 닫힘은 1이다.
 * - R2000~R2010 DWG의 맞춤점 자료(종류 2)에는 매듭 매개변수가 없다: AutoCAD는 현 길이 맞춤점 스플라인만 맞춤점 자료로 쓰고
 *   (제곱근·균일은 조정점 자료), 읽을 때는 현 길이로 본다(AutoCAD가 그 DWG를 DXF로 쓰면 70 = 1064).
 *
 * 맞춤점 자료만 담은 DWG를 AutoCAD가 DXF로 쓰면 조정점·매듭을 함께 적는다. 그 값은 `fitSplineAcad`(src/geom/curves.ts)와 같다.
 */
import type { SplineEntity, Vec3 } from '../../core/model';
import { fitSplineAcad, knotParamOfFlags, nurbsPoint } from '../../geom/curves';
import { count3, pack3, unpack3 } from '../../core/flat3';

/** DXF 70: 맞춤점 방식(DWG 첫 값 1) */
export const SPLINE_FIT_METHOD = 1024;

const KNOT_PARAM_BITS: Record<number, number> = { 0: 32, 1: 64, 2: 128 };

/** DWG R2013+ 맞춤점 스플라인(첫 값 1)의 DXF 70 비트 */
export function splineFitBits(knotParam: number): number {
  return SPLINE_FIT_METHOD | (KNOT_PARAM_BITS[knotParam] ?? 0);
}

/** DXF 70 → DWG R2013+ 매듭 매개변수(비트가 없으면 AutoCAD 기본 현 길이 0) */
export const splineKnotParam = knotParamOfFlags;

/** 맞춤 공차가 이보다 크면 AutoCAD는 맞춤점을 지나지 않는 근사 곡선을 만든다(그 계산은 모른다) */
const FIT_TOL_EXACT = 1e-9;

const nonZero = (v?: Vec3): v is Vec3 => !!v && (v.x !== 0 || v.y !== 0 || v.z !== 0);

/** AutoCAD처럼 맞춤점에서 조정점을 다시 구할 수 있는 스플라인인지(열린 3차, 가중치 없음, 맞춤 공차 0) */
function fitShapeOk(e: SplineEntity): boolean {
  if (e.helix || e.degree !== 3 || e.flags & (1 | 2)) return false;
  if (e.fitTolerance > FIT_TOL_EXACT) return false;
  if (e.weights?.some((w) => w !== 1)) return false;
  return true;
}

/** 두 조정점·매듭이 같은 곡선인지(매듭은 시작·끝으로 정규화해 견준다 — 매듭을 아핀으로 바꿔도 곡선은 같다) */
function sameNurbs(ctrl: readonly Vec3[], knots: readonly number[], c2: readonly Vec3[], k2: readonly number[]): boolean {
  if (ctrl.length !== c2.length || knots.length !== k2.length || knots.length < 2) return false;
  let ext = 0;
  for (const p of ctrl) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  const tol = 1e-8 * Math.max(1, ext);
  for (let i = 0; i < ctrl.length; i++) {
    const a = ctrl[i]!;
    const b = c2[i]!;
    if (Math.abs(a.x - b.x) > tol || Math.abs(a.y - b.y) > tol || Math.abs(a.z - b.z) > tol) return false;
  }
  const a0 = knots[0]!;
  const a1 = knots[knots.length - 1]!;
  const b0 = k2[0]!;
  const b1 = k2[k2.length - 1]!;
  if (!(a1 > a0) || !(b1 > b0)) return false;
  for (let i = 0; i < knots.length; i++) if (Math.abs((knots[i]! - a0) / (a1 - a0) - (k2[i]! - b0) / (b1 - b0)) > 1e-8) return false;
  return true;
}

/** DWG에 쓸 맞춤점 자료 */
export interface DwgFitData {
  fit: Vec3[];
  startTangent?: Vec3;
  endTangent?: Vec3;
  knotParam: number;
  tolerance: number;
}

/**
 * 조정점만 남은 맞춤점 방식 스플라인(DXF 70에 1024, 맞춤점 없음 — AutoCAD가 균일 매듭 맞춤점 스플라인을 DXF로 쓸 때 맞춤점을 빼고 쓴다)에서
 * 맞춤점 자료를 되살린다: 맞춤점 = 안쪽 매듭에서의 곡선 위 점, 끝 접선 = 그 끝의 1차 도함수(2차 도함수가 0이면 접선 없음).
 * 같은 도면을 AutoCAD가 DWG로 쓴 짝의 맞춤점 자료가 이 값과 같다. 되살린 자료로 다시 구한 곡선이 같을 때만 쓴다.
 */
function fitFromControl(e: SplineEntity, knotParam: number): DwgFitData | null {
  const P = unpack3(e.controlVerts);
  const U = e.knots;
  const nc = P.length;
  if (nc < 4 || U.length !== nc + 4) return null;
  for (let i = 1; i < 4; i++) if (U[i] !== U[0] || U[nc + i] !== U[nc]) return null;
  for (let i = 3; i < nc; i++) if (!(U[i + 1]! > U[i]!)) return null;
  const n = nc - 2;
  const fit: Vec3[] = [];
  for (let i = 0; i < n; i++) fit.push(i === 0 ? { ...P[0]! } : i === n - 1 ? { ...P[nc - 1]! } : nurbsPoint(3, U, P, undefined, U[3 + i]!));
  // 맞춤점에서 다시 매긴 매듭으로 끝의 1·2차 도함수를 본다(DXF 매듭이 정규화돼 있어도 접선 크기가 AutoCAD 매개변수에 맞게)
  const base = fitSplineAcad(fit, knotParam);
  if (!base) return null;
  const K = base.knots;
  const m = nc - 1;
  const q = (i: number): Vec3 => {
    const d = K[i + 4]! - K[i + 1]!;
    return { x: (3 * (P[i + 1]!.x - P[i]!.x)) / d, y: (3 * (P[i + 1]!.y - P[i]!.y)) / d, z: (3 * (P[i + 1]!.z - P[i]!.z)) / d };
  };
  const natural = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= 1e-9 * Math.max(Math.hypot(a.x, a.y, a.z), Math.hypot(b.x, b.y, b.z), 1e-300);
  const q0 = q(0);
  const q1 = q(1);
  const qe = q(m - 1);
  const qe1 = q(m - 2);
  const out: DwgFitData = { fit, knotParam, tolerance: e.fitTolerance > 0 ? e.fitTolerance : 1e-10 };
  if (!natural(q0, q1)) out.startTangent = q0;
  if (!natural(qe, qe1)) out.endTangent = qe;
  const s = fitSplineAcad(fit, knotParam, out.startTangent, out.endTangent);
  return s && sameNurbs(P, U, s.ctrl, s.knots) ? out : null;
}

/** DWG에 스플라인을 쓰는 방법 */
export type DwgSplinePlan =
  | ({ kind: 'fit' } & DwgFitData)
  | {
      kind: 'ctrl';
      degree: number;
      knots: number[];
      ctrl: Vec3[];
      weights?: number[];
      /** 맞춤점이 있었지만 조정점으로만 쓴다: 'version' 이 판에 없는 매듭 매개변수, 'mismatch' 조정점이 맞춤점에서 다시 구한 곡선과 다름 */
      fitDropped?: 'version' | 'mismatch';
    };

/**
 * DWG에 맞춤점 자료로 쓸지 조정점 자료로 쓸지 정한다(AutoCAD처럼 맞춤점 방식이면 맞춤점 자료 — 다시 열 때 AutoCAD가 같은 조정점을 만든다).
 *
 * - 맞춤점과 조정점이 함께 있으면, 맞춤점에서 AutoCAD 방식으로 다시 구한 조정점·매듭이 지금 것과 같을 때만 맞춤점 자료로 쓴다(모양이 같다).
 *   다르면(조정점을 따로 고쳤거나 근사 공차·다른 끝 조건) 조정점 자료로 쓰고 맞춤점은 빠진다.
 * - 조정점만 있고 70에 1024가 있으면 맞춤점 자료를 되살릴 수 있을 때 맞춤점 자료로(fitFromControl).
 * - R2000~R2010은 현 길이 맞춤점 스플라인만 맞춤점 자료로 쓴다.
 * - 맞춤점만 있으면 맞춤점 자료 그대로(R2000~R2010에 현 길이가 아닌 열린 곡선은 조정점을 구해 조정점 자료로).
 */
export function dwgSplinePlan(e: SplineEntity, r2013: boolean): DwgSplinePlan {
  const knotParam = splineKnotParam(e.flags);
  const fitPts = unpack3(e.fitVerts);
  const asFit = (): DwgSplinePlan => ({
    kind: 'fit',
    fit: fitPts,
    ...(nonZero(e.startTangent) ? { startTangent: e.startTangent } : {}),
    ...(nonZero(e.endTangent) ? { endTangent: e.endTangent } : {}),
    knotParam,
    tolerance: e.fitTolerance,
  });
  const asCtrl = (fitDropped?: 'version' | 'mismatch'): DwgSplinePlan => ({ kind: 'ctrl', degree: e.degree, knots: e.knots, ctrl: unpack3(e.controlVerts), ...(e.weights ? { weights: e.weights } : {}), ...(fitDropped ? { fitDropped } : {}) });
  const hasFit = fitPts.length >= 2;
  if (!e.controlVerts.length) {
    if (!hasFit || r2013 || knotParam === 0 || !fitShapeOk(e)) return asFit();
    const s = fitSplineAcad(fitPts, knotParam, e.startTangent, e.endTangent);
    return s ? { kind: 'ctrl', degree: 3, knots: s.knots, ctrl: s.ctrl, fitDropped: 'version' } : asFit();
  }
  if (e.helix) return asCtrl();
  const versionOk = r2013 || knotParam === 0;
  if (hasFit) {
    if (!fitShapeOk(e)) return asCtrl('mismatch');
    const s = fitSplineAcad(fitPts, knotParam, e.startTangent, e.endTangent);
    if (!s || !sameNurbs(unpack3(e.controlVerts), e.knots, s.ctrl, s.knots)) return asCtrl('mismatch');
    return versionOk ? asFit() : asCtrl('version');
  }
  if (e.flags & SPLINE_FIT_METHOD && versionOk && fitShapeOk(e)) {
    const f = fitFromControl(e, knotParam);
    if (f) return { kind: 'fit', ...f };
  }
  return asCtrl();
}

/**
 * DWG 맞춤점 자료(종류 2)를 읽은 스플라인에 AutoCAD가 만드는 조정점·매듭을 채운다(AutoCAD가 같은 DWG를 DXF로 쓸 때 적는 값).
 * 닫힌 곡선·근사 공차·3차가 아닌 것은 그 계산을 몰라 비워 둔다(그릴 때 맞춤점으로 보간한다).
 */
export function fillFitControl(e: SplineEntity, knotParam: number): void {
  if (e.controlVerts.length || count3(e.fitVerts) < 2 || !fitShapeOk(e)) return;
  const s = fitSplineAcad(unpack3(e.fitVerts), knotParam, e.startTangent, e.endTangent);
  if (!s) return;
  e.controlVerts = pack3(s.ctrl);
  e.knots = s.knots;
}
