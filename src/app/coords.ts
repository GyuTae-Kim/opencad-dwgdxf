/**
 * 상태 막대의 좌표 표시. AutoCAD 도움말 COORDS(우리말 요약, 레지스트리 자리 — 초기값 1):
 * 0 절대 좌표를 점을 지정할 때만 갱신, 1 절대 좌표를 계속 갱신, 2 명령이 점·거리·각도를 물을 때는 상대 극좌표(그 밖에는 절대 좌표),
 * Z는 늘 절대 값. 3(지리 좌표)은 지리 위치가 있는 도면만이라 이 앱은 받지 않는다.
 * "상태 막대의 좌표 표시 바꾸기": 점을 물을 때 좌표 표시를 누르거나 Ctrl+I를 거듭 눌러 표시 방식을 돌린다.
 * 상대 극좌표의 기준은 점 요청의 기준점(고무줄 선이 시작하는 점)이고, 기준점이 없는 요청(첫 점)은 절대 좌표다(도움말에 없어 정한 것).
 */
import type { UnitSettings } from '../core/units';
import { formatAngle, formatLength } from '../core/units';
import type { DocState } from './docstate';
import { browserSysvar } from './sysvars';
import { displayDirection } from './polar';
import { currentUcs, dirToUcs, toUcs } from './ucs';
import { zeroish } from './inquiry';

type Pt = { x: number; y: number };

export type CoordsMode = 0 | 1 | 2;

/** 지금 COORDS(이 브라우저 변수) */
export function coordsMode(): CoordsMode {
  const v = browserSysvar('COORDS');
  return v === 0 || v === 2 ? v : 1;
}

/** 좌표 표시를 누르거나 Ctrl+I: 0 → 1 → 2 → 0 */
export function nextCoordsMode(v: CoordsMode): CoordsMode {
  return ((v + 1) % 3) as CoordsMode;
}

/** 바꾼 뒤 명령행에 알리는 글 */
export const COORDS_NOTE: Record<CoordsMode, string> = {
  0: '<좌표: 점을 지정할 때만>',
  1: '<좌표: 계속 갱신>',
  2: '<좌표: 상대 극좌표>',
};

/** 상대 극좌표 "거리<각도, Z": 지금 UCS에서 잰 평면 거리, 각도는 도면 단위의 0 방향·방향(극좌표 입력 d<a와 같은 기준) */
export function polarText(u: UnitSettings, ucs: ReturnType<typeof currentUcs>, base: Pt, p: Pt, z: number): string {
  const r = dirToUcs(ucs, { x: p.x - base.x, y: p.y - base.y });
  // 돌린 UCS의 계산 끝자리(−1e-15)가 각도를 360°로, 0을 "-0.0000"으로 보이지 않게
  const d = { x: zeroish(r.x), y: zeroish(r.y) };
  const a = displayDirection(Math.atan2(d.y, d.x), u);
  return `${formatLength(Math.hypot(d.x, d.y), u)}<${formatAngle(a, u)}, ${formatLength(zeroish(z), u)}`;
}

/**
 * 상태 막대 좌표 글. base: COORDS 2에서 점을 묻는 요청의 기준점(없으면 절대 좌표).
 * 절대 좌표는 지금 UCS의 X·Y와 Z(이 앱의 UCS는 평면 안의 원점·회전뿐이라 Z는 WCS Z 그대로)
 */
export function coordsText(st: DocState, p: Pt, z: number, base: Pt | null): string {
  const u = st.units;
  const ucs = currentUcs(st);
  if (base) return polarText(u, ucs, base, p, z);
  const pu = toUcs(ucs, p);
  return `${formatLength(zeroish(pu.x), u)}, ${formatLength(zeroish(pu.y), u)}, ${formatLength(zeroish(z), u)}`;
}
