/**
 * 222차: 도면 단위 표시(core/units.ts)의 과학 지수(LUNITS 1)와 측량 단위(AUNITS 4).
 * - AutoCAD -UNITS 도움말의 보고 형식 예: 과학 `1.55E+01`(지수는 부호와 두 자리), 측량 단위 `N 45d0'0" E`
 * - UNITS 대화 상자 도움말: 측량 단위는 N·S + 북·남에서 잰 90도 아래 각(도/분/초) + E·W, 정확한 동서남북이면 그 글자 하나
 * - 이 앱의 AutoLISP rtos 1·angtos 4와 극좌표 툴팁은 이미 그 꼴이었다 — 이제 같은 함수(core/units)를 쓴다
 * 상태 막대·LIST·DIST·특성 팔레트·명령행 기본값이 이 함수를 쓴다. 저장 값은 바뀌지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatAngle, formatLength, parseLength } from '../../src/core/units';
import { angtof, angtos, rtos } from '../../src/edit/lisp/text';
import { parseAngleText } from '../../src/app/polar';
import { registerCommands } from '../../src/app/commands';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

const D = Math.PI / 180;
const S = (v: number, luprec: number) => formatLength(v, { lunits: 1, luprec });
const B = (deg: number, auprec: number) => formatAngle(deg * D, { aunits: 4, auprec });

describe('과학 지수(LUNITS 1)', () => {
  it('지수는 부호와 두 자리 이상(-UNITS 예 1.55E+01)', () => {
    expect(S(15.5, 2)).toBe('1.55E+01');
    expect([0, 2, 4, 8].map((p) => S(15.5, p))).toEqual(['2E+01', '1.55E+01', '1.5500E+01', '1.55000000E+01']);
    expect([S(30.5, 4), S(-30.5, 4), S(0.00123, 3), S(1234567, 1), S(0, 2), S(1e100, 2)]).toEqual([
      '3.0500E+01',
      '-3.0500E+01',
      '1.230E-03',
      '1.2E+06',
      '0.00E+00',
      '1.00E+100',
    ]);
  });

  it('AutoLISP rtos 1과 같은 글이고, 다시 읽으면 같은 값이다', () => {
    for (const v of [15.5, -30.5, 0.00123, 1234567, 0]) {
      for (let p = 0; p <= 8; p++) expect(S(v, p)).toBe(rtos(v, 1, p, 0));
      expect(parseLength(S(v, 8))).toBeCloseTo(v, 6);
    }
    // rtos는 전과 같다(Autodesk rtos 예)
    expect(rtos(17.5, 1, 4, 0)).toBe('1.7500E+01');
    expect(parseLength('1.55E+01')).toBe(15.5);
  });

  it('다른 길이 단위는 그대로(-UNITS 예)', () => {
    expect(formatLength(15.5, { lunits: 2, luprec: 2 })).toBe('15.50');
    expect(formatLength(15.5, { lunits: 3, luprec: 2 })).toBe(`1'-3.50"`);
    expect(formatLength(15.5, { lunits: 4, luprec: 4 })).toBe(`1'-3 1/2"`);
    expect(formatLength(15.5, { lunits: 5, luprec: 4 })).toBe('15 1/2');
  });
});

describe('측량 단위(AUNITS 4)', () => {
  it('-UNITS 예 N 45d0\'0" E', () => {
    expect(B(45, 4)).toBe(`N 45d0'0" E`);
  });

  it('각 부분은 도/분/초(AUNITS 1과 같은 자릿수: 0 도, 1·2 분, 3·4 초, 5~ 초 소수)', () => {
    // 방위 N 22d30'15" E = 동쪽에서 시계 반대 방향 67.4958…도
    const t = 90 - (22 + 30 / 60 + 15 / 3600);
    expect([0, 1, 2, 3, 4, 5].map((p) => B(t, p))).toEqual(['N 23d E', "N 22d30' E", "N 22d30' E", `N 22d30'15" E`, `N 22d30'15" E`, `N 22d30'15.0" E`]);
    expect([0, 1, 2, 3, 4, 5].map((p) => formatAngle((90 - t) * D, { aunits: 1, auprec: p }))).toEqual(['23d', "22d30'", "22d30'", `22d30'15"`, `22d30'15"`, `22d30'15.0"`]);
  });

  it('네 사분면과 음수 각(Autodesk angtos 예 -45도 → S 45d E)', () => {
    expect([30, 120, 210, 300, -45].map((t) => B(t, 0))).toEqual(['N 60d E', 'N 30d W', 'S 60d W', 'S 30d E', 'S 45d E']);
  });

  it('정확한 동서남북은 글자 하나(UNITS 도움말)', () => {
    expect([0, 90, 180, 270, 360, -90].map((t) => B(t, 4))).toEqual(['E', 'N', 'W', 'S', 'E', 'S']);
  });

  it('AutoLISP angtos 4와 같은 글이고, 방위 입력(극좌표 설정·angtof)이 다시 읽는다', () => {
    for (const t of [0, 1, 30, 45, 67.4958, 90, 135.25, 180, 222.2, 270, 300, 359.9]) {
      for (let p = 0; p <= 8; p++) expect(B(t, p)).toBe(angtos(t * D, 4, p, 0));
      expect(parseAngleText(B(t, 8), 4, true)! % 360).toBeCloseTo(t % 360, 6);
    }
    // angtos 4는 전과 같다
    expect([angtos(Math.PI / 4, 4, 4, 0), angtos(-Math.PI / 4, 4, 0, 0), angtos(-Math.PI / 4, 4, 2, 0), angtos(0, 4, 0, 0)]).toEqual([`N 45d0'0" E`, 'S 45d E', "S 45d0' E", 'E']);
    expect(angtof(`N 45d0'0" E`, 4)).toBeCloseTo(Math.PI / 4, 9);
  });

  it('다른 각도 단위는 그대로(-UNITS 예 — 십진 도에는 이 앱이 ° 를 붙인다)', () => {
    expect([0, 1, 2, 3].map((aunits) => formatAngle(Math.PI / 4, { aunits, auprec: 4 }))).toEqual(['45.0000°', `45d0'0"`, '50.0000g', '0.7854r']);
  });
});

describe('명령행 글(진짜 App의 DIST)', () => {
  it('LUNITS 1·AUNITS 4 도면: 거리·증분은 두 자리 지수, XY 평면 각도는 도/분/초 방위', async () => {
    const h = makeApp((d) => {
      d.header.set('$LUNITS', 1);
      d.header.set('$LUPREC', 2);
      d.header.set('$AUNITS', 4);
      d.header.set('$AUPREC', 4);
    });
    registerCommands(h.app);
    const pk = new FakePicker(h.doc);
    (h.app as unknown as { picker: () => unknown }).picker = () => pk;
    h.app.osnapOn = false;
    h.app.polarOn = false;
    h.app.otrackOn = false;
    h.app.dynOn = false;
    const cl = h.cmd as unknown as DirectCommandLine;
    const before = [h.doc.header.get('$LUNITS'), h.doc.header.get('$LUPREC'), h.doc.header.get('$AUNITS'), h.doc.header.get('$AUPREC')];
    void h.app.run('DIST');
    await settle();
    for (const t of ['0,0', '10,10']) {
      cl.type(t);
      await settle();
    }
    expect(h.out().filter((t) => /^(거리|X 증분) =/.test(t))).toEqual([
      `거리 = 1.41E+01 mm,  XY 평면에서의 각도 = N 45d0'0" E,  XY 평면으로부터의 각도 = 0d0'0"`,
      'X 증분 = 1.00E+01,  Y 증분 = 1.00E+01,  Z 증분 = 0.00E+00',
    ]);
    // 표시만 바뀌고 저장 값은 그대로
    expect([h.doc.header.get('$LUNITS'), h.doc.header.get('$LUPREC'), h.doc.header.get('$AUNITS'), h.doc.header.get('$AUPREC')]).toEqual(before);
  });
});
