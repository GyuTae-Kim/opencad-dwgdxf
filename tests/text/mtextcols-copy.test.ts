/**
 * 90차: 여러 단 MTEXT 묶음(R2000~R2013 꼴)을 복사·붙여넣기·배열·대칭·분해로 만든 사본도 새 단끼리 이은 묶음이다.
 * AutoCAD에서는 여러 단 문자가 객체 하나(R2018 DXF·DWG는 한 MTEXT 안에 단 자료)라 고르기·복사가 늘 묶음째다 —
 * 이 앱은 고를 때 묶음째 고르고, 같은 변환으로 묶음이 다 복사되면 사본의 첫 단이 새 단 핸들을 가리킨다.
 * 명령 취소·다시 하기, DXF·DWG(R2013)로 저장해 다시 열기에서도 묶음이 그대로다.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type BlockDef, type CadDocument, type InsertEntity, type MTextEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerModifyCommands } from '../../src/app/modify';
import { registerModify2Commands } from '../../src/app/modify2';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { mtextColumnLinks, mtextColumnSets, readColumnXData } from '../../src/edit/util/mtextcols';
import { makeHarness } from '../cmds2/harness';
import { runWith, type Input2 } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';
import { columnDoc, columnGroup } from './mtextcols-fixture';

function harness(make: () => CadDocument = columnDoc) {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, make())));
  registerModifyCommands(h.app);
  registerModify2Commands(h.app);
  registerEditCommands(h.app);
  registerBlockCommands(h.app);
  (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (n: string) => h.app.commands.get(n.toUpperCase());
  return h;
}

/** 블록마다 묶음(첫 단 → 다른 단 핸들) */
function groups(doc: CadDocument): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [h, list] of mtextColumnSets(doc)) if (list[0] === h) out.set(h, list.slice(1));
  return out;
}

const model = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities;
const all = (doc: CadDocument) => model(doc).map((e) => e.handle);

/** 새로 생긴 묶음(원본 A0 말고) — 첫 단과 다른 단의 글·삽입점 */
function newGroup(doc: CadDocument): { head: MTextEntity; members: MTextEntity[] } {
  const g = [...groups(doc)].find(([h]) => h !== 'A0');
  expect(g).toBeDefined();
  const [head, hs] = g!;
  return { head: doc.entityIndex.get(head) as MTextEntity, members: hs.map((x) => doc.entityIndex.get(x) as MTextEntity) };
}

async function run(h: ReturnType<typeof harness>, steps: [string, Input2[]][]) {
  for (const [cmd, inputs] of steps) await runWith(h, cmd, inputs);
}

describe('여러 단 MTEXT 묶음의 복사본', () => {
  it('COPY: 사본은 새 단끼리 이은 묶음이고, 명령 취소·다시 하기에도 그대로다', async () => {
    const h = harness();
    const s = h.st.session;
    const mark = s.undoTop();
    await run(h, [['COPY', [{ sel: all(h.doc) }, '0,0', '0,40', '']]]);
    expect(groups(h.doc).size).toBe(2);
    const { head, members } = newGroup(h.doc);
    expect(members.map((m) => m.text)).toEqual(['Line 4\\PLine 5\\PLine 6\\P', 'Line 7\\PLine 8\\PLine 9']);
    expect(members.map((m) => m.insert.y)).toEqual([40, 40]);
    expect(mtextColumnLinks(head)).toEqual(members.map((m) => m.handle));
    expect(readColumnXData(members[0]!)).toEqual({ definedHeight: 12 });
    // 원본 묶음은 그대로
    expect(groups(h.doc).get('A0')).toEqual(['A1', 'A2']);
    const after = [...groups(h.doc)];
    while (s.undoTop() !== mark) s.undo();
    expect([...groups(h.doc)]).toEqual([['A0', ['A1', 'A2']]]);
    while (s.canRedo()) s.redo();
    expect([...groups(h.doc)]).toEqual(after);
  });

  it('COPY 뒤 DXF·DWG(R2013)로 저장해 다시 열어도 두 묶음이다', async () => {
    const h = harness();
    await run(h, [['COPY', [{ sel: all(h.doc) }, '0,0', '0,40', '']]]);
    const want = [...groups(h.doc)];
    for (const back of [readDxf(writeDxf(h.doc, { version: 'AC1027' }).data), readDwg(writeDwg(h.doc, { version: 'AC1027' }).data), readDxf(writeDxf(h.doc, { version: 'AC1015' }).data)]) {
      expect([...groups(back)]).toEqual(want);
    }
  });

  it('붙여넣기(COPYCLIP → PASTECLIP)·여러 번 복사도 사본마다 묶음이다', async () => {
    const h = harness();
    await run(h, [
      ['COPYCLIP', [{ sel: ['A1'] }]],
      ['PASTECLIP', ['100,0']],
    ]);
    // 한 단만 골라 복사해도 고르기가 묶음째다(시험 하네스의 { sel }은 넓히지 않으므로 하네스 대신 묶음을 골랐다고 본다) — 고른 단만이면 보통 MTEXT
    expect(groups(h.doc).size).toBe(1);
    const h2 = harness();
    await run(h2, [
      ['COPYCLIP', [{ sel: ['A0', 'A1', 'A2'] }]],
      ['PASTECLIP', ['100,0']],
      ['COPY', [{ sel: ['A0', 'A1', 'A2'] }, '0,0', '0,40', '0,80', '']],
    ]);
    expect(groups(h2.doc).size).toBe(4);
    for (const [head, hs] of groups(h2.doc)) {
      const e = h2.doc.entityIndex.get(head) as MTextEntity;
      expect(hs.map((x) => (h2.doc.entityIndex.get(x) as MTextEntity).insert.x - e.insert.x)).toEqual([25, 50]);
    }
  });

  it('대칭 복사: 여러 줄 문자는 글자를 읽을 수 있게 두어 단마다 제 상자로 뒤집히므로(단 차례가 어긋난다) 사본을 잇지 않는다', async () => {
    const h = harness();
    await run(h, [['MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'N']]]);
    expect(groups(h.doc).size).toBe(1);
    expect(model(h.doc).filter((e) => e.type === 'MTEXT' && !e.xdata).length).toBe(3);
  });

  it('회전·축척한 복사본도 묶음이다(단 폭·간격·정한 높이가 축척을 따른다)', async () => {
    const h = harness();
    await run(h, [['ROTATE', [{ sel: ['A0', 'A1', 'A2'] }, '0,0', 'C', '90']]]);
    expect(groups(h.doc).size).toBe(2);
    const h2 = harness();
    await run(h2, [['SCALE', [{ sel: ['A0', 'A1', 'A2'] }, '0,0', 'C', '2']]]);
    expect(groups(h2.doc).size).toBe(2);
    const { head } = newGroup(h2.doc);
    const c = readColumnXData(head)!;
    expect([c.info!.width, c.info!.gutter, c.definedHeight]).toEqual([expect.closeTo(40), expect.closeTo(10), expect.closeTo(24)]);
  });

  it('연관 배열(ARRAYRECT): 원본 블록 안의 사본이 새 단끼리 이은 묶음이고, 분해하면 항목마다 묶음이다', async () => {
    const h = harness();
    await run(h, [['ARRAYRECT', [{ sel: ['A0', 'A1', 'A2'] }, '']]]);
    const inBlocks = [...groups(h.doc)].filter(([k]) => h.st.session.ownerOf(k) !== MODEL_SPACE);
    expect(inBlocks.length).toBe(1);
    const owner = h.st.session.ownerOf(inBlocks[0]![0]);
    for (const x of inBlocks[0]![1]) expect(h.st.session.ownerOf(x)).toBe(owner);
    const arr = model(h.doc).find((e) => e.type === 'INSERT')!;
    await run(h, [['EXPLODE', [{ sel: [arr.handle] }]]]);
    // 항목 참조(원본 블록)를 한 번 더 분해하면 항목마다 묶음
    const items = model(h.doc).filter((e) => e.type === 'INSERT').map((e) => e.handle);
    expect(items.length).toBeGreaterThan(1);
    await run(h, [['EXPLODE', [{ sel: items }]]]);
    const mine = [...groups(h.doc)].filter(([k]) => h.st.session.ownerOf(k) === MODEL_SPACE);
    expect(mine.length).toBe(items.length);
  });

  it('여러 단 MTEXT가 든 블록을 분해하면 모형 공간에 새 묶음이 생긴다', async () => {
    const make = () => {
      const doc = createNewDocument('metric');
      const def: BlockDef = { name: 'COLS', handle: 'B9', recordHandle: 'B8', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: columnGroup('B0', 'B1', 'B2') };
      doc.blocks.set('COLS', def);
      doc.blockRecords.set('COLS', { name: 'COLS', handle: 'B8', flags: 0, insertUnits: 0, explodable: true, scalable: true });
      const ins: InsertEntity = { ...entityDefaults(), handle: 'C1', layer: '0', type: 'INSERT', block: 'COLS', insert: { x: 100, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] };
      doc.blocks.get(MODEL_SPACE)!.entities.push(ins);
      return finalizeDocument(doc);
    };
    const h = harness(make);
    expect(groups(h.doc).get('B0')).toEqual(['B1', 'B2']);
    await run(h, [['EXPLODE', [{ sel: ['C1'] }]]]);
    const mine = [...groups(h.doc)].filter(([k]) => h.st.session.ownerOf(k) === MODEL_SPACE);
    expect(mine.length).toBe(1);
    const head = h.doc.entityIndex.get(mine[0]![0]) as MTextEntity;
    expect(head.insert.x).toBe(100);
    // 블록 정의의 묶음은 그대로
    expect(groups(h.doc).get('B0')).toEqual(['B1', 'B2']);
  });
});
