/**
 * 편집 명령 확정을 거치지 않는 복사 경로의 지시선(LEADER) 주석 연결(161차).
 * Autodesk 도움말 "About Leader Associativity"(ActiveX)·"Leader Associativity"(.NET): 지시선과 주석을 한 번에 함께 복사하면 새 복사본도 연관이고,
 * 따로 복사하면 연관이 아니다. 160차는 편집 명령 확정(COPY·배열·붙여넣기·끌어 복사·분해)에서 이 규칙을 지켰는데, 블록 정의로 복사하는 세 경로
 * (블록으로 붙여넣기, BLOCK의 유지, 연관 배열의 원본 블록)는 새 핸들을 주면서 지시선의 주석 핸들(DXF 340)을 그대로 두어 복사본 지시선이 원본 주석을 가리켰다
 * (연관 배열을 만들면 원본을 지우므로 없는 객체를 가리켰다). 복사본 주석은 반응자가 지워져 복사본끼리 이어지지 않았다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, InsertEntity, LeaderEntity, MTextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, normalizeHandle, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { pack3 } from '../../src/core/flat3';
import { registerModifyCommands } from '../../src/app/modify';
import { defineBlockOps } from '../../src/app/blockdefine';
import { type BuildEnv, blockCopies, createArrayOps } from '../../src/edit/assocarray/build';
import { readArray } from '../../src/edit/assocarray/read';
import type { RectParams } from '../../src/edit/assocarray/types';
import { allocBlockName } from '../../src/edit/geom/types';
import { affTranslate } from '../../src/edit/geom/math';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeHarness, modelEntities } from '../cmds2/harness';
import { perCommandGroups } from '../drawmod/groups';

/** 지시선 340 ↔ 주석 반응자로 이은 지시선(첫 점 0,0)과 여러 줄 문자(10,10) — 160차 시험과 같은 꼴 */
function harness() {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, createNewDocument('metric'))));
  registerModifyCommands(h.app);
  const nh = h.st.session.newHandle();
  const lh = h.st.session.newHandle();
  h.add({ ...entityDefaults(), type: 'MTEXT', handle: nh, reactors: [lh], insert: { x: 10, y: 10, z: 0 }, height: 2.5, width: 0, attachment: 1, drawingDirection: 1, text: '주석', style: 'Standard', rotation: 0, lineSpacingStyle: 1, lineSpacingFactor: 1, backgroundFlags: 0, backgroundScale: 1.5 } as MTextEntity);
  h.add({
    ...entityDefaults(),
    type: 'LEADER',
    handle: lh,
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
    annotation: nh,
  } as LeaderEntity);
  return { h, note: nh, leader: lh };
}

type H = ReturnType<typeof harness>['h'];
const same = (a: string | undefined, b: string | undefined) => !!a && !!b && normalizeHandle(a) === normalizeHandle(b);
const pick = <T extends Entity>(list: readonly Entity[], type: string) => list.filter((e) => e.type === type) as T[];

/** 원본 지시선·주석이 그대로인지 */
function originalsKept(h: H, note: string, leader: string): void {
  expect(same((h.doc.entityIndex.get(leader) as LeaderEntity).annotation, note)).toBe(true);
  expect(h.doc.entityIndex.get(note)!.reactors).toEqual([leader]);
}

/** 한 블록 안의 복사본 지시선이 같은 블록의 복사본 주석을 가리키고, 그 주석의 반응자가 그 지시선인지 */
function linkedInside(list: readonly Entity[], note: string, leader: string): { ld: LeaderEntity; nt: MTextEntity } {
  const [ld] = pick<LeaderEntity>(list, 'LEADER');
  const [nt] = pick<MTextEntity>(list, 'MTEXT');
  expect(ld!.handle).not.toBe(leader);
  expect(nt!.handle).not.toBe(note);
  expect(same(ld!.annotation, nt!.handle)).toBe(true);
  expect(nt!.reactors).toEqual([ld!.handle]);
  return { ld: ld!, nt: nt! };
}

/** 블록으로 붙여넣은 블록 정의의 객체 */
function pastedBlock(h: H): Entity[] {
  const ins = modelEntities(h.doc, 'INSERT')[0] as InsertEntity;
  return h.doc.blocks.get(tableKey(ins.block))!.entities;
}

const env = (h: H): BuildEnv => ({ doc: h.doc, newHandle: () => h.st.session.newHandle(), newBlockName: () => allocBlockName(h.doc, '*U') });

describe('블록으로 붙여넣기(PASTEBLOCK)의 지시선과 주석(161차)', () => {
  it('함께 붙여 넣으면 블록 안의 복사본 지시선이 복사본 주석을 가리킨다(전에는 모형 공간의 원본 주석)', async () => {
    const { h, note, leader } = harness();
    await h.run('COPYBASE', [{ sel: [leader, note] }, '0,0']);
    await h.run('PASTEBLOCK', ['0,30']);
    linkedInside(pastedBlock(h), note, leader);
    originalsKept(h, note, leader);
  });

  it('지시선만 붙여 넣으면 복사본은 주석과 이어지지 않는다', async () => {
    const { h, note, leader } = harness();
    await h.run('COPYBASE', [{ sel: [leader] }, '0,0']);
    await h.run('PASTEBLOCK', ['0,30']);
    const [ld] = pick<LeaderEntity>(pastedBlock(h), 'LEADER');
    expect(ld!.annotation).toBeUndefined();
    originalsKept(h, note, leader);
  });

  it('주석만 붙여 넣으면 복사본 주석에는 반응자가 없다(전후 같음)', async () => {
    const { h, note, leader } = harness();
    await h.run('COPYBASE', [{ sel: [note] }, '0,0']);
    await h.run('PASTEBLOCK', ['0,30']);
    const [nt] = pick<MTextEntity>(pastedBlock(h), 'MTEXT');
    expect(nt!.reactors).toBeUndefined();
    originalsKept(h, note, leader);
  });
});

describe('BLOCK의 지시선과 주석(161차)', () => {
  it('유지(R): 함께 정의하면 블록 안의 복사본끼리 잇고, 지시선만이면 연결을 뗀다', () => {
    for (const [name, handles] of [['K', 'both'], ['L', 'leader']] as const) {
      const { h, note, leader } = harness();
      const r = defineBlockOps(h.app, { name, base: { x: 0, y: 0, z: 0 }, handles: handles === 'both' ? [leader, note] : [leader], mode: 'retain' });
      if ('error' in r) throw new Error(r.error);
      h.st.session.commit({ label: 'BLOCK', ops: r.ops });
      const ents = h.doc.blocks.get(name)!.entities;
      if (handles === 'both') linkedInside(ents, note, leader);
      else expect(pick<LeaderEntity>(ents, 'LEADER')[0]!.annotation).toBeUndefined();
      originalsKept(h, note, leader);
    }
  });

  it('블록으로 변환(C): 객체가 핸들째 옮겨 가 연결이 그대로다(전후 같음)', () => {
    const { h, note, leader } = harness();
    const r = defineBlockOps(h.app, { name: 'K', base: { x: 0, y: 0, z: 0 }, handles: [leader, note], mode: 'convert' });
    if ('error' in r) throw new Error(r.error);
    h.st.session.commit({ label: 'BLOCK', ops: r.ops });
    const ents = h.doc.blocks.get('K')!.entities;
    expect(ents.map((e) => e.handle).sort()).toEqual([leader, note].sort());
    originalsKept(h, note, leader);
  });
});

describe('연관 배열의 지시선과 주석(161차)', () => {
  it('함께 배열하면 원본 블록 안의 복사본끼리 잇는다(전에는 지운 원본 주석을 가리켰다) — DXF·DWG에도 그대로', () => {
    const { h, note, leader } = harness();
    const params: RectParams = { kind: 'rect', base: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, columns: 3, columnSpacing: 30, rows: 1, rowSpacing: 30, rowElevation: 0, levels: 1, levelSpacing: 1, axesAngle: Math.PI / 2 };
    const { handle: _h, ...props } = { ...entityDefaults(), handle: '' };
    void _h;
    const sources = [h.doc.entityIndex.get(leader)!, h.doc.entityIndex.get(note)!];
    const r = createArrayOps(env(h), { params, sources, normalize: affTranslate(0, 0), insert: { x: 0, y: 0, z: 0 }, rotation: 0, props, space: MODEL_SPACE });
    if ('error' in r) throw new Error(r.error);
    h.st.session.commit({ label: 'ARRAYRECT', ops: r.ops });
    // 원본은 원본 블록으로 들어가 모형 공간에서 지워진다
    expect(h.doc.entityIndex.has(leader)).toBe(false);
    expect(h.doc.entityIndex.has(note)).toBe(false);
    const info = readArray(h.doc, h.doc.entityIndex.get(r.insert.handle))!;
    const { ld, nt } = linkedInside(h.doc.blocks.get(tableKey(info.state.source))!.entities, note, leader);
    for (const back of [readDxf(writeDxf(h.doc, { version: 'AC1032' }).data), readDwg(writeDwg(h.doc, { version: 'AC1032' }).data)]) {
      expect(same((back.entityIndex.get(normalizeHandle(ld.handle)) as LeaderEntity).annotation, nt.handle)).toBe(true);
      expect((back.entityIndex.get(normalizeHandle(nt.handle))!.reactors ?? []).map(normalizeHandle)).toContain(normalizeHandle(ld.handle));
    }
  });

  it('지시선만 원본 블록으로 복사하면 연결을 뗀다', () => {
    const { h, note, leader } = harness();
    const out = blockCopies(env(h), [h.doc.entityIndex.get(leader)!], affTranslate(0, 0));
    expect((out.entities[0] as LeaderEntity).annotation).toBeUndefined();
    originalsKept(h, note, leader);
  });
});
