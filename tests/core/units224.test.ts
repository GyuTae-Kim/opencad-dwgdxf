// @vitest-environment jsdom
/**
 * 224차: 223차가 남긴 각도 입력 꼴(ROADMAP 「223차에 보고 두 것」).
 * - Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와 상관없이 도/분/초·그라드·라디안·측량 꼴로도 넣는다.
 *   "About Entering 2D Polar Coordinates": 각은 X축에서 기본 시계 반대 방향, 각도 규칙(0 방향·방향)은 UNITS로 바꾼다.
 * - 명령행 극좌표·원통·구 좌표의 각 자리(commandline.ts parsePointInput unitAngles)에 `45d30'`·`45°`·`50g`·`0.7854r`. 방향 글자가 없는 수 각도라
 *   수만 쓴 각과 같은 0 방향·방향(ANGBASE·ANGDIR)에서 잰다(극좌표 설정 추가 각도 parseAngleText와 같은 규칙). 글을 받는 점 프롬프트(allowText)는
 *   전처럼 글이 먼저다(CIRCLE 반지름 parseFloat 등 — 결과 그대로).
 * - 각도 프롬프트: 대시 명령 askAngleDeg(-INSERT·-ATTEDIT·-HATCH·-UNITS)와 치수 문자 각도(A — dimcmds textOption)는 방위·d/g/r,
 *   annot2-common·express-util askAngle은 d/g/r(방위는 223차), TEXT·MTEXT 회전은 방위만(d/g/r은 parseFloat가 앞 수를 받아 와 결과가 바뀌어 뺌 —
 *   225차가 그 앞 수 읽기를 틀린 값으로 보고 d/g/r도 그 단위로 받게 고침, tests/core/units225.test.ts).
 * 전에 받던 입력은 결과 그대로다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, LineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { formatAngle, parseUnitAngle } from '../../src/core/units';
import { parsePointInput } from '../../src/app/commandline';
import { askAngle } from '../../src/app/annot2-common';
import { askAngle as askAngleX } from '../../src/app/express-util';
import { askAngleDeg } from '../../src/app/dashcmds-ask';
import { type DimOpts, textOption } from '../../src/app/dimcmds';
import type { CommandContext } from '../../src/app/app';
import { registerDrawCommands } from '../../src/app/draw';
import { activeEditor } from '../../src/app/textedit/editor';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

const D = Math.PI / 180;
const C = (v: number) => expect.closeTo(v, 9);
/** 동쪽에서 시계 반대 방향 t도로 거리 d */
const polar = (d: number, t: number, o = { x: 0, y: 0 }) => ({ x: C(o.x + d * Math.cos(t * D)), y: C(o.y + d * Math.sin(t * D)) });
/** 글을 받지 않는 점 프롬프트(App이 unitAngles를 켠다) */
const P = (s: string, last: { x: number; y: number; z?: number } | null = null, conv = {}) => parsePointInput(s, last, null, 0, conv, true);
const Q = `${Math.PI / 4}r`;

describe('명령행 극좌표 각 자리의 도/분/초·그라드·라디안(글을 받지 않는 점 프롬프트)', () => {
  it('도/분/초·°·그라드·라디안, 대소문자·부호', () => {
    expect(P(`@10<45d30'`, { x: 1, y: 1 })).toEqual(polar(10, 45.5, { x: 1, y: 1 }));
    expect(P(`10<45d30'36"`)).toEqual(polar(10, 45 + 30 / 60 + 36 / 3600));
    expect(['10<45°', '10<50g', '10<100G', `10<${Q}`, '10<45D', '10<-30d', '10<+90d'].map((t) => P(t))).toEqual([
      polar(10, 45),
      polar(10, 45),
      polar(10, 90),
      polar(10, 45),
      polar(10, 45),
      polar(10, -30),
      polar(10, 90),
    ]);
    expect(P('10<0.5R')).toEqual(polar(10, 0.5 / D));
  });

  it('원통(d<a,z)·구(d<a<b) 좌표 — 구 좌표의 올려 본 각도', () => {
    expect(P('5<50g,2')).toEqual({ ...polar(5, 45), z: 2 });
    expect(P('@10<45d,5', { x: 0, y: 0, z: 1 })).toEqual({ ...polar(10, 45), z: 6 });
    const h = 10 * Math.cos(30 * D);
    expect(P('10<45d<30d')).toEqual({ x: C(h * Math.cos(45 * D)), y: C(h * Math.sin(45 * D)), z: C(5) });
    expect(P('10<0<50g')).toEqual({ x: C(10 * Math.SQRT1_2), y: C(0), z: C(10 * Math.SQRT1_2) });
    expect(P('10<N<30d')).toEqual({ x: C(0), y: C(h), z: C(5) });
  });

  it('상태 막대 각도 글(formatAngle AUNITS 0~3, AUPREC 8)을 다시 치면 같은 방향', () => {
    for (const aunits of [0, 1, 2, 3]) {
      for (const t of [30, 45, 67.4958, 135.25, 222.2, 300]) {
        const s = formatAngle(t * D, { aunits, auprec: 8 });
        const p = P(`10<${s}`)!;
        expect(Math.atan2(p.y, p.x) / D, s).toBeCloseTo(t > 180 ? t - 360 : t, 5);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 9);
      }
    }
  });

  it('0 방향·방향을 바꾼 도면에서도 수만 쓴 각과 같은 규칙(0 방향에서 ANGDIR 쪽)', () => {
    for (const conv of [{ angbase: 90 * D, angdir: 1 }, { angbase: 90 * D }, { angdir: 1 }, { angbase: 30 * D }]) {
      const n = parsePointInput('10<45', null, null, 0, conv)!;
      for (const t of ['45d', `45d0'0"`, '50g', Q, '45°']) expect(P(`10<${t}`, null, conv), t).toEqual({ x: C(n.x), y: C(n.y) });
    }
    expect(P('@10<50g', { x: 1, y: 1 }, { angbase: 90 * D })).toEqual(polar(10, 135, { x: 1, y: 1 }));
    expect(P('10<90d', null, { angdir: 1 })).toEqual(polar(10, -90));
  });

  it('unitAngles를 켜지 않으면(글을 받는 프롬프트·기본값) 전처럼 null', () => {
    for (const t of ['10<45d', '@10<50g', '10<0.5r,2', '10<0<45d', `10<45d30'`, '10<45°']) {
      expect(parsePointInput(t, { x: 0, y: 0 }, null), t).toBeNull();
      expect(parsePointInput(t, { x: 0, y: 0 }, null, 0, {}, false), t).toBeNull();
    }
  });

  it('못 읽는 꼴은 켜도 null, 전에 받던 좌표는 그대로', () => {
    for (const t of ['10<45dd', '10<45d30', '10<g', '10<45x', '10<1e1d', '10<45gr', '10<45d<', `10<45'`, '10<d45', '10<N45g', '10<.d']) expect(P(t, { x: 0, y: 0 }), t).toBeNull();
    expect(P('10<45')).toEqual(polar(10, 45));
    expect(P('@10<45,2', { x: 0, y: 0 })).toEqual({ ...polar(10, 45), z: 2 });
    expect(P('10<N')).toEqual(polar(10, 90));
    expect(P('1.0E+01<4.5E+01,2.5E+00')).toEqual({ ...polar(10, 45), z: 2.5 });
    expect(P('8<60<30')).toEqual(parsePointInput('8<60<30', null, null));
    expect(P('10,20')).toEqual({ x: 10, y: 20 });
  });
});

describe('단위 글자 각 읽기(core/units parseUnitAngle)', () => {
  it('도/분/초·°·그라드·라디안만, 수만 쓴 글·방위·못 읽는 글은 null', () => {
    expect([`45d30'15"`, '45°', '50g', '0.5r', '-30d', ` 45d 30' `, '100G'].map((t) => parseUnitAngle(t))).toEqual([
      C((45 + 30 / 60 + 15 / 3600) * D),
      C(45 * D),
      C(Math.PI / 4),
      0.5,
      C(-30 * D),
      C(45.5 * D),
      C(Math.PI / 2),
    ]);
    for (const t of ['45', '1e1', '-30', 'N45dE', 'E', 'S30dW', '', 'abc', '45x', 'g', '45d30', '1e1d', 'r']) expect(parseUnitAngle(t), t).toBeNull();
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

describe('각도 프롬프트', () => {
  it('대시 명령 askAngleDeg(-INSERT·-ATTEDIT 회전, -HATCH 각도, -UNITS 각도 0의 방향): 방위·d/g/r, 수는 그대로', async () => {
    const got: number[] = [];
    for (const t of ['N', 'S45dE', 'n30dw', '100g', `45d30'`, `${Math.PI}r`, '45°', '-30d', '30', '1e1', '-45', ' 15 ']) got.push(await askAngleDeg(fakeCtx([t]).ctx, '회전 각도 지정 <0>:', null, 0));
    expect(got).toEqual([C(Math.PI / 2), C(315 * D), C(120 * D), C(Math.PI / 2), C(45.5 * D), C(Math.PI), C(45 * D), C(-30 * D), C(30 * D), C(10 * D), C(-45 * D), C(15 * D)]);
    const f = fakeCtx(['NXE', '45d30', '15']);
    expect(await askAngleDeg(f.ctx, '각도 0의 방향 입력 <0>:', null, 0)).toBeCloseTo(15 * D, 12);
    expect(f.errors).toEqual(['각도 또는 점이 필요합니다.', '각도 또는 점이 필요합니다.']);
  });

  it('치수 문자의 각도(A — DIMLINEAR 등 dimcmds textOption): 방위·d/g/r, 수는 그대로', async () => {
    const got: (number | undefined)[] = [];
    for (const t of [`N45d0'0"E`, 'S', '50g', `30d30'`, '30', '-15']) {
      const o: DimOpts = {};
      expect(await textOption(fakeCtx([t]).ctx, 'A', o)).toBe(true);
      got.push(o.angle);
    }
    expect(got).toEqual([C(Math.PI / 4), C(1.5 * Math.PI), C(Math.PI / 4), C(30.5 * D), C(30 * D), C(-15 * D)]);
    const f = fakeCtx(['abc', '45d30', '15']);
    const o: DimOpts = {};
    await textOption(f.ctx, 'A', o);
    expect(o.angle).toBeCloseTo(15 * D, 12);
    expect(f.errors).toEqual(['각도를 입력하십시오.', '각도를 입력하십시오.']);
  });

  it('annot2-common askAngle(치수 문자 각도·기울기)·express-util askAngle(TORIENT): d/g/r, 방위·수는 그대로', async () => {
    const a: (number | null)[] = [];
    for (const t of [`45d30'`, '50g', '0.5r', '45°', `N45d0'0"E`, '30']) a.push(await askAngle(fakeCtx([t]).ctx, '치수 문자의 각도 지정:'));
    expect(a).toEqual([C(45.5 * D), C(Math.PI / 4), 0.5, C(45 * D), C(Math.PI / 4), C(30 * D)]);
    const f = fakeCtx(['45d30', '15']);
    expect(await askAngle(f.ctx, '기울기 각도 입력:')).toBeCloseTo(15 * D, 12);
    expect(f.errors).toEqual(['각도를 입력하십시오.']);
    const x: unknown[] = [];
    for (const t of ['100g', '-90d', '1r', 'w', '90']) x.push(await askAngleX(fakeCtx([t]).ctx, '새 절대 회전 각도:'));
    expect(x).toEqual([C(Math.PI / 2), C(-Math.PI / 2), 1, C(Math.PI), C(Math.PI / 2)]);
    const g = fakeCtx(['45dx', '20']);
    expect(await askAngleX(g.ctx, '새 절대 회전 각도:')).toBeCloseTo(20 * D, 12);
    expect(g.errors).toEqual(['각도(도)를 입력하거나 두 점을 지정하십시오.']);
  });
});

function setup(header: Record<string, number> = {}): RealApp {
  const h = makeApp((d) => {
    for (const [k, v] of Object.entries(header)) d.header.set(k, v);
  });
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  h.app.osnapOn = false;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  return h;
}

async function runWith(h: RealApp, cmd: string, inputs: string[]): Promise<void> {
  void h.app.run(cmd);
  await settle();
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

const ents = <T>(h: RealApp, type: string) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const lines = (h: RealApp) => ents<LineEntity>(h, 'LINE').map((e) => [e.start.x, e.start.y, e.end.x, e.end.y]);
const badPoint = (h: RealApp) => h.out().filter((t) => t.startsWith('점이 올바르지 않습니다'));

describe('진짜 App', () => {
  it('LINE: 도/분/초·그라드 극좌표로 그린다', async () => {
    const h = setup();
    await runWith(h, 'LINE', ['0,0', `@10<45d30'`, '@10<50g', '']);
    const a = { x: 10 * Math.cos(45.5 * D), y: 10 * Math.sin(45.5 * D) };
    const b = { x: a.x + 10 * Math.SQRT1_2, y: a.y + 10 * Math.SQRT1_2 };
    expect(lines(h)).toEqual([
      [0, 0, C(a.x), C(a.y)],
      [C(a.x), C(a.y), C(b.x), C(b.y)],
    ]);
    expect(badPoint(h)).toEqual([]);
  });

  it('LINE: 0 방향을 북쪽으로·방향을 시계로 바꾼 도면에서 d/g/r은 수만 쓴 각과 같은 방향', async () => {
    const n = setup({ $ANGBASE: Math.PI / 2 });
    await runWith(n, 'LINE', ['0,0', '@10<45d', '@10<45', '']);
    const u = 10 * Math.SQRT1_2;
    expect(lines(n)).toEqual([
      [0, 0, C(-u), C(u)],
      [C(-u), C(u), C(-2 * u), C(2 * u)],
    ]);
    const c = setup({ $ANGDIR: 1 });
    await runWith(c, 'LINE', ['0,0', '@10<50g', '']);
    expect(lines(c)).toEqual([[0, 0, C(u), C(-u)]]);
    expect([...badPoint(n), ...badPoint(c)]).toEqual([]);
  });

  it('글을 받는 점 프롬프트(CIRCLE 반지름)는 전처럼 글: 10<45d30\' → parseFloat 10', async () => {
    const h = setup();
    await runWith(h, 'CIRCLE', ['5,5', `10<45d30'`]);
    expect(ents<CircleEntity>(h, 'CIRCLE').map((e) => [e.center.x, e.center.y, e.radius])).toEqual([[5, 5, 10]]);
  });

  it('TEXT 회전: 방위를 받고, d/g/r은 그 단위로(225차 — 224차까지는 앞 수만 도로 읽어 50g가 50도)', async () => {
    const rot: number[] = [];
    for (const r of ['N', `S45d0'0"E`, '50g', '30']) {
      const h = setup();
      await runWith(h, 'TEXT', ['10,10', '3', r, '글', '']);
      const ts = ents<TextEntity>(h, 'TEXT');
      expect(ts, r).toHaveLength(1);
      expect(h.out().filter((t) => t.startsWith('각도(도)를 입력')), r).toEqual([]);
      rot.push(ts[0]!.rotation);
      activeEditor()?.cancel();
    }
    expect(rot).toEqual([C(Math.PI / 2), C(315 * D), C(45 * D), C(30 * D)]);
  });
});
