// @vitest-environment jsdom
/**
 * 206차: TEXT·MTEXT·INSERT가 현재 고도(ELEVATION)를 쓰는지.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서: TEXT의 10·11(첫째·둘째 정렬점, OCS)과 INSERT의 10(삽입점, OCS), MTEXT의 10(삽입점)은 따로 고도 칸이 없고 점의 30이 Z다
 * (DWG의 TEXT 고도 칸은 쓰기 코드가 삽입점 Z로 채운다).
 * 전에는 세 명령이 찍은 점의 Z를 늘 0으로 써서 고도가 있는 도면에서도 문자·블록 참조가 Z 0에 놓였다
 * (같은 앱의 POINT·LINE·PLINE·SOLID 등은 고도를 쓴다 — tests/drawmod/more 「ELEVATION은 Z」, solid-elev205).
 * 고도가 0인 도면, 프롬프트 흐름은 전과 같다. 입력이 Z를 준 점·UCS·−Z는 보지 않는다(205차와 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, MTextEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerTextCommands } from '../../src/app/textedit/commands';
import { registerBlockCommands } from '../../src/app/blocks';
import { activeEditor } from '../../src/app/textedit/editor';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

function setup(elevation?: number) {
  const h = makeApp();
  registerTextCommands(h.app);
  registerBlockCommands(h.app);
  // 시험의 가짜 글꼴로는 배치하지 못한다: 문자 범위만 대략(tests/annotedit/app과 같다)
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  // 블록 B1: 선 하나와 미리 설정(8) 속성 정의 N(블록 좌표 (1, 2, 0)) — INSERT가 속성 값을 묻지 않는다
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

async function run(h: H, name: string, inputs: string[], arg?: string): Promise<void> {
  void h.app.run(name, arg);
  await settle();
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

/** 열린 여러 줄 문자 편집기에 글을 넣고 Ctrl+Enter(tests/annotedit/app과 같다) */
async function typeAndClose(t: string): Promise<void> {
  const box = document.querySelector('.te-box') as HTMLElement;
  const span = box.querySelector('.te-r');
  if (span) span.firstChild!.nodeValue = t;
  else box.firstElementChild!.replaceChildren(document.createTextNode(t));
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  await settle();
}

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];

describe('TEXT·MTEXT·INSERT의 현재 고도(206차)', () => {
  it('TEXT: 고도 5에서 두 줄 모두 삽입점 Z = 5(전에는 0), 명령 취소 한 번이면 둘 다 없다', async () => {
    const h = setup(5);
    await run(h, 'TEXT', ['10,20', '3', '0', '첫 줄', '둘째 줄', '']);
    const t = model<TextEntity>(h.doc, 'TEXT');
    expect(t.map((e) => e.text)).toEqual(['첫 줄', '둘째 줄']);
    expect(xyz(t[0]!.insert)).toEqual([10, 20, 5]);
    expect(xyz(t[1]!.insert)).toEqual([10, +(20 - 3 * 1.667).toFixed(6), 5]);
    expect(t[0]!.alignPoint).toBeUndefined();
    h.st.session.undo();
    expect(model(h.doc, 'TEXT')).toHaveLength(0);
  });

  it('TEXT 중간 중심(MC): 삽입점·정렬점 모두 Z = 고도(−1.5)', async () => {
    const h = setup(-1.5);
    await run(h, 'TEXT', ['MC', '10,10', '3', '0', '가운데', '']);
    const [t] = model<TextEntity>(h.doc, 'TEXT');
    expect(t).toMatchObject({ text: '가운데', halign: 1, valign: 2 });
    expect(xyz(t!.insert)).toEqual([10, 10, -1.5]);
    expect(xyz(t!.alignPoint)).toEqual([10, 10, -1.5]);
  });

  it('MTEXT: 고도 −2.5에서 삽입점 Z = −2.5(맨 위 왼쪽 = 첫 구석), 명령 취소 한 번이면 없다', async () => {
    const h = setup(-2.5);
    await run(h, 'MTEXT', ['0,0', '40,-10']);
    expect(document.querySelector('.te-box')).toBeTruthy();
    await typeAndClose('여러 줄');
    const [m] = model<MTextEntity>(h.doc, 'MTEXT');
    expect(m!.text).toBe('여러 줄');
    expect(xyz(m!.insert)).toEqual([0, 0, -2.5]);
    h.st.session.undo();
    expect(model(h.doc, 'MTEXT')).toHaveLength(0);
  });

  it('INSERT(이름을 주어 대화 상자 없이): 고도 7에서 삽입점 Z = 7, 속성은 정의 자리 + 고도, 명령 취소 한 번이면 없다', async () => {
    const h = setup(7);
    await run(h, 'INSERT', ['10,20'], 'B1');
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins!.block).toBe('B1');
    expect(xyz(ins!.insert)).toEqual([10, 20, 7]);
    expect(ins!.attribs.map((a) => [a.tag, a.text, ...xyz(a.insert)!])).toEqual([['N', 'v', 11, 22, 7]]);
    h.st.session.undo();
    expect(model(h.doc, 'INSERT')).toHaveLength(0);
  });

  it('전과 같은 값: 고도가 없는 도면은 TEXT·MTEXT·INSERT 모두 Z = 0', async () => {
    const h = setup();
    await run(h, 'TEXT', ['5,5', '2', '0', '기본', '']);
    await run(h, 'MTEXT', ['0,0', '40,-10']);
    await typeAndClose('여러 줄');
    await run(h, 'INSERT', ['10,20'], 'B1');
    expect(xyz(model<TextEntity>(h.doc, 'TEXT')[0]!.insert)).toEqual([5, 5, 0]);
    expect(xyz(model<MTextEntity>(h.doc, 'MTEXT')[0]!.insert)).toEqual([0, 0, 0]);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(xyz(ins!.insert)).toEqual([10, 20, 0]);
    expect(xyz(ins!.attribs[0]!.insert)).toEqual([11, 22, 0]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(TEXT 고도 칸·정렬점, MTEXT·INSERT·속성 삽입점)', async () => {
    const h = setup(4);
    await run(h, 'TEXT', ['MC', '10,10', '3', '0', '가운데', '']);
    await run(h, 'MTEXT', ['0,0', '40,-10']);
    await typeAndClose('여러 줄');
    await run(h, 'INSERT', ['10,20'], 'B1');
    const pick = (doc: CadDocument) => {
      const [t] = model<TextEntity>(doc, 'TEXT');
      const [m] = model<MTextEntity>(doc, 'MTEXT');
      const [i] = model<InsertEntity>(doc, 'INSERT');
      return { text: xyz(t!.insert), align: xyz(t!.alignPoint), mtext: xyz(m!.insert), insert: xyz(i!.insert), attrib: xyz(i!.attribs[0]!.insert) };
    };
    const want = { text: [10, 10, 4], align: [10, 10, 4], mtext: [0, 0, 4], insert: [10, 20, 4], attrib: [11, 22, 4] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
