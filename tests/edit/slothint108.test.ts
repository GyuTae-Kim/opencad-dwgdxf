/**
 * 108차: commitResults 밖에서 바꾸기 변경을 만드는 길(CHPROP·CHANGE(특성·점)·MATCHPROP·특성 팔레트·FIND 바꾸기·SETBYLAYER)에도
 * 107차 자리 짐작(index — EditSession.slotHint/hinted)을 단다. 큰 선택의 특성 바꾸기가 적용 때 블록 전체의 자리 표를 만들지 않게.
 * - 바꾸기 변경마다 지금 자리가 달리고(앞을 지워 밀린 뒤에도), 짐작을 끈 같은 명령과 문서·명령 취소·다시 하기·출력이 같다
 * - 워커로 보낸 변경(packOps·묶음 부호화)도 같은 문서가 된다
 * - 핸들이 겹친 문서(옛 길)는 짐작 없이 전처럼
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { EditOp } from '../../src/edit/session';
import { applyOps } from '../../src/edit/session';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerPropCommands } from '../../src/app/propcmds';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerLayerToolCommands, setSetByLayerMode } from '../../src/app/layerstate-tools';
import { SBL_DEFAULT } from '../../src/edit/layerstate/setbylayer';
import { GENERAL_FIELDS, applyField } from '../../src/app/propedit';
import { findTargets, replaceTargets } from '../../src/app/textedit/findreplace';
import { decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import { type Harness, makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

type Modify = Extract<EditOp, { kind: 'modify' }>;

const N = 240;
const line = (handle: string, i: number): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, color: { aci: 3 }, lineweight: 50, start: { x: i * 2, y: 0, z: 0 }, end: { x: i * 2 + 1, y: 0, z: 0 } });
const text = (handle: string, i: number): TextEntity => ({ ...entityDefaults(), type: 'TEXT', handle, insert: { x: i * 2, y: 5, z: 0 }, height: 1, text: `AB ${i}`, rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 });

/** 같은 핸들의 시험 문서(앞 셋 중 하나는 문자) */
function fill(doc: CadDocument, dup: boolean): void {
  const list = doc.blocks.get(MODEL_SPACE)!.entities;
  for (let i = 0; i < N; i++) {
    const h = `C${(i + 256).toString(16).toUpperCase()}`;
    const e = i % 3 === 2 ? text(h, i) : line(h, i);
    list.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  if (dup) list.push(line((list[1] as LineEntity).handle, -50));
}

const blockState = (doc: CadDocument) => JSON.stringify(doc.blocks.get(MODEL_SPACE)!.entities);
const indexState = (doc: CadDocument) => JSON.stringify([...doc.entityIndex].map(([k, e]) => [k, JSON.stringify(e)]).sort());

type Cmd = ((h: Harness, pick: string[]) => Promise<unknown> | unknown) & { prep?: (h: Harness) => void };

async function run(cmd: Cmd, opt: { noHint?: boolean; dup?: boolean } = {}) {
  const h = perCommandGroups(makeHarness((doc) => fill(doc, !!opt.dup)));
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  registerPropCommands(h.app);
  registerEditCommands(h.app);
  registerLayerToolCommands(h.app);
  setSetByLayerMode(SBL_DEFAULT);
  if (opt.noHint) h.st.session.slotHint = () => undefined;
  const all = () => h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
  // 앞을 지워 자리를 민 뒤(짐작이 처음 자리와 달라야 시험이 된다)
  await runWith(h, 'ERASE', [{ sel: all().slice(0, 9) }], 11);
  const erased = h.st.session.undoTop()!.ops;
  cmd.prep?.(h);
  const pre = h.st.session.undoTop()!.ops;
  const pick = all().filter((_, i) => i % 3 !== 0 && i < N - 20);
  const at = new Map(all().map((x, i) => [x, i]));
  const depth = h.st.session.depth;
  await cmd(h, pick);
  expect(h.st.session.depth).toBe(depth + 1);
  const tx = h.st.session.undoTop()!.ops;
  const ops = tx.filter((o): o is Modify => o.kind === 'modify');
  const state = () => [blockState(h.doc), indexState(h.doc)];
  const after = state();
  h.st.session.undo();
  const undone = state();
  h.st.session.redo();
  const redone = state();
  // 워커: 같은 처음 문서에 지우기·이 명령을 묶음 부호화로 받아 적용한다
  const w = makeHarness((doc) => fill(doc, !!opt.dup)).doc;
  for (const t of pre === erased ? [erased, tx] : [erased, pre, tx]) applyOps(w, unpackOps(decodeWire(encodeWire(packOps(t))!)));
  return { ops, at, after, undone, redone, worker: blockState(w), printed: h.printed };
}

/** 처음 문서에서의 자리(핸들 C100부터 차례로) */
const first = (h: string) => parseInt(h.slice(1), 16) - 256;

const CASES: [string, Cmd][] = [
  ['CHPROP 색상', (h, pick) => runWith(h, 'CHPROP', [{ sel: pick }, 'C', '5', ''])],
  ['CHANGE 특성(선가중치·두께)', (h, pick) => runWith(h, 'CHANGE', [{ sel: pick }, 'P', 'LW', '0.3', 'T', '2', ''])],
  ['CHANGE 점(선 끝점)', (h, pick) => runWith(h, 'CHANGE', [{ sel: pick.filter((x) => h.doc.entityIndex.get(x)!.type === 'LINE') }, '7,9'])],
  [
    'MATCHPROP',
    Object.assign((h: Harness, pick: string[]) => runWith(h, 'MATCHPROP', [{ pick: h.doc.blocks.get(MODEL_SPACE)!.entities.at(-1)!.handle, at: [0, 0] }, { sel: pick }, '']), {
      // 원본(마지막 객체)의 색·선종류를 바꿔 둔다(명령 밖 확정)
      prep: (h: Harness) => {
        const src = h.doc.blocks.get(MODEL_SPACE)!.entities.at(-1)!;
        h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: MODEL_SPACE, before: src, after: { ...src, color: { aci: 1 }, linetype: 'ByBlock' } as Entity }] });
      },
    }),
  ],
  ['특성 팔레트(색상)', (h, pick) => applyField(h.app, pick, GENERAL_FIELDS.find((f) => f.label === '색상')!, { aci: 6 })],
  [
    'FIND 바꾸기',
    (h) => {
      const q = { query: 'AB', matchCase: false, wholeWord: false, scope: 'all' as const, kinds: new Set(['text'] as const) };
      return replaceTargets(h.app, findTargets(h.app, q), q, 'XY');
    },
  ],
  ['SETBYLAYER', (h, pick) => runWith(h, 'SETBYLAYER', [{ sel: pick }, 'N', 'N'])],
];

describe('commitResults 밖의 바꾸기 길에도 자리 짐작(108차)', () => {
  for (const [name, cmd] of CASES)
    it(`${name}: 바꾸기 변경마다 지금 자리, 짐작 없는 같은 명령과 문서·명령 취소·다시·워커가 같다`, async () => {
      const hinted = await run(cmd);
      const plain = await run(cmd, { noHint: true });
      // 적용 때 자리 표를 만드는 크기(64개 이상)
      expect(hinted.ops.length).toBeGreaterThanOrEqual(64);
      // 지금 자리 = 처음 자리 − 앞에서 지운 9개
      for (const op of hinted.ops) {
        expect(op.index, op.before.handle).toBe(hinted.at.get(op.before.handle));
        expect(op.index, op.before.handle).toBe(first(op.before.handle) - 9);
      }
      expect(plain.ops.every((op) => !('index' in op))).toBe(true);
      expect(hinted.after).toEqual(plain.after);
      expect(hinted.after).not.toEqual(hinted.undone);
      expect(hinted.undone).toEqual(plain.undone);
      expect(hinted.redone).toEqual(plain.redone);
      expect(hinted.redone).toEqual(hinted.after);
      expect(hinted.worker).toBe(hinted.after[0]);
      expect(plain.worker).toBe(plain.after[0]);
      expect(hinted.printed).toEqual(plain.printed);
    });

  it('핸들이 겹친 문서(옛 길)의 CHPROP·특성 팔레트는 짐작 없이 전처럼', async () => {
    for (const [, cmd] of [CASES[0]!, CASES[4]!]) {
      const r = await run(cmd, { dup: true });
      expect(r.ops.length).toBeGreaterThan(0);
      expect(r.ops.every((op) => !('index' in op))).toBe(true);
    }
  });
});
