// @vitest-environment jsdom
/**
 * 227차: askReal(parseReal — 수 정규식 + Number)로 각(도)을 읽던 프롬프트가 단위 글자 꼴을 거절하던 것(ROADMAP 「226차에 보고 두 것」).
 * - 고치기 전: `45d30'`·`50g`·`0.7854r`을 parseReal이 못 읽어 「숫자 값이 필요합니다.」 뒤 다시 물었다(-STYLE 기울기, -ARRAY 채울 각도·항목 사이 각도,
 *   XATTACH 회전(R)·명령행 판 삽입 뒤 회전, PDFATTACH 명령행 판 회전, TINSERT 명령행 판 회전). 조용히 다른 값을 쓰는 갈래는 없다.
 * - Autodesk 도움말 "About Unit Format Conventions": 각도는 현재 단위와 상관없이 도/분/초·그라드·라디안 꼴로도 넣는다 → parseReal이 읽는 글은 그 값 그대로
 *   (같은 parseReal — 식·16진·피트-인치는 전처럼 못 읽음), 못 읽은 글이 단위 글자 꼴(core/units parseUnitAngle — 224차)이면 그 각(도).
 * - 수(`45`)·식(`45+45`)·못 읽는 글(`45x`)·Enter·XATTACH 축척(S)·회전(R) 키워드와 -STYLE 기울기 범위(−85~85, 도로 잰 검사)는 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app/app';
import type { BlockDef, CadDocument, Entity, InsertEntity, LineEntity, UnderlayEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { numberAngleDegrees } from '../../src/core/units';
import { parseReal, parseRealAngle } from '../../src/app/dashcmds-ask';
import { registerDashTableCommands } from '../../src/app/dashcmds-tables';
import { registerDashArrayCommand } from '../../src/app/dashcmds-array';
import { registerBlkXrefCommands } from '../../src/app/blkcmds-xref';
import { registerBlkMiscCommands } from '../../src/app/blkcmds-misc';
import { scriptVars } from '../../src/app/script';
import { cellRect, createTable } from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { addTableOps, saveTableStyleOps } from '../../src/edit/table/ops';
import { type RealApp, makeApp, settle } from '../polish/real-app';

/** 다음 파일 고르기가 돌려줄 파일과, 외부 참조로 열 도면(210차 attach-field-elev210 시험과 같은 가짜) */
const picked = vi.hoisted(() => ({ file: null as File | null, xdoc: null as CadDocument | null }));

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/blkcmds-io', async (orig) => ({ ...(await orig<object>()), pickOneFile: async () => picked.file }));
vi.mock('../../src/app/refs', async (orig) => {
  const o = await orig<typeof import('../../src/app/refs')>();
  return {
    ...o,
    linkXrefFiles: async (_app: unknown, files: File[]) => files.map((f) => f.name),
    // XATTACH는 연결한 파일을 블록 이름 '?'의 시험 문서로 찾는다(blkcmds-xref linkedXref)
    xrefOfDoc: (doc: CadDocument, key: string) => (key === '?' ? { name: picked.file?.name ?? '', docId: 0, doc: picked.xdoc, scene: { bounds: null }, layers: [] } : o.xrefOfDoc(doc, key)),
    expandXrefBounds: () => {},
    linkPdfFiles: async (_app: unknown, files: File[]) => ({ linked: files.map((f) => f.name), failed: [] }),
    renderPdfPages: async () => ({ rendered: 0, failed: [] }),
  };
});
// 한 쪽짜리 레터 용지(쪽이 하나라 명령행 판은 페이지 번호를 묻지 않는다)
vi.mock('../../src/app/pdfraster', () => ({
  openPdf: async () => ({ pdf: { numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 612, height: 792 }) }) }, close: async () => {} }),
  rasterPage: async () => null,
}));

afterEach(() => {
  scriptVars.CMDDIA = 1;
  document.body.replaceChildren();
});

const D = Math.PI / 180;
/** 프롬프트마다 넣는 여섯 글: 수·식(그대로)·도/분/초·그라드·라디안(바뀜)·못 읽는 글(그대로) */
const INPUTS = ['45', '45+45', `45d30'`, '50g', '0.7854r', '45x'];
/** 고친 뒤 각(도): 식·못 읽는 글은 전과 같은 prev(거절 뒤 남은 값 — 만든 것이 없으면 null), 단위 글자 꼴은 그 각 */
const want = (prev: number | null) => [45, prev, 45.5, 45, 0.7854 / D, prev].map((v) => (v === null ? null : expect.closeTo(v, 6)));
/** 오류 줄 수: 식·못 읽는 글만 e(전과 같은 거절), 단위 글자 꼴은 0 */
const rejects = (e: number) => [0, e, 0, 0, 0, e];

/** 블록 B1(정의 기준점 0,0,0 — 선 하나, 속성 없음) */
function addBlock(doc: CadDocument): void {
  const line = { ...entityDefaults(), type: 'LINE', handle: '9015', owner: '9013', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 2, z: 0 } } as Entity;
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
function addSel(h: RealApp, e: Entity): void {
  const ent = { ...e, handle: h.st.session.newHandle(), owner: h.doc.blocks.get(MODEL_SPACE)!.recordHandle } as Entity;
  h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: ent }] });
  h.st.selection.add(ent.handle);
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

describe('dashcmds-ask parseRealAngle(askReal로 각을 읽던 프롬프트의 글 → 도)', () => {
  it('parseReal이 읽는 글은 그 값 그대로, 못 읽은 글만 단위 글자 꼴을 그 단위로, 그 밖은 null(식·16진·피트-인치는 전처럼 못 읽음)', () => {
    // parseReal 그대로(같은 호출 — 부호·지수 표기·0)
    const num = ['45', ' 15 ', '1e1', '1E+01', '-45', '+45', '.5', '0', '360'];
    expect(num.map((t) => parseRealAngle(t))).toEqual(num.map((t) => parseReal(t)));
    // 단위 글자 꼴(도/분/초·도 글자·그라드·라디안, 빈칸)
    expect([`45d30'`, '50g', '0.7854r', '45°', '-30d', '100G', ` 45d 30' `, `45d30'36"`].map((t) => parseRealAngle(t))).toEqual(
      [45.5, 45, 0.7854 / D, 45, -30, 90, 45.5, 45 + 30 / 60 + 36 / 3600].map((v) => expect.closeTo(v, 9)),
    );
    // 못 읽는 글은 전처럼 null(식·앞 수만 있는 글·분의 작은따옴표 없음·지수 뒤 d·키워드 글자·빈 글·16진·무한대·피트-인치)
    for (const t of ['45+45', '45x', '45d30', '1e1d', 'abc', 'R', '', '0x1d', 'Infinity', 'd45', `1'2"`]) expect(parseRealAngle(t), t).toBeNull();
    // Number로 읽는 226차 도우미와 다른 곳: parseReal이 못 읽는 16진·빈 글은 이 프롬프트에서 전처럼 못 읽는다
    expect([numberAngleDegrees('0x1d'), parseRealAngle('0x1d'), numberAngleDegrees(''), parseRealAngle('')]).toEqual([29, null, 0, null]);
  });
});

describe('askReal로 각을 읽던 프롬프트(못 읽으면 「숫자 값이 필요합니다.」 뒤 다시)', () => {
  /** -STYLE 새 스타일 S1(기본 기울기 0) — 이름 → 글꼴·높이·폭 비율 Enter → 기울기 → 반대로·거꾸로·수직 Enter */
  const obliqueOf = (h: RealApp) => {
    const s = h.doc.textStyles.get(tableKey('S1'));
    return s ? s.oblique / D : null;
  };

  it('-STYLE 기울기 각도(거절되면 Enter가 기본 0을 받고 수직 물음에서 멈춰 스타일이 없다)', async () => {
    const got = await each(
      () => setup(registerDashTableCommands),
      async (h, t) => (await runWith(h, '-STYLE', ['S1', '', '', '', t, '', '', '']), obliqueOf(h)),
    );
    expect(got).toEqual({ deg: want(null), err: rejects(1) });
  });

  it('-STYLE 기울기 범위(−85~85)는 도로 바꾼 뒤 그대로 검사: `100g`(90도)는 범위 오류 뒤 다시, `-30d`는 −30도', async () => {
    const h = setup(registerDashTableCommands);
    await runWith(h, '-STYLE', ['S1', '', '', '', '100g', '', '', '', '']);
    expect([obliqueOf(h), errs(h)]).toEqual([0, ['-85에서 85 사이의 각도가 필요합니다.']]);
    const h2 = setup(registerDashTableCommands);
    await runWith(h2, '-STYLE', ['S1', '', '', '', '-30d', '', '', '']);
    expect([obliqueOf(h2), errs(h2)]).toEqual([expect.closeTo(-30, 9), []]);
  });

  /** -ARRAY 원형: 선 (10,0)–(11,0)을 중심 0,0으로 — 사본 시작점의 방향(도), 사본이 없으면 null */
  const dashPolar = (seq: (t: string) => string[]) =>
    each(
      () => setup(registerDashArrayCommand),
      async (h, t) => {
        addSel(h, { ...entityDefaults(), type: 'LINE', handle: '', start: { x: 10, y: 0, z: 0 }, end: { x: 11, y: 0, z: 0 } } as Entity);
        await runWith(h, '-ARRAY', seq(t));
        const ls = model<LineEntity>(h, 'LINE');
        return ls.length < 2 ? null : Math.atan2(ls.at(-1)!.start.y, ls.at(-1)!.start.x) / D;
      },
    );

  it('-ARRAY 원형 채울 각도(항목 2개 — 사본이 그 각, 거절되면 Enter가 360을 받고 회전 물음에서 멈춘다)', async () => {
    // 유형 P → 중심점 → 항목 수 2 → 채울 각도 → 회전 Enter(예)
    expect(await dashPolar((t) => ['P', '0,0', '2', t, ''])).toEqual({ deg: want(null), err: rejects(1) });
  });

  it('-ARRAY 원형 항목 사이의 각도(채울 각도 0 — 거절되면 Enter도 기본값이 없어 다시 묻는다)', async () => {
    // 유형 P → 중심점 → 항목 수 2 → 채울 각도 0 → 항목 사이 각도 → 회전 Enter(예)
    expect(await dashPolar((t) => ['P', '0,0', '2', '0', t, ''])).toEqual({ deg: want(null), err: rejects(2) });
  });

  /** 외부 참조·PDF·표 셀 명령은 명령행 판(CMDDIA 0 — 스크립트와 같은 길)으로 */
  const xattach = (seq: (t: string) => string[]) =>
    each(
      () => setup(registerBlkXrefCommands),
      async (h, t) => {
        scriptVars.CMDDIA = 0;
        picked.file = { name: 'site.dxf', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
        picked.xdoc = createNewDocument('metric');
        await runWith(h, 'XATTACH', seq(t));
        return insertRot(h);
      },
    );

  it('XATTACH 삽입점 프롬프트의 회전(R) 회전 각도(삽입 뒤 회전은 Enter로 그 값 — 거절되면 점도 오류, Enter 0, 삽입점 Enter로 끝)', async () => {
    // R → 각도 → 삽입점 → X 축척 Enter → 회전 Enter(R로 준 값)
    expect(await xattach((t) => ['R', t, '10,20', '', ''])).toEqual({ deg: want(null), err: rejects(2) });
  });

  it('XATTACH 명령행 판 삽입 뒤 회전 각도', async () => {
    // 삽입점 → X 축척 Enter → 회전
    expect(await xattach((t) => ['10,20', '', t])).toEqual({ deg: want(null), err: rejects(1) });
  });

  it('XATTACH 축척(S)·회전(R) 키워드는 그대로: S 2 → R `45d30\'` → 삽입점이면 축척 2·회전 45.5도', async () => {
    const h = setup(registerBlkXrefCommands);
    scriptVars.CMDDIA = 0;
    picked.file = { name: 'site.dxf', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
    picked.xdoc = createNewDocument('metric');
    await runWith(h, 'XATTACH', ['S', '2', 'R', `45d30'`, '10,20', '', '']);
    const x = model<InsertEntity>(h, 'INSERT').at(-1);
    expect([x?.scale.x, x && x.rotation / D, errs(h)]).toEqual([2, expect.closeTo(45.5, 9), []]);
  });

  it('PDFATTACH 명령행 판 회전 지정', async () => {
    const got = await each(
      () => setup(registerBlkXrefCommands),
      async (h, t) => {
        scriptVars.CMDDIA = 0;
        picked.file = { name: 'plan.pdf', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
        // 삽입점 → 축척 Enter → 회전
        await runWith(h, 'PDFATTACH', ['10,20', '', t]);
        const u = model<UnderlayEntity>(h, 'PDFUNDERLAY').at(-1);
        return u ? u.rotation / D : null;
      },
    );
    expect(got).toEqual({ deg: want(null), err: rejects(1) });
  });

  it('TINSERT 명령행 판 회전 각도(표 각 0에 더함)', async () => {
    const got = await each(
      () => setup(registerBlkMiscCommands),
      async (h, t) => {
        scriptVars.CMDDIA = 0;
        // 2열 표(제목·머리글·자료 1행), 삽입점 (10, 100)
        const nh = () => h.st.session.newHandle();
        const ts = defaultTableStyle(true, '셀표');
        const saved = saveTableStyleOps(h.doc, nh, ts);
        h.st.session.commit({ label: 'TABLESTYLE', ops: saved.ops });
        const data = createTable({ cols: 2, colWidth: 40, dataRows: 1, rowLines: 1, first: 'title', second: 'header' }, ts);
        const added = addTableOps(h.doc, nh, { space: MODEL_SPACE, data, style: ts, styleHandle: saved.handle, insert: { x: 10, y: 100, z: 0 }, props: { ...entityDefaults() } });
        h.st.session.commit({ label: 'TABLE', ops: added.ops });
        const handle = added.table.handle;
        // 고르기는 늘 그 표(셀 안을 누른 점이 셀을 정한다)
        (h.app as unknown as { picker: () => unknown }).picker = () => ({ pick: () => handle, pickAll: () => [handle], geometry: () => ({ segs: [] }) });
        void h.app.run('TINSERT');
        await settle();
        // 자료 행(2)의 첫 셀 가운데를 누른다
        const q = cellRect(data, 2, 0, ts.flow);
        const p = { x: 10 + (q.x0 + q.x1) / 2, y: 100 + (q.y0 + q.y1) / 2 };
        h.view.events.click!(p, p, { pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent);
        await settle();
        // 블록 이름 B1 → 셀에 맞춰 자동 축척 Enter(예) → 회전
        await type(h, ['B1', '', t]);
        return insertRot(h);
      },
    );
    expect(got).toEqual({ deg: want(null), err: rejects(1) });
  });
});
