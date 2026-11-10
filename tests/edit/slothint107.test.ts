/**
 * 107차: 바꾸기 변경(modify)의 자리 짐작(index). 계획 때 ownerOf가 찾은 자리를 변경에 달아 applyOps가 블록 전체의 자리 표를 만들지 않는다
 * (객체 150만 개 블록에서 2,000개를 옮기면 그 표가 확정의 대부분이었다).
 * - 맞는 짐작이면 표를 만들지 않고, 틀린 짐작(다른 핸들·범위 밖·소수·음수)은 전처럼 찾아 짐작 없는 적용과 같은 문서가 된다
 * - 되돌리기(inverseTransaction)도 짐작을 지녀 표 없이 되돌린다
 * - 워커로도 보내고(packOps·묶음 부호화), 받은 쪽(바꾸기 전 객체는 핸들만)도 메인과 같은 문서가 된다
 * - slotHint: 빠른 길은 지금 블록에서 확인한 자리, 핸들이 겹친 문서(옛 길)는 짐작 없음
 * - MOVE 확정의 바꾸기 변경마다 지금 자리가 달리고, 짐작을 지운 같은 확정과 문서·명령 취소·다시 하기가 같다
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { EditSession, applyOps, inverseTransaction } from '../../src/edit/session';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

type Modify = Extract<EditOp, { kind: 'modify' }>;

const line = (handle: string, x = 0): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x, y: 0, z: 0 }, end: { x: x + 1, y: 0, z: 0 } });

function docWith(n: number): { doc: CadDocument; list: LineEntity[] } {
  const doc = createNewDocument('metric');
  const list = doc.blocks.get(MODEL_SPACE)!.entities as LineEntity[];
  for (let i = 0; i < n; i++) {
    const e = line(`A${(i + 16).toString(16).toUpperCase()}`, i);
    list.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  return { doc, list };
}

/** 같은 핸들로 옮긴 객체 */
const moved = (e: LineEntity, d = 5): LineEntity => ({ ...e, start: { ...e.start, y: e.start.y + d }, end: { ...e.end, y: e.end.y + d } });

/** 자리 표(핸들 → 수)를 만든 Map.set 횟수. 핸들 색인(HandleIndex·Map)은 객체를 넣으므로 세지 않는다 */
function tableSets(f: () => void): number {
  const set = vi.spyOn(Map.prototype, 'set');
  f();
  const n = set.mock.calls.filter((c) => typeof c[1] === 'number').length;
  set.mockRestore();
  return n;
}

const blockState = (doc: CadDocument) => JSON.stringify(doc.blocks.get(MODEL_SPACE)!.entities);
const indexState = (doc: CadDocument) => JSON.stringify([...doc.entityIndex].map(([k, e]) => [k, JSON.stringify(e)]).sort());

afterEach(() => {
  vi.restoreAllMocks();
});

describe('바꾸기 자리 짐작 적용', () => {
  it('맞는 짐작이면 자리 표를 만들지 않고 같은 객체를 바꾼다(짐작 없는 적용과 같은 문서)', () => {
    const a = docWith(1000);
    const b = docWith(1000);
    const pick = Array.from({ length: 100 }, (_, k) => k * 9 + 3);
    const withHint: EditOp[] = pick.map((i) => ({ kind: 'modify', block: MODEL_SPACE, before: a.list[i]!, after: moved(a.list[i]!), index: i }));
    const without: EditOp[] = pick.map((i) => ({ kind: 'modify', block: MODEL_SPACE, before: b.list[i]!, after: moved(b.list[i]!) }));
    expect(tableSets(() => applyOps(a.doc, withHint))).toBe(0);
    // 짐작이 없으면 전처럼 블록 전체(1,000개)의 자리 표를 만든다
    expect(tableSets(() => applyOps(b.doc, without))).toBeGreaterThanOrEqual(1000);
    expect(blockState(a.doc)).toBe(blockState(b.doc));
    expect(indexState(a.doc)).toBe(indexState(b.doc));
    for (const [k, i] of pick.entries()) expect(a.doc.blocks.get(MODEL_SPACE)!.entities[i]).toBe((withHint[k] as Modify).after);
  });

  it('틀린 짐작(다른 핸들·범위 밖·소수·음수)은 전처럼 찾아 같은 문서가 된다', () => {
    const a = docWith(300);
    const b = docWith(300);
    const bad = [(i: number) => i + 1, () => 5000, (i: number) => i + 0.5, () => -1, () => 0];
    const pick = Array.from({ length: 80 }, (_, k) => k * 3 + 7);
    const withHint: EditOp[] = pick.map((i, k) => ({ kind: 'modify', block: MODEL_SPACE, before: a.list[i]!, after: moved(a.list[i]!), index: bad[k % bad.length]!(i) }));
    const without: EditOp[] = pick.map((i) => ({ kind: 'modify', block: MODEL_SPACE, before: b.list[i]!, after: moved(b.list[i]!) }));
    applyOps(a.doc, withHint);
    applyOps(b.doc, without);
    expect(blockState(a.doc)).toBe(blockState(b.doc));
    expect(indexState(a.doc)).toBe(indexState(b.doc));
    // 적은 변경(자리 표를 만들지 않고 훑는 길)도 같다
    const c = docWith(50);
    const d = docWith(50);
    applyOps(c.doc, [{ kind: 'modify', block: MODEL_SPACE, before: c.list[10]!, after: moved(c.list[10]!), index: 11 }]);
    applyOps(d.doc, [{ kind: 'modify', block: MODEL_SPACE, before: d.list[10]!, after: moved(d.list[10]!) }]);
    expect(blockState(c.doc)).toBe(blockState(d.doc));
  });

  it('같은 묶음에서 앞 변경이 자리를 밀면(블록 정의 바꾸기 등) 짐작이 빗나가도 맞는 객체를 바꾼다', () => {
    const a = docWith(200);
    const b = docWith(200);
    const ops = (x: { list: LineEntity[] }, hint: boolean): EditOp[] => [
      { kind: 'remove', block: MODEL_SPACE, entity: x.list[0]!, index: 0 },
      ...Array.from({ length: 70 }, (_, k): EditOp => {
        const i = k * 2 + 5;
        const op: Modify = { kind: 'modify', block: MODEL_SPACE, before: x.list[i]!, after: moved(x.list[i]!) };
        // 지우기 앞의 자리(하나씩 밀렸다)
        if (hint) op.index = i;
        return op;
      }),
    ];
    applyOps(a.doc, ops(a, true));
    applyOps(b.doc, ops(b, false));
    expect(blockState(a.doc)).toBe(blockState(b.doc));
  });
});

describe('되돌리기·워커', () => {
  it('되돌리기 변경도 짐작을 지니고 자리 표 없이 되돌린다', () => {
    const { doc, list } = docWith(500);
    const before = blockState(doc);
    const s = new EditSession(doc, () => {});
    const ops: EditOp[] = Array.from({ length: 120 }, (_, k): EditOp => ({ kind: 'modify', block: MODEL_SPACE, before: list[k * 4]!, after: moved(list[k * 4]!), index: k * 4 }));
    expect(tableSets(() => s.commit({ label: 'MOVE', ops }))).toBe(0);
    const inv = inverseTransaction({ label: 'MOVE', ops }).ops as Modify[];
    expect(inv.map((o) => o.index)).toEqual((ops as Modify[]).map((o) => o.index).reverse());
    expect(tableSets(() => s.undo())).toBe(0);
    expect(blockState(doc)).toBe(before);
    s.redo();
    expect(blockState(doc)).not.toBe(before);
  });

  it('워커로도 보내고(구조화 복제·묶음 부호화), 받은 쪽도 자리 표 없이 메인과 같은 문서가 된다', () => {
    const main = docWith(400);
    const worker = docWith(400);
    const viaClone = docWith(400);
    const ops: EditOp[] = Array.from({ length: 300 }, (_, k): EditOp => ({ kind: 'modify', block: MODEL_SPACE, before: main.list[k]!, after: moved(main.list[k]!), index: k }));
    const wire = packOps(ops);
    expect(wire.every((o) => o.kind === 'modify' && o.index !== undefined)).toBe(true);
    const enc = encodeWire(wire)!;
    expect(enc).not.toBeNull();
    applyOps(main.doc, ops);
    expect(tableSets(() => applyOps(worker.doc, unpackOps(decodeWire(enc))))).toBe(0);
    applyOps(viaClone.doc, unpackOps(structuredClone(wire)));
    expect(blockState(worker.doc)).toBe(blockState(main.doc));
    expect(blockState(viaClone.doc)).toBe(blockState(main.doc));
  });
});

describe('slotHint', () => {
  it('빠른 길은 지금 블록에서 확인한 자리(앞을 지워 밀린 뒤에도), 없는 핸들은 짐작 없음', () => {
    const { doc, list } = docWith(100);
    const s = new EditSession(doc, () => {});
    expect(s.slotHint(list[40]!.handle)).toBe(40);
    s.commit({ label: 'E', ops: [{ kind: 'remove', block: MODEL_SPACE, entity: list[3]!, index: 3 }] });
    // 지운 자리 뒤의 객체는 한 자리씩 당겨졌다(list는 블록 배열 그대로)
    for (const i of [0, 2, 39, 98]) expect(s.slotHint(list[i]!.handle)).toBe(i);
    expect(s.slotHint('FFFFFF')).toBeUndefined();
    // ownerOf 바로 뒤에는 다시 찾지 않는다
    expect(s.ownerOf(list[50]!.handle)).toBe(MODEL_SPACE);
    const again = vi.spyOn(s, 'ownerOf');
    expect(s.slotHint(list[50]!.handle)).toBe(50);
    expect(again).not.toHaveBeenCalled();
    expect(s.slotHint(list[60]!.handle)).toBe(60);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('핸들이 겹친 문서(옛 길)는 짐작을 주지 않는다', () => {
    const { doc, list } = docWith(30);
    const dup = line(list[5]!.handle, 99);
    list.push(dup);
    const s = new EditSession(doc, () => {});
    expect(s.ownerOf(list[7]!.handle)).toBe(MODEL_SPACE);
    expect(s.slotHint(list[7]!.handle)).toBeUndefined();
    expect(s.slotHint(dup.handle)).toBeUndefined();
  });

  it('빠른 길에서 찾은 뒤 문서가 옛 길로 바뀌면(핸들이 겹침) 그 핸들도 짐작을 주지 않는다', () => {
    const { doc, list } = docWith(30);
    for (let b = 1; b <= 9; b++) doc.blocks.set(`B${b}`, { name: `B${b}`, handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [] });
    const s = new EditSession(doc, () => {});
    expect(s.slotHint(list[7]!.handle)).toBe(7);
    list.push(line(list[5]!.handle, 99));
    // 108차부터 빠른 길은 명령 취소 뒤에도 기억을 남긴다: 짐작은 지금 그 핸들이 든(확인한) 자리다
    s.commit({ label: 'X', ops: [{ kind: 'header', name: '$TEST107', before: undefined, after: 1 }] });
    s.undo();
    expect(s.slotHint(list[7]!.handle)).toBe(7);
    expect(s.slotHint(list[5]!.handle)).toBe(5);
    // 객체를 넣은 블록이 많아 기억을 버리면 다음 찾기에서 표를 다시 만들며 겹친 핸들을 본다
    s.commit({ label: 'Y', ops: Array.from({ length: 9 }, (_, b): EditOp => ({ kind: 'add', block: `B${b + 1}`, entity: line(`C${b}`, b) })) });
    expect(s.slotHint(list[7]!.handle)).toBeUndefined();
  });
});

describe('MOVE 확정', () => {
  async function moveRun(n: number, opt: { noHint?: boolean; dup?: boolean; eraseFirst?: number } = {}) {
    const h = perCommandGroups(
      makeHarness((doc) => {
        // 소유 레코드 핸들(owner)은 시험 문서마다 달라 두 판 견주기에서 빼려고 두지 않는다
        const list = doc.blocks.get(MODEL_SPACE)!.entities;
        for (let i = 0; i < n; i++) {
          const e = line(`B${(i + 256).toString(16).toUpperCase()}`, i * 2);
          list.push(e);
          doc.entityIndex.set(e.handle, e);
        }
        if (opt.dup) list.push(line((list[1] as LineEntity).handle, -50));
      }),
    );
    registerDrawCommands(h.app);
    registerModifyCommands(h.app);
    if (opt.noHint) h.st.session.slotHint = () => undefined;
    const all = () => h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
    if (opt.eraseFirst) await runWith(h, 'ERASE', [{ sel: all().slice(0, opt.eraseFirst) }]);
    const list = h.doc.blocks.get(MODEL_SPACE)!.entities;
    const pick = all().filter((_, i) => i % 3 === 1);
    const at = new Map(pick.map((x) => [x, list.findIndex((e) => e.handle === x)]));
    await runWith(h, 'MOVE', [{ sel: pick }, '0,0', '7,3']);
    const ops = h.st.session.undoTop()!.ops.filter((o): o is Modify => o.kind === 'modify');
    const state = () => [blockState(h.doc), indexState(h.doc)];
    const moveDoc = state();
    h.st.session.undo();
    const undone = state();
    h.st.session.redo();
    const redone = state();
    return { ops, at, moveDoc, undone, redone, printed: h.printed };
  }

  it('바꾸기 변경마다 지금 자리가 달리고, 짐작을 지운 같은 확정과 문서·명령 취소·다시 하기가 같다', async () => {
    for (const eraseFirst of [0, 9]) {
      const hinted = await moveRun(240, { eraseFirst });
      const plain = await moveRun(240, { eraseFirst, noHint: true });
      expect(hinted.ops.length).toBe(hinted.at.size);
      expect(hinted.ops.length).toBeGreaterThanOrEqual(64);
      for (const op of hinted.ops) expect(op.index).toBe(hinted.at.get(op.before.handle));
      expect(plain.ops.every((op) => !('index' in op))).toBe(true);
      expect(hinted.moveDoc).toEqual(plain.moveDoc);
      expect(hinted.undone).toEqual(plain.undone);
      expect(hinted.redone).toEqual(plain.redone);
      expect(hinted.printed).toEqual(plain.printed);
    }
  });

  it('핸들이 겹친 문서의 MOVE는 짐작 없이 전처럼 확정한다', async () => {
    const r = await moveRun(120, { dup: true });
    expect(r.ops.length).toBeGreaterThan(0);
    expect(r.ops.every((op) => !('index' in op))).toBe(true);
  });
});
