/**
 * 극좌표 추적 설정을 추적 방향으로 바꾸는 순수 계산. 값은 AutoCAD 도움말의 레지스트리 변수(이 앱은 이 브라우저 — sysvars.ts)다.
 *  - POLARANG: 증분 각도(도, 초기값 90). 그 배수 방향을 모두 쓴다
 *  - POLARADDANG: 추가 각도 목록(도, ;로 구분, 10개까지, 초기값 ""). 배수를 만들지 않는다(그 각도만)
 *  - POLARMODE 비트(초기값 0)
 *     1  극좌표 각도를 마지막으로 그린 선분에서 잰다(상대). 0이면 지금 UCS에서 잰다(절대)
 *     2  객체 스냅 추적에 극좌표 추적 설정(증분·추가 각도)을 쓴다. 0이면 직교(수평·수직)로만 추적
 *     4  추가 각도(POLARADDANG)를 쓴다
 *     8  객체 스냅 추적점을 Shift를 누른 채 지나야 얻는다. 0이면 자동(스냅점 위에 잠시 머물면)
 * 극좌표 추적 켜기·끄기는 POLARMODE가 아니라 AUTOSNAP 8(F10)이다(settings.ts polarTrackOn).
 * 화면·DOM을 가져오지 않는다(시험이 가볍게 쓴다).
 */
import { polarAngles } from './tracking';

/** POLARMODE 1: 마지막으로 그린 선분 기준(상대) */
export const PM_RELATIVE = 1;
/** POLARMODE 2: 객체 스냅 추적에 극좌표 각도 */
export const PM_OTRACK_POLAR = 2;
/** POLARMODE 4: 추가 각도(POLARADDANG) */
export const PM_ADD_ANGLES = 4;
/** POLARMODE 8: Shift를 눌러 객체 스냅 추적점 획득 */
export const PM_SHIFT_ACQUIRE = 8;

/** 제도 설정·상태 막대에서 고르는 흔한 증분 각도(AutoCAD 목록과 같다 — 다른 각도도 칠 수 있다) */
export const POLAR_COMMON_ANGLES: readonly number[] = [90, 45, 30, 22.5, 18, 15, 10, 5];
/** 증분 각도의 범위(도). 아주 작은 각도는 방향이 너무 많아져(0.1도면 3600개) 막는다 */
export const POLARANG_MIN = 0.1;
export const POLARANG_MAX = 360;
/** 추가 각도는 10개까지(AutoCAD 도움말) */
export const POLARADDANG_MAX = 10;

/** 화면·입력이 읽는 극좌표 추적 설정 */
export interface PolarSettings {
  /** POLARMODE 비트 */
  mode: number;
  /** 증분 각도, 도(POLARANG) */
  inc: number;
  /** 추가 각도, 도(POLARADDANG) — POLARMODE 4일 때만 쓴다 */
  add: readonly number[];
}

/** 제도 설정·OPTIONS 칸 ↔ POLARMODE 비트 */
export interface PolarModeFields {
  /** 1: 마지막 세그먼트에 상대적 */
  relative: boolean;
  /** 2: 전체 극좌표 각도 설정을 사용하여 추적 */
  otrackPolar: boolean;
  /** 4: 추가 각도 */
  addAngles: boolean;
  /** 8: Shift 키를 눌러 획득 */
  shiftAcquire: boolean;
}

export function polarModeFields(mode: number): PolarModeFields {
  return { relative: (mode & PM_RELATIVE) !== 0, otrackPolar: (mode & PM_OTRACK_POLAR) !== 0, addAngles: (mode & PM_ADD_ANGLES) !== 0, shiftAcquire: (mode & PM_SHIFT_ACQUIRE) !== 0 };
}

/** 준 칸만 바꾼 POLARMODE(주지 않은 칸과 나머지 비트는 그대로 — 제도 설정은 8을, OPTIONS는 1·2·4를 건드리지 않는다) */
export function polarModeBits(old: number, v: Partial<PolarModeFields>): number {
  let out = old;
  const put = (bit: number, on: boolean | undefined) => {
    if (on !== undefined) out = on ? out | bit : out & ~bit;
  };
  put(PM_RELATIVE, v.relative);
  put(PM_OTRACK_POLAR, v.otrackPolar);
  put(PM_ADD_ANGLES, v.addAngles);
  put(PM_SHIFT_ACQUIRE, v.shiftAcquire);
  return out;
}

/** 객체 스냅 추적점을 Shift로만 얻는지(POLARMODE 8) */
export function shiftAcquire(mode: number): boolean {
  return (mode & PM_SHIFT_ACQUIRE) !== 0;
}

/** 각도(도)를 글로: 소수 여섯째 자리까지, 끝의 0 없이(90, 22.5) */
export function formatDeg(d: number): string {
  const r = Math.round(d * 1e6) / 1e6;
  return String(r === 0 ? 0 : r);
}

/** 0 ≤ d < 360 */
export function normDeg(d: number): number {
  const r = ((d % 360) + 360) % 360;
  return Math.abs(r - 360) < 1e-9 ? 0 : r;
}

const NUM = /^[-+]?(\d+(\.\d*)?|\.\d+)$/;

/** 증분 각도 글(도) → 값. 숫자가 아니거나 범위 밖이면 문구 */
export function parsePolarAng(text: string): number | string {
  const t = text.trim();
  const v = Number(t);
  if (!NUM.test(t) || !(v >= POLARANG_MIN && v <= POLARANG_MAX)) return `증분 각도는 ${POLARANG_MIN}과(와) ${POLARANG_MAX} 사이의 수(도)여야 합니다.`;
  return v;
}

/**
 * POLARADDANG 글 → 추가 각도 목록(도, 0 ≤ θ < 360, 같은 각도는 한 번). 빈 글과 "."(AutoCAD 문자열 변수의 "없음")은 빈 목록.
 * 숫자가 아닌 항목이 있거나 10개가 넘으면 문구
 */
export function parsePolarAddAng(text: string): number[] | string {
  const t = text.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!t || t === '.') return [];
  const out: number[] = [];
  for (const raw of t.split(';')) {
    const p = raw.trim();
    if (!p) continue;
    if (!NUM.test(p)) return `추가 각도 "${p}"은(는) 수가 아닙니다. 각도(도)를 ;로 나눠 입력하십시오.`;
    const v = normDeg(Number(p));
    if (!out.some((x) => Math.abs(x - v) < 1e-9)) out.push(v);
  }
  if (out.length > POLARADDANG_MAX) return `추가 각도는 ${POLARADDANG_MAX}개까지입니다.`;
  return out;
}

/** 저장된 POLARADDANG 글 → 목록(없거나 맞지 않으면 빈 목록) */
export function polarAddList(text: string | null): number[] {
  const r = text === null ? [] : parsePolarAddAng(text);
  return typeof r === 'string' ? [] : r;
}

/** 추가 각도 목록 → POLARADDANG 글("10;75") */
export function formatPolarAddAng(list: readonly number[]): string {
  return list.map(formatDeg).join(';');
}

const TAU = 2 * Math.PI;
const norm = (a: number) => {
  const r = ((a % TAU) + TAU) % TAU;
  return Math.abs(r - TAU) < 1e-12 ? 0 : r;
};

/** 극좌표 추적 방향(라디안, 0 ≤ θ < 2π): 증분 각도의 배수와 POLARMODE 4면 추가 각도, 모두 ref(0도 방향)에서 잰다 */
export function polarDirections(s: PolarSettings, ref: number): number[] {
  const rad = Math.PI / 180;
  const inc = Math.min(POLARANG_MAX, Math.max(POLARANG_MIN, s.inc)) * rad;
  return polarAngles(inc, s.mode & PM_ADD_ANGLES ? s.add.map((a) => a * rad) : []).map((a) => norm(a + ref));
}

/**
 * 극좌표 각도의 0도 방향(라디안): POLARMODE 1이고 마지막으로 그린 선분이 있으면 그 진행 방향(상대),
 * 아니면 지금 UCS의 X축(절대). 그린 선분이 없으면 상대로 정해 두어도 절대로 잰다
 */
export function polarReference(mode: number, ucsAngle: number, lastSegment: number | null): { ref: number; relative: boolean } {
  if (mode & PM_RELATIVE && lastSegment !== null && Number.isFinite(lastSegment)) return { ref: lastSegment, relative: true };
  return { ref: ucsAngle, relative: false };
}

/**
 * 객체 스냅 추적에서 획득점이 내는 정렬선 방향(라디안): POLARMODE 2이고 극좌표 각도를 쓸 수 있으면(극좌표 추적이 켜져 있고
 * 직교가 아닐 때) 극좌표 추적 설정의 각도, 아니면 수평·수직. 둘 다 지금 UCS에서 잰다(획득점은 그린 선분과 상관없다)
 */
export function otrackDirections(s: PolarSettings, polarActive: boolean, ucsAngle: number): number[] {
  if (polarActive && s.mode & PM_OTRACK_POLAR) return polarDirections(s, ucsAngle);
  return polarAngles(Math.PI / 2).map((a) => norm(a + ucsAngle));
}
