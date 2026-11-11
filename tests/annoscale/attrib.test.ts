/**
 * 주석 속성(119차): 주석이 아닌 블록의 주석 속성 정의(ATTDEF)로 만드는 속성(ATTRIB).
 * Autodesk 도움말 — 주석 속성은 주석이 아닌 블록에도 쓸 수 있고, 속성 문자는 속성의 용지 높이로 보인다(삽입 때 현재 주석 축척 지원).
 * AutoCAD가 쓴 공개 실도면의 주석 속성 60개: 자기 확장 사전에 축척 레코드 하나, 높이 = 정의 높이 ÷ 정의 축척 × 속성 축척 × |Y 축척|.
 * 예전에는 속성이 정의의 확장 사전을 함께 가리키고(정의 통째 복사), 높이에 주석 축척이 빠지고, 레코드가 없었다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AttribEntity, BlockDef, DictionaryObject, Entity, InsertEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { DocState } from '../../src/app/docstate';
import { annotateTransaction, setCannoscale } from '../../src/app/annoscale-core';
import { makeAttribs } from '../../src/app/blocks';
import type { App } from '../../src/app/app';
import {
  CLASS_ATTRIB,
  ScaleIndex,
  addRecordOps,
  attAnno,
  attribHeightK,
  classVersion,
  contextRecords,
  ensureChain,
  textAnnoFactor,
  textFields,
  textRecordRaw,
  textScaleFactor,
  upper,
  withAnnotativeFlag,
} from '../../src/edit/annoscale';
import { buildAttribs, syncAllOps } from '../../src/edit/util/blockutil';
import { EditSession, type EditOp, type Transaction } from '../../src/edit/session';
import { insert, newDoc } from './helpers';

function setup() {
  const { doc } = newDoc('metric');
  const st = new DocState(1, doc, 't.dxf', 0, 0);
  const app = { lastSelection: [] as string[], active: st, docs: [st] } as unknown as App;
  st.session = new EditSession(doc, () => {});
  const raw = st.session.commit.bind(st.session);
  st.session.commit = (tx: Transaction) => raw(annotateTransaction(app, st, tx));
  setCannoscale(app, st, '1:20', 1);
  return { doc, st, app };
}

type S = ReturnType<typeof setup>;

const attdef = (tag: string, h: number, x = 1, y = 2): AttribEntity => ({
  type: 'ATTDEF',
  ...entityDefaults(),
  handle: '',
  insert: { x, y, z: 0 },
  height: h,
  text: 'V',
  rotation: 0,
  widthFactor: 1,
  oblique: 0,
  style: 'Standard',
  generation: 0,
  halign: 0,
  valign: 0,
  tag,
  prompt: tag,
  attFlags: 0,
});

/** 주석이 아닌 블록 TAG: 주석 속성 정의 A(1:1 레코드, 용지 높이 2.5) · 필드처럼 확장 사전만 있는 보통 속성 정의 B */
function block(s: S, annotativeBlock = false): BlockDef {
  const { doc, st } = s;
  const idx = new ScaleIndex(doc);
  const ops: EditOp[] = [];
  const alloc = () => st.session.newHandle();
  const a = attdef('A', 2.5);
  a.handle = alloc();
  a.xdata = withAnnotativeFlag(undefined, true);
  const ch = ensureChain(doc, a, alloc, ops);
  a.xdict = ch.newXdict;
  addRecordOps(doc, ch.scales, CLASS_ATTRIB, textRecordRaw(classVersion(doc), true, upper(idx.name('1:1')!.handle), { halign: 0, rotation: 0, insert: { x: 1, y: 2 }, align: { x: 0, y: 0 } }, true), alloc, ops);
  const b = attdef('B', 3, 1, -2);
  b.handle = alloc();
  b.xdict = alloc();
  ops.push({ kind: 'object', key: b.xdict, before: null, after: { type: 'DICTIONARY', handle: b.xdict, owner: b.handle, entries: new Map(), hardOwner: false, cloning: 1 } as DictionaryObject });
  st.session.commit({ label: 'DEF', ops });
  const def: BlockDef = { name: 'TAG', handle: alloc(), recordHandle: alloc(), basePoint: { x: 0, y: 0, z: 0 }, flags: 2, entities: [a, b] };
  doc.blocks.set('TAG', def);
  doc.blockRecords.set('TAG', { name: 'TAG', handle: def.recordHandle, flags: 0, insertUnits: 0, explodable: true, scalable: true, ...(annotativeBlock ? { xdata: withAnnotativeFlag(undefined, true) } : {}) });
  return def;
}

const add = (st: DocState, e: Entity) => {
  st.session.commit({ label: 'TEST', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
  return st.doc.entityIndex.get(e.handle)! as InsertEntity;
};

/** INSERT 명령처럼 makeAttribs로 속성을 만든 참조를 넣는다 */
function inserted(s: S, def: BlockDef, sy = 2): InsertEntity {
  const ins = insert('TAG', 100, 0, sy);
  ins.handle = s.st.session.newHandle();
  ins.attribs = makeAttribs(s.app, def, ins.insert, ins.scale, 0, new Map(), ins.handle);
  return add(s.st, ins);
}

describe('주석 속성 정의로 만드는 속성', () => {
  let s: S;
  beforeEach(() => {
    s = setup();
  });

  it('속성은 정의의 확장 사전·반응자를 함께 가리키지 않는다(정의의 필드·주석 축척 사전)', () => {
    const def = block(s);
    const ins = inserted(s, def);
    const [a, b] = ins.attribs;
    expect(a!.xdict).toBeTruthy();
    expect(a!.xdict).not.toBe(def.entities[0]!.xdict);
    expect(b!.xdict).toBeUndefined();
    // 정의의 사전은 그대로(정의가 주인)
    expect((s.doc.objects.get(def.entities[0]!.xdict!) as DictionaryObject).owner).toBe(def.entities[0]!.handle);
    expect(contextRecords(s.doc, def.entities[0]!)).toHaveLength(1);
    // buildAttribs(ATTSYNC·MINSERT·BLOCKREPLACE 무리)도 같다
    const built = buildAttribs(def, ins, new Map(), () => s.st.session.newHandle());
    expect(built.map((x) => x.xdict)).toEqual([undefined, undefined]);
  });

  it('INSERT: 높이 = 용지 높이 × 지금 주석 축척(1:20) × |Y 축척|, 자기 사전에 1:20 레코드(보이는 축척) 하나', () => {
    const def = block(s);
    const ins = inserted(s, def, 2);
    const [a, b] = ins.attribs;
    expect(a!.height).toBeCloseTo(2.5 * 20 * 2);
    expect(b!.height).toBeCloseTo(3 * 2);
    expect(a!.xdata).toEqual(withAnnotativeFlag(undefined, true));
    const recs = contextRecords(s.doc, a!);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.type).toBe(CLASS_ATTRIB);
    expect(recs[0]!.isDefault).toBe(true);
    const idx = new ScaleIndex(s.doc);
    expect(idx.handle(recs[0]!.scale)?.name).toBe('1:20');
    expect((s.doc.objects.get(a!.xdict!) as DictionaryObject).owner).toBe(a!.handle);
    expect(textFields(recs[0]!)?.insert).toEqual({ x: a!.insert.x, y: a!.insert.y });
    expect(attAnno(s.doc, a!, idx)).toMatchObject({ annotative: true, factor: 20 });
    // 명령 취소 한 번에 참조와 레코드가 함께 빠진다
    s.st.session.undo();
    expect(s.doc.entityIndex.get(ins.handle)).toBeUndefined();
    expect(s.doc.objects.get(a!.xdict!)).toBeUndefined();
  });

  it('주석 블록의 참조: 속성 높이는 블록을 따른다(속성 정의 배율을 따로 곱하지 않는다)', () => {
    const def = block(s, true);
    const k = attribHeightK(s.doc, def, new ScaleIndex(s.doc), 20);
    expect(k(def.entities[0] as AttribEntity)).toBe(1);
  });

  it('참조를 옮기면 속성의 레코드가 따라간다', () => {
    const def = block(s);
    const ins = inserted(s, def);
    const moved: InsertEntity = { ...ins, insert: { x: 300, y: 50, z: 0 }, attribs: ins.attribs.map((a) => ({ ...a, insert: { x: a.insert.x + 200, y: a.insert.y + 50, z: 0 } })) };
    s.st.session.commit({ label: 'MOVE', ops: [{ kind: 'modify', block: MODEL_SPACE, before: ins, after: moved }] });
    const a = (s.doc.entityIndex.get(ins.handle) as InsertEntity).attribs[0]!;
    const f = textFields(contextRecords(s.doc, a)[0]!)!;
    expect(f.insert.x).toBeCloseTo(a.insert.x);
    expect(f.insert.y).toBeCloseTo(a.insert.y);
  });

  it('ATTSYNC: 지킨 주석 속성은 자기 사전·보이는 축척을 지키고, 바뀐 것이 없으면 참조를 고치지 않는다', () => {
    const def = block(s);
    const ins = inserted(s, def, 2);
    const a0 = ins.attribs[0]!;
    expect(syncAllOps(s.doc, 'TAG', () => s.st.session.newHandle()).ops).toEqual([]);
    // 정의 높이를 바꾸면(용지 2.5 → 3) 속성은 3 × 20 × 2, 사전은 그대로
    const a = def.entities[0] as AttribEntity;
    const def2: BlockDef = { ...def, entities: [{ ...a, height: 3 }, def.entities[1]!] };
    const r = syncAllOps(s.doc, 'TAG', () => s.st.session.newHandle(), def2);
    expect(r.ops).toHaveLength(1);
    s.st.session.commit({ label: 'ATTSYNC', ops: r.ops });
    const a1 = (s.doc.entityIndex.get(ins.handle) as InsertEntity).attribs[0]!;
    expect(a1.handle).toBe(a0.handle);
    expect(a1.xdict).toBe(a0.xdict);
    expect(a1.height).toBeCloseTo(3 * 20 * 2);
    expect(contextRecords(s.doc, a1)).toHaveLength(1);
  });

  it('복사본(확장 사전을 뗀 속성)은 크기 그대로 지금 축척의 레코드를 얻는다', () => {
    const def = block(s);
    const ins = inserted(s, def, 1);
    const copy: InsertEntity = { ...ins, handle: s.st.session.newHandle(), insert: { x: 500, y: 0, z: 0 }, attribs: ins.attribs.map((a) => ({ ...a, handle: s.st.session.newHandle(), xdict: undefined })) };
    const c = add(s.st, copy);
    expect(c.attribs[0]!.height).toBeCloseTo(ins.attribs[0]!.height);
    expect(contextRecords(s.doc, c.attribs[0]!)).toHaveLength(1);
    expect(c.attribs[0]!.xdict).not.toBe(ins.attribs[0]!.xdict);
    expect(c.attribs[1]!.xdict).toBeUndefined();
  });

  it('SCALETEXT: 주석 속성 정의는 주석 객체(모형 높이는 건너뛰고 도면 높이는 용지 높이 × 축척 배율)', () => {
    const def = block(s);
    const idx = new ScaleIndex(s.doc);
    const [a, b] = def.entities as AttribEntity[];
    expect(textAnnoFactor(s.doc, a!, idx)).toEqual({ annotative: true, factor: 1 });
    expect(textAnnoFactor(s.doc, b!, idx)).toEqual({ annotative: false });
    expect(textScaleFactor(s.doc, a!, 2.5, { kind: 'model', height: 5 }, idx)).toEqual({ skip: 'annotative' });
    expect(textScaleFactor(s.doc, a!, 2.5, { kind: 'paper', height: 5 }, idx)).toEqual({ k: 2 });
    expect(textScaleFactor(s.doc, b!, 3, { kind: 'model', height: 6 }, idx)).toEqual({ k: 2 });
  });
});
