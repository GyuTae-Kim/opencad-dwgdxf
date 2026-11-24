// @vitest-environment jsdom
/**
 * 209차: Express BREAKLINE·COUNTTABLE(COUNT 「표 삽입」과 같은 함수)·DATAEXTRACTION 표·WIPEOUT(점 지정)이 현재 고도(ELEVATION)를 쓰는지 —
 * 205~208차(SOLID·TEXT·MTEXT·INSERT·-INSERT·MINSERT·ATTDEF·TABLE·TOLERANCE·REVCLOUD)의 다음.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서: LWPOLYLINE은 꼭짓점이 X·Y뿐이고 고도는 38 하나, ACAD_TABLE의 10(블록 참조 부분)은 삽입점,
 * WIPEOUT은 10 삽입점(WCS)·11 U 벡터·12 V 벡터이고 고도(38)·돌출(210) 칸이 없다 — Z는 삽입점의 30뿐이다.
 * 전에는 네 명령이 찍은 점의 Z(끊기선은 폴리선 고도)를 늘 0으로 써서, 고도가 있는 도면에서 PLINE·TABLE(208차)과 다른 높이에 놓였다.
 * 고도가 0인 도면, 프롬프트 흐름, 끊기선 꼭짓점의 X·Y, 표 내용, 가리기의 U·V 벡터는 전과 같다.
 * WIPEOUT 폴리선(P) 갈래는 이미 원본 폴리선의 Z를 따르므로 바꾸지 않는다. 입력이 Z를 준 점·UCS·−Z는 보지 않는다(205~208차와 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, ImageEntity, InsertEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerCountCommands } from '../../src/app/count';
import { registerDataExtractCommands } from '../../src/app/dataextract';
import { registerExpressDrawCommands } from '../../src/app/express-draw';
import { registerModify2Commands } from '../../src/app/modify2';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

function setup(elevation?: number) {
  const h = makeApp();
  registerExpressDrawCommands(h.app);
  registerCountCommands(h.app);
  registerDataExtractCommands(h.app);
  registerModify2Commands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  return h;
}

type H = ReturnType<typeof setup>;

/** 블록 B1(선 하나)과 그 참조 하나((50, 50, 0))를 모형 공간에 둔다 — COUNTTABLE·DATAEXTRACTION이 셀 블록 참조 */
function seedBlock(h: H): void {
  const s = h.st.session;
  const line = { ...entityDefaults(), type: 'LINE', handle: s.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } } as Entity;
  h.doc.blocks.set('B1', { name: 'B1', handle: s.newHandle(), recordHandle: s.newHandle(), basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [line] });
  const ref: InsertEntity = {
    ...entityDefaults(),
    type: 'INSERT',
    handle: s.newHandle(),
    owner: h.doc.blocks.get(MODEL_SPACE)?.recordHandle,
    block: 'B1',
    insert: { x: 50, y: 50, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: [],
  };
  s.commit({ label: 'seed', ops: [{ kind: 'add', block: h.st.space, entity: ref }] });
}

async function run(h: H, name: string, inputs: string[]): Promise<void> {
  void h.app.run(name);
  await settle();
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

const dlg = () => document.querySelector('.dialog') as HTMLElement | null;

/** DATAEXTRACTION: 대화 상자 기본값(지금 공간·블록만·표 삽입) 그대로 확인 → 테이블 삽입점 */
async function dataextract(h: H, at: string): Promise<void> {
  void h.app.run('DATAEXTRACTION');
  await vi.waitFor(() => expect(dlg()?.querySelector('[aria-label="출력"]')).not.toBeNull());
  (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
  await settle();
  h.app.submitInput(at);
  await settle();
}

const model = <T extends Entity>(doc: CadDocument, ...types: string[]) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => types.includes(e.type)) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];
/** 표(AC1015에 쓰면 익명 블록 참조로 돌아온다) — 심어 둔 B1 참조는 뺀다. X 순서로 */
const tables = (doc: CadDocument) =>
  model<Entity & { insert: { x: number; y: number; z: number }; block: string }>(doc, 'ACAD_TABLE', 'INSERT')
    .filter((e) => e.type === 'ACAD_TABLE' || e.block.toUpperCase() !== 'B1')
    .map((e) => xyz(e.insert)!)
    .sort((a, b) => a[0]! - b[0]!);
const breaklines = (doc: CadDocument) => model<LwPolylineEntity>(doc, 'LWPOLYLINE');
const wipeouts = (doc: CadDocument) => model<ImageEntity>(doc, 'WIPEOUT');
const verts = (e: LwPolylineEntity) => lwVertices(e).map((v) => [+v.x.toFixed(9), +v.y.toFixed(9), +v.bulge.toFixed(9)]);

describe('BREAKLINE·COUNTTABLE·DATAEXTRACTION·WIPEOUT의 현재 고도(209차)', () => {
  it('BREAKLINE: 고도 2.5에서 끊기선 폴리선 고도 = 2.5(전에는 0), 꼭짓점 X·Y는 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(2.5);
    // 기본 크기 1·확장 1, 두 점 (0, 0)·(10, 0), 기호 위치 Enter(중간점)
    await run(h, 'BREAKLINE', ['0,0', '10,0', '']);
    const [b] = breaklines(h.doc);
    expect(b!.elevation).toBe(2.5);
    // 확장 1만큼 밖으로, 가운데 5에 지그재그(선 방향 1, 위아래 0.5씩)
    expect(verts(b!)).toEqual([
      [-1, 0, 0],
      [4.5, 0, 0],
      [4.75, 0.5, 0],
      [5.25, -0.5, 0],
      [5.5, 0, 0],
      [11, 0, 0],
    ]);
    expect(h.st.session.undoTop()?.label).toBe('BREAKLINE');
    h.st.session.undo();
    expect(breaklines(h.doc)).toHaveLength(0);
  });

  it('COUNTTABLE: 고도 −1.5에서 개수 표 삽입점 (10, 20, −1.5)(전에는 Z 0), 명령 취소 한 번이면 표만 없다', async () => {
    const h = setup(-1.5);
    seedBlock(h);
    // 객체 선택 Enter = 지금 공간 전체 → 테이블 삽입점
    await run(h, 'COUNTTABLE', ['', '10,20']);
    expect(tables(h.doc)).toEqual([[10, 20, -1.5]]);
    expect(h.st.session.undoTop()?.label).toBe('COUNTTABLE');
    h.st.session.undo();
    expect(tables(h.doc)).toHaveLength(0);
    expect(model(h.doc, 'INSERT')).toHaveLength(1);
  });

  it('DATAEXTRACTION: 고도 6에서 데이터 추출 표 삽입점 (30, 40, 6)(전에는 Z 0), 명령 취소 한 번이면 없다', async () => {
    const h = setup(6);
    seedBlock(h);
    await dataextract(h, '30,40');
    expect(tables(h.doc)).toEqual([[30, 40, 6]]);
    expect(h.st.session.undoTop()?.label).toBe('DATAEXTRACTION');
    h.st.session.undo();
    expect(tables(h.doc)).toHaveLength(0);
  });

  it('WIPEOUT 점 지정: 고도 −2에서 삽입점 (0, 0, −2)(전에는 Z 0), U·V 벡터는 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(-2);
    await run(h, 'WIPEOUT', ['0,0', '10,0', '10,5', '']);
    const [w] = wipeouts(h.doc);
    expect(xyz(w!.insert)).toEqual([0, 0, -2]);
    expect(w!.uVector).toEqual({ x: 10, y: 0, z: 0 });
    expect(w!.vVector).toEqual({ x: 0, y: 5, z: 0 });
    expect(h.st.session.undoTop()?.label).toBe('WIPEOUT');
    h.st.session.undo();
    expect(wipeouts(h.doc)).toHaveLength(0);
  });

  it('전과 같은 값: 고도가 없는 도면의 BREAKLINE·COUNTTABLE·DATAEXTRACTION·WIPEOUT은 Z(고도) 0', async () => {
    const h = setup();
    seedBlock(h);
    await run(h, 'BREAKLINE', ['0,0', '10,0', '']);
    await run(h, 'COUNTTABLE', ['', '10,20']);
    await dataextract(h, '30,40');
    await run(h, 'WIPEOUT', ['0,0', '10,0', '10,5', '']);
    expect(breaklines(h.doc)[0]!.elevation).toBe(0);
    expect(tables(h.doc)).toEqual([
      [10, 20, 0],
      [30, 40, 0],
    ]);
    expect(xyz(wipeouts(h.doc)[0]!.insert)).toEqual([0, 0, 0]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(끊기선 고도 38, 두 표 삽입점, 가리기 삽입점 30)', async () => {
    const h = setup(4);
    seedBlock(h);
    await run(h, 'BREAKLINE', ['0,0', '10,0', '']);
    await run(h, 'COUNTTABLE', ['', '10,20']);
    await dataextract(h, '30,40');
    await run(h, 'WIPEOUT', ['0,0', '10,0', '10,5', '']);
    const pick = (doc: CadDocument) => {
      const [b] = breaklines(doc);
      const [w] = wipeouts(doc);
      return {
        breakline: [b?.elevation, b ? lwVertices(b).length : 0],
        tables: tables(doc),
        wipeout: [xyz(w?.insert), xyz(w?.uVector), xyz(w?.vVector)],
      };
    };
    const want = {
      breakline: [4, 6],
      tables: [
        [10, 20, 4],
        [30, 40, 4],
      ],
      wipeout: [
        [0, 0, 4],
        [10, 0, 0],
        [0, 5, 0],
      ],
    };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
