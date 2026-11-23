/**
 * 지시선(LEADER)과 주석을 복사할 때의 연관(160차).
 * Autodesk 도움말 "About Leader Associativity"(ActiveX)·"Leader Associativity"(.NET): 지시선과 주석을 한 번에 함께 복사하면 새 복사본도 연관이고,
 * 따로 복사하면 연관이 아니다. 전에는 복사본 지시선이 원본 주석 핸들(DXF 340)을 그대로 지녀, 함께 복사해도 복사본 주석이 아니라 원본 주석을 가리켰고
 * (복사본 주석은 반응자가 지워져 옮겨도 복사본 지시선이 따라가지 않았다), 지시선만 복사해도 원본 주석을 가리켰다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, LeaderEntity, MTextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, normalizeHandle } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { leaderVertices, pack3 } from '../../src/core/flat3';
import { leaderFollowOps } from '../../src/app/leaderassoc';
import { registerModifyCommands } from '../../src/app/modify';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

/** 지시선 340 ↔ 주석 반응자로 이은 지시선(첫 점 0,0)과 여러 줄 문자(10,10) */
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

const ofType = <T extends Entity>(h: ReturnType<typeof harness>['h'], type: string) => h.doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const same = (a: string | undefined, b: string | undefined) => !!a && !!b && normalizeHandle(a) === normalizeHandle(b);

/** 원본 지시선·주석이 그대로인지 */
function originalsKept(h: ReturnType<typeof harness>['h'], note: string, leader: string): void {
  expect(same((h.doc.entityIndex.get(leader) as LeaderEntity).annotation, note)).toBe(true);
  expect(h.doc.entityIndex.get(note)!.reactors).toEqual([leader]);
}

describe('지시선과 주석의 복사(160차)', () => {
  it('함께 복사하면 복사본 지시선이 복사본 주석을 가리키고, 복사본 주석을 옮기면 복사본 지시선이 따라간다(DXF·DWG에도 그대로)', async () => {
    const { h, note, leader } = harness();
    await runWith(h, 'COPY', [{ sel: [leader, note] }, '0,0', '0,30', '']);
    const ld = ofType<LeaderEntity>(h, 'LEADER').find((e) => e.handle !== leader)!;
    const nt = ofType<MTextEntity>(h, 'MTEXT').find((e) => e.handle !== note)!;
    expect(same(ld.annotation, nt.handle)).toBe(true);
    expect(nt.reactors).toEqual([ld.handle]);
    originalsKept(h, note, leader);
    // 복사본 주석을 옮기면 복사본 지시선 끝이 따라간다(원본 지시선은 그대로)
    const moved = { ...structuredClone(nt), insert: { x: 15, y: 45, z: 0 } } as MTextEntity;
    const extra = leaderFollowOps(h.st, { label: 'MOVE', ops: [{ kind: 'modify', block: MODEL_SPACE, before: nt, after: moved }] } as never);
    expect(extra.map((o) => (o as { before: Entity }).before.handle)).toEqual([ld.handle]);
    // 저장하고 다시 열어도 복사본끼리 이어져 있다
    for (const back of [readDxf(writeDxf(h.doc, { version: 'AC1032' }).data), readDwg(writeDwg(h.doc, { version: 'AC1032' }).data)]) {
      const bl = back.entityIndex.get(normalizeHandle(ld.handle)) as LeaderEntity;
      expect(same(bl.annotation, nt.handle)).toBe(true);
      expect((back.entityIndex.get(normalizeHandle(nt.handle))!.reactors ?? []).map(normalizeHandle)).toContain(normalizeHandle(ld.handle));
      expect(same((back.entityIndex.get(normalizeHandle(leader)) as LeaderEntity).annotation, note)).toBe(true);
    }
  });

  it('지시선만 복사하면 복사본은 주석과 이어지지 않는다(원본 주석을 가리키지 않는다)', async () => {
    const { h, note, leader } = harness();
    await runWith(h, 'COPY', [{ sel: [leader] }, '0,0', '0,30', '']);
    const ld = ofType<LeaderEntity>(h, 'LEADER').find((e) => e.handle !== leader)!;
    expect(ld.annotation).toBeUndefined();
    originalsKept(h, note, leader);
    const back = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data);
    expect((back.entityIndex.get(normalizeHandle(ld.handle)) as LeaderEntity).annotation).toBeUndefined();
  });

  it('배열(A)로 여러 벌 복사하면 같은 자리의 복사본끼리 잇는다', async () => {
    const { h, note, leader } = harness();
    await runWith(h, 'COPY', [{ sel: [leader, note] }, '0,0', 'A', '3', '0,30', '']);
    const leaders = ofType<LeaderEntity>(h, 'LEADER').filter((e) => e.handle !== leader);
    expect(leaders).toHaveLength(2);
    for (const ld of leaders) {
      const nt = ld.annotation ? (h.doc.entityIndex.get(ld.annotation) as MTextEntity | undefined) : undefined;
      expect(nt?.handle).not.toBe(note);
      expect(nt!.insert.y - leaderVertices(ld)[0]!.y).toBeCloseTo(10, 9);
      expect(nt!.reactors).toEqual([ld.handle]);
    }
    originalsKept(h, note, leader);
  });

  it('주석만 복사하면 복사본 주석에는 반응자가 없다(전후 같음)', async () => {
    const { h, note, leader } = harness();
    await runWith(h, 'COPY', [{ sel: [note] }, '0,0', '0,30', '']);
    const nt = ofType<MTextEntity>(h, 'MTEXT').find((e) => e.handle !== note)!;
    expect(nt.reactors).toBeUndefined();
    originalsKept(h, note, leader);
  });
});
