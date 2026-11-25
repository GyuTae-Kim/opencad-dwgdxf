// @vitest-environment jsdom
/**
 * 214차: MINSERT의 X·Y 옵션. Autodesk MINSERT 도움말은 삽입점 프롬프트에서 미리 정할 수 있는 옵션으로 기준점·축척·X·Y·Z·회전을 적고,
 * X·Y는 그 축의 축척을 정한다. 전에는 MINSERT가 기준점(B)·축척(S)·회전(R)만 받아 X·Y를 「점이 올바르지 않습니다.」로 거절했다
 * (X는 EXPLODE 별칭이지만 투명 명령이 아니고 Y는 명령이 없다).
 * 도움말이 적지 않은 빈칸(다른 축의 값·뒤 축척 프롬프트)은 -INSERT의 미리 준 축척 규칙과 같다: 미리 준 축척이 있으면 뒤 X·Y 축척을 묻지 않고,
 * X = X ?? Y ?? 1, Y = Y ?? X, Z = |X|. 축척(S)은 전처럼 X·Y = 준 값·Z 1이다(도움말은 |S| — 213차에 보고 둔 그대로).
 * Z 옵션은 넣지 않았다(Z는 지금 투명 ZOOM으로 받는 글자 — 213차 판단). X·Y를 쓰지 않은 입력은 전과 같은 값이다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

const PROMPT = '삽입점 지정 또는 [기준점(B)/축척(S)/X/Y/회전(R)]:';
const SCALE_PROMPT = 'X 축척 비율 입력, 반대 구석 지정';

function setup(elevation?: number) {
  const h = makeApp();
  registerUtil2BlockCommands(h.app);
  registerBlockCommands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  // 블록 B1(정의 기준점 0,0,0): 선 하나와 미리 설정(8) 속성 정의 N(블록 좌표 (1, 2, 0)) — 속성 값을 묻지 않는다(213차 시험과 같은 블록)
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
  // 물은 프롬프트(Enter로 답한 것도 남는다 — 명령행 줄에는 Enter 답이 찍히지 않는다)
  const asked: string[] = [];
  h.cmd.watchers.add({ prompt: (t: string) => asked.push(t.replace(/[⁨⁩]/g, '')) });
  return { ...h, asked };
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
const askedScale = (h: H) => h.asked.filter((p) => p.startsWith(SCALE_PROMPT)).length;

describe('MINSERT X·Y 옵션(214차)', () => {
  it('고도 3에서 X 2만 미리 주면 X·Y·Z 축척 (2, 2, 2)·삽입점 (10, 20, 3)·속성 (12, 24, 3), 뒤 X 축척을 묻지 않고, 명령 취소 한 번이면 없다', async () => {
    const h = setup(3);
    // 블록 이름, X, X 축척, 삽입점, 회전 Enter, 행 Enter, 열 Enter
    await run(h, 'MINSERT', ['B1', 'X', '2', '10,20', '', '', '']);
    expect(rejected(h)).toEqual([]);
    expect(h.out()).toContain(`${PROMPT} X`);
    expect(h.out()).toContain('X 축척 비율 지정 <1>: 2');
    expect(askedScale(h)).toBe(0);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ block: 'B1', rowCount: 1, columnCount: 1, scale: { x: 2, y: 2, z: 2 }, rotation: 0 });
    expect(xyz(ins!.insert)).toEqual([10, 20, 3]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 12, 24, 3]]);
    h.st.session.undo();
    expect(model(h.doc, 'INSERT')).toHaveLength(0);
  });

  it('X 2·Y 3·기준점(B) (1, 2) 뒤 회전 90°·2행 3열: 축척 (2, 3, 2), 고른 블록 점이 찍은 점 (10, 20)에 오고 행·열·간격은 준 값', async () => {
    const h = setup();
    await run(h, 'MINSERT', ['B1', 'X', '2', 'Y', '3', 'B', '1,2', '10,20', '90', '2', '3', '5', '4']);
    expect(rejected(h)).toEqual([]);
    expect(h.out()).toContain('Y 축척 비율 지정 <1>: 3');
    expect(askedScale(h)).toBe(0);
    const [ins] = model<InsertEntity>(h.doc, 'INSERT');
    expect(ins).toMatchObject({ rowCount: 2, columnCount: 3, rowSpacing: 5, columnSpacing: 4, scale: { x: 2, y: 3, z: 2 } });
    expect(ins!.rotation).toBeCloseTo(Math.PI / 2, 12);
    // 삽입점 = (10, 20) − 회전(90°)·축척(2, 3)·(1, 2) = (10, 20) − (−6, 2)
    expect(xyz(ins!.insert)).toEqual([16, 18, 0]);
    expect(ins!.attribs.map((a) => [a.tag, ...xyz(a.insert)!])).toEqual([['N', 10, 20, 0]]);
  });

  it('Y만(소문자 y −0.5)이면 X도 Y·Z = |Y|, X에서 Enter면 1을 미리 준 것이라 뒤 X 축척을 묻지 않고, 축척(S) 2 뒤 X 3이면 (3, 2, 1)', async () => {
    const h = setup();
    await run(h, 'MINSERT', ['B1', 'y', '-0.5', '10,20', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'X', '', '50,60', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'S', '2', 'X', '3', '30,40', '', '', '']);
    expect(rejected(h)).toEqual([]);
    expect(askedScale(h)).toBe(0);
    const [a, b, c] = model<InsertEntity>(h.doc, 'INSERT');
    expect([a!.scale, xyz(a!.insert), xyz(a!.attribs[0]!.insert)]).toEqual([{ x: -0.5, y: -0.5, z: 0.5 }, [10, 20, 0], [9.5, 19, 0]]);
    expect([b!.scale, xyz(b!.insert), xyz(b!.attribs[0]!.insert)]).toEqual([{ x: 1, y: 1, z: 1 }, [50, 60, 0], [51, 62, 0]]);
    expect([c!.scale, xyz(c!.insert), xyz(c!.attribs[0]!.insert)]).toEqual([{ x: 3, y: 2, z: 1 }, [30, 40, 0], [33, 44, 0]]);
  });

  it('전과 같은 값: 옵션 없이는 X 축척을 묻고 (1, 1, 1), 축척(S) 2는 묻지 않고 (2, 2, 1), 축척(S) 1이면 다시 물어 3을 주면 (3, 3, 1)', async () => {
    const h = setup();
    await run(h, 'MINSERT', ['B1', '30,40', '', '', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'S', '2', '50,60', '', '', '']);
    await run(h, 'MINSERT', ['B1', 'S', '1', '70,80', '3', '', '', '', '']);
    expect(askedScale(h)).toBe(2);
    const [a, b, c] = model<InsertEntity>(h.doc, 'INSERT');
    expect([a!.scale, xyz(a!.insert), xyz(a!.attribs[0]!.insert)]).toEqual([{ x: 1, y: 1, z: 1 }, [30, 40, 0], [31, 42, 0]]);
    expect([b!.scale, xyz(b!.insert), xyz(b!.attribs[0]!.insert)]).toEqual([{ x: 2, y: 2, z: 1 }, [50, 60, 0], [52, 64, 0]]);
    expect([c!.scale, xyz(c!.insert), xyz(c!.attribs[0]!.insert)]).toEqual([{ x: 3, y: 3, z: 1 }, [70, 80, 0], [73, 86, 0]]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 X·Y로 넣은 다중 삽입의 삽입점·속성·행·열·간격·X·Y·Z 축척이 같다', async () => {
    const h = setup(4);
    await run(h, 'MINSERT', ['B1', 'X', '2', 'Y', '3', 'B', '1,2', '10,20', '', '2', '3', '5', '4']);
    const pick = (doc: CadDocument) => {
      const [ins] = model<InsertEntity>(doc, 'INSERT');
      return {
        insert: xyz(ins!.insert),
        grid: [ins!.rowCount, ins!.columnCount, ins!.rowSpacing, ins!.columnSpacing, ins!.scale.x, ins!.scale.y, ins!.scale.z],
        attrib: xyz(ins!.attribs[0]!.insert),
      };
    };
    // 삽입점 = (10, 20) − 축척(2, 3)·(1, 2)
    const want = { insert: [8, 14, 4], grid: [2, 3, 5, 4, 2, 3, 2], attrib: [10, 20, 4] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });

  it('새 프롬프트 글이 네 언어 사전에 있다(X·Y 축척 프롬프트는 기존 틀로 옮겨진다)', () => {
    expect(translate(PROMPT, 'en')).toBe('Specify insertion point or [Base point (B)/Scale (S)/X/Y/Rotation (R)]:');
    for (const l of ['de', 'ja', 'zh-CN']) expect(translate(PROMPT, l), l).not.toMatch(/[가-힣]/);
    expect(translate('X 축척 비율 지정 <1>:', 'en')).toBe('Specify X scale factor <1>:');
    expect(translate('Y 축척 비율 지정 <1>:', 'en')).toBe('Specify Y scale factor <1>:');
  });
});
