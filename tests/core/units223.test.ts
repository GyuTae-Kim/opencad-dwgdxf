/**
 * 223차: 화면에 보인 꼴(222차 — 과학 `1.55E+01`, 측량 단위 `N 45d0'0" E`)을 다시 입력할 때.
 * - Autodesk 도움말 "About Coordinate Entry": 좌표는 과학 표기로도, 각도는 측량 단위로도 넣는다.
 *   "About Unit Format Conventions": 측량 단위 각에는 북·남·동·서 표시가 든다 — 예 `@72'8"<n45d20'6"e`(극좌표 각 자리의 방위).
 * - 명령행 좌표(commandline.ts parsePointInput): 지수 `E+`(전에는 `e-?\d+`만 — `1e1,2`·`1E-1,2`는 이미 좌표),
 *   극좌표·원통·구 좌표의 XY 각 자리에 측량 방위. 0 방향·방향(ANGBASE·ANGDIR)을 바꾼 도면에서 방위를 어떻게 읽는지 도움말이 적지 않아
 *   그런 도면에서는 전처럼 받지 않는다.
 * - 특성 팔레트 각도 칸·각도 프롬프트(annot2-common·express-util askAngle): 방위를 AutoLISP angtof 4와 같은 규칙(core/units parseBearing)으로.
 * 전에 받던 입력은 결과 그대로다(직접 거리 `1E+01`은 이번에 바꾸지 않았다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { type UnitSettings, formatAngle, formatLength, parseAngle, parseBearing } from '../../src/core/units';
import { angtof } from '../../src/edit/lisp/text';
import { parsePointInput } from '../../src/app/commandline';
import { type Field, formatValue, parseValue } from '../../src/app/propedit';
import { askAngle } from '../../src/app/annot2-common';
import { askAngle as askAngleX } from '../../src/app/express-util';
import type { CommandContext } from '../../src/app/app';
import { registerDrawCommands } from '../../src/app/draw';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
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
const C = (v: number) => expect.closeTo(v, 9);
/** 동쪽에서 시계 반대 방향 t도로 거리 d */
const polar = (d: number, t: number, o = { x: 0, y: 0 }) => ({ x: C(o.x + d * Math.cos(t * D)), y: C(o.y + d * Math.sin(t * D)) });
const S = (v: number, luprec: number) => formatLength(v, { lunits: 1, luprec });
const B = (t: number, auprec: number) => formatAngle(t * D, { aunits: 4, auprec });

describe('명령행 좌표의 과학 지수(LUNITS 1 표시 꼴)', () => {
  it('x,y·x,y,z·@ 상대 좌표에 E+ 지수', () => {
    expect(parsePointInput('1.55E+01,2E+00', null, null)).toEqual({ x: 15.5, y: 2 });
    expect(parsePointInput('1.55E+01,2.00E+00,-3.50E+00', null, null)).toEqual({ x: 15.5, y: 2, z: -3.5 });
    expect(parsePointInput('@1.00E+01,-2.00E+00', { x: 1, y: 1 }, null)).toEqual({ x: 11, y: -1 });
    expect(parsePointInput('1e+1,2', null, null)).toEqual({ x: 10, y: 2 });
    // 상태 막대 글(formatLength LUNITS 1)을 그대로 친다
    expect(parsePointInput(`${S(15.5, 2)},${S(-0.00123, 4)}`, null, null)).toEqual({ x: 15.5, y: -0.00123 });
  });

  it('극좌표·원통·구 좌표의 거리·각·Z에 E+ 지수', () => {
    expect(parsePointInput('@1E+01<9E+01', { x: 1, y: 1 }, null)).toEqual(polar(10, 90, { x: 1, y: 1 }));
    expect(parsePointInput('1.0E+01<4.5E+01,2.5E+00', null, null)).toEqual({ ...polar(10, 45), z: 2.5 });
    expect(parsePointInput('1E+01<0<3E+01', null, null)).toEqual({ x: C(10 * Math.cos(30 * D)), y: C(0), z: C(5) });
  });

  it('전에 받던 좌표는 그대로, 직접 거리 1E+01은 이번에도 점이 아니다', () => {
    expect(parsePointInput('10,20', null, null)).toEqual({ x: 10, y: 20 });
    expect(parsePointInput('1e1,2', null, null)).toEqual({ x: 10, y: 2 });
    expect(parsePointInput('1E-1,2,3', null, null)).toEqual({ x: 0.1, y: 2, z: 3 });
    expect(parsePointInput('@10<45', { x: 1, y: 1 }, null)).toEqual(polar(10, 45, { x: 1, y: 1 }));
    expect(parsePointInput('5<90,2', null, null)).toEqual({ ...polar(5, 90), z: 2 });
    const last = { x: 0, y: 0 };
    const dir = { x: 1, y: 0 };
    expect(parsePointInput('1E1', last, dir)).toEqual({ x: 10, y: 0 });
    expect(parsePointInput('1E+01', last, dir)).toBeNull();
    for (const t of ['1E+,2', 'E+01,2', '10<', '1,2,3,4', '1.55E+01']) expect(parsePointInput(t, null, null)).toBeNull();
  });
});

describe('명령행 극좌표 각 자리의 측량 방위(ANGBASE 0·ANGDIR 0)', () => {
  it('도움말 예 꼴(@72<n45d20\'6"e)·빈칸 없는 방위·정방위 글자 하나', () => {
    expect(parsePointInput(`@10<N45d0'0"E`, { x: 1, y: 1 }, null)).toEqual(polar(10, 45, { x: 1, y: 1 }));
    expect(parsePointInput(`@72<n45d20'6"e`, { x: 0, y: 0 }, null)).toEqual(polar(72, 90 - (45 + 20 / 60 + 6 / 3600)));
    expect(['10<N', '10<w', '10<S', '10<E'].map((t) => parsePointInput(t, null, null))).toEqual([polar(10, 90), polar(10, 180), polar(10, 270), polar(10, 0)]);
    expect(['10<N30dW', '10<S60dW', '10<S30dE', '10<N10.5dE'].map((t) => parsePointInput(t, null, null))).toEqual([polar(10, 120), polar(10, 210), polar(10, 300), polar(10, 79.5)]);
    // 0 방향·방향이 기본값인 도면(값을 적어 둔 도면)도
    expect(parsePointInput('10<N', null, null, 0, { angbase: 0, angdir: 0 })).toEqual(polar(10, 90));
  });

  it('원통(d<방위,z)·구(d<방위<b) 좌표와 상대 Z', () => {
    expect(parsePointInput('5<S30dW,2', null, null)).toEqual({ ...polar(5, 240), z: 2 });
    expect(parsePointInput('10<N<30', null, null)).toEqual({ x: C(0), y: C(10 * Math.cos(30 * D)), z: C(5) });
    expect(parsePointInput('@10<N45dE,5', { x: 0, y: 0, z: 1 }, null)).toEqual({ ...polar(10, 45), z: 6 });
  });

  it('상태 막대·DIST의 방위 글(formatAngle AUNITS 4)을 빈칸 없이 치면 같은 방향', () => {
    for (const t of [1, 30, 45, 67.4958, 135.25, 222.2, 300, 359.9]) {
      const s = B(t, 8).replace(/ /g, '');
      const p = parsePointInput(`10<${s}`, null, null)!;
      expect(Math.atan2(p.y, p.x) / D).toBeCloseTo(t > 180 ? t - 360 : t, 6);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 9);
    }
  });

  it('0 방향·방향을 바꾼 도면에서는 방위를 전처럼 받지 않는다(수는 그대로 도면 각도)', () => {
    for (const conv of [{ angbase: 90 * D, angdir: 1 }, { angbase: 90 * D }, { angdir: 1 }]) {
      for (const t of [`@10<N45d0'0"E`, '10<E', '5<S30dW,2', '10<N<30']) expect(parsePointInput(t, { x: 0, y: 0 }, null, 0, conv)).toBeNull();
    }
    expect(parsePointInput('10<90', null, null, 0, { angdir: 1 })).toEqual(polar(10, -90));
    expect(parsePointInput('10<0', null, null, 0, { angbase: 90 * D })).toEqual(polar(10, 90));
  });

  it('방위가 아닌 글·못 읽는 방위는 전처럼 null', () => {
    for (const t of ['10<NXE', '10<X', '10<NE45', '10<N45dE,', '10<45d', '@10<<N']) expect(parsePointInput(t, { x: 0, y: 0 }, null)).toBeNull();
  });
});

describe('방위 읽기(core/units parseBearing — AutoLISP angtof 4와 같은 규칙)', () => {
  it('N·S + 각 + E·W, 정방위 글자, 빈칸·대소문자 무시, 방위가 아니면 null', () => {
    expect(parseBearing(`N 45d0'0" E`)).toBeCloseTo(Math.PI / 4, 12);
    expect(parseBearing(`n45d20'6"e`)).toBeCloseTo((90 - (45 + 20 / 60 + 6 / 3600)) * D, 12);
    expect(['N', 's', ' W ', 'E', 'N E', 'S W'].map((t) => parseBearing(t))).toEqual([C(Math.PI / 2), C(1.5 * Math.PI), C(Math.PI), 0, C(Math.PI / 2), C(1.5 * Math.PI)]);
    for (const t of ['45', '45d', '50g', '', 'NXE', 'NE45', 'E N', 'NSE']) expect(parseBearing(t)).toBeNull();
  });

  it('formatAngle AUNITS 4(AUPREC 0~8)의 글을 다시 읽어 다시 보이면 같은 글', () => {
    // 359.9도처럼 AUPREC 0에서 90도로 반올림되는 방위(S 90d E)는 222차가 「보고 두 것」으로 남겨 빼 둔다
    for (const t of [1, 30, 45, 67.4958, 90, 135.25, 180, 222.2, 270, 300, 358.2]) {
      for (let p = 0; p <= 8; p++) {
        const s = B(t, p);
        expect(formatAngle(parseBearing(s)!, { aunits: 4, auprec: p })).toBe(s);
      }
      expect(parseBearing(B(t, 8))! / D).toBeCloseTo(t, 6);
    }
  });

  it('angtof·parseAngle 결과는 전과 같다', () => {
    expect([`N 45d E`, 'N10dW', 'N', ' w ', 'N E', 'N100dE'].map((t) => angtof(t, 4))).toEqual([C(Math.PI / 4), C(100 * D), C(Math.PI / 2), C(Math.PI), C(Math.PI / 2), C(350 * D)]);
    expect([angtof('S 45d E', 0), angtof('-90', 0), angtof('100g', 2), angtof('45', 1)]).toEqual([C(315 * D), C(270 * D), C(Math.PI / 2), C(Math.PI / 4)]);
    for (const t of ['NSE', 'E N', '', 'N1e999E', '1e999', 'abc']) expect(angtof(t, 4)).toBeNull();
    // parseAngle은 방위를 읽지 않는다(극좌표 설정의 증분 각도 등 — 그대로)
    expect(['N45dE', 'E', `N 45d0'0" E`].map((t) => parseAngle(t, 4))).toEqual([null, null, null]);
    expect([parseAngle('-30', 4), parseAngle("45d30'", 0), parseAngle('50g', 0), parseAngle('1e1', 0)]).toEqual([C(-30 * D), C(45.5 * D), C(Math.PI / 4), C(10 * D)]);
  });
});

describe('특성 팔레트 각도 칸(propedit parseValue)', () => {
  const F = { label: '회전', kind: 'angle', get: () => 0, set: () => undefined } as Field;
  const U = (aunits: number, auprec: number): UnitSettings => ({ lunits: 2, luprec: 4, aunits, auprec, insunits: 0, angbase: 0, angdir: 0, measurement: 1 });

  it('보인 방위 글(formatValue — AUNITS 4)을 그대로 넣으면 같은 각, 0 방향을 바꾼 도면도(칸의 표시·해석 모두 0 방향을 쓰지 않는다)', () => {
    for (const u of [U(4, 4), { ...U(4, 4), angbase: 90 * D, angdir: 1 }]) {
      for (const t of [0, 30, 45, 90, 135.25, 180, 222.2, 270, 300]) {
        const shown = formatValue(F, t * D, u);
        expect(parseValue(F, shown, u)).toEqual({ value: C(t * D) });
      }
    }
    expect(formatValue(F, 45 * D, U(4, 4))).toBe(`N 45d0'0" E`);
    expect([`N 45d0'0" E`, 'n45de', 's', `S 30d0'0" W`].map((t) => parseValue(F, t, U(0, 0)))).toEqual([{ value: C(Math.PI / 4) }, { value: C(Math.PI / 4) }, { value: C(1.5 * Math.PI) }, { value: C(240 * D) }]);
  });

  it('전에 받던 글은 같은 값, 못 읽는 글은 같은 오류', () => {
    const u = U(4, 4);
    expect(['45', "45d30'", '50g', '-30', '1e1', '0.5r'].map((t) => parseValue(F, t, u))).toEqual([
      { value: C(45 * D) },
      { value: C(45.5 * D) },
      { value: C(Math.PI / 4) },
      { value: C(-30 * D) },
      { value: C(10 * D) },
      { value: 0.5 },
    ]);
    for (const t of ['abc', 'NXE', 'E N', '']) expect(parseValue(F, t, u)).toEqual({ error: '각도를 입력하십시오.' });
  });
});

/** 차례로 글을 돌려주는 가짜 ctx(다 쓰면 Enter) */
function fakeCtx(inputs: string[]): { ctx: CommandContext; errors: string[] } {
  const errors: string[] = [];
  const ctx = {
    getPoint: async () => {
      const t = inputs.shift();
      return t === undefined ? { enter: true } : { text: t };
    },
    print: (s: string, cls?: string) => void (cls === 'err' && errors.push(s)),
  } as unknown as CommandContext;
  return { ctx, errors };
}

describe('각도 프롬프트(askAngle — 치수 문자 각도·기울기, TORIENT)', () => {
  it('annot2-common askAngle: 방위는 동쪽 0·반시계 각, 수는 그대로 도, 못 읽으면 다시 묻는다', async () => {
    const got: (number | null)[] = [];
    for (const t of [`N45d0'0"E`, 'S', 'n30dw', '30', '-45', '1e1']) got.push(await askAngle(fakeCtx([t]).ctx, '치수 문자의 각도 지정:'));
    expect(got).toEqual([C(Math.PI / 4), C(1.5 * Math.PI), C(120 * D), C(30 * D), C(-45 * D), C(10 * D)]);
    const f = fakeCtx(['NXE', '15']);
    expect(await askAngle(f.ctx, '기울기 각도 입력:')).toBeCloseTo(15 * D, 12);
    expect(f.errors).toEqual(['각도를 입력하십시오.']);
  });

  it('express-util askAngle(TORIENT 새 절대 회전 각도): 방위, 수는 그대로', async () => {
    const got: unknown[] = [];
    for (const t of [`S45d0'0"E`, 'w', '90', '0']) got.push(await askAngleX(fakeCtx([t]).ctx, '새 절대 회전 각도:'));
    expect(got).toEqual([C(315 * D), C(Math.PI), C(Math.PI / 2), 0]);
    const f = fakeCtx(['N1xE', '20']);
    expect(await askAngleX(f.ctx, '새 절대 회전 각도:')).toBeCloseTo(20 * D, 12);
    expect(f.errors).toEqual(['각도(도)를 입력하거나 두 점을 지정하십시오.']);
  });

  it('진짜 App 명령행: 방위 글은 각도 프롬프트에 글로 간다(키워드·객체 스냅 재지정·점이 아님)', async () => {
    const h = setup();
    const got: (number | null)[] = [];
    h.app.register({ name: 'T223ANG', title: 'T223ANG', run: async (ctx) => {
      for (let i = 0; i < 3; i++) got.push(await askAngle(ctx, '치수 문자의 각도 지정:'));
    } });
    void h.app.run('T223ANG');
    await settle();
    for (const t of [`N45d0'0"E`, 'E', '30']) {
      h.app.submitInput(t);
      await settle();
    }
    expect(got).toEqual([C(Math.PI / 4), 0, C(30 * D)]);
  });
});

function setup(header: Record<string, number> = {}): RealApp {
  const h = makeApp((d) => {
    for (const [k, v] of Object.entries(header)) d.header.set(k, v);
  });
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.osnapOn = false;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  return h;
}

const lines = (h: RealApp) => (h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LINE') as LineEntity[]).map((e) => [e.start.x, e.start.y, e.end.x, e.end.y]);

describe('진짜 App LINE', () => {
  it('LUNITS 1·AUNITS 4 도면: 상태 막대 꼴 좌표(E+ 지수·방위)로 그린다', async () => {
    const h = setup({ $LUNITS: 1, $LUPREC: 2, $AUNITS: 4, $AUPREC: 4 });
    void h.app.run('LINE');
    await settle();
    for (const t of ['1.55E+01,2.00E+00', '@1.00E+01<N', `@1.00E+01<N45d0'0"E`]) {
      h.app.submitInput(t);
      await settle();
    }
    const r = 10 * Math.SQRT1_2;
    expect(lines(h)).toEqual([
      [15.5, 2, C(15.5), C(12)],
      [C(15.5), C(12), C(15.5 + r), C(12 + r)],
    ]);
    expect(h.out().filter((t) => t.startsWith('점이 올바르지 않습니다'))).toEqual([]);
  });

  it('0 방향을 북쪽으로 바꾼 도면: 방위 극좌표는 전처럼 거절, 수 극좌표·E+ 좌표는 받는다', async () => {
    const h = setup({ $ANGBASE: Math.PI / 2 });
    void h.app.run('LINE');
    await settle();
    for (const t of ['0,0', `@10<N45d0'0"E`, '@1E+01<0']) {
      h.app.submitInput(t);
      await settle();
    }
    expect(lines(h)).toEqual([[0, 0, C(0), C(10)]]);
    expect(h.out().filter((t) => t.startsWith('점이 올바르지 않습니다'))).toEqual(['점이 올바르지 않습니다. 예: 100,50  @20,0  @30<45']);
  });
});
