// @vitest-environment jsdom
/**
 * 225차: 각을 parseFloat로 읽던 프롬프트가 단위 글자를 버리던 것(ROADMAP 「224차에 보고 두 것」).
 * - 고치기 전: `45d30'` → 45도, `50g` → 50도(50그라드 = 45도), `0.7854r` → 0.7854도 — 앞 수만 도로 읽어 사용자가 준 값과 다른 각을 조용히 썼다.
 * - Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와 상관없이 도/분/초·그라드·라디안 꼴로도 넣는다 → 그 꼴은 그 단위로 읽는다
 *   (core/units parseAngleDegrees — parseUnitAngle(224차)이 읽으면 그 값, 아니면 전처럼 parseFloat).
 * - 수만 쓴 각(`45`)은 전처럼 도, 못 읽는 꼴(`45d30` 등)은 전처럼 앞 수. 0 방향·방향(ANGBASE·ANGDIR·UCS)은 각 프롬프트가 수에 하던 그대로다.
 * - 키워드가 있는 프롬프트(RECTANG 점 선택(P)·XLINE 참조(R)·ELLIPSE 매개변수(P)·사이각(I)·ROTATE 복사(C)·참조(R)·그립 참조(R))의 글자 하나는 전처럼 키워드.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArcEntity, EllipseEntity, LineEntity, LwPolylineEntity, PolylineEntity, TextEntity, XLineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { polyVertices } from '../../src/core/polyverts';
import { parseAngleDegrees } from '../../src/core/units';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { registerGripMenu } from '../../src/app/gripmenu';
import { activeEditor } from '../../src/app/textedit/editor';
import { arc, line, lw } from '../edit/make';
import { type Harness, type Input, makeHarness, modelEntities } from '../cmds2/harness';
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
const C = (v: number) => expect.closeTo(v, 6);
/** 프롬프트마다 넣는 네 각: 수(그대로)·도/분/초·그라드·라디안(바뀜) */
const INPUTS = ['45', `45d30'`, '50g', '0.7854r'];
/** 고친 뒤 각(도). 고치기 전에는 [45, 45, 50, 0.7854](앞 수만 도) */
const WANT = [45, 45.5, 45, 0.7854 / D].map(C);
/** 라디안 → 0~360도 */
const nd = (a: number) => (((a / D) % 360) + 360) % 360;
const dirOf = (v: { x: number; y: number }) => Math.atan2(v.y, v.x) / D;

describe('core/units parseAngleDegrees(각도 프롬프트의 글 → 도)', () => {
  it('단위 글자 꼴은 그 단위로, 수만 쓴 글과 못 읽는 꼴은 전처럼 parseFloat, 글자만은 null', () => {
    expect(['45', `45d30'`, '50g', '0.7854r', '45°', '-30d', '100G', ` 45d 30' `, `45d30'36"`].map((t) => parseAngleDegrees(t))).toEqual(
      [45, 45.5, 45, 0.7854 / D, 45, -30, 90, 45.5, 45 + 30 / 60 + 36 / 3600].map((v) => expect.closeTo(v, 9)),
    );
    // 못 읽는 꼴·수는 parseFloat 그대로(작은따옴표 없는 분, 지수 뒤 d, 다른 글자)
    expect(['45d30', '1e1d', '45x', ' 15 ', '1e1', '-45', '.5'].map((t) => parseAngleDegrees(t))).toEqual([45, 10, 45, 15, 10, -45, 0.5]);
    for (const t of ['R', 'D', 'g', 'r', 'N', 'S45dE', 'abc', '', 'd45']) expect(parseAngleDegrees(t), t).toBeNull();
  });
});

function harness(): Harness {
  const h = makeHarness();
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  registerPeditCommands(h.app);
  registerGripMenu(h.app);
  return h;
}

/** 입력마다 새 도면에서 명령을 돌리고 잰 각(도) */
async function each(run: (h: Harness, t: string) => Promise<number>, inputs = INPUTS): Promise<number[]> {
  const out: number[] = [];
  for (const t of inputs) out.push(await run(harness(), t));
  return out;
}

const last = <T extends 'ARC' | 'ELLIPSE' | 'XLINE' | 'LWPOLYLINE'>(h: Harness, type: T) => modelEntities(h.doc, type).at(-1)!;
const sweep = (e: ArcEntity) => nd(e.endAngle - e.startAngle);
async function runIn(h: Harness, name: string, inputs: Input[]): Promise<void> {
  await h.run(name, inputs);
}

describe('ARC·PLINE 호(draw.ts)', () => {
  it('ARC 중심·시작·각도의 사이각', async () => {
    expect(await each(async (h, t) => (await runIn(h, 'ARC', ['C', '0,0', '10,0', 'A', t]), sweep(last(h, 'ARC') as ArcEntity)))).toEqual(WANT);
  });

  it('ARC 시작·끝·각도의 사이각', async () => {
    expect(await each(async (h, t) => (await runIn(h, 'ARC', ['10,0', 'E', '0,10', 'A', t]), sweep(last(h, 'ARC') as ArcEntity)))).toEqual(WANT);
  });

  it('ARC 시작·끝·방향의 접선 방향(현과 이루는 각 = asin(반현 / 반지름))', async () => {
    const got = await each(async (h, t) => {
      await runIn(h, 'ARC', ['0,0', 'E', '10,0', 'D', t]);
      return Math.asin(5 / (last(h, 'ARC') as ArcEntity).radius) / D;
    });
    expect(got).toEqual(WANT);
  });

  it('PLINE 호 모드 각도(A)의 사이각(getAngle — 볼록 = tan(사이각/4))', async () => {
    const got = await each(async (h, t) => {
      await runIn(h, 'PLINE', ['0,0', 'A', 'A', t, '10,0', '']);
      return (4 * Math.atan(lwVertices(last(h, 'LWPOLYLINE') as LwPolylineEntity)[0]!.bulge)) / D;
    });
    expect(got).toEqual(WANT);
  });
});

describe('ELLIPSE·XLINE·RECTANG(draw.ts)', () => {
  it('ELLIPSE 장축 주위 회전(R — getAngle, 비율 = cos)', async () => {
    const got = await each(async (h, t) => (await runIn(h, 'ELLIPSE', ['-10,0', '10,0', 'R', t]), Math.acos((last(h, 'ELLIPSE') as EllipseEntity).ratio) / D));
    expect(got).toEqual(WANT);
  });

  it('타원형 호: 시작 각도·끝 각도·끝 사이각(I), 매개변수(P)의 시작 매개변수', async () => {
    const start = await each(async (h, t) => (await runIn(h, 'ELLIPSE', ['A', '-10,0', '10,0', '10', t, '180']), nd((last(h, 'ELLIPSE') as EllipseEntity).startParam)));
    const end = await each(async (h, t) => (await runIn(h, 'ELLIPSE', ['A', '-10,0', '10,0', '10', '0', t]), nd((last(h, 'ELLIPSE') as EllipseEntity).endParam)));
    const inc = await each(async (h, t) => (await runIn(h, 'ELLIPSE', ['A', '-10,0', '10,0', '10', '0', 'I', t]), nd((last(h, 'ELLIPSE') as EllipseEntity).endParam)));
    const param = await each(async (h, t) => (await runIn(h, 'ELLIPSE', ['A', '-10,0', '10,0', '5', 'P', t, '180']), nd((last(h, 'ELLIPSE') as EllipseEntity).startParam)));
    expect([start, end, inc, param]).toEqual([WANT, WANT, WANT, WANT]);
  });

  it('XLINE 각도(A)와 참조(R) 뒤 더하는 각(getAngle)', async () => {
    const abs = await each(async (h, t) => (await runIn(h, 'XLINE', ['A', t, '0,0', '']), dirOf((last(h, 'XLINE') as XLineEntity).direction)));
    const ref = await each(async (h, t) => {
      const l = h.add(line(0, -5, 10, -5));
      await runIn(h, 'XLINE', ['A', 'R', { pick: l.handle, at: [5, -5] }, t, '0,0', '']);
      return dirOf((last(h, 'XLINE') as XLineEntity).direction);
    });
    expect([abs, ref]).toEqual([WANT, WANT]);
  });

  it('RECTANG 회전(R)의 각도, 점 선택(P)은 키워드', async () => {
    const edge = (h: Harness) => {
      const [a, b] = lwVertices(last(h, 'LWPOLYLINE') as LwPolylineEntity);
      return ((dirOf({ x: b!.x - a!.x, y: b!.y - a!.y }) % 90) + 90) % 90;
    };
    expect(await each(async (h, t) => (await runIn(h, 'RECTANG', ['0,0', 'R', t, '0,10']), edge(h)))).toEqual(WANT);
    const h = harness();
    await runIn(h, 'RECTANG', ['0,0', 'R', 'P', '0,0', '10,10', '0,10']);
    expect(edge(h)).toBeCloseTo(45, 9);
    expect(h.prompts).toContain('첫 번째 점 지정:');
  });
});

describe('LENGTHEN·CHAMFER·PEDIT·그립 회전(modify.ts·modify2-pedit.ts)', () => {
  it('LENGTHEN 증분 각도·전체 각도(호 0~90도의 끝을 고름)', async () => {
    const run = async (h: Harness, mode: string, t: string) => {
      const a = h.add(arc(0, 0, 10, 0, 90));
      await runIn(h, 'LENGTHEN', [mode, 'A', t, { pick: a.handle, at: [0, 10] }, '']);
      return sweep(h.doc.entityIndex.get(a.handle) as ArcEntity);
    };
    const de = await each(async (h, t) => (await run(h, 'DE', t)) - 90);
    const tot = await each((h, t) => run(h, 'T', t));
    expect([de, tot]).toEqual([WANT, WANT]);
  });

  it('CHAMFER 각도(A)의 모따기 각도($CHAMFERD)', async () => {
    const got = await each(async (h, t) => (await runIn(h, 'CHAMFER', ['A', '2', t, '']), Number(h.doc.header.get('$CHAMFERD')) / D));
    expect(got).toEqual(WANT);
  });

  it('PEDIT 정점 편집 접선(T)의 접선 방향', async () => {
    const got = await each(async (h, t) => {
      const p = h.add(lw([[0, 0], [10, 0], [20, 0]]));
      await runIn(h, 'PEDIT', [{ pick: p.handle, at: [5, 0] }, 'E', 'T', t, 'X', '']);
      return polyVertices(h.doc.entityIndex.get(p.handle) as PolylineEntity)[0]!.tangent! / D;
    });
    expect(got).toEqual(WANT);
  });

  it('그립 회전: 회전 각도, 참조(R)는 키워드이고 참조 각도도 단위 글자', async () => {
    const grip = async (h: Harness, inputs: (t: string) => Input[], t: string) => {
      const l = h.add(line(0, 0, 10, 0));
      h.st.selection.add(l.handle);
      (h.app as unknown as { hotGrip: unknown }).hotGrip = { point: { x: 0, y: 0 }, items: [{ handle: l.handle, id: 'start', point: { x: 0, y: 0 } }] };
      await runIn(h, 'GRIPEDIT', inputs(t));
      const e = h.doc.entityIndex.get(l.handle) as LineEntity;
      return dirOf({ x: e.end.x - e.start.x, y: e.end.y - e.start.y });
    };
    const rot = await each((h, t) => grip(h, (x) => ['RO', x], t));
    const ref = await each(async (h, t) => 90 - (await grip(h, (x) => ['RO', 'R', x, '90'], t)));
    const nw = await each((h, t) => grip(h, (x) => ['RO', 'R', '0', x], t));
    expect([rot, ref, nw]).toEqual([WANT, WANT, WANT]);
  });
});

function setup(header: Record<string, number> = {}): RealApp {
  const h = makeApp((d) => {
    for (const [k, v] of Object.entries(header)) d.header.set(k, v);
  });
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
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

const lines = (h: RealApp) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LINE') as LineEntity[];
const badAngle = (h: RealApp) => h.out().filter((t) => t.startsWith('각도(도)를 입력'));

/** 진짜 App: (0,0)-(10,0) 선을 고른 채 ROTATE를 돌리고 마지막 선의 방향(도) */
async function rotate(header: Record<string, number>, inputs: string[]): Promise<{ dirs: number[]; bad: string[] }> {
  const h = setup(header);
  const ln = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  ln.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: ln }] });
  h.st.selection.add(ln.handle);
  await runWith(h, 'ROTATE', ['0,0', ...inputs]);
  return { dirs: lines(h).map((e) => dirOf({ x: e.end.x - e.start.x, y: e.end.y - e.start.y })), bad: badAngle(h) };
}

describe('진짜 App', () => {
  it('ROTATE 회전 각도: 단위 글자 꼴, ANGDIR 1이면 수와 같이 시계 방향', async () => {
    const got: number[] = [];
    for (const t of INPUTS) {
      const r = await rotate({}, [t]);
      expect(r.bad, t).toEqual([]);
      got.push(r.dirs[0]!);
    }
    expect(got).toEqual(WANT);
    expect((await rotate({ $ANGDIR: 1 }, ['50g'])).dirs).toEqual([C(-45)]);
    expect((await rotate({ $ANGDIR: 1 }, ['45'])).dirs).toEqual([C(-45)]);
  });

  it('ROTATE 참조(R)·복사(C)는 키워드, 참조 각도·새 각도는 단위 글자 꼴', async () => {
    const ref: number[] = [];
    const nw: number[] = [];
    for (const t of INPUTS) {
      ref.push(90 - (await rotate({}, ['R', t, '90'])).dirs[0]!);
      nw.push((await rotate({}, ['R', '0', t])).dirs[0]!);
    }
    expect([ref, nw]).toEqual([WANT, WANT]);
    expect((await rotate({}, ['C', '50g'])).dirs).toEqual([C(0), C(45)]);
  });

  it('TEXT 문자의 회전 각도', async () => {
    const rot: number[] = [];
    for (const t of INPUTS) {
      const h = setup();
      await runWith(h, 'TEXT', ['10,10', '3', t, '글', '']);
      const ts = h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'TEXT') as TextEntity[];
      expect(ts, t).toHaveLength(1);
      expect(badAngle(h), t).toEqual([]);
      rot.push(ts[0]!.rotation / D);
      activeEditor()?.cancel();
    }
    expect(rot).toEqual(WANT);
  });
});
