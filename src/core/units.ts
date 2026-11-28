/**
 * 도면 단위·숫자 표시(LUNITS·LUPREC·AUNITS·AUPREC·INSUNITS).
 * 화면 언어와 상관없이 「.」 소수점·천 단위 묶음 없음 — 명령행이 다시 읽는 꼴(parseLength·「x,y」 점 — 쉼표는 좌표 가름)과 같아야 하고
 * AutoCAD도 도면 값을 언어마다 바꾸지 않는다. 화면 글의 셈 수(객체·항목·선택 수·바이트)도 묶음 없는 꼴 하나(344차 — 브라우저 지역 꼴
 * toLocaleString()은 독일어 브라우저에서 「1.234」로 CAD 값 소수점과 같은 글자가 된다).
 */
import type { CadDocument } from './model';

export const INSUNITS_NAMES: Record<number, { name: string; abbr: string; mm?: number }> = {
  0: { name: '단위 없음', abbr: '' },
  1: { name: '인치', abbr: 'in', mm: 25.4 },
  2: { name: '피트', abbr: 'ft', mm: 304.8 },
  3: { name: '마일', abbr: 'mi', mm: 1609344 },
  4: { name: '밀리미터', abbr: 'mm', mm: 1 },
  5: { name: '센티미터', abbr: 'cm', mm: 10 },
  6: { name: '미터', abbr: 'm', mm: 1000 },
  7: { name: '킬로미터', abbr: 'km', mm: 1e6 },
  8: { name: '마이크로인치', abbr: 'µin', mm: 25.4e-6 },
  9: { name: '밀', abbr: 'mil', mm: 0.0254 },
  10: { name: '야드', abbr: 'yd', mm: 914.4 },
  11: { name: '옹스트롬', abbr: 'Å', mm: 1e-7 },
  12: { name: '나노미터', abbr: 'nm', mm: 1e-6 },
  13: { name: '마이크로미터', abbr: 'µm', mm: 1e-3 },
  14: { name: '데시미터', abbr: 'dm', mm: 100 },
  15: { name: '데카미터', abbr: 'dam', mm: 1e4 },
  16: { name: '헥토미터', abbr: 'hm', mm: 1e5 },
  17: { name: '기가미터', abbr: 'Gm', mm: 1e12 },
  18: { name: '천문단위', abbr: 'AU' },
  19: { name: '광년', abbr: 'ly' },
  20: { name: '파섹', abbr: 'pc' },
  21: { name: '미국 측량 피트', abbr: 'ft', mm: 304.8006096 },
};

export interface UnitSettings {
  lunits: number;
  luprec: number;
  aunits: number;
  auprec: number;
  insunits: number;
  /** 각도 0의 방향(라디안) */
  angbase: number;
  /** 1이면 시계 방향 */
  angdir: number;
  measurement: number;
}

export function unitSettings(doc: CadDocument): UnitSettings {
  const n = (k: string, d: number) => {
    const v = doc.header.get(k);
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  };
  return {
    lunits: n('$LUNITS', 2),
    luprec: Math.max(0, Math.min(8, n('$LUPREC', 4))),
    aunits: n('$AUNITS', 0),
    auprec: Math.max(0, Math.min(8, n('$AUPREC', 0))),
    insunits: n('$INSUNITS', 0),
    angbase: n('$ANGBASE', 0),
    angdir: n('$ANGDIR', 0),
    measurement: n('$MEASUREMENT', 1),
  };
}

function trimZeros(s: string): string {
  return s;
}

function fraction(v: number, prec: number): string {
  // 분모 2^prec
  const den = 1 << Math.max(0, Math.min(8, prec));
  const neg = v < 0;
  let a = Math.abs(v);
  let whole = Math.floor(a);
  let num = Math.round((a - whole) * den);
  if (num === den) {
    whole++;
    num = 0;
  }
  let d = den;
  while (num && num % 2 === 0 && d % 2 === 0) {
    num /= 2;
    d /= 2;
  }
  a = whole;
  const s = num ? (whole ? `${whole} ${num}/${d}` : `${num}/${d}`) : `${whole}`;
  return neg ? '-' + s : s;
}

/** 길이 표시 */
export function formatLength(v: number, u: Pick<UnitSettings, 'lunits' | 'luprec'>, prec = u.luprec): string {
  if (!Number.isFinite(v)) return '-';
  switch (u.lunits) {
    case 1: {
      // 과학: 지수는 부호와 두 자리 이상(AutoCAD -UNITS 예 1.55E+01 — AutoLISP rtos 1·치수 DIMLUNIT 1·필드 %lu1과 같은 꼴)
      const e = v.toExponential(prec);
      const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(e);
      return m ? `${m[1]}E${m[2]}${m[3]!.padStart(2, '0')}` : e.toUpperCase();
    }
    case 3: {
      // 공학: 피트-인치(소수)
      const neg = v < 0;
      const a = Math.abs(v);
      const ft = Math.floor(a / 12);
      const inch = a - ft * 12;
      const s = `${ft}'-${inch.toFixed(prec)}"`;
      return neg ? '-' + s : s;
    }
    case 4: {
      const neg = v < 0;
      const a = Math.abs(v);
      let ft = Math.floor(a / 12);
      let inchStr = fraction(a - ft * 12, prec);
      if (inchStr.startsWith('12')) {
        ft++;
        inchStr = '0';
      }
      const s = `${ft}'-${inchStr}"`;
      return neg ? '-' + s : s;
    }
    case 5:
      return fraction(v, prec);
    default:
      return trimZeros(v.toFixed(prec));
  }
}

const RAD = 180 / Math.PI;
const TAU = Math.PI * 2;

/** 각도 표시(라디안 입력, 도면의 각도 0 방향·방향은 적용하지 않은 순수 각도) */
export function formatAngle(a: number, u: Pick<UnitSettings, 'aunits' | 'auprec'>, prec = u.auprec): string {
  if (!Number.isFinite(a)) return '-';
  switch (u.aunits) {
    case 1: {
      let deg = Math.abs(a * RAD);
      const neg = a < 0;
      let d = Math.floor(deg);
      deg = (deg - d) * 60;
      let m = Math.floor(deg);
      let s = (deg - m) * 60;
      if (prec <= 0) return `${neg ? '-' : ''}${Math.round(a * RAD)}d`;
      if (prec <= 2) {
        m = Math.round(deg);
        if (m === 60) {
          d++;
          m = 0;
        }
        return `${neg ? '-' : ''}${d}d${m}'`;
      }
      const sp = Math.max(0, prec - 4);
      s = Number(s.toFixed(sp));
      if (s >= 60) {
        s = 0;
        m++;
      }
      if (m >= 60) {
        m = 0;
        d++;
      }
      return `${neg ? '-' : ''}${d}d${m}'${s.toFixed(sp)}"`;
    }
    case 2:
      return `${((a * 200) / Math.PI).toFixed(prec)}g`;
    case 3:
      return `${a.toFixed(prec)}r`;
    case 4: {
      // 측량 단위(UNITS 도움말): N·S에서 E·W 쪽으로 잰 90도 아래 각을 도/분/초로(N 45d0'0" E — 자릿수는 위 AUNITS 1과 같다),
      // 정확한 동서남북이면 그 글자 하나. a는 동쪽에서 시계 반대 방향(음수·2π 넘는 각은 0 ≤ θ < 2π로 — AutoLISP angtos와 같다)
      let r = a % TAU;
      if (r < 0) r += TAU;
      if (Math.abs(r - TAU) < 1e-12) r = 0;
      const deg = (r * 180) / Math.PI;
      if (Math.abs(deg) < 1e-9 || Math.abs(deg - 180) < 1e-9) return deg < 90 ? 'E' : 'W';
      if (Math.abs(deg - 90) < 1e-9) return 'N';
      if (Math.abs(deg - 270) < 1e-9) return 'S';
      const b = deg <= 90 ? 90 - deg : deg <= 180 ? deg - 90 : deg <= 270 ? 270 - deg : deg - 270;
      const ns = deg > 180 && deg < 360 ? 'S' : 'N';
      const ew = deg > 90 && deg < 270 ? 'W' : 'E';
      return `${ns} ${formatAngle((b * Math.PI) / 180, { aunits: 1, auprec: prec })} ${ew}`;
    }
    default:
      return `${(a * RAD).toFixed(prec)}°`;
  }
}

/** 면적 표시: 단위의 제곱 */
export function formatArea(v: number, u: Pick<UnitSettings, 'lunits' | 'luprec'>): string {
  if (u.lunits === 4 || u.lunits === 3) {
    // 제곱인치와 제곱피트
    const sqft = v / 144;
    return `${v.toFixed(u.luprec)} 제곱 in (${sqft.toFixed(4)} 제곱 ft)`;
  }
  return formatLength(v, { lunits: u.lunits === 5 ? 2 : u.lunits, luprec: u.luprec });
}

export function unitAbbr(insunits: number): string {
  return INSUNITS_NAMES[insunits]?.abbr ?? '';
}

export function unitName(insunits: number): string {
  return INSUNITS_NAMES[insunits]?.name ?? `코드 ${insunits}`;
}

/**
 * 길이 입력 읽기: 소수(12.5, 1.25E+01), 분수(12 1/2), 피트-인치(1'-2.5", 1'2-1/2", 3', 4").
 * 읽지 못하면 null.
 */
export function parseLength(s: string): number | null {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return Number(t);
  const frac = (x: string): number | null => {
    const m = /^(\d+(?:\.\d+)?)?(?:[ -]?(\d+)\/(\d+))?$/.exec(x.trim());
    if (!m || (!m[1] && !m[2])) return null;
    const whole = m[1] ? Number(m[1]) : 0;
    const f = m[2] ? Number(m[2]) / Number(m[3]) : 0;
    return Number.isFinite(f) ? whole + f : null;
  };
  let neg = false;
  let body = t;
  if (body.startsWith('-')) {
    neg = true;
    body = body.slice(1).trim();
  }
  const ft = /^(\d+(?:\.\d+)?)'\s*-?\s*(.*?)"?$/.exec(body);
  if (ft) {
    const feet = Number(ft[1]);
    const inch = ft[2] ? frac(ft[2]) : 0;
    if (inch === null) return null;
    const v = feet * 12 + inch;
    return neg ? -v : v;
  }
  const inch = /^(.*?)"$/.exec(body);
  const v = frac(inch ? inch[1]! : body);
  if (v === null) return null;
  return neg ? -v : v;
}

/**
 * 각도 입력 읽기(라디안으로). 단위 표시가 없으면 aunits를 따른다(0·1·4 도, 2 그라드, 3 라디안).
 * 45, 45d30'15", 45°, 50g, 0.7854r 형식.
 */
export function parseAngle(s: string, aunits = 0): number | null {
  const t = s.trim().replace(/\s+/g, '');
  if (!t) return null;
  const DEG = Math.PI / 180;
  let m = /^([-+]?\d*\.?\d+)(g|r)$/i.exec(t);
  if (m) return m[2]!.toLowerCase() === 'g' ? (Number(m[1]) * Math.PI) / 200 : Number(m[1]);
  m = /^([-+])?(\d*\.?\d+)(?:d|°)(?:(\d*\.?\d+)')?(?:(\d*\.?\d+)")?$/i.exec(t);
  if (m) {
    const v = Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0) + (m[4] ? Number(m[4]) / 3600 : 0);
    return (m[1] === '-' ? -v : v) * DEG;
  }
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) {
    const v = Number(t);
    if (aunits === 2) return (v * Math.PI) / 200;
    if (aunits === 3) return v;
    return v * DEG;
  }
  return null;
}

/**
 * 단위 글자를 붙인 각 읽기(라디안 — 224차): 도/분/초 `45d30'15"`·`45°`, 그라드 `50g`, 라디안 `0.7854r`(parseAngle — 그 글자의 단위, 도면 AUNITS와 상관없이).
 * 수만 쓴 글(`45`·`1E+01`)·방위·못 읽는 글은 null — 수는 프롬프트마다 읽는 법이 따로라 이 함수가 읽지 않는다.
 * Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와 상관없이 다른 꼴로도 넣는다. 방향 글자가 없는 수 각도라 0 방향·방향은 수와 같게 쓴다
 */
export function parseUnitAngle(s: string): number | null {
  const t = s.trim().replace(/\s+/g, '');
  return /[d°gr]/i.test(t) ? parseAngle(t, 0) : null;
}

/**
 * 각도 프롬프트의 글을 도로 읽기(225차): 단위 글자 꼴(`45d30'`·`50g`·`0.7854r` — parseUnitAngle)은 그 단위의 각을 도로 바꾸고,
 * 그 밖은 parseFloat(수만 쓴 각은 전처럼 그 수의 도, 못 읽는 꼴 `45d30`·`1e1d`는 전처럼 앞 수). 수가 없으면 null.
 * parseFloat로 각을 읽던 프롬프트(TEXT 회전·ARC 사이각·ROTATE·LENGTHEN 등)는 단위 글자를 버리고 앞 수만 도로 읽어 `50g`를 50도로 썼다.
 * 0 방향·방향(ANGBASE·ANGDIR·UCS)은 부르는 쪽이 수 각도에 하던 그대로 더한다
 */
export function parseAngleDegrees(s: string): number | null {
  const u = parseUnitAngle(s);
  if (u !== null) return (u * 180) / Math.PI;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

/** 단위 글자 꼴 각(parseUnitAngle)을 도로, 못 읽으면 null(226차 — CAL 식이 못 읽은 각도 값에도 쓴다) */
export function unitAngleDegrees(s: string): number | null {
  const u = parseUnitAngle(s);
  return u === null ? null : (u * 180) / Math.PI;
}

/**
 * Number로 각(도)을 읽던 프롬프트의 글 읽기(226차): Number가 읽는 글은 그 값 그대로(전과 같은 Number — `45`·`1e1`·`0x1d`·빈 글 0·`Infinity`),
 * Number가 못 읽은(NaN) 글이 단위 글자 꼴(`45d30'`·`50g`·`0.7854r` — unitAngleDegrees)이면 그 각을 도로, 그 밖은 전처럼 NaN이라 부르는 곳이 하던
 * 앞 값·0·오류 그대로다. parseFloat 대체가 아니다(`45x`는 전처럼 NaN — parseFloat면 45가 되어 앞 값을 쓰던 결과가 바뀐다).
 * 전에는 -HATCHEDIT·CHANGE·MINSERT·옛 LEADER·DIMLINEAR 회전(R)·UCS Z·MOCORO가 단위 글자 꼴에 조용히 앞 값·0을 썼다. 0 방향·방향은 부르는 쪽이 수에 하던 그대로
 */
export function numberAngleDegrees(s: string): number {
  const v = Number(s);
  return Number.isNaN(v) ? (unitAngleDegrees(s) ?? v) : v;
}

/**
 * 측량 방위 읽기(라디안 — 동쪽에서 시계 반대 방향, 0 ≤ θ < 2π). formatAngle AUNITS 4의 거꾸로이고 AutoLISP angtof 4의 방위 규칙이다(223차에 angtof에서 옮김).
 * N·S + 북·남에서 E·W 쪽으로 잰 각(parseAngle의 도 — 비면 0) + E·W: `N 45d0'0" E`, 빈칸 없이 `N45d0'0"E`, 도움말 예 `n45d20'6"e`.
 * 정방위는 글자 하나(N·S·E·W). 빈칸·대소문자는 가리지 않고 도면의 0 방향·방향(ANGBASE·ANGDIR)은 쓰지 않는다.
 * 방위 꼴이 아니거나 각을 읽지 못하면 null — 그런 글은 parseAngle도 읽지 못해 방위를 받는 칸은 `parseBearing(t) ?? parseAngle(t)`
 */
export function parseBearing(s: string): number | null {
  const t = s.trim().replace(/\s+/g, '');
  const sv = /^([NS])(.*?)([EW])$/i.exec(t);
  let r: number;
  if (sv) {
    const b = sv[2] ? parseAngle(sv[2], 0) : 0;
    if (b === null) return null;
    const n = sv[1]!.toUpperCase() === 'N';
    const e = sv[3]!.toUpperCase() === 'E';
    const deg90 = Math.PI / 2;
    r = n ? (e ? deg90 - b : deg90 + b) : e ? 3 * deg90 + b : 3 * deg90 - b;
  } else if (/^[NSEW]$/i.test(t)) r = { N: Math.PI / 2, S: (3 * Math.PI) / 2, E: 0, W: Math.PI }[t.toUpperCase() as 'N']!;
  else return null;
  if (!Number.isFinite(r)) return null;
  r %= TAU;
  return r < 0 ? r + TAU : r;
}
