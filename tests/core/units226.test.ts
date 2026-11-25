// @vitest-environment jsdom
/**
 * 226차: Number·CAL 식으로 각(도)을 읽던 프롬프트가 단위 글자 꼴을 버리던 것(ROADMAP 「225차에 보고 두 것」).
 * - 고치기 전: `45d30'`·`50g`·`0.7854r`을 Number가 NaN으로 읽어 오류 없이 앞 값·0을 쓰거나(-HATCHEDIT 선·무늬 각도, CHANGE 문자·블록 회전, MINSERT 블록 회전,
 *   옛 LEADER 블록 회전, DIMLINEAR 회전(R), UCS Z, MOCORO 회전) 오류 뒤 다시 물었다(MINSERT 회전(R), DesignCenter 회전(R), INSERT 화면상 회전,
 *   MLEADER 각도 구속, ARRAY 항목 사이·채울 각도).
 * - Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와 상관없이 도/분/초·그라드·라디안 꼴로도 넣는다 → 지금 읽는 꼴(Number·식)을 먼저 쓰고,
 *   그것이 못 읽은 글이 단위 글자 꼴(core/units parseUnitAngle — 224차)이면 그 각(도). parseFloat 대체가 아니다(`45x`는 전처럼 못 읽는다).
 * - 수(`45`)·못 읽는 글(`45x` — 전처럼 앞 값·0·오류)·키워드(MOCORO 복사(C)·ARRAY 표현식(EX))는 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app/app';
import type { BlockDef, DimensionEntity, Entity, HatchEntity, HatchPath, InsertEntity, LineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { packBulge } from '../../src/core/lwpoly';
import { numberAngleDegrees, parseAngleDegrees } from '../../src/core/units';
import { createHatch } from '../../src/edit/hatch';
import { readArray } from '../../src/edit/assocarray/read';
import type { PolarParams } from '../../src/edit/assocarray/types';
import { registerHatchEditCommands } from '../../src/app/hatchedit';
import { registerPropCommands } from '../../src/app/propcmds';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerLeaderCommand } from '../../src/app/leaderold';
import { mleaderSession, registerAnnotateCommands } from '../../src/app/annotate';
import { registerDimCommands } from '../../src/app/dimcmds';
import { currentUcs, registerUcsCommands } from '../../src/app/ucs';
import { registerMocoroCommand } from '../../src/app/mocoro';
import { registerArrayCommands } from '../../src/app/arraycmd';
import { setArrayAssociativity } from '../../src/app/assocarray';
import { insertBlockFrom, registerDesignCenterCommands } from '../../src/app/designcenter';
import { type RealApp, makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

// jsdom에는 캔버스 그리기가 없다(INSERT 대화 상자의 블록 미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(() => {
  setArrayAssociativity(true);
  document.body.replaceChildren();
});

const D = Math.PI / 180;
/** 프롬프트마다 넣는 다섯 글: 수(그대로)·도/분/초·그라드·라디안(바뀜)·못 읽는 글(그대로 — Number NaN, parseFloat면 45) */
const INPUTS = ['45', `45d30'`, '50g', '0.7854r', '45x'];
/** 고친 뒤 각(도): 넷째까지 그 각, 다섯째(`45x`)는 전과 같은 prev(앞 값·0, 만든 것이 없으면 null) */
const want = (prev: number | null) => [45, 45.5, 45, 0.7854 / D, prev].map((v) => (v === null ? null : expect.closeTo(v, 6)));

/** 블록 B1(정의 기준점 0,0,0 — 선 하나, 속성 없음) */
function addBlock(doc: RealApp['doc']): void {
  const line = { ...entityDefaults(), type: 'LINE', handle: '9015', owner: '9013', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } } as Entity;
  const def: BlockDef = { name: 'B1', handle: '9012', recordHandle: '9013', endHandle: '9014', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [line], layer: '0' };
  doc.blocks.set(tableKey('B1'), def);
  doc.blockRecords.set(tableKey('B1'), { name: 'B1', handle: '9013', flags: 0, insertUnits: 0, explodable: true, scalable: true });
}

function setup(...regs: ((app: App) => void)[]): RealApp {
  const h = makeApp(addBlock);
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  for (const r of regs) r(h.app);
  h.app.osnapOn = false;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  return h;
}

async function type(h: RealApp, inputs: string[]): Promise<void> {
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

async function runWith(h: RealApp, cmd: string, inputs: string[]): Promise<void> {
  void h.app.run(cmd);
  await settle();
  await type(h, inputs);
}

/** 모형 공간에 넣고(핸들은 세션이 매김) 고른다 */
function addSel<T extends Entity>(h: RealApp, e: Entity): T {
  const ent = { ...e, handle: h.st.session.newHandle(), owner: h.doc.blocks.get(MODEL_SPACE)!.recordHandle } as Entity;
  h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: ent }] });
  h.st.selection.add(ent.handle);
  return h.doc.entityIndex.get(ent.handle) as T;
}

const model = <T extends Entity>(h: RealApp, type: string) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const errs = (h: RealApp) => h.cmd.lines.filter((l) => l.cls === 'err').map((l) => l.text);
/** 마지막 블록 참조의 회전(도), 없으면 null */
const insertRot = (h: RealApp) => {
  const e = model<InsertEntity>(h, 'INSERT').at(-1);
  return e ? e.rotation / D : null;
};

/** 입력마다 새 도면에서 돌려 잰 각(도 — 없으면 null)과 오류 줄 수. 끝나지 않은 명령은 잰 뒤 취소한다 */
async function each(make: () => RealApp, run: (h: RealApp, t: string) => Promise<number | null>, inputs = INPUTS): Promise<{ deg: (number | null)[]; err: number[] }> {
  const deg: (number | null)[] = [];
  const err: number[] = [];
  for (const t of inputs) {
    const h = make();
    deg.push(await run(h, t));
    err.push(errs(h).length);
    h.app.cancel(true);
    await settle();
  }
  return { deg, err };
}

const SILENT = [0, 0, 0, 0, 0];

describe('core/units numberAngleDegrees(Number로 각을 읽던 프롬프트의 글 → 도)', () => {
  it('Number가 읽는 글은 그 값 그대로, NaN인 글만 단위 글자 꼴을 그 단위로, 그 밖은 NaN(parseFloat 대체가 아님)', () => {
    // Number 그대로(바이트까지 같은 값 — 16진·빈 글·무한대도 Number의 결과)
    const num = ['45', ' 15 ', '1e1', '-45', '.5', '0x1d', '', 'Infinity'];
    expect(num.map((t) => numberAngleDegrees(t))).toEqual(num.map((t) => Number(t)));
    // 단위 글자 꼴(도/분/초·도 글자·그라드·라디안)
    expect([`45d30'`, '50g', '0.7854r', '45°', '-30d', '100G', ` 45d 30' `, `45d30'36"`].map((t) => numberAngleDegrees(t))).toEqual(
      [45.5, 45, 0.7854 / D, 45, -30, 90, 45.5, 45 + 30 / 60 + 36 / 3600].map((v) => expect.closeTo(v, 9)),
    );
    // 못 읽는 글은 전처럼 NaN(분의 작은따옴표 없음·지수 뒤 d·다른 글자·키워드·방위)
    for (const t of ['45x', '45d30', '1e1d', 'abc', 'R', 'EX', 'C', 'N45dE', 'd45']) expect(numberAngleDegrees(t), t).toBeNaN();
    // parseFloat로 읽는 225차 도우미와 다른 곳: 앞 수만 있는 글
    expect([parseAngleDegrees('45x'), numberAngleDegrees('45x')]).toEqual([45, NaN]);
  });
});

/** 사각형 (0,0)–(10,10) 경로 */
const square: HatchPath = {
  flags: 3,
  polyline: {
    closed: true,
    verts: packBulge([
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 },
      { x: 0, y: 10, bulge: 0 },
    ]),
  },
};

describe('조용히 앞 값·0을 쓰던 프롬프트', () => {
  const hatchAngle = async (inputs: (t: string) => string[]) =>
    each(
      () => setup(registerHatchEditCommands),
      async (h, t) => {
        const e = addSel<HatchEntity>(h, { ...createHatch(h.doc, [square], { pattern: 'ANSI31', angle: 10 * D }), handle: '' } as Entity);
        await runWith(h, '-HATCHEDIT', inputs(t));
        return (h.doc.entityIndex.get(e.handle) as HatchEntity).patternAngle / D;
      },
    );

  it('-HATCHEDIT 무늬에 대한 각도(ANSI31 — 앞 값 10도)', async () => {
    // 옵션 Enter(특성) → 무늬 이름 Enter → 축척 Enter → 각도
    expect(await hatchAngle((t) => ['', '', '', t])).toEqual({ deg: want(10), err: SILENT });
  });

  it('-HATCHEDIT 사용자 정의(U) 선 각도(앞 값 10도)', async () => {
    // 옵션 Enter → U → 선 각도 → 선 간격 Enter → 이중 Enter
    expect(await hatchAngle((t) => ['', 'U', t, '', ''])).toEqual({ deg: want(10), err: SILENT });
  });

  it('CHANGE 변경점: 문자의 새 회전 각도(앞 값 10도)', async () => {
    const got = await each(
      () => setup(registerPropCommands),
      async (h, t) => {
        const e = addSel<TextEntity>(h, {
          ...entityDefaults(),
          type: 'TEXT',
          handle: '',
          insert: { x: 0, y: 0, z: 0 },
          height: 2.5,
          text: 'A',
          rotation: 10 * D,
          widthFactor: 1,
          oblique: 0,
          style: 'Standard',
          generation: 0,
          halign: 0,
          valign: 0,
        } as Entity);
        // 변경점 → 새 높이 Enter → 새 회전 각도 → 새 문자 Enter
        await runWith(h, 'CHANGE', ['5,5', '', t, '']);
        return (h.doc.entityIndex.get(e.handle) as TextEntity).rotation / D;
      },
    );
    expect(got).toEqual({ deg: want(10), err: SILENT });
  });

  it('CHANGE 변경점: 새 블록 회전 각도(앞 값 10도)', async () => {
    const got = await each(
      () => setup(registerPropCommands),
      async (h, t) => {
        const e = addSel<InsertEntity>(h, {
          ...entityDefaults(),
          type: 'INSERT',
          handle: '',
          block: 'B1',
          insert: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 10 * D,
          columnCount: 1,
          rowCount: 1,
          columnSpacing: 0,
          rowSpacing: 0,
          attribs: [],
        } as Entity);
        await runWith(h, 'CHANGE', ['5,5', t]);
        return (h.doc.entityIndex.get(e.handle) as InsertEntity).rotation / D;
      },
    );
    expect(got).toEqual({ deg: want(10), err: SILENT });
  });

  it('MINSERT 블록 회전 각도(삽입점·축척 뒤 — 앞 값 0)', async () => {
    // 블록 이름 → 삽입점 → X·Y 축척 Enter → 회전 → 행·열 Enter
    const got = await each(
      () => setup(registerUtil2BlockCommands, registerBlockCommands),
      async (h, t) => (await runWith(h, 'MINSERT', ['B1', '10,20', '', '', t, '', '']), insertRot(h)),
    );
    expect(got).toEqual({ deg: want(0), err: SILENT });
  });

  it('옛 LEADER 주석 블록(B)의 회전 각도(앞 값 0)', async () => {
    // 두 점 → Enter → 빈 첫 줄(옵션) → 블록(B) B1 → 삽입점 → X·Y 축척 Enter → 회전
    const got = await each(
      () => setup(registerLeaderCommand),
      async (h, t) => (await runWith(h, 'LEADER', ['0,0', '10,10', '', '', 'B', 'B1', '15,35', '', '', t]), insertRot(h)),
    );
    expect(got).toEqual({ deg: want(0), err: SILENT });
  });

  it('DIMLINEAR 회전(R)의 치수선 각도(앞 값 0)', async () => {
    const got = await each(
      () => setup(registerDimCommands),
      async (h, t) => {
        await runWith(h, 'DIMLINEAR', ['0,0', '10,0', 'R', t, '5,5']);
        const d = model<DimensionEntity>(h, 'DIMENSION').at(-1);
        return d ? d.rotation / D : null;
      },
    );
    expect(got).toEqual({ deg: want(0), err: SILENT });
  });

  it('UCS Z축 회전(지금 UCS 10도에 더하는 각 — 못 읽으면 UCS 그대로)', async () => {
    const got = await each(
      () => setup(registerUcsCommands),
      async (h, t) => {
        h.doc.header.set('$UCSORG', { x: 0, y: 0, z: 0 });
        h.doc.header.set('$UCSXDIR', { x: Math.cos(10 * D), y: Math.sin(10 * D), z: 0 });
        h.doc.header.set('$UCSYDIR', { x: -Math.sin(10 * D), y: Math.cos(10 * D), z: 0 });
        await runWith(h, 'UCS', ['Z', t]);
        return currentUcs(h.st).angle / D - 10;
      },
    );
    expect(got).toEqual({ deg: want(0), err: SILENT });
  });

  const mocoro = (inputs: (t: string) => string[]) =>
    each(
      () => setup(registerMocoroCommand),
      async (h, t) => {
        addSel<LineEntity>(h, { ...entityDefaults(), type: 'LINE', handle: '', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as Entity);
        await runWith(h, 'MOCORO', inputs(t));
        const ls = model<LineEntity>(h, 'LINE');
        const e = ls.at(-1)!;
        // 회전한 선의 방향(복사(C)면 사본이 마지막) — 선이 하나뿐이고 돌지 않았으면 0
        return ls.length * 1000 + Math.atan2(e.end.y - e.start.y, e.end.x - e.start.x) / D;
      },
    );

  it('MOCORO 회전 모드의 회전 각도(못 읽으면 오류 없이 다시 묻고 Enter로 끝), 복사(C)는 키워드', async () => {
    // 기준점 → 회전(R) → 각도 → Enter(끝). 값 = 선 수 × 1000 + 마지막 선 방향(도)
    const one = await mocoro((t) => ['0,0', 'R', t, '']);
    expect(one).toEqual({ deg: [45, 45.5, 45, 0.7854 / D, 0].map((v) => expect.closeTo(1000 + v, 6)), err: SILENT });
    // 회전 모드에서 C는 키워드(복사 켬) → 사본(둘째 선)이 그 각으로 돈다. 못 읽는 글은 사본 없이 끝
    const copy = await mocoro((t) => ['0,0', 'R', 'C', t, '']);
    expect(copy).toEqual({ deg: [2045, 2045.5, 2045, 2000 + 0.7854 / D, 1000].map((v) => expect.closeTo(v, 6)), err: SILENT });
  });
});

describe('오류 뒤 다시 묻던 프롬프트', () => {
  it('MINSERT 회전(R)의 회전 각도: 단위 글자 꼴은 그 각, 못 읽는 글은 전처럼 오류 뒤 다시 묻는다', async () => {
    // 블록 이름 → R → 각도 → 삽입점 → X·Y 축척 Enter → 행·열 Enter(회전을 정했으면 회전을 다시 묻지 않는다)
    const got = await each(
      () => setup(registerUtil2BlockCommands, registerBlockCommands),
      async (h, t) => (await runWith(h, 'MINSERT', ['B1', 'R', t, '10,20', '', '', '', '']), insertRot(h)),
    );
    expect(got).toEqual({ deg: want(null), err: [0, 0, 0, 0, 1] });
  });

  it('INSERT 대화 상자에서 회전 「화면상에 지정」을 켠 회전 각도', async () => {
    const got = await each(
      () => setup(registerBlockCommands),
      async (h, t) => {
        void h.app.run('INSERT');
        await settle();
        const dlg = document.querySelector('.dialog') as HTMLElement;
        (dlg.querySelector('[aria-label="회전 화면상에 지정"]') as HTMLInputElement).checked = true;
        (dlg.querySelector('footer .btn.primary') as HTMLButtonElement).click();
        await settle();
        await type(h, ['10,10', t]);
        return insertRot(h);
      },
    );
    expect(got).toEqual({ deg: want(null), err: [0, 0, 0, 0, 1] });
  });

  it('DesignCenter 삽입(ADCADD) 회전(R)의 회전 각도', async () => {
    const got = await each(
      () => setup(registerDesignCenterCommands),
      async (h, t) => {
        void insertBlockFrom(h.app, h.doc, 'B1.dwg', 'B1');
        await settle();
        // R → 각도 → 삽입점(각을 못 읽으면 점은 각도 프롬프트가 거절)
        await type(h, ['R', t, '10,10']);
        return insertRot(h);
      },
    );
    expect(got).toEqual({ deg: want(null), err: [0, 0, 0, 0, 2] });
  });

  for (const [k, name] of [
    ['F', '첫 번째'],
    ['S', '두 번째'],
  ] as const) {
    it(`MLEADER 옵션 ${name} 각도 구속(앞 값 10도 — 못 읽으면 오류 뒤 다시, X도 수가 아니라 오류)`, async () => {
      const got = await each(
        () => setup(registerAnnotateCommands),
        async (h, t) => {
          const s = mleaderSession(h.doc);
          s.firstAngle = s.secondAngle = 10 * D;
          // 옵션(O) → F·S → 각도 → 옵션 종료(X)
          await runWith(h, 'MLEADER', ['O', k, t, 'X']);
          return (k === 'F' ? s.firstAngle : s.secondAngle) / D;
        },
      );
      expect(got).toEqual({ deg: want(10), err: [0, 0, 0, 0, 2] });
    });
  }

  const polar = (key: 'A' | 'F', seq: (t: string) => string[], inputs = INPUTS) =>
    each(
      () => setup(registerArrayCommands),
      async (h, t) => {
        setArrayAssociativity(true);
        addSel<LineEntity>(h, { ...entityDefaults(), type: 'LINE', handle: '', start: { x: 10, y: 0, z: 0 }, end: { x: 11, y: 0, z: 0 } } as Entity);
        // 중심점 → (기본 6개·360도 연관 배열) → 옵션 → 값 → 종료(X)
        await runWith(h, 'ARRAYPOLAR', ['0,0', key, ...seq(t), 'X']);
        const a = model<InsertEntity>(h, 'INSERT').at(-1);
        const p = a ? (readArray(h.doc, a)?.state.params as PolarParams | undefined) : undefined;
        return p ? (key === 'A' ? p.itemAngle : p.fillAngle) / D : null;
      },
      inputs,
    );

  it('ARRAYPOLAR 항목 사이의 각도(A — 앞 값 60도): 식이 먼저, 못 읽는 글은 전처럼 식 오류 뒤 다시', async () => {
    expect(await polar('A', (t) => [t])).toEqual({ deg: want(60), err: [0, 0, 0, 0, 2] });
  });

  it('ARRAYPOLAR 채울 각도(F — 앞 값 360도), 표현식(EX)은 키워드이고 식 프롬프트는 그대로', async () => {
    expect(await polar('F', (t) => [t])).toEqual({ deg: want(360), err: [0, 0, 0, 0, 2] });
    // 수 식(`45+45`)은 전처럼 식으로, EX 뒤 「표현식 입력:」은 식만(단위 글자 꼴은 전처럼 식 오류 — 채울 각도를 다시 묻고 X도 식 오류)
    expect(await polar('F', (t) => [t], ['45+45', 'r2d(pi)'])).toEqual({ deg: [90, 180].map((v) => expect.closeTo(v, 6)), err: [0, 0] });
    expect(await polar('F', (t) => ['EX', t], ['90', '50g'])).toEqual({ deg: [90, 360].map((v) => expect.closeTo(v, 6)), err: [0, 2] });
  });
});
