/**
 * 123차: EXPLODE한 블록의 속성 — Autodesk EXPLODE 도움말("속성이 든 블록을 분해하면 속성 값을 지우고 속성 정의를 다시 보인다")대로
 * 블록 정의의 ATTDEF(상수·숨김 깃발 포함)를 참조 변환으로 옮기고 참조의 속성 값은 버린다. 122차까지는 BURST처럼 값을 문자로 남기고
 * 상수가 아닌 ATTDEF는 버렸다. BURST(Express Tools — 속성 값을 문자로)와 범위·모서리 조회는 값 문자 그대로다.
 * 분해해 넣기(-INSERT *이름, 블록 팔레트의 분해)도 넣은 참조를 EXPLODE한 것과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, MTextEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { explodeEntity } from '../../src/edit/geom/explode';
import { registerModifyCommands } from '../../src/app/modify';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { registerDashInsertCommands } from '../../src/app/dashcmds-insert';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { P, deg, line, near, newDoc, renders } from './helpers';

function attdef(tag: string, x: number, y: number, flags = 0, value = '', extra: Partial<AttribEntity> = {}): AttribEntity {
  return {
    ...entityDefaults(),
    type: 'ATTDEF',
    handle: 'AD' + tag,
    insert: P(x, y),
    height: 0.5,
    text: value,
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
    tag,
    prompt: tag + '?',
    attFlags: flags,
    ...extra,
  };
}

function insert(block: string, x: number, y: number, extra: Partial<InsertEntity> = {}): InsertEntity {
  return {
    ...entityDefaults(),
    type: 'INSERT',
    handle: 'I' + block + x,
    block,
    insert: P(x, y),
    scale: P(1, 1, 1),
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: [],
    ...extra,
  };
}

/** 블록 B: 선, 상수 아닌 속성 정의 T, 상수 C, 숨김 H, 여러 줄 M */
function addBlock(doc: CadDocument): void {
  const mt: MTextEntity = {
    ...entityDefaults(),
    type: 'MTEXT',
    handle: '',
    insert: P(1, 3),
    height: 0.5,
    width: 4,
    attachment: 1,
    drawingDirection: 1,
    text: 'L1\\PL2',
    style: 'Standard',
    rotation: 0,
  } as MTextEntity;
  doc.blocks.set('B', {
    name: 'B',
    handle: 'B1',
    recordHandle: 'B2',
    basePoint: P(0, 0),
    flags: 2,
    entities: [
      { ...line(0, 0, 1, 0), handle: 'BL' },
      attdef('T', 0, 1, 0, 'DEF'),
      attdef('C', 0, 2, 2, 'CONST'),
      attdef('H', 0, -1, 1, 'hid'),
      attdef('M', 1, 3, 0, 'L1\\PL2', { mtext: mt }),
    ],
  });
}

/** 참조 속성: 값 VALUE·secret·여러 줄 */
function attribs(): AttribEntity[] {
  return [
    { ...attdef('T', 0, 1, 0, 'VALUE'), type: 'ATTRIB', handle: 'AT1', layer: 'A' },
    { ...attdef('H', 0, -1, 1, 'secret'), type: 'ATTRIB', handle: 'AT2' },
  ];
}

const tagsOf = (list: readonly Entity[]) => list.filter((e): e is AttribEntity => e.type === 'ATTDEF').map((a) => a.tag);
const textsOf = (list: readonly Entity[]) => list.filter((e): e is TextEntity => e.type === 'TEXT').map((t) => t.text);

describe('explodeEntity — 속성 정의(definitions)와 값 문자(values)', () => {
  const doc = newDoc();
  addBlock(doc);

  it('definitions: 정의 넷(상수·숨김·여러 줄 포함)을 참조 변환으로 옮기고 값은 버린다', () => {
    const ins = insert('B', 5, 5, { scale: P(2, 2, 1), rotation: deg(90), attribs: attribs() });
    const r = explodeEntity(ins, doc, false, 'definitions');
    expect(r.remove).toEqual([ins.handle]);
    expect(r.add!.map((e) => e.type)).toEqual(['LINE', 'ATTDEF', 'ATTDEF', 'ATTDEF', 'ATTDEF']);
    expect(tagsOf(r.add!)).toEqual(['T', 'C', 'H', 'M']);
    expect(textsOf(r.add!)).toEqual([]);
    const d = r.add!.filter((e): e is AttribEntity => e.type === 'ATTDEF');
    // 기본값·프롬프트·깃발은 정의 그대로(참조의 값 VALUE·secret은 없다)
    expect(d.map((a) => [a.text, a.prompt, a.attFlags])).toEqual([
      ['DEF', 'T?', 0],
      ['CONST', 'C?', 2],
      ['hid', 'H?', 1],
      ['L1\\PL2', 'M?', 0],
    ]);
    // (0, 1)을 2배·90도 돌려 (5, 5)에: (3, 5), 높이 1, 회전 90도
    near(d[0]!.insert, P(3, 5));
    expect(d[0]!.height).toBeCloseTo(1);
    expect(d[0]!.rotation).toBeCloseTo(deg(90));
    expect(d[0]!.layer).toBe('0');
    // 여러 줄 정의의 MTEXT도 같은 변환
    near(d[3]!.mtext!.insert, P(-1, 7));
    expect(d[3]!.mtext!.height).toBeCloseTo(1);
    expect(r.add!.every((e) => e.handle === '')).toBe(true);
    // 블록 정의의 ATTDEF는 그대로
    expect((doc.blocks.get('B')!.entities[1] as AttribEntity).insert).toEqual(P(0, 1));
    renders(doc, r.add!);
  });

  it('values(기본 — BURST·조회): 보이는 속성은 값 문자, 상수 정의는 문자, 상수 아닌 정의는 버린다(122차까지의 EXPLODE)', () => {
    const ins = insert('B', 5, 5, { attribs: attribs() });
    const r = explodeEntity(ins, doc);
    expect(tagsOf(r.add!)).toEqual([]);
    expect(textsOf(r.add!).sort()).toEqual(['CONST', 'VALUE']);
  });

  it('동적 블록 표현(*U)에서 가시성 상태로 숨은 정의는 옮기지 않는다', () => {
    doc.blocks.set('*U7', { name: '*U7', handle: 'U1', recordHandle: 'U2', basePoint: P(0, 0), flags: 1, entities: [line(0, 0, 1, 0), attdef('A', 0, 1), { ...attdef('Z', 0, 2), invisible: true }] });
    const r = explodeEntity(insert('*U7', 0, 0), doc, false, 'definitions');
    expect(tagsOf(r.add!)).toEqual(['A']);
  });

  it('속성이 없는 블록은 두 길이 같다', () => {
    doc.blocks.set('P', { name: 'P', handle: 'P1', recordHandle: 'P2', basePoint: P(0, 0), flags: 0, entities: [line(0, 0, 1, 0), line(0, 0, 0, 1)] });
    const a = explodeEntity(insert('P', 3, 0), doc, false, 'definitions');
    const b = explodeEntity(insert('P', 3, 0), doc);
    expect(a.add).toEqual(b.add);
  });
});

describe('명령: EXPLODE·BURST·분해해 넣기', () => {
  function harness() {
    const h = makeHarness((doc) => {
      addBlock(doc);
      doc.layers.set('A', { ...doc.layers.get('0')!, name: 'A', handle: 'LA' });
    });
    registerModifyCommands(h.app);
    registerUtil2BlockCommands(h.app);
    registerDashInsertCommands(h.app);
    return h;
  }
  const model = (h: ReturnType<typeof harness>) => h.doc.blocks.get(MODEL_SPACE)!.entities;

  it('EXPLODE: 속성 값을 지우고 속성 정의를 다시 보인다, 명령 취소로 참조와 값이 돌아온다', async () => {
    const h = harness();
    const ins = h.add(insert('B', 10, 0, { attribs: attribs() })) as InsertEntity;
    await runWith(h, 'EXPLODE', [{ sel: [ins.handle] }]);
    expect(model(h).map((e) => e.type)).toEqual(['LINE', 'ATTDEF', 'ATTDEF', 'ATTDEF', 'ATTDEF']);
    expect(tagsOf(model(h))).toEqual(['T', 'C', 'H', 'M']);
    expect(model(h).filter((e): e is AttribEntity => e.type === 'ATTDEF').map((a) => a.text)).toEqual(['DEF', 'CONST', 'hid', 'L1\\PL2']);
    expect(model(h).every((e) => e.handle && h.doc.entityIndex.get(e.handle) === e)).toBe(true);
    h.st.session.undo();
    expect(model(h).map((e) => e.type)).toEqual(['INSERT']);
    expect((model(h)[0] as InsertEntity).attribs.map((a) => a.text)).toEqual(['VALUE', 'secret']);
  });

  it('BURST: 속성 값은 문자로 남는다(정의는 나오지 않는다)', async () => {
    const h = harness();
    const ins = h.add(insert('B', 10, 0, { attribs: attribs() })) as InsertEntity;
    await runWith(h, 'BURST', [{ sel: [ins.handle] }]);
    expect(tagsOf(model(h))).toEqual([]);
    expect(textsOf(model(h)).sort()).toEqual(['CONST', 'VALUE']);
  });

  it('-INSERT *B(분해해 넣기): 값을 묻지 않고 속성 정의를 넣는다', async () => {
    const h = harness();
    await runWith(h, '-INSERT', ['*B', '20,0', '1', '0']);
    expect(tagsOf(model(h))).toEqual(['T', 'C', 'H', 'M']);
    const t = model(h).find((e) => e.type === 'ATTDEF') as AttribEntity;
    near(t.insert, P(20, 1));
    expect(textsOf(model(h))).toEqual([]);
  });
});
