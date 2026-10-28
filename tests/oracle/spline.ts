/**
 * 맞춤점만 적힌 기준 DXF와 우리 리더 사이의 스플라인 형식 차이(요약 비교용 — 훑기 ezdxf 대조와 로컬 DWG 대조 시험이 같이 쓴다).
 *
 * AutoCAD는 DWG의 맞춤점 자료를 DXF로 쓸 때 그 자료로 구한 조정점·매듭을 함께 적는다(3차 보간: 조정점 = 맞춤점 + 2, 매듭 = 맞춤점 + 6).
 * 우리 DWG 리더도 같은 값을 채운다(src/io/dwg/splineflags.ts fillFitControl — 표본 sample_AC1027·AC1032의 같은 도면을 AutoCAD가 쓴 DXF와
 * 조정점·매듭이 같다, tests/dwg/spline-fit.test.ts). AutoCAD가 쓰지 않은 기준 DXF(DWG 기준 도구가 바꾼 DXF, 다른 도구가 쓴 DXF)에는
 * 맞춤점만 있어 조정점·매듭 수가 0이다.
 */

const num = (v: unknown): number => (typeof v === 'number' ? v : -1);

/**
 * 기준(exp)이 맞춤점만 적힌 스플라인이고 우리 쪽(act)이 같은 맞춤점에서 AutoCAD가 적을 조정점·매듭 수를 가졌는지.
 * 참이면 두 수는 형식 차이라 견주지 않아도 된다. 맞춤점 수가 다르거나 우리 쪽 수가 AutoCAD 규칙과 다르면 거짓(그대로 견준다).
 * 우리 쪽이 조정점을 채우지 않았으면(닫힌 곡선·근사 공차 등) 두 수가 모두 0이라 그대로 견주어도 같다.
 */
export function fitOnlySplineGap(exp: Record<string, unknown>, act: Record<string, unknown>): boolean {
  if (exp.type !== 'SPLINE' || num(exp.controlPoints) !== 0) return false;
  const n = num(exp.fitPoints);
  return n >= 2 && num(act.fitPoints) === n && num(act.controlPoints) === n + 2 && num(act.knots) === n + 6;
}
