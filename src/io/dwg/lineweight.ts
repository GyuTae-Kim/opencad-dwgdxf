/** DWG 선가중치 번호 → 1/100 mm(-1 ByLayer, -2 ByBlock, -3 기본값) */
const LW_TABLE = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

export function lineweightFromIndex(i: number): number {
  if (i >= 0 && i < LW_TABLE.length) return LW_TABLE[i];
  if (i === 29) return -1;
  if (i === 30) return -2;
  if (i === 31) return -3;
  return -3;
}

/**
 * 도형 공통 자료의 선가중치 번호 → 1/100 mm. 표에 없는 번호 28은 ByLayer(-1)로 본다(135차).
 * 같은 도면을 AutoCAD가 DWG와 DXF로 쓴 짝(R2013·R2018 두 도면, 도형 31개)에서 DWG 번호가 28인 도형은 모두 DXF에 370이 없다 —
 * AutoCAD DXF는 도형의 ByLayer 선가중치만 370을 빼고 쓴다(실제 DXF 도형 370에 -1·-3이 하나도 없다). 실제 DWG(R2004~R2018)에서
 * 번호 28은 흔하고(742개 중 474개 도면, 대부분 옛 해치 블록 *X의 선) 24~27은 없다. 도면층 표의 번호는 그대로 둔다(근거 없음)
 */
export function entityLineweightFromIndex(i: number): number {
  return i === 28 ? -1 : lineweightFromIndex(i);
}
