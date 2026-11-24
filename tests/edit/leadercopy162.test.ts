/**
 * 다른 도면에서 옮기는 정의 복사의 지시선(LEADER) 주석 연결(162차).
 * Autodesk 도움말 "About Leader Associativity"(ActiveX)·"Leader Associativity"(.NET): 지시선과 주석을 한 번에 함께 복사하면 새 복사본도 연관이고,
 * 따로 복사하면 연관이 아니다. 정의 복사기(edit/layertools/clone.ts DefinitionCopier)는 모든 객체의 반응자를 지워
 * - 블록·배치를 가져오면(디자인센터·파일을 블록으로·배치 가져오기) 지시선 340은 복사본 주석으로 잇지만 복사본 주석의 반응자가 비어
 *   한쪽만 이어졌다(가져온 배치의 주석을 옮겨도 지시선이 따라가지 않았다),
 * - 다른 도면에서 붙여 넣으면(PASTECLIP·PASTEBLOCK — 의존 정의 복사 app/pastedeps.ts) 주석의 반응자가 지워져 붙여넣기 명령이 주석을 적지 못해
 *   지시선과 주석을 함께 붙여 넣어도 연결이 떼어졌다(같은 도면에서 붙여 넣으면 160·161차부터 이어진다).
 */
import { describe, expect, it } from 'vitest';
import type { BlockDef, Entity, InsertEntity, LeaderEntity, MTextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, normalizeHandle, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { pack3 } from '../../src/core/flat3';
import { DocState } from '../../src/app/docstate';
import { leaderFollowOps } from '../../src/app/leaderassoc';
import { registerModifyCommands } from '../../src/app/modify';
import { DefinitionCopier } from '../../src/edit/layertools/clone';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from '../drawmod/groups';
import { type TestDoc, commit, newDoc } from '../layertools/helpers';

/** 주석(여러 줄 문자, 10,10) — 반응자 = 지시선 */
function note(handle: string, leader: string, owner?: string): MTextEntity {
  return { ...entityDefaults(), type: 'MTEXT', handle, owner, reactors: [leader], insert: { x: 10, y: 10, z: 0 }, height: 2.5, width: 0, attachment: 1, drawingDirection: 1, text: '주석', style: 'Standard', rotation: 0, lineSpacingStyle: 1, lineSpacingFactor: 1, backgroundFlags: 0, backgroundScale: 1.5 } as MTextEntity;
}

/** 지시선(첫 점 0,0) — 340 = 주석 */
function leader(handle: string, annotation: string, owner?: string): LeaderEntity {
  return {
    ...entityDefaults(),
    type: 'LEADER',
    handle,
    owner,
    dimStyle: 'Standard',
    verts: pack3([{ x: 0, y: 0, z: 0 }, { x: 8, y: 9, z: 0 }]),
    arrowHead: true,
    pathType: 0,
    creation: 0,
    hooklineDirection: 0,
    hookline: false,
    textHeight: 2.5,
    textWidth: 0,
    horizontalDirection: { x: 1, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    annotation,
  } as LeaderEntity;
}

/** 명령을 돌리는 도면(src면 지시선과 주석을 넣는다) */
function harness(withPair: boolean) {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, createNewDocument('metric'))));
  registerModifyCommands(h.app);
  if (!withPair) return { h, note: '', leader: '' };
  const nh = h.st.session.newHandle();
  const lh = h.st.session.newHandle();
  h.add(note(nh, lh));
  h.add(leader(lh, nh));
  return { h, note: nh, leader: lh };
}

type H = ReturnType<typeof harness>['h'];
const same = (a: string | undefined, b: string | undefined) => !!a && !!b && normalizeHandle(a) === normalizeHandle(b);
const pick = <T extends Entity>(list: readonly Entity[], type: string) => list.filter((e) => e.type === type) as T[];

/** 원본 지시선·주석이 그대로인지 */
function originalsKept(h: H, nt: string, ld: string): void {
  expect(same((h.doc.entityIndex.get(ld) as LeaderEntity).annotation, nt)).toBe(true);
  expect(h.doc.entityIndex.get(nt)!.reactors).toEqual([ld]);
}

/** 목록의 지시선이 같은 목록의 주석을 가리키고, 그 주석의 반응자가 그 지시선인지 */
function linked(list: readonly Entity[]): { ld: LeaderEntity; nt: MTextEntity } {
  const [ld] = pick<LeaderEntity>(list, 'LEADER');
  const [nt] = pick<MTextEntity>(list, 'MTEXT');
  expect(same(ld!.annotation, nt!.handle)).toBe(true);
  expect(nt!.reactors).toEqual([ld!.handle]);
  return { ld: ld!, nt: nt! };
}

/** 주석을 옮기면 그 지시선이 따라가는지(App 확정 직전 고리 — app/leaderassoc.ts) */
function follows(st: DocState, block: string, ld: LeaderEntity, nt: MTextEntity): void {
  const moved = { ...structuredClone(nt), insert: { x: nt.insert.x + 5, y: nt.insert.y + 5, z: 0 } } as MTextEntity;
  const extra = leaderFollowOps(st, { label: 'MOVE', ops: [{ kind: 'modify', block, before: nt, after: moved }] } as never);
  expect(extra.map((o) => (o as { before: Entity }).before.handle)).toEqual([ld.handle]);
}

describe('다른 도면에서 붙여넣기의 지시선과 주석(162차)', () => {
  it('PASTECLIP: 함께 붙여 넣으면 복사본끼리 잇고(전에는 떼어졌다), 주석을 옮기면 지시선이 따라간다 — DXF·DWG에도 그대로', async () => {
    const src = harness(true);
    const dst = harness(false);
    await src.h.run('COPYBASE', [{ sel: [src.leader, src.note] }, '0,0']);
    await dst.h.run('PASTECLIP', ['0,30']);
    const { ld, nt } = linked(dst.h.doc.blocks.get(MODEL_SPACE)!.entities);
    follows(dst.h.st, MODEL_SPACE, ld, nt);
    originalsKept(src.h, src.note, src.leader);
    for (const back of [readDxf(writeDxf(dst.h.doc, { version: 'AC1032' }).data), readDwg(writeDwg(dst.h.doc, { version: 'AC1032' }).data)]) {
      expect(same((back.entityIndex.get(normalizeHandle(ld.handle)) as LeaderEntity).annotation, nt.handle)).toBe(true);
      expect((back.entityIndex.get(normalizeHandle(nt.handle))!.reactors ?? []).map(normalizeHandle)).toContain(normalizeHandle(ld.handle));
    }
  });

  it('PASTECLIP: 지시선만이면 주석 연결을 떼고, 주석만이면 복사본 주석에 반응자가 없다(전후 같음)', async () => {
    const src = harness(true);
    const dst = harness(false);
    await src.h.run('COPYBASE', [{ sel: [src.leader] }, '0,0']);
    await dst.h.run('PASTECLIP', ['0,30']);
    expect(modelEntities(dst.h.doc, 'LEADER')[0]!.annotation).toBeUndefined();
    await src.h.run('COPYBASE', [{ sel: [src.note] }, '0,0']);
    await dst.h.run('PASTECLIP', ['0,60']);
    expect(modelEntities(dst.h.doc, 'MTEXT')[0]!.reactors).toBeUndefined();
    originalsKept(src.h, src.note, src.leader);
  });

  it('PASTEBLOCK: 함께 붙여 넣으면 블록 안의 복사본끼리 잇는다(전에는 떼어졌다)', async () => {
    const src = harness(true);
    const dst = harness(false);
    await src.h.run('COPYBASE', [{ sel: [src.leader, src.note] }, '0,0']);
    await dst.h.run('PASTEBLOCK', ['0,30']);
    const ins = modelEntities(dst.h.doc, 'INSERT')[0] as InsertEntity;
    linked(dst.h.doc.blocks.get(tableKey(ins.block))!.entities);
    originalsKept(src.h, src.note, src.leader);
  });
});

/** 이은 지시선과 주석으로 된 새 블록(name) */
function pairInBlock(t: TestDoc, name: string): void {
  const rec = t.nh();
  const nh = t.nh();
  const lh = t.nh();
  const def: BlockDef = { name, handle: t.nh(), recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags: 0, layer: '0', entities: [note(nh, lh, rec), leader(lh, nh, rec)], endHandle: t.nh() };
  commit(t, [
    { kind: 'blockRecord', key: tableKey(name), before: null, after: { name, handle: rec, flags: 0, insertUnits: 0, explodable: true, scalable: true } },
    { kind: 'blockDef', key: tableKey(name), before: null, after: def },
  ]);
}

describe('정의 복사(디자인센터·배치 가져오기)의 지시선과 주석(162차)', () => {
  it('블록: 블록 안의 복사본 주석 반응자에 복사본 지시선을 넣는다(전에는 340만 이어져 반응자가 비었다)', () => {
    const s = newDoc();
    pairInBlock(s, 'TAG');
    const d = newDoc();
    const cp = new DefinitionCopier(s.doc, d.doc, d.nh);
    expect(cp.copy('block', 'TAG')).toBe('added');
    commit(d, cp.finish());
    linked(d.doc.blocks.get('TAG')!.entities);
    // 원본 도면의 블록은 그대로(두 도면은 핸들을 따로 매기므로 핸들 값은 견주지 않는다)
    linked(s.doc.blocks.get('TAG')!.entities);
  });

  it('배치: 가져온 배치의 주석을 옮기면 지시선이 따라간다(전에는 따라가지 않았다)', () => {
    const s = newDoc();
    const lay = s.doc.layouts.find((l) => tableKey(l.blockName) !== MODEL_SPACE)!;
    const key = tableKey(lay.blockName);
    const owner = s.doc.blocks.get(key)!.recordHandle;
    const nh = s.nh();
    const lh = s.nh();
    commit(s, [
      { kind: 'add', block: key, entity: { ...note(nh, lh, owner), paperSpace: true } as Entity },
      { kind: 'add', block: key, entity: { ...leader(lh, nh, owner), paperSpace: true } as Entity },
      { kind: 'layout', key, before: lay, after: { ...lay, name: '상세도' } },
    ]);
    const d = newDoc();
    const cp = new DefinitionCopier(s.doc, d.doc, d.nh);
    expect(cp.copy('layout', '상세도')).toBe('added');
    commit(d, cp.finish());
    const nl = d.doc.layouts.find((l) => l.name === '상세도')!;
    const { ld, nt } = linked(d.doc.blocks.get(tableKey(nl.blockName))!.entities);
    const st = new DocState(1, d.doc, 'dst.dxf', 0, 0);
    st.session = d.session;
    follows(st, tableKey(nl.blockName), ld, nt);
  });
});
