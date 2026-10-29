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
 * 제도 설정·상태 막대는 두 각도를 도면의 각도 단위(AUNITS·AUPREC)로 보이고 그 단위로 받는다(AutoCAD 도움말의 POLARADDANG:
 * "The AUNITS system variable sets the format for display of angles"). 저장값은 그대로 도다(formatPolarAngle·parseAngleText).
 * 각도의 0 방향과 양의 방향은 도면 단위(ANGBASE·ANGDIR)를 따른다(AutoCAD 도움말 "About Polar Tracking and PolarSnap": 0의 방향은
 * 도면 단위 대화상자에서 정한 각도를, 스냅 방향(시계·반시계)은 도면 단위에서 정한 방향을 따른다).
 * 증분 각도의 배수와 추가 각도는 모두 그 0 방향에서 ANGDIR 쪽으로 잰다(AngleConvention). 추적 툴팁의 각도도 그렇게 재서
 * AUNITS·AUPREC로 보인다(trackAngleText — 도움말 "Drawing Units Dialog Box": 각도 형식·정밀도는 각도를 보이는 형식·자릿수).
 * 화면·DOM을 가져오지 않는다(시험이 가볍게 쓴다).
 */
import { formatAngle, parseAngle } from '../core/units';
import { angtof, angtos } from '../edit/lisp/text';
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

/** 0 ≤ d < 360(이미 그 안이면 그대로 — 나머지 셈의 끝자리 오차를 붙이지 않는다) */
export function normDeg(d: number): number {
  if (d >= 0 && d < 360 - 1e-9) return d;
  const r = ((d % 360) + 360) % 360;
  return Math.abs(r - 360) < 1e-9 ? 0 : r;
}

// ---------------------------------------------------------------------------
// 각도 단위(AUNITS·AUPREC)로 보이기·받기
// ---------------------------------------------------------------------------

/** 도면의 각도 단위: AUNITS(0 십진 도, 1 도/분/초, 2 그라드, 3 라디안, 4 측량 단위)와 AUPREC(정밀도 0~8) */
export interface AngleUnits {
  aunits: number;
  auprec: number;
}

/** 도면이 없을 때와 명령행·SETVAR의 값(저장값 그대로 — 십진 도) */
export const DEGREE_UNITS: AngleUnits = { aunits: 0, auprec: 0 };

/**
 * 도면의 각도 0 방향과 양의 방향(UNITS 대화상자의 방향·시계 방향): ANGBASE(라디안, 지금 UCS의 X축에서 시계 반대 방향으로 잰 0 방향),
 * ANGDIR(1이면 시계 방향이 양). 없으면 0·0(UCS X축에서 시계 반대 방향 — 이전 판과 같다)
 */
export interface AngleConvention {
  angbase?: number;
  angdir?: number;
}

/** ANGDIR 1(시계 방향이 양)인지 */
export function clockwise(c: AngleConvention): boolean {
  return c.angdir === 1;
}

/** ANGBASE(라디안, 맞지 않으면 0) */
export function angleBase(c: AngleConvention): number {
  return typeof c.angbase === 'number' && Number.isFinite(c.angbase) ? c.angbase : 0;
}

/** 도면 각도(0 방향에서 ANGDIR 쪽으로 잰 라디안) → UCS X축에서 시계 반대 방향으로 잰 라디안 */
export function fromDrawingAngle(a: number, c: AngleConvention): number {
  return angleBase(c) + (clockwise(c) ? -a : a);
}

/** UCS X축에서 시계 반대 방향으로 잰 라디안 → 도면 각도(0 방향에서 ANGDIR 쪽으로, 0 ≤ θ < 2π) */
export function toDrawingAngle(a: number, c: AngleConvention): number {
  const d = a - angleBase(c);
  return norm(clockwise(c) ? -d : d);
}

const RAD = Math.PI / 180;
/** 같은 각도로 볼 차이(도). 저장하는 글(formatDeg)이 소수 여섯째 자리까지다 */
const SAME_DEG = 1e-6;

/** 맞지 않는 AUNITS·AUPREC은 십진 도·0~8로 */
function unitsOf(u: AngleUnits): AngleUnits {
  return { aunits: Number.isInteger(u.aunits) && u.aunits >= 0 && u.aunits <= 4 ? u.aunits : 0, auprec: Math.max(0, Math.min(8, Math.round(u.auprec) || 0)) };
}

/** 측량 방위(N 80d E)나 방위 글자 하나(N·S·E·W) */
const BEARING = /^([NS]\s*.*?\s*[EW]|[NSEW])$/i;

/** 두 방향(도)의 차이(0~180) */
function dirDiff(a: number, b: number): number {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return Math.min(d, 360 - d);
}

/**
 * 각도 글 → 도(0~360으로 바꾸지 않는다). 단위 표시가 있으면 그 단위(45d30'15", 45°, 50g, 0.7854r), 없으면 aunits의 단위
 * (0·1·4 도, 2 그라드, 3 라디안 — AutoLISP angtof와 같다). direction이면 측량 방위(N 80d E·N·S·E·W)도 읽는다.
 * 방위는 절대 방향이라 도면의 0 방향·양의 방향(conv — ANGBASE·ANGDIR)에서 잰 각도로 바꾼다(없으면 동쪽에서 시계 반대 방향).
 * 앱의 각도 해석(core/units parseAngle, AutoLISP angtof)을 그대로 쓴다. 지수(1e2)와 못 읽는 글은 null
 */
export function parseAngleText(text: string, aunits: number, direction = false, conv: AngleConvention = {}): number | null {
  const t = text.trim();
  if (!t) return null;
  let r: number | null;
  if (direction && BEARING.test(t)) {
    r = angtof(t, 4);
    if (r !== null && Number.isFinite(r) && (angleBase(conv) || clockwise(conv))) r = toDrawingAngle(r, conv);
  } else if (/^[-+]?(\d+\.?\d*|\.\d+)e/i.test(t)) return null;
  else r = parseAngle(t, aunits === 1 || aunits === 4 ? 0 : aunits);
  if (r === null || !Number.isFinite(r)) return null;
  return Math.round((r / RAD) * 1e9) / 1e9;
}

/**
 * 극좌표 각도(도)를 도면 각도 단위의 글로(앱의 각도 표시 — AutoLISP angtos·core/units formatAngle과 같은 꼴, 십진 도는 ° 없이 "22.5").
 * direction이면 방향(추가 각도 — 측량 단위면 방위 "N 80d E": 도면의 0 방향·양의 방향(units의 ANGBASE·ANGDIR)에서 잰 각도를 절대 방향으로
 * 바꿔 보인다), 아니면 크기(증분 각도 — 측량 단위면 도/분/초).
 * AUPREC 자릿수로 값이 달라 보이면(22.5를 정밀도 0으로 "23") 같은 값으로 다시 읽힐 때까지 자릿수를 늘린다(maxPrec자리까지 — 기본 8).
 * 저장값은 반올림하지 않는다(AutoCAD는 AUPREC으로 반올림한다고 도움말에 적혀 있다 — README)
 */
export function formatPolarAngle(deg: number, units: AngleUnits & AngleConvention = DEGREE_UNITS, direction = false, maxPrec = 8): string {
  const u = unitsOf(units);
  const mode = u.aunits === 4 && !direction ? 1 : u.aunits;
  const v = Math.abs(deg) < 5e-10 ? 0 : deg;
  const bearing = direction && mode === 4;
  const once = (p: number) =>
    mode === 0 ? v.toFixed(p) : bearing ? angtos(fromDrawingAngle(v * RAD, units), 4, p, 0) : direction ? angtos(v * RAD, mode, p, 0) : formatAngle(v * RAD, { aunits: mode, auprec: p });
  const last = Math.max(u.auprec, Math.min(8, maxPrec));
  for (let p = u.auprec; ; p++) {
    const s = once(p);
    if (p >= last) return s;
    const back = parseAngleText(s, mode, direction, units);
    if (back !== null && (direction ? dirDiff(back, v) : Math.abs(back - v)) < SAME_DEG) return s;
  }
}

/** 추적 툴팁 각도의 자릿수 한도(AUPREC보다 크면 AUPREC까지). 아무 방향(UCS를 돌린 도면의 직교 정렬선)이 8자리로 길어지지 않게 */
const TIP_PREC = 4;

/**
 * 극좌표·객체 스냅 추적 툴팁의 각도 글: 0 방향(절대면 ANGBASE, 상대 극좌표면 마지막 선분)에서 ANGDIR 쪽으로 잰 각도 a(라디안)를
 * 도면 각도 단위(AUNITS·AUPREC)로. 십진 도는 °를 붙인다(이전 판의 툴팁과 같은 꼴). 측량 단위는 절대 방향이면 그 방향의 방위(N 45d E),
 * 상대 극좌표면 크기(도/분/초). AUPREC로 값이 달라 보이면(22.5를 정밀도 0으로) 다시 읽힐 때까지 TIP_PREC자리까지 늘린다
 */
export function trackAngleText(a: number, units: AngleUnits & AngleConvention = DEGREE_UNITS, relative = false): string {
  const deg = normDeg(Math.round((norm(a) / RAD) * 1e9) / 1e9);
  const u = unitsOf(units);
  if (u.aunits === 4 && !relative) return formatPolarAngle(deg, units, true, TIP_PREC);
  const s = formatPolarAngle(deg, units, false, TIP_PREC);
  return u.aunits === 0 ? `${s}°` : s;
}

/**
 * 증분 각도 글 → 도. units: 단위 표시 없는 수의 단위(명령행·SETVAR는 저장값 그대로 도, 제도 설정은 도면의 AUNITS).
 * 단위 표시(22d30'·25g·0.3927r)는 어디서나 받는다. 못 읽거나 0.1~360도 밖이면 문구(경계는 그 단위로)
 */
export function parsePolarAng(text: string, units: AngleUnits = DEGREE_UNITS): number | string {
  const v = parseAngleText(text, unitsOf(units).aunits);
  if (v === null || !(v >= POLARANG_MIN - 1e-9 && v <= POLARANG_MAX + 1e-9))
    return `증분 각도는 ${formatPolarAngle(POLARANG_MIN, units)}과(와) ${formatPolarAngle(POLARANG_MAX, units)} 사이의 각도여야 합니다.`;
  return Math.min(POLARANG_MAX, Math.max(POLARANG_MIN, v));
}

/** 추가 각도 하나(도, 0 ≤ θ < 360 — 저장하는 글처럼 소수 여섯째 자리까지) */
function addDeg(raw: number): number {
  const r = Math.round(normDeg(raw) * 1e6) / 1e6;
  return r >= 360 ? 0 : r;
}

/**
 * POLARADDANG 글 → 추가 각도 목록(도, 0 ≤ θ < 360, 같은 각도는 한 번). 빈 글과 "."(AutoCAD 문자열 변수의 "없음")은 빈 목록.
 * 항목은 parseAngleText(units — 명령행·SETVAR는 도)로 읽는다. 못 읽는 항목이 있거나 10개가 넘으면 문구
 */
export function parsePolarAddAng(text: string, units: AngleUnits & AngleConvention = DEGREE_UNITS): number[] | string {
  const t = text.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!t || t === '.') return [];
  const out: number[] = [];
  for (const raw of t.split(';')) {
    const p = raw.trim();
    if (!p) continue;
    const d = parseAngleText(p, unitsOf(units).aunits, true, units);
    if (d === null) return `추가 각도 "${p}"을(를) 각도로 읽을 수 없습니다. 각도를 ;로 나눠 입력하십시오.`;
    const v = addDeg(d);
    if (!out.some((x) => Math.abs(x - v) < 1e-9)) out.push(v);
  }
  if (out.length > POLARADDANG_MAX) return `추가 각도는 ${POLARADDANG_MAX}개까지입니다.`;
  return out;
}

/** 제도 설정 추가 각도 목록의 새로 만들기 결과: 넣었으면 새 목록·고를 칸·알림(0~360 밖이라 같은 방향으로 바꿨을 때), 아니면 문구 */
export type PolarAddResult = { list: number[]; index: number; note: string | null } | { error: string };

/**
 * 추가 각도 목록에 하나 넣기(AutoCAD 제도 설정의 [새로 만들기] — 도움말: 10개까지). 글은 도면 각도 단위로 읽는다(parseAngleText).
 * 10개가 찼거나, 못 읽거나, 같은 방향이 이미 있으면 문구. 0~360 밖(-10, 400)은 같은 방향(350, 40)으로 넣고 알린다
 */
export function addPolarAngle(list: readonly number[], text: string, units: AngleUnits & AngleConvention = DEGREE_UNITS): PolarAddResult {
  if (list.length >= POLARADDANG_MAX) return { error: `추가 각도는 ${POLARADDANG_MAX}개까지입니다.` };
  const t = text.trim();
  const raw = parseAngleText(t, unitsOf(units).aunits, true, units);
  if (raw === null) return { error: `"${t}"을(를) 각도로 읽을 수 없습니다.` };
  const v = addDeg(raw);
  const shown = formatPolarAngle(v, units, true);
  if (list.some((x) => dirDiff(x, v) < SAME_DEG)) return { error: `추가 각도 ${shown}은(는) 이미 목록에 있습니다.` };
  const note = raw < 0 || raw >= 360 ? `${t}을(를) 같은 방향인 ${shown}(으)로 넣었습니다(추가 각도는 0 이상 360 미만).` : null;
  return { list: [...list, v], index: list.length, note };
}

/** 추가 각도 목록에서 index 칸 지우기(AutoCAD [삭제]): 남은 목록과 다음에 고를 칸(같은 자리, 끝이었으면 앞 칸, 비면 -1) */
export function removePolarAngle(list: readonly number[], index: number): { list: number[]; index: number } {
  if (!(index >= 0 && index < list.length)) return { list: [...list], index: list.length ? 0 : -1 };
  const out = list.filter((_, i) => i !== index);
  return { list: out, index: out.length ? Math.min(index, out.length - 1) : -1 };
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

/**
 * 극좌표 추적 방향(라디안, 0 ≤ θ < 2π): 증분 각도의 배수와 POLARMODE 4면 추가 각도, 모두 ref(0도 방향)에서 잰다.
 * cw(ANGDIR 1)면 시계 방향으로 잰다 — 360을 나누지 않는 증분(50도)과 추가 각도는 반시계와 다른 방향이 된다
 */
export function polarDirections(s: PolarSettings, ref: number, cw = false): number[] {
  const rad = Math.PI / 180;
  const inc = Math.min(POLARANG_MAX, Math.max(POLARANG_MIN, s.inc)) * rad;
  return polarAngles(inc, s.mode & PM_ADD_ANGLES ? s.add.map((a) => a * rad) : []).map((a) => norm(cw ? ref - a : ref + a));
}

/**
 * 극좌표 각도의 0도 방향(라디안): POLARMODE 1이고 마지막으로 그린 선분이 있으면 그 진행 방향(상대),
 * 아니면 지금 UCS의 X축에서 ANGBASE만큼 돈 방향(절대 — 도면 단위의 0 방향). 그린 선분이 없으면 상대로 정해 두어도 절대로 잰다
 */
export function polarReference(mode: number, ucsAngle: number, lastSegment: number | null, angbase = 0): { ref: number; relative: boolean } {
  if (mode & PM_RELATIVE && lastSegment !== null && Number.isFinite(lastSegment)) return { ref: lastSegment, relative: true };
  return { ref: ucsAngle + (Number.isFinite(angbase) ? angbase : 0), relative: false };
}

/**
 * 객체 스냅 추적에서 획득점이 내는 정렬선 방향(라디안): POLARMODE 2이고 극좌표 각도를 쓸 수 있으면(극좌표 추적이 켜져 있고
 * 직교가 아닐 때) 극좌표 추적 설정의 각도(절대 극좌표처럼 도면 단위의 0 방향·양의 방향 — conv), 아니면 수평·수직(UCS 축 —
 * 제도 설정 "직교로만 추적"). 획득점은 그린 선분과 상관없다
 */
export function otrackDirections(s: PolarSettings, polarActive: boolean, ucsAngle: number, conv: AngleConvention = {}): number[] {
  if (polarActive && s.mode & PM_OTRACK_POLAR) return polarDirections(s, ucsAngle + angleBase(conv), clockwise(conv));
  return polarAngles(Math.PI / 2).map((a) => norm(a + ucsAngle));
}
