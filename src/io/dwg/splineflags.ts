/**
 * SPLINE의 DXF 70 ↔ DWG R2013+ 값(첫 값·플래그·매듭 매개변수). AutoCAD가 같은 도면을 DWG와 DXF로 쓴 실물 짝으로 확인했다.
 *
 * - DWG R2013+: 첫 값(1·2), 플래그(1 맞춤점 방식, 4 닫힘, 8은 맞춤점 방식과 늘 같이), 매듭 매개변수(0 현 길이, 1 제곱근, 2 균일, 15 사용자 지정).
 *   맞춤점 방식이면 맞춤점 자료만, 매듭 매개변수 15면 조정점 자료만 담는다.
 * - DXF 70: 1 닫힘, 2 주기, 4 유리, 8 평면, 16 직선. 첫 값이 1인 맞춤점 스플라인은 1024와 매듭 매개변수 비트(32 현 길이·64 제곱근·128 균일)를
 *   함께 쓴다(예: 1064·1160). 첫 값이 2인 맞춤점 스플라인과 조정점 스플라인에는 이 비트가 없고, 닫힘은 1이다.
 */

/** DXF 70: 맞춤점 방식(DWG 첫 값 1) */
export const SPLINE_FIT_METHOD = 1024;

const KNOT_PARAM_BITS: Record<number, number> = { 0: 32, 1: 64, 2: 128 };

/** DWG R2013+ 맞춤점 스플라인(첫 값 1)의 DXF 70 비트 */
export function splineFitBits(knotParam: number): number {
  return SPLINE_FIT_METHOD | (KNOT_PARAM_BITS[knotParam] ?? 0);
}

/** DXF 70 → DWG R2013+ 매듭 매개변수(비트가 없으면 AutoCAD 기본 현 길이 0) */
export function splineKnotParam(flags: number): number {
  return flags & 128 ? 2 : flags & 64 ? 1 : 0;
}
