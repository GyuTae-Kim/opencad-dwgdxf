// @vitest-environment jsdom
/**
 * 207차: -INSERT·MINSERT·ATTDEF(화면상에 지정)가 현재 고도(ELEVATION)를 쓰는지 — 206차 TEXT·MTEXT·INSERT의 다음.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서: INSERT(MINSERT도 같은 개체 — 70·71 행·열)의 10은 삽입점(OCS), ATTDEF의 10·11은 시작점·맞춤점(OCS)이고 따로 고도 칸이 없다
 * (DWG의 ATTDEF 고도 칸은 쓰기 코드가 삽입점 Z로 채운다).
 * 전에는 세 명령이 찍은 점의 Z를 늘 0으로 써서 고도가 있는 도면에서 INSERT(206차)로 넣은 블록과 -INSERT·MINSERT로 넣은 블록의 Z가 달랐다.
 * -INSERT 기준점(B)은 X·Y만 옮긴다(도움말이 기준점의 Z를 적지 않음 — 정의 기준점의 Z가 삽입점에 오는 것은 INSERT와 같다).
 * 고도가 0인 도면, 프롬프트 흐름, ATTDEF 대화 상자의 X·Y·Z 칸은 전과 같다. 입력이 Z를 준 점·UCS·−Z는 보지 않는다(205·206차와 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerDashInsertCommands } from '../../src/app/dashcmds-insert';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
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
  registerUtil2BlockCommands(h.app);
  registerDashInsertCommands(h.app);
  registerBlockCommands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  // 블록 B1: 선 하나와 미리 설정(8) 속성 정의 N(블록 좌표 (1, 2, 0)) — 세 명령 모두 속성 값을 묻지 않는다(206차 시험과 같은 블록)
  const s = h.st.session;
  const line = { ...entityDefaults(), type: 'LINE', handle: s.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } } as Entity;
  const att: AttribEntity = {
    ...entityDefaults(),
    type: 'ATTDEF',
    handle: s.newHandle(),
    insert: { x: 1, y: 2, z: 0 },
    height: 1,
    text: 'v',
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
    tag: 'N',
    prompt: 'N?',
    attFlags: 8,
  };
  h.doc.blocks.set('B1', { name: 'B1', handle: s.newHandle(), recordHandle: s.newHandle(), basePoint: { x: 0, y: 0, z: 0 }, flags: 2, entities: [line, att as Entity] });
  return h;
}

type H = ReturnType<typeof setup>;

async function run(h: H, name: string, inputs: string[]): Promise<void> {
  void h.app.run(name);
  await settle();
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

const dlg = () => document.querySelector('.dialog') as HTMLElement | null;
const field = <T extends HTMLElement = HTMLInputElement>(aria: string) => dlg()!.querySelector(`[aria-label="${aria}"]`) as T;

/** ATTDEF: 대화 상자에 태그(와 자리맞추기·X·Y·Z 칸)를 넣고 확인한 뒤 화면 점을 준다 */
async function attdef(h: H, o: { tag: string; just?: string; at?: [number, number, number]; points?: string[] }): Promise<void> {
  void h.app.run('ATTDEF');
  await vi.waitFor(() => expect(dlg()?.getAttribute('aria-label')).toBe('속성 정의'));
  field('태그').value = o.tag;
  if (o.just) field<HTMLSelectElement>('자리맞추기').value = o.just;
  if (o.at) {
    const on = field('화면상에 지정');
    on.checked = false;
    on.dispatchEvent(new Event('change'));
    field('X').value = String(o.at[0]);
    field('Y').value = String(o.at[1]);
    field('Z').value = String(o.at[2]);
  }
  (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
  await settle();
  for (const t of o.points ?? []) {
    h.app.submitInput(t);
    await settle();
  }
}

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];

describe('-INSERT·MINSERT·ATTDEF의 현재 고도(207차)', () => {
  it('-INSERT: 고도 7에서 삽입점 Z = 7(전에는 0), 속성은 정의 자리 + 고도, 명령 취소 한 번이면 없다', async () => {
    const h = setup(7);
    await run(h, '-INSERT', ['B1', '10,20', '', '', '']);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins!.block).toBe('B1');
    expect(xyz(ins!.insert)).toEqual([10, 20, 7]);
    expect(ins!.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(ins!.attribs.map((a) => [a.tag, a.text, ...xyz(a.insert)!])).toEqual([['N', 'v', 11, 22, 7]]);
    h.st.session.undo();
    expect(model(h.doc, 'INSERT')).toHaveLength(0);
  });

  it('-INSERT 기준점(B): X·Y만 옮기고 삽입점 Z = 고도(3)', async () => {
    const h = setup(3);
    await run(h, '-INSERT', ['B1', 'B', '1,2', '10,20', '', '', '']);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    // 블록 점 (1, 2)가 찍은 점 (10, 20)에 온다: 삽입점(정의 기준점 자리) = (9, 18)
    expect(xyz(ins!.insert)).toEqual([9, 18, 3]);
    expect(xyz(ins!.attribs[0]!.insert)).toEqual([10, 20, 3]);
  });

  it('MINSERT: 고도 −2에서 삽입점 Z = −2, 행·열·간격은 그대로, 속성도 고도, 명령 취소 한 번이면 없다', async () => {
    const h = setup(-2);
    await run(h, 'MINSERT', ['B1', '10,20', '', '', '', '2', '3', '5', '4']);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ block: 'B1', rowCount: 2, columnCount: 3, rowSpacing: 5, columnSpacing: 4, scale: { x: 1, y: 1, z: 1 } });
    expect(xyz(ins!.insert)).toEqual([10, 20, -2]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 11, 22, -2]]);
    h.st.session.undo();
    expect(model(h.doc, 'INSERT')).toHaveLength(0);
  });

  it('ATTDEF 화면상에 지정: 고도 5의 왼쪽 시작점 Z = 5(맞춤점 없음), 명령 취소 한 번이면 없다', async () => {
    const h = setup(5);
    await attdef(h, { tag: 't1', points: ['10,20'] });
    const [a] = model<AttribEntity>(h.doc, 'ATTDEF');
    expect(a).toMatchObject({ tag: 'T1', halign: 0, valign: 0 });
    expect(xyz(a!.insert)).toEqual([10, 20, 5]);
    expect(a!.alignPoint).toBeUndefined();
    h.st.session.undo();
    expect(model(h.doc, 'ATTDEF')).toHaveLength(0);
  });

  it('ATTDEF 정렬(A): 고도 −1.5에서 첫째·둘째 끝점 모두 Z = −1.5', async () => {
    const h = setup(-1.5);
    await attdef(h, { tag: 'a', just: 'A', points: ['0,0', '10,0'] });
    const [a] = model<AttribEntity>(h.doc, 'ATTDEF');
    expect(a).toMatchObject({ tag: 'A', halign: 3 });
    expect(xyz(a!.insert)).toEqual([0, 0, -1.5]);
    expect(xyz(a!.alignPoint)).toEqual([10, 0, -1.5]);
  });

  it('전과 같은 값: 고도가 없는 도면의 -INSERT·MINSERT·ATTDEF는 Z = 0, 대화 상자 X·Y·Z 칸은 고도가 있어도 준 값', async () => {
    const h = setup();
    await run(h, '-INSERT', ['B1', '10,20', '', '', '']);
    await run(h, 'MINSERT', ['B1', '30,40', '', '', '', '', '']);
    await attdef(h, { tag: 'z0', points: ['5,5'] });
    const [one, many] = model<InsertEntity>(h.doc, 'INSERT');
    expect(xyz(one!.insert)).toEqual([10, 20, 0]);
    expect(xyz(one!.attribs[0]!.insert)).toEqual([11, 22, 0]);
    expect(xyz(many!.insert)).toEqual([30, 40, 0]);
    expect(xyz(model<AttribEntity>(h.doc, 'ATTDEF')[0]!.insert)).toEqual([5, 5, 0]);
    const g = setup(5);
    await attdef(g, { tag: 'typed', at: [1, 2, -3] });
    expect(xyz(model<AttribEntity>(g.doc, 'ATTDEF')[0]!.insert)).toEqual([1, 2, -3]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(-INSERT·MINSERT·속성 삽입점, ATTDEF 시작점·맞춤점)', async () => {
    const h = setup(4);
    await run(h, '-INSERT', ['B1', '10,20', '', '', '']);
    await run(h, 'MINSERT', ['B1', '30,40', '', '', '', '2', '3', '5', '4']);
    await attdef(h, { tag: 'mc', just: 'MC', points: ['10,10'] });
    const pick = (doc: CadDocument) => {
      const ins = model<InsertEntity>(doc, 'INSERT');
      const one = ins.find((e) => e.rowCount === 1)!;
      const many = ins.find((e) => e.rowCount === 2)!;
      const [a] = model<AttribEntity>(doc, 'ATTDEF');
      return {
        insert: xyz(one.insert),
        attrib: xyz(one.attribs[0]!.insert),
        minsert: [...xyz(many.insert)!, many.columnCount, many.rowSpacing, many.columnSpacing],
        mattrib: xyz(many.attribs[0]!.insert),
        attdef: xyz(a!.insert),
        align: xyz(a!.alignPoint),
      };
    };
    const want = { insert: [10, 20, 4], attrib: [11, 22, 4], minsert: [30, 40, 4, 3, 5, 4], mattrib: [31, 42, 4], attdef: [10, 10, 4], align: [10, 10, 4] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
