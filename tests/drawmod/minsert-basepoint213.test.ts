// @vitest-environment jsdom
/**
 * 213차: MINSERT의 기준점(B) 옵션. Autodesk MINSERT 도움말은 삽입점 프롬프트에서 미리 정할 수 있는 옵션으로 기준점·축척·X·Y·Z·회전을 적고,
 * 기준점은 블록을 지금 자리에 잠시 두고 끌어 놓을 새 기준점을 고르게 한다(블록 정의의 기준점은 바뀌지 않는다) — -INSERT 도움말과 같은 글이다.
 * 전에는 MINSERT가 축척(S)·회전(R)만 받아 B를 「점이 올바르지 않습니다.」로 거절했다(B는 BLOCK 별칭이지만 투명 명령이 아니다).
 * 규칙은 -INSERT 기준점(207차 `insertPointFor`)과 같다: 받은 점을 블록 정의 좌표로 보고 X·Y만 옮기며, 삽입점 Z는 현재 고도다.
 * B를 쓰지 않거나 기준점 프롬프트에서 Enter면 정의 기준점 그대로라 삽입점 = 찍은 점(전과 같다). X·Y·Z 옵션은 이번에 넣지 않았다(ROADMAP).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerBlockCommands } from '../../src/app/blocks';
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
  registerBlockCommands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  // 블록 B1(정의 기준점 0,0,0): 선 하나와 미리 설정(8) 속성 정의 N(블록 좌표 (1, 2, 0)) — 속성 값을 묻지 않는다(207차 시험과 같은 블록)
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

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];
const rejected = (h: H) => h.out().filter((l) => l.includes('점이 올바르지 않습니다'));

describe('MINSERT 기준점(B)(213차)', () => {
  it('고도 3에서 블록 점 (1, 2)를 찍은 점 (10, 20)에: 삽입점 (9, 18, 3)·속성 (10, 20, 3), B를 거절하지 않고, 명령 취소 한 번이면 없다', async () => {
    const h = setup(3);
    // 블록 이름, B, 기준점, 삽입점, X 축척 Enter, Y 축척 Enter, 회전 Enter, 행 Enter, 열 Enter
    await run(h, 'MINSERT', ['B1', 'B', '1,2', '10,20', '', '', '', '', '']);
    expect(rejected(h)).toEqual([]);
    // 214차에 X·Y 옵션이 더해진 프롬프트 글
    expect(h.out()).toContain('삽입점 지정 또는 [기준점(B)/축척(S)/X/Y/회전(R)]: B');
    expect(h.out()).toContain('기준점 지정: 1,2');
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ block: 'B1', rowCount: 1, columnCount: 1, scale: { x: 1, y: 1, z: 1 }, rotation: 0 });
    expect(xyz(ins!.insert)).toEqual([9, 18, 3]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 10, 20, 3]]);
    h.st.session.undo();
    expect(model(h.doc, 'INSERT')).toHaveLength(0);
  });

  it('기준점(B) 뒤 X 축척 2·회전 90°·2행 3열: 고른 블록 점이 찍은 점 (10, 20)에 오고 행·열·간격·축척·회전은 준 값', async () => {
    const h = setup();
    await run(h, 'MINSERT', ['B1', 'B', '1,2', '10,20', '2', '', '90', '2', '3', '5', '4']);
    expect(rejected(h)).toEqual([]);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ block: 'B1', rowCount: 2, columnCount: 3, rowSpacing: 5, columnSpacing: 4, scale: { x: 2, y: 2, z: 1 } });
    expect(ins!.rotation).toBeCloseTo(Math.PI / 2, 12);
    // 삽입점 = (10, 20) − 회전(90°)·축척(2)·(1, 2) = (10, 20) − (−4, 2)
    expect(xyz(ins!.insert)).toEqual([14, 18, 0]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 10, 20, 0]]);
  });

  it('미리 준 축척(S) 2 뒤 기준점(B): 고도 −1.5에서 삽입점 (8, 16, −1.5)·속성 (10, 20, −1.5) — 미리 준 옵션을 함께 쓴다', async () => {
    const h = setup(-1.5);
    // 축척을 미리 주면 X·Y 축척을 묻지 않는다(전과 같음): 회전 Enter, 행 Enter, 열 Enter
    await run(h, 'MINSERT', ['B1', 'S', '2', 'B', '1,2', '10,20', '', '', '']);
    expect(rejected(h)).toEqual([]);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ rowCount: 1, columnCount: 1, scale: { x: 2, y: 2, z: 1 }, rotation: 0 });
    expect(xyz(ins!.insert)).toEqual([8, 16, -1.5]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 10, 20, -1.5]]);
  });

  it('전과 같은 값: B를 쓰지 않으면 삽입점 = 찍은 점, 회전(R)을 미리 줘도 같고, 기준점 프롬프트에서 Enter면 정의 기준점 그대로', async () => {
    const h = setup();
    await run(h, 'MINSERT', ['B1', '30,40', '', '', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'R', '90', '50,60', '', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'B', '', '70,80', '', '', '', '', '']);
    const [a, b, c] = model<InsertEntity>(h.doc, 'INSERT');
    expect([xyz(a!.insert), xyz(a!.attribs[0]!.insert), a!.rotation]).toEqual([[30, 40, 0], [31, 42, 0], 0]);
    expect([xyz(b!.insert), xyz(b!.attribs[0]!.insert)]).toEqual([[50, 60, 0], [48, 61, 0]]);
    expect(b!.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect([xyz(c!.insert), xyz(c!.attribs[0]!.insert), c!.rotation, c!.scale]).toEqual([[70, 80, 0], [71, 82, 0], 0, { x: 1, y: 1, z: 1 }]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 기준점(B)으로 넣은 다중 삽입의 삽입점·속성·행·열·간격·축척이 같다', async () => {
    const h = setup(4);
    await run(h, 'MINSERT', ['B1', 'B', '1,2', '10,20', '2', '', '', '2', '3', '5', '4']);
    const pick = (doc: CadDocument) => {
      const [ins] = model<InsertEntity>(doc, 'INSERT');
      return {
        insert: xyz(ins!.insert),
        grid: [ins!.rowCount, ins!.columnCount, ins!.rowSpacing, ins!.columnSpacing, ins!.scale.x, ins!.scale.y],
        attrib: xyz(ins!.attribs[0]!.insert),
      };
    };
    const want = { insert: [8, 16, 4], grid: [2, 3, 5, 4, 2, 2], attrib: [10, 20, 4] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
