/**
 * 113차: 글자를 읽을 수 있게 두는 대칭(MIRRTEXT 0)은 여러 단 MTEXT 묶음을 묶음 전체 상자로 옮긴다.
 * R2018 꼴(객체 하나)은 전부터 전체 상자로 뒤집혔고, R2000~R2013 꼴(단마다 객체)은 단마다 제 상자로 뒤집혀
 * 단 차례가 거꾸로 되고(읽는 차례가 틀림) R2018로 저장하면 첫 단이던 맨 오른쪽 자리에서 단이 다시 뻗어 나갔다.
 * 같은 글이 저장 형식에 따라 다르게 옮겨지면 안 되므로 묶음 전체 상자 기준으로 맞춘다.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, type CadDocument, type Entity, type MTextEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerModifyCommands } from '../../src/app/modify';
import { registerModify2Commands } from '../../src/app/modify2';
import { registerBlockCommands } from '../../src/app/blocks';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { columnLayoutFits, mergeColumnGroup, mtextColumnSets, readColumnXData } from '../../src/edit/util/mtextcols';
import { affMirror } from '../../src/edit/geom/math';
import { mtextLocalBox } from '../../src/edit/geom/xtext';
import { transformEntity } from '../../src/edit/geom';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';
import { columnGroup, mtext } from './mtextcols-fixture';

const model = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities;

function makeDoc(rotation = 0, mirrtext = 0, group: () => MTextEntity[] = () => columnGroup()): CadDocument {
  const d = createNewDocument('metric');
  d.header.set('$MIRRTEXT', mirrtext);
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  for (const m of group()) {
    const { x, y } = m.insert;
    m.insert = { x: x * c - y * s, y: x * s + y * c, z: 0 };
    m.rotation = rotation;
    model(d).push(m);
  }
  return finalizeDocument(d);
}

function harness(make: () => CadDocument) {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, make())));
  registerModifyCommands(h.app);
  registerModify2Commands(h.app);
  registerEditCommands(h.app);
  registerBlockCommands(h.app);
  (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (n: string) => h.app.commands.get(n.toUpperCase());
  return h;
}

/** 단마다 단 폭으로 나눈 글 상자의 합(WCS 네 모서리의 평균 = 묶음 상자 중심) */
function groupCenter(doc: CadDocument, g: MTextEntity[], colWidth: number): { x: number; y: number } {
  const u = { x: Math.cos(g[0]!.rotation), y: Math.sin(g[0]!.rotation) };
  const v = { x: -u.y, y: u.x };
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const m of g) {
    const b = mtextLocalBox({ ...m, width: colWidth, xdata: undefined }, doc);
    const ou = (m.insert.x - g[0]!.insert.x) * u.x + (m.insert.y - g[0]!.insert.y) * u.y;
    const ov = (m.insert.x - g[0]!.insert.x) * v.x + (m.insert.y - g[0]!.insert.y) * v.y;
    minU = Math.min(minU, ou + b.minX);
    maxU = Math.max(maxU, ou + b.maxX);
    minV = Math.min(minV, ov + b.minY);
    maxV = Math.max(maxV, ov + b.maxY);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return { x: g[0]!.insert.x + u.x * cu + v.x * cv, y: g[0]!.insert.y + u.y * cu + v.y * cv };
}

const groupOf = (doc: CadDocument, head: string) => mtextColumnSets(doc).get(head)!.map((h) => doc.entityIndex.get(h) as MTextEntity);
const apply = (m: readonly number[], p: { x: number; y: number }) => ({ x: m[0]! * p.x + m[2]! * p.y + m[4]!, y: m[1]! * p.x + m[3]! * p.y + m[5]! });

describe('여러 단 MTEXT 묶음의 글자를 읽을 수 있게 두는 대칭', () => {
  it('MIRROR(원본 지움): 단 차례가 그대로이고 묶음 상자가 거울상 자리에 있다', async () => {
    const h = harness(() => makeDoc());
    const before = groupCenter(h.doc, groupOf(h.doc, 'A0'), 20);
    await runWith(h, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'Y']);
    const g = groupOf(h.doc, 'A0');
    expect(g.map((m) => m.text)).toEqual(['Line 1\\PLine 2\\PLine 3\\P', 'Line 4\\PLine 5\\PLine 6\\P', 'Line 7\\PLine 8\\PLine 9']);
    expect(g[1]!.insert.x - g[0]!.insert.x).toBeCloseTo(25, 9);
    expect(g[2]!.insert.x - g[0]!.insert.x).toBeCloseTo(50, 9);
    expect(g[1]!.insert.y - g[0]!.insert.y).toBeCloseTo(0, 9);
    expect(columnLayoutFits(g[0]!, g.slice(1), readColumnXData(g[0]!)!.info)).toBe(true);
    const c = groupCenter(h.doc, g, 20);
    expect(c.x).toBeCloseTo(-20 - before.x, 9);
    expect(c.y).toBeCloseTo(before.y, 9);
  });

  it('MIRROR(사본): 사본도 새 단끼리 이은 묶음이고 저장해 다시 열어도 묶음이다', async () => {
    const h = harness(() => makeDoc());
    await runWith(h, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'N']);
    const heads = [...mtextColumnSets(h.doc)].filter(([k, l]) => l[0] === k);
    expect(heads.length).toBe(2);
    const copy = heads.find(([k]) => k !== 'A0')!;
    const g = copy[1].map((x) => h.doc.entityIndex.get(x) as MTextEntity);
    expect(g[1]!.insert.x - g[0]!.insert.x).toBeCloseTo(25, 9);
    expect(g[0]!.text.startsWith('Line 1')).toBe(true);
    const want = heads.map(([k, l]) => [k, l.slice(1)]);
    for (const back of [readDxf(writeDxf(h.doc, { version: 'AC1027' }).data), readDwg(writeDwg(h.doc, { version: 'AC1027' }).data)]) {
      const got = [...mtextColumnSets(back)].filter(([k, l]) => l[0] === k).map(([k, l]) => [k, l.slice(1)]);
      expect(got).toEqual(want);
    }
  });

  it('R2018 저장: 합친 객체가 R2018 꼴 객체 하나를 대칭한 것과 같은 자리다', async () => {
    const h = harness(() => makeDoc());
    const g0 = groupOf(h.doc, 'A0');
    const merged = mergeColumnGroup(g0[0]!, readColumnXData(g0[0]!)!, g0.slice(1));
    const m = affMirror({ x: -10, y: 0 }, { x: -10, y: 10 });
    const one = transformEntity(merged, m, h.doc, {}).replace![0] as MTextEntity;
    await runWith(h, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'Y']);
    const back = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data);
    const saved = back.blocks.get(MODEL_SPACE)!.entities.filter((e: Entity) => e.type === 'MTEXT') as MTextEntity[];
    expect(saved.length).toBe(1);
    expect(saved[0]!.columns?.count).toBe(3);
    expect(saved[0]!.insert.x).toBeCloseTo(one.insert.x, 6);
    expect(saved[0]!.insert.y).toBeCloseTo(one.insert.y, 6);
  });

  it('돌린 묶음을 기운 축으로 대칭해도 글자 방향으로 단 폭 + 간격씩이고 상자는 거울상 자리다', async () => {
    const h = harness(() => makeDoc(Math.PI / 6));
    const before = groupCenter(h.doc, groupOf(h.doc, 'A0'), 20);
    const a = { x: -30, y: 5 };
    const b = { x: 10, y: 45 };
    await runWith(h, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, `${a.x},${a.y}`, `${b.x},${b.y}`, 'Y']);
    const g = groupOf(h.doc, 'A0');
    expect(columnLayoutFits(g[0]!, g.slice(1), readColumnXData(g[0]!)!.info)).toBe(true);
    const c = groupCenter(h.doc, g, 20);
    const w = apply(affMirror(a, b), before);
    expect(c.x).toBeCloseTo(w.x, 9);
    expect(c.y).toBeCloseTo(w.y, 9);
  });

  it('긴 문단: 단 폭으로 줄을 나눈 상자로 잰다(41은 전체 폭이라 그대로 재면 상자가 넓다)', async () => {
    const long = 'word word word word word word word word word word word word word word word word\\P';
    const make = () =>
      makeDoc(0, 0, () => {
        const g = columnGroup();
        g[0]!.text = long;
        g[1]!.text = long;
        g[2]!.text = long;
        return g;
      });
    const h = harness(make);
    const before = groupCenter(h.doc, groupOf(h.doc, 'A0'), 20);
    await runWith(h, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'Y']);
    const g = groupOf(h.doc, 'A0');
    const c = groupCenter(h.doc, g, 20);
    expect(c.x).toBeCloseTo(-20 - before.x, 9);
  });

  it('묶음 일부만 대칭하면 예전처럼 제 상자로 뒤집힌다', async () => {
    const h = harness(() => makeDoc());
    const e = h.doc.entityIndex.get('A1') as MTextEntity;
    const b = mtextLocalBox(e, h.doc);
    await runWith(h, 'MIRROR', [{ sel: ['A1'] }, '-10,0', '-10,10', 'Y']);
    const m = h.doc.entityIndex.get('A1') as MTextEntity;
    // 제 상자(41 폭)의 가운데가 거울상 자리
    const cx = 25 + (b.minX + b.maxX) / 2;
    expect(m.insert.x + (b.minX + b.maxX) / 2).toBeCloseTo(-20 - cx, 9);
  });

  it('MIRRTEXT 1이어도 MTEXT는 읽을 수 있게 두므로(지금 동작) 묶음 결과가 0일 때와 같다', async () => {
    const h0 = harness(() => makeDoc(0, 0));
    const h1 = harness(() => makeDoc(0, 1));
    await runWith(h0, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'Y']);
    await runWith(h1, 'MIRROR', [{ sel: ['A0', 'A1', 'A2'] }, '-10,0', '-10,10', 'Y']);
    expect(groupOf(h1.doc, 'A0').map((m) => m.insert.x)).toEqual(groupOf(h0.doc, 'A0').map((m) => m.insert.x));
  });

  it('회전·이동은 영향이 없다', async () => {
    const h = harness(() => makeDoc());
    await runWith(h, 'MOVE', [{ sel: ['A0', 'A1', 'A2'] }, '0,0', '7,0']);
    expect(groupOf(h.doc, 'A0').map((m) => m.insert.x)).toEqual([7, 32, 57]);
  });

  it('보통 MTEXT는 그대로다', async () => {
    const h = harness(() => {
      const d = createNewDocument('metric');
      d.header.set('$MIRRTEXT', 0);
      model(d).push(mtext('B0', 0, 'Hello'));
      return finalizeDocument(d);
    });
    const e0 = h.doc.entityIndex.get('B0') as MTextEntity;
    const b = mtextLocalBox(e0, h.doc);
    await runWith(h, 'MIRROR', [{ sel: ['B0'] }, '-10,0', '-10,10', 'Y']);
    const e = h.doc.entityIndex.get('B0') as MTextEntity;
    expect(e.insert.x + (b.minX + b.maxX) / 2).toBeCloseTo(-20 - (b.minX + b.maxX) / 2, 9);
  });
});
