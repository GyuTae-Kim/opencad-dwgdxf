/**
 * 극좌표 추적 설정의 순수 계산(src/app/polar.ts, tracking.ts): POLARMODE 비트(AutoCAD 도움말 — 1 마지막 선분 기준, 2 객체 스냅 추적에
 * 극좌표 각도, 4 추가 각도, 8 Shift로 획득), POLARANG(증분 각도)·POLARADDANG(추가 각도) 글 읽기, 추적 방향과 툴팁 각도,
 * 이 브라우저 변수로 저장(글 변수 POLARADDANG 포함).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  POLARADDANG_MAX,
  addPolarAngle,
  formatDeg,
  formatPolarAngle,
  parseAngleText,
  removePolarAngle,
  formatPolarAddAng,
  normDeg,
  otrackDirections,
  parsePolarAddAng,
  parsePolarAng,
  polarAddList,
  polarDirections,
  polarModeBits,
  polarModeFields,
  polarReference,
  shiftAcquire,
  angleBase,
  clockwise,
  fromDrawingAngle,
  toDrawingAngle,
  trackAngleText,
} from '../../src/app/polar';
import { objectTrack, polarAngles, polarTrack } from '../../src/app/tracking';
import { parsePointInput } from '../../src/app/commandline';
import { DynInput } from '../../src/app/dyninput';
import { WORLD } from '../../src/app/ucs';
import { BROWSER_TEXT_VARS, BROWSER_VARS, browserSysvar, browserSysvarText, isBrowserSysvar, onSysvarChange, setBrowserSysvar, setBrowserSysvarText } from '../../src/app/sysvars';
import { DEFAULT_SETTINGS, readSettings } from '../../src/app/settings';
import { optionValue } from '../../src/app/options';
import { prefSet } from '../../src/app/mgr-ui';

afterEach(() => {
  for (const v of [...BROWSER_VARS, ...BROWSER_TEXT_VARS]) prefSet(`opencad.sysvar.${v.name}`, null);
});

const D = Math.PI / 180;
/** 방향(라디안)을 도로, 정렬해서 */
const degs = (xs: number[]) => xs.map((a) => Math.round((a / D) * 1e6) / 1e6).sort((a, b) => a - b);
const fmt = (v: number) => v.toFixed(2);

describe('POLARMODE 비트 ↔ 칸', () => {
  it('비트마다 칸 하나, 주지 않은 칸과 나머지 비트는 그대로', () => {
    expect(polarModeFields(0)).toEqual({ relative: false, otrackPolar: false, addAngles: false, shiftAcquire: false });
    expect(polarModeFields(15)).toEqual({ relative: true, otrackPolar: true, addAngles: true, shiftAcquire: true });
    expect(polarModeFields(1)).toMatchObject({ relative: true, otrackPolar: false });
    expect(polarModeFields(2)).toMatchObject({ relative: false, otrackPolar: true });
    expect(polarModeFields(4).addAngles).toBe(true);
    expect([shiftAcquire(8), shiftAcquire(7)]).toEqual([true, false]);
    // 제도 설정은 8을, OPTIONS는 1·2·4를 건드리지 않는다
    expect(polarModeBits(8, { relative: true, otrackPolar: true, addAngles: false })).toBe(11);
    expect(polarModeBits(7, { shiftAcquire: true })).toBe(15);
    expect(polarModeBits(15, { shiftAcquire: false })).toBe(7);
    expect(polarModeBits(5, {})).toBe(5);
    for (let v = 0; v < 16; v++) expect(polarModeBits(0, polarModeFields(v))).toBe(v);
  });
});

describe('POLARANG·POLARADDANG 글', () => {
  it('증분 각도는 0.1~360도의 수(목록에 없는 각도도)', () => {
    expect([parsePolarAng('90'), parsePolarAng(' 22.5 '), parsePolarAng('7.5'), parsePolarAng('360')]).toEqual([90, 22.5, 7.5, 360]);
    for (const bad of ['0', '-15', '361', 'abc', '', '1e2', '0.05']) expect(typeof parsePolarAng(bad)).toBe('string');
    expect(parsePolarAng('0')).toBe('증분 각도는 0.1과(와) 360 사이의 각도여야 합니다.');
  });

  it('추가 각도는 ;로 나눈 도, 0~360으로 바꾸고 같은 각도는 한 번, 10개까지, 빈 글·"."은 없음', () => {
    expect(parsePolarAddAng('10;75')).toEqual([10, 75]);
    expect(parsePolarAddAng(' 10 ; 75.50 ;; -15 ; 370 ; 10 ')).toEqual([10, 75.5, 345]);
    expect(parsePolarAddAng('"30"')).toEqual([30]);
    expect([parsePolarAddAng(''), parsePolarAddAng('.'), parsePolarAddAng('  ')]).toEqual([[], [], []]);
    expect(parsePolarAddAng('10,75')).toBe('추가 각도 "10,75"을(를) 각도로 읽을 수 없습니다. 각도를 ;로 나눠 입력하십시오.');
    const eleven = Array.from({ length: POLARADDANG_MAX + 1 }, (_, i) => i * 5).join(';');
    expect(parsePolarAddAng(eleven)).toBe('추가 각도는 10개까지입니다.');
    expect(parsePolarAddAng(eleven.split(';').slice(0, 10).join(';'))).toHaveLength(10);
    expect(formatPolarAddAng([10, 75.5, 345])).toBe('10;75.5;345');
    expect(polarAddList(null)).toEqual([]);
    expect(polarAddList('x;1')).toEqual([]);
    expect(polarAddList('1;2')).toEqual([1, 2]);
    expect([formatDeg(22.5), formatDeg(90), formatDeg(1 / 3), formatDeg(-0)]).toEqual(['22.5', '90', '0.333333', '0']);
    expect([normDeg(-15), normDeg(720), normDeg(359.9999999999)]).toEqual([345, 0, 0]);
  });

  it('이 브라우저 변수: POLARMODE·POLARANG(도, 실수)은 수, POLARADDANG은 고른 꼴의 글로 저장하고 바뀌면 알린다', () => {
    expect([browserSysvar('POLARMODE'), browserSysvar('POLARANG'), browserSysvarText('POLARADDANG')]).toEqual([0, 90, '']);
    expect(readSettings(optionValue)).toMatchObject({ polarMode: 0, polarAng: 90 });
    expect([DEFAULT_SETTINGS.polarMode, DEFAULT_SETTINGS.polarAng]).toEqual([0, 90]);
    const seen: string[] = [];
    const off = onSysvarChange((n, v) => seen.push(`${n}=${v}`));
    expect(setBrowserSysvar('POLARANG', 22.5)).toBeNull();
    expect(setBrowserSysvar('POLARANG', 0)).toBe('0.1과(와) 360 사이의 값이 필요합니다.');
    expect(setBrowserSysvar('POLARMODE', 16)).toBe('0과(와) 15 사이의 정수가 필요합니다.');
    expect(setBrowserSysvar('POLARMODE', 2.5)).toBe('0과(와) 15 사이의 정수가 필요합니다.');
    expect(setBrowserSysvar('POLARMODE', 13)).toBeNull();
    expect(setBrowserSysvarText('POLARADDANG', ' 75 ; 10 ')).toBeNull();
    expect(setBrowserSysvarText('POLARADDANG', 'x')).toContain('각도로 읽을 수 없습니다');
    off();
    expect(seen).toEqual(['POLARANG=22.5', 'POLARMODE=13', 'POLARADDANG=75;10']);
    expect([browserSysvar('POLARMODE'), browserSysvar('POLARANG'), browserSysvarText('POLARADDANG')]).toEqual([13, 22.5, '75;10']);
    expect(readSettings(optionValue)).toMatchObject({ polarMode: 13, polarAng: 22.5 });
    // 글 변수는 수로 읽히지 않는다(NaN), 둘 다 이 브라우저 변수
    expect(Number.isNaN(browserSysvar('POLARADDANG'))).toBe(true);
    expect([isBrowserSysvar('polaraddang'), isBrowserSysvar('POLARMODE'), isBrowserSysvar('$POLARANG'), isBrowserSysvar('ORTHOMODE')]).toEqual([true, true, true, false]);
    // 손으로 고친 저장값이 맞지 않으면 초기값
    prefSet('opencad.sysvar.POLARADDANG', '1;x');
    prefSet('opencad.sysvar.POLARANG', '0');
    expect([browserSysvarText('POLARADDANG'), browserSysvar('POLARANG')]).toEqual(['', 90]);
  });
});

describe('각도 단위(AUNITS·AUPREC)로 보이기·받기 — 저장값은 도', () => {
  const U = (aunits: number, auprec = 0) => ({ aunits, auprec });

  it('십진 도·도/분/초·그라드·라디안: AUPREC 자릿수, 값이 달라 보이면 다시 읽힐 때까지 자릿수를 늘린다', () => {
    expect([formatPolarAngle(90), formatPolarAngle(22.5), formatPolarAngle(0.1), formatPolarAngle(360)]).toEqual(['90', '22.5', '0.1', '360']);
    expect([formatPolarAngle(90, U(0, 2)), formatPolarAngle(22.5, U(0, 4))]).toEqual(['90.00', '22.5000']);
    // 도/분/초(AutoLISP angtos 1과 같은 꼴): 0 → 도, 1·2 → 분, 3·4 → 초, 5부터 초의 소수
    expect([formatPolarAngle(90, U(1)), formatPolarAngle(22.5, U(1)), formatPolarAngle(7.5, U(1, 4)), formatPolarAngle(10.123, U(1))]).toEqual(['90d', "22d30'", `7d30'0"`, `10d7'22.8"`]);
    expect([formatPolarAngle(90, U(2)), formatPolarAngle(22.5, U(2)), formatPolarAngle(45, U(2, 2))]).toEqual(['100g', '25g', '50.00g']);
    expect([formatPolarAngle(90, U(3, 4)), formatPolarAngle(180, U(3, 2))]).toEqual(['1.57079633r', '3.14159265r']);
    // 측량 단위: 증분(크기)은 도/분/초, 추가 각도(방향)는 방위
    expect([formatPolarAngle(22.5, U(4)), formatPolarAngle(10, U(4), true), formatPolarAngle(22.5, U(4), true), formatPolarAngle(100, U(4), true), formatPolarAngle(200, U(4), true), formatPolarAngle(300, U(4), true)]).toEqual([
      "22d30'",
      'N 80d E',
      "N 67d30' E",
      'N 10d W',
      'S 70d W',
      'S 30d E',
    ]);
    expect([0, 90, 180, 270].map((d) => formatPolarAngle(d, U(4), true))).toEqual(['E', 'N', 'W', 'S']);
    // 맞지 않는 AUNITS·AUPREC은 십진 도·0~8
    expect([formatPolarAngle(45, U(9, -3)), formatPolarAngle(45, U(0, 20))]).toEqual(['45', '45.00000000']);
    // 어느 단위든 보인 글을 다시 읽으면 같은 각도
    for (const u of [U(0), U(1), U(2), U(3), U(4), U(1, 8), U(2, 3)])
      for (const d of [0.1, 5, 7.5, 10.123456, 22.5, 90, 359.5]) {
        expect(parseAngleText(formatPolarAngle(d, u), u.aunits)).toBeCloseTo(d, 5);
        expect(parseAngleText(formatPolarAngle(d, u, true), u.aunits, true)).toBeCloseTo(d, 5);
      }
  });

  it('받기: 단위 표시가 있으면 그 단위, 없으면 AUNITS의 단위(0·1·4 도, 2 그라드, 3 라디안), 방향은 방위도', () => {
    expect([parseAngleText("22d30'", 0), parseAngleText('25g', 0), parseAngleText('45°', 3), parseAngleText(' 10 ', 1), parseAngleText('10', 4)]).toEqual([22.5, 22.5, 45, 10, 10]);
    expect([parseAngleText('50', 2), parseAngleText(String(Math.PI / 2), 3), parseAngleText('-15', 0)]).toEqual([45, 90, -15]);
    expect(parseAngleText('0.5r', 0)).toBeCloseTo(28.64788976, 7);
    expect([parseAngleText('N 80d E', 4, true), parseAngleText('s 30d e', 0, true), parseAngleText('W', 0, true), parseAngleText("N 67d30' E", 1, true)]).toEqual([10, 300, 180, 22.5]);
    // 증분 각도(크기)는 방위를 받지 않는다. 지수·못 읽는 글은 null
    expect([parseAngleText('N 80d E', 4), parseAngleText('1e2', 0), parseAngleText('abc', 0), parseAngleText('', 0), parseAngleText('N x E', 4, true)]).toEqual([null, null, null, null, null]);
  });

  it('증분 각도: 제도 설정은 도면 단위로 읽고(경계 문구도 그 단위), 명령행은 도 — 단위 표시는 어디서나', () => {
    expect([parsePolarAng('50', U(2)), parsePolarAng('22d30\'', U(1)), parsePolarAng('25g'), parsePolarAng('0.25r')]).toEqual([45, 22.5, 22.5, 14.323944878]);
    expect(parsePolarAng('500', U(2))).toBe('증분 각도는 0.111111g과(와) 400g 사이의 각도여야 합니다.');
    expect(parsePolarAng('0', U(1))).toBe("증분 각도는 0d6'과(와) 360d 사이의 각도여야 합니다.");
    expect(parsePolarAng('N 80d E', U(4))).toBe("증분 각도는 0d6'과(와) 360d 사이의 각도여야 합니다.");
  });

  it('POLARADDANG 글의 항목도 단위 표시·방위를 받아 도로 저장한다', () => {
    expect(parsePolarAddAng('N 80d E;25g;10;0.5r')).toEqual([10, 22.5, 28.647890]);
    expect(parsePolarAddAng('50;N', U(2))).toEqual([45, 90]);
    expect(formatPolarAddAng(parsePolarAddAng("7d30';S 30d E") as number[])).toBe('7.5;300');
  });

  it('추가 각도 새로 만들기·삭제: 10개까지, 같은 방향은 거르고, 0~360 밖은 같은 방향으로 넣고 알린다', () => {
    expect(addPolarAngle([], "22d30'", U(1))).toEqual({ list: [22.5], index: 0, note: null });
    expect(addPolarAngle([22.5], '25g', U(1))).toEqual({ error: "추가 각도 22d30'은(는) 이미 목록에 있습니다." });
    expect(addPolarAngle([10], '-10')).toEqual({ list: [10, 350], index: 1, note: '-10을(를) 같은 방향인 350(으)로 넣었습니다(추가 각도는 0 이상 360 미만).' });
    expect(addPolarAngle([10], '370')).toEqual({ error: '추가 각도 10은(는) 이미 목록에 있습니다.' });
    expect(addPolarAngle([0], '359.9999999')).toEqual({ error: '추가 각도 0은(는) 이미 목록에 있습니다.' });
    expect(addPolarAngle([], 'S 30d E', U(4))).toEqual({ list: [300], index: 0, note: null });
    expect(addPolarAngle([], '50', U(2))).toEqual({ list: [45], index: 0, note: null });
    expect(addPolarAngle([], ' x ')).toEqual({ error: '"x"을(를) 각도로 읽을 수 없습니다.' });
    const ten = Array.from({ length: POLARADDANG_MAX }, (_, i) => i * 7);
    expect(addPolarAngle(ten, '1')).toEqual({ error: '추가 각도는 10개까지입니다.' });
    expect(addPolarAngle(ten.slice(1), '1')).toMatchObject({ index: 9 });
    expect(removePolarAngle([1, 2, 3], 1)).toEqual({ list: [1, 3], index: 1 });
    expect(removePolarAngle([1, 2, 3], 2)).toEqual({ list: [1, 2], index: 1 });
    expect(removePolarAngle([1], 0)).toEqual({ list: [], index: -1 });
    expect(removePolarAngle([1, 2], -1)).toEqual({ list: [1, 2], index: 0 });
  });
});

describe('추적 방향', () => {
  const S = (mode: number, inc = 90, add: number[] = []) => ({ mode, inc, add });

  it('증분 각도의 배수: 360을 나누지 않는 증분은 360 아래의 배수를 모두', () => {
    expect(degs(polarAngles(90 * D))).toEqual([0, 90, 180, 270]);
    expect(degs(polarAngles(45 * D))).toHaveLength(8);
    expect(degs(polarAngles(50 * D))).toEqual([0, 50, 100, 150, 200, 250, 300, 350]);
    expect(degs(polarAngles(22.5 * D))).toHaveLength(16);
    expect(degs(polarAngles(360 * D))).toEqual([0]);
  });

  it('추가 각도는 POLARMODE 4일 때만, 배수를 만들지 않는다', () => {
    expect(degs(polarDirections(S(0, 90, [10, 75]), 0))).toEqual([0, 90, 180, 270]);
    expect(degs(polarDirections(S(4, 90, [10, 75]), 0))).toEqual([0, 10, 75, 90, 180, 270]);
    // 이미 배수인 추가 각도는 한 번
    expect(degs(polarDirections(S(4, 45, [90]), 0))).toHaveLength(8);
  });

  it('0도 방향: POLARMODE 1이고 마지막 선분이 있으면 그 방향(상대), 아니면 UCS X축(절대)', () => {
    expect(polarReference(0, 0.1, 0.5)).toEqual({ ref: 0.1, relative: false });
    expect(polarReference(1, 0.1, 0.5)).toEqual({ ref: 0.5, relative: true });
    expect(polarReference(1, 0.1, null)).toEqual({ ref: 0.1, relative: false });
    expect(polarReference(14, 0.1, 0.5).relative).toBe(false);
    // 45도로 그린 선분 다음: 90도 증분이 45·135·225·315도가 된다
    expect(degs(polarDirections(S(1), 45 * D))).toEqual([45, 135, 225, 315]);
  });

  it('객체 스냅 추적: POLARMODE 2이고 극좌표 추적 중이면 극좌표 각도(UCS 기준), 아니면 수평·수직', () => {
    expect(degs(otrackDirections(S(0, 45), true, 0))).toEqual([0, 90, 180, 270]);
    expect(degs(otrackDirections(S(2, 45), true, 0))).toHaveLength(8);
    expect(degs(otrackDirections(S(2, 45), false, 0))).toEqual([0, 90, 180, 270]);
    expect(degs(otrackDirections(S(6, 90, [30]), true, 0))).toEqual([0, 30, 90, 180, 270]);
    // 상대(1)여도 획득점은 UCS 기준
    expect(degs(otrackDirections(S(3, 90), true, 10 * D))).toEqual([10, 100, 190, 280]);
  });

  it('툴팁 각도는 0도 방향에서 잰다(상대 극좌표는 이름도)', () => {
    const base = { x: 0, y: 0 };
    const a = polarDirections(S(1), 45 * D);
    const t = polarTrack(base, { x: -7, y: 7.2 }, a, 1, fmt, { ref: 45 * D, label: '상대 극좌표' })!;
    expect(t.tip).toBe('상대 극좌표: 10.04 < 90°');
    expect(t.p.x).toBeCloseTo(-t.p.y, 9);
    expect(polarTrack(base, { x: 0.2, y: 5 }, polarDirections(S(0), 0), 1, fmt)!.tip).toBe('극좌표: 5.00 < 90°');
    expect(polarTrack(base, { x: 3, y: 4 }, polarDirections(S(0), 0), 1, fmt)).toBeNull();
    // 객체 스냅 추적: 획득점은 ref, 기준점의 극좌표 정렬선은 baseTip.ref에서
    const o = objectTrack([{ p: { x: 10, y: 0 }, label: '끝점' }], { x: 10.3, y: 6 }, polarDirections(S(0), 0), 1, null, null, fmt, 0)!;
    expect(o.tip).toBe('끝점: 6.00 < 90°');
    const both = objectTrack([{ p: { x: 10, y: 0 }, label: '끝점' }], { x: 10.2, y: 10.1 }, polarDirections(S(0), 0), 1, base, a, fmt, 0, { ref: 45 * D, label: '상대 극좌표' })!;
    expect(both.p.x).toBeCloseTo(10, 9);
    expect(both.p.y).toBeCloseTo(10, 9);
    // 커서에 더 가까운 정렬선(기준점의 상대 45도 = 0°)이 먼저
    expect(both.tip).toBe('상대 극좌표: < 0°, 끝점: < 90°');
  });
});

describe('도면 단위의 0 방향·양의 방향(ANGBASE·ANGDIR)과 툴팁 각도의 단위(16차)', () => {
  const S = (mode: number, inc = 90, add: number[] = []) => ({ mode, inc, add });
  // 측량에서 흔한 설정: 0 방향 북쪽(ANGBASE 90도), 시계 방향(ANGDIR 1)
  const NORTH_CW = { aunits: 0, auprec: 0, angbase: 90 * D, angdir: 1 };

  it('도면 각도 ↔ UCS 각도: 0 방향에서 ANGDIR 쪽으로 잰다(없으면 그대로)', () => {
    expect(fromDrawingAngle(30 * D, NORTH_CW) / D).toBeCloseTo(60, 9);
    expect(toDrawingAngle(60 * D, NORTH_CW) / D).toBeCloseTo(30, 9);
    expect(toDrawingAngle(0, NORTH_CW) / D).toBeCloseTo(90, 9);
    expect(fromDrawingAngle(0.3, {})).toBe(0.3);
    expect([clockwise({ angdir: 1 }), clockwise({}), angleBase({ angbase: Number.NaN })]).toEqual([true, false, 0]);
  });

  it('절대 극좌표의 0 방향은 UCS X축 + ANGBASE, 상대(마지막 선분)에는 ANGBASE가 없다', () => {
    expect(polarReference(0, 0.1, 0.5, 0.2).ref).toBeCloseTo(0.3, 12);
    expect(polarReference(1, 0.1, 0.5, 0.2)).toEqual({ ref: 0.5, relative: true });
    expect(polarReference(1, 0.1, null, 0.2)).toEqual({ ref: 0.1 + 0.2, relative: false });
  });

  it('ANGDIR 1이면 시계 방향으로 센다: 360을 나누지 않는 증분과 추가 각도의 방향이 달라진다', () => {
    expect(degs(polarDirections(S(0, 50), 0, true))).toEqual([0, 10, 60, 110, 160, 210, 260, 310]);
    expect(degs(polarDirections(S(0, 50), 0, false))).toEqual([0, 50, 100, 150, 200, 250, 300, 350]);
    // 북쪽 0·시계 방향: 증분 90은 같은 네 방향, 추가 각도 10은 북쪽에서 시계 방향 10도(UCS 80도)
    expect(degs(polarDirections(S(4, 90, [10]), 90 * D, true))).toEqual([0, 80, 90, 180, 270]);
    // 0 방향 30도(ANGBASE): 90 증분이 30·120·210·300
    expect(degs(polarDirections(S(0, 90), 30 * D))).toEqual([30, 120, 210, 300]);
  });

  it('객체 스냅 추적: 직교로만이면 UCS 축 그대로, 극좌표 각도(2)면 절대 극좌표와 같은 0 방향·방향', () => {
    expect(degs(otrackDirections(S(0, 45), true, 0, { angbase: 30 * D, angdir: 1 }))).toEqual([0, 90, 180, 270]);
    expect(degs(otrackDirections(S(2, 90), true, 0, { angbase: 30 * D }))).toEqual([30, 120, 210, 300]);
    expect(degs(otrackDirections(S(6, 90, [10]), true, 0, NORTH_CW))).toEqual([0, 80, 90, 180, 270]);
  });

  it('툴팁 각도 글: AUNITS·AUPREC(값이 달라 보이면 네 자리까지), 십진 도는 °, 측량 단위는 절대면 방위·상대면 도/분/초', () => {
    expect(trackAngleText(45 * D)).toBe('45°');
    expect(trackAngleText(22.5 * D)).toBe('22.5°');
    expect(trackAngleText(-90 * D)).toBe('270°');
    expect(trackAngleText(45 * D, { aunits: 0, auprec: 2 })).toBe('45.00°');
    expect(trackAngleText(22.5 * D, { aunits: 1, auprec: 0 })).toBe("22d30'");
    expect(trackAngleText(22.5 * D, { aunits: 2, auprec: 0 })).toBe('25g');
    expect(trackAngleText(90 * D, { aunits: 3, auprec: 0 })).toBe('1.5708r');
    // 아무 각도(UCS를 돌린 도면의 직교선)는 네 자리에서 멈춘다
    expect(trackAngleText(0.3, { aunits: 0, auprec: 0 })).toBe('17.1887°');
    // 측량 단위: 북쪽 0·시계 방향에서 30도 = 방위 N 30d E. 0 방향이 동쪽이면 30도 = N 60d E
    expect(trackAngleText(30 * D, { ...NORTH_CW, aunits: 4 })).toBe('N 30d E');
    expect(trackAngleText(30 * D, { aunits: 4, auprec: 0 })).toBe('N 60d E');
    expect(trackAngleText(30 * D, { ...NORTH_CW, aunits: 4 }, true)).toBe('30d');
  });

  it('정렬선 툴팁: 0 방향(ref)에서 cw 쪽으로 재고 각도 글은 angle로', () => {
    const base = { x: 0, y: 0 };
    const units = { ...NORTH_CW, aunits: 1 };
    const tip = { ref: 90 * D, cw: true, angle: (a: number) => trackAngleText(a, units) };
    const dirs = polarDirections(S(0, 30), 90 * D, true);
    // UCS 60도(북쪽에서 시계 방향 30도) 근처
    const t = polarTrack(base, { x: 5, y: 8.7 }, dirs, 1, fmt, tip)!;
    expect(t.tip).toBe('극좌표: 10.03 < 30d');
    expect(Math.atan2(t.p.y, t.p.x) / D).toBeCloseTo(60, 9);
    // 획득점(PolarTip로 준 0 방향)과 기준점(baseTip)
    const o = objectTrack([{ p: { x: 10, y: 0 }, label: '끝점' }], { x: 16, y: 0.3 }, polarDirections(S(0), 0), 1, null, null, fmt, tip)!;
    expect(o.tip).toBe('끝점: 6.00 < 90d');
    const both = objectTrack([{ p: { x: 10, y: 0 }, label: '끝점' }], { x: 10.2, y: 5.9 }, polarDirections(S(0), 0), 1, base, dirs, fmt, tip, { ...tip, label: '극좌표' })!;
    expect(both.p.x).toBeCloseTo(10, 9);
    // 기준점의 정렬선은 UCS 30도 = 북쪽에서 시계 방향 60도, 획득점의 수직선은 북쪽 = 0
    expect(both.tip).toBe('극좌표: < 60d, 끝점: < 0d');
  });

  it('방위로 준 추가 각도는 도면의 0 방향·방향으로 바꿔 받고, 방위로 보일 때 되돌린다', () => {
    const sv = { ...NORTH_CW, aunits: 4 };
    expect(parseAngleText('N 30d E', 4, true, NORTH_CW)).toBeCloseTo(30, 9);
    expect(parseAngleText('E', 4, true, NORTH_CW)).toBeCloseTo(90, 9);
    expect(parseAngleText('N 30d E', 4, true)).toBeCloseTo(60, 9);
    expect(formatPolarAngle(30, sv, true)).toBe('N 30d E');
    expect(formatPolarAngle(90, sv, true)).toBe('E');
    expect(parsePolarAddAng('N 30d E;S', sv)).toEqual([30, 180]);
    const r = addPolarAngle([], 'N 10d W', sv);
    expect('list' in r && r.list).toEqual([350]);
  });

  it('극좌표 좌표 입력(d<a·@d<a·원통·구)의 각도도 0 방향에서 ANGDIR 쪽으로', () => {
    const conv = { angbase: 90 * D, angdir: 1 };
    const p = parsePointInput('@10<30', { x: 1, y: 1 }, null, 0, conv)!;
    expect(p.x).toBeCloseTo(1 + 10 * Math.cos(60 * D), 9);
    expect(p.y).toBeCloseTo(1 + 10 * Math.sin(60 * D), 9);
    const c = parsePointInput('5<0,2', null, null, 0, conv)!;
    expect([c.x, c.y, c.z]).toEqual([expect.closeTo(0, 9), expect.closeTo(5, 9), 2]);
    const s = parsePointInput('10<90<90', null, null, 0, conv)!;
    expect(s.z).toBeCloseTo(10, 9);
    // 시계 방향만: 90은 아래쪽
    const q = parsePointInput('10<90', null, null, 0, { angdir: 1 })!;
    expect(q.y).toBeCloseTo(-10, 9);
    // 기본(0·0)은 이전과 같다
    expect(parsePointInput('10<90', null, null)!.y).toBeCloseTo(10, 9);
  });

  it('동적 입력의 각도 칸: 커서 각도를 0 방향에서 재서 보이고, 잠근 각도도 그렇게 읽는다', () => {
    const conv = { angbase: 90 * D, angdir: 1 };
    const dyn = new DynInput();
    dyn.sync({});
    const base = { x: 0, y: 0 };
    // 커서는 UCS 60도(북쪽에서 시계 방향 30도)
    const cur = { x: 10 * Math.cos(60 * D), y: 10 * Math.sin(60 * D) };
    expect(dyn.fields(base, cur, '', WORLD, (v) => v.toFixed(2), conv).map((f) => f.text)).toEqual(['10.00', '30°']);
    expect(dyn.fields(base, cur, '', WORLD, (v) => v.toFixed(2)).map((f) => f.text)).toEqual(['10.00', '60°']);
    // 거리 칸에 5를 잠그고 각도 0(북쪽)
    expect(dyn.tab('5', true)).toBe(true);
    const r = dyn.resolve('0', base, cur, WORLD, 0, conv)!;
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(5, 9);
    const k = dyn.constrain(base, cur, WORLD, 0, conv);
    expect(Math.hypot(k.x, k.y)).toBeCloseTo(5, 9);
  });
});
