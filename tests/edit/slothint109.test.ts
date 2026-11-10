/**
 * 109차: 블록을 훑으며 바꾸기 변경을 만드는 길(이름 바꾸기 — 도면층·선종류·문자 스타일·치수 스타일·블록, 도면층 관리자 이름 바꾸기, LAYMRG·LAYCUR,
 * 도면층 변환기, SETBYLAYER의 블록 정의 안, 문자·치수 스타일 대화 상자 이름 바꾸기, CONVERTPSTYLES)과 PLOTSTYLE에도 자리 짐작(index)을 단다.
 * - 바꾸기 변경마다 지금 자리(앞을 지워 밀린 뒤에도)이고, 짐작을 끈 같은 명령(EditSession.scanHints·slotHint 없음)과
 *   문서·명령 취소·다시 하기·출력·워커(묶음 부호화)가 같다
 * - 핸들이 겹친 문서(옛 길)는 짐작 없이 전처럼
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, InsertEntity, Layer, LineEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { applyOps } from '../../src/edit/session';
import { createLinearDimension } from '../../src/edit/dim';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerLayerToolCommands as registerLayTools } from '../../src/app/laytools';
import { registerLayerToolCommands, setSetByLayerMode } from '../../src/app/layerstate-tools';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { renameLayer } from '../../src/app/layers';
import { SBL_DEFAULT } from '../../src/edit/layerstate/setbylayer';
import { translateLayersOps } from '../../src/edit/layertools/translate';
import { textStyleRenameOps } from '../../src/app/textedit/styledlg';
import { dimStyleRenameOps } from '../../src/app/dimstyle';
import { assignPlotStyleOps, convertToNamedOps } from '../../src/edit/filecmds/pstyles';
import { decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import { type Harness, makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

type Modify = Extract<EditOp, { kind: 'modify' }>;

const N = 300;
const DIMSTYLE = (doc: CadDocument) => String(doc.header.get('$DIMSTYLE'));
const hx = (n: number) => n.toString(16).toUpperCase();

/** 같은 핸들의 시험 문서: 도면층 L1·선종류 DASHED·문자 스타일 S1·블록 B1(선 70개)과 모형 공간 객체 300개(문자·선·치수·블록 참조) */
function fill(doc: CadDocument, dup: boolean): void {
  Object.assign(doc, createNewDocument('metric'));
  doc.header.set('$HANDSEED', 'F000');
  const l0 = doc.layers.get('0')!;
  doc.layers.set('L1', { ...structuredClone(l0), name: 'L1', handle: 'B01', color: { aci: 3 }, linetype: 'DASHED' });
  doc.layers.set('L2', { ...structuredClone(l0), name: 'L2', handle: 'B02', color: { aci: 5 } });
  const cont = doc.linetypes.get('CONTINUOUS')!;
  doc.linetypes.set('DASHED', { ...structuredClone(cont), name: 'DASHED', handle: 'B03' });
  const std = doc.textStyles.get('STANDARD')!;
  doc.textStyles.set('S1', { ...structuredClone(std), name: 'S1', handle: 'B04' });
  const put = (list: Entity[], e: Entity) => {
    list.push(e);
    doc.entityIndex.set(e.handle, e);
  };
  const props = { layer: 'L1', color: { aci: 1 }, linetype: 'DASHED' };
  // 블록 B1
  const inner: Entity[] = [];
  doc.blocks.set('B1', { name: 'B1', handle: 'B05', recordHandle: 'B06', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: inner, endHandle: 'B07' });
  doc.blockRecords.set('B1', { name: 'B1', handle: 'B06', flags: 0, insertUnits: 0, explodable: true, scalable: true });
  for (let i = 0; i < 70; i++)
    put(inner, { ...entityDefaults(), ...props, type: 'LINE', handle: `D${hx(i + 256)}`, owner: 'B06', start: { x: i, y: 1, z: 0 }, end: { x: i, y: 2, z: 0 } } as LineEntity);
  const list = doc.blocks.get(MODEL_SPACE)!.entities;
  for (let i = 0; i < N; i++) {
    const handle = `C${hx(i + 256)}`;
    let e: Entity;
    if (i % 20 === 7) e = { ...entityDefaults(), ...props, type: 'INSERT', handle, block: 'B1', insert: { x: i, y: 9, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as InsertEntity;
    else if (i % 4 === 0)
      e = { ...entityDefaults(), ...props, type: 'TEXT', handle, insert: { x: i * 2, y: 5, z: 0 }, height: 1, text: `AB ${i}`, rotation: 0, widthFactor: 1, oblique: 0, style: 'S1', generation: 0, halign: 0, valign: 0 } as TextEntity;
    else if (i % 4 === 2) e = { ...createLinearDimension(doc, { x: i, y: 0, z: 0 }, { x: i + 1, y: 0, z: 0 }, { x: i, y: 3, z: 0 }), ...props, handle } as DimensionEntity;
    else e = { ...entityDefaults(), ...props, type: 'LINE', handle, start: { x: i * 2, y: 0, z: 0 }, end: { x: i * 2 + 1, y: 0, z: 0 } } as LineEntity;
    put(list, e);
  }
  if (dup) list.push({ ...(list[1] as LineEntity), start: { x: -50, y: 0, z: 0 } });
}

const blockState = (doc: CadDocument) => JSON.stringify([...doc.blocks].map(([k, b]) => [k, b.name, b.entities]));
// 머리말의 $HANDSEED는 세션이 새 핸들을 만들 때 직접 적는다(변경이 아니라 워커에는 없다). 만든 시각($TD…)은 문서마다 다르다
const tableState = (doc: CadDocument) =>
  JSON.stringify([[...doc.layers], [...doc.linetypes], [...doc.textStyles], [...doc.dimStyles], [...doc.header].filter(([k]) => k !== '$HANDSEED' && !k.startsWith('$TD')), [...doc.objects.keys()].sort()]);
const indexState = (doc: CadDocument) => JSON.stringify([...doc.entityIndex].map(([k, e]) => [k, JSON.stringify(e)]).sort());

type Cmd = ((h: Harness, pick: string[]) => Promise<unknown> | unknown) & { prep?: (h: Harness) => void };

async function run(cmd: Cmd, opt: { noHint?: boolean; dup?: boolean } = {}) {
  const h = perCommandGroups(makeHarness((doc) => fill(doc, !!opt.dup)));
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  registerLayTools(h.app);
  registerLayerToolCommands(h.app);
  const app = h.app as unknown as { findCommand?: (n: string) => unknown; commands: Map<string, unknown>; ui: { refreshLayouts?: () => void } };
  app.findCommand ??= (n: string) => app.commands.get(n.toUpperCase());
  app.ui.refreshLayouts ??= () => {};
  registerUtil2MiscCommands(h.app);
  setSetByLayerMode(SBL_DEFAULT);
  if (opt.noHint) {
    h.st.session.slotHint = () => undefined;
    h.st.session.scanHints = () => false;
  }
  const all = () => h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
  // 앞을 지워 자리를 민 뒤(짐작이 처음 자리와 달라야 시험이 된다)
  await runWith(h, 'ERASE', [{ sel: all().slice(0, 9) }], 11);
  const erased = h.st.session.undoTop()!.ops;
  cmd.prep?.(h);
  const pre = h.st.session.undoTop()!.ops;
  const pick = all().filter((_, i) => i % 3 !== 0 && i < N - 20);
  const depth = h.st.session.depth;
  await cmd(h, pick);
  expect(h.st.session.depth).toBe(depth + 1);
  const tx = h.st.session.undoTop()!.ops;
  const ops = tx.filter((o): o is Modify => o.kind === 'modify');
  // 짐작이 가리키는 자리(바꾸기는 자리를 옮기지 않는다): 적용한 뒤에도 그 자리에 같은 핸들
  const wrong = ops.filter((o) => o.index !== undefined && h.doc.blocks.get(o.block)!.entities[o.index]?.handle !== o.before.handle).length;
  const state = () => [blockState(h.doc), tableState(h.doc), indexState(h.doc)];
  const after = state();
  h.st.session.undo();
  const undone = state();
  h.st.session.redo();
  const redone = state();
  // 워커: 같은 처음 문서에 지우기·이 명령을 묶음 부호화로 받아 적용한다
  const w = makeHarness((doc) => fill(doc, !!opt.dup)).doc;
  for (const t of pre === erased ? [erased, tx] : [erased, pre, tx]) applyOps(w, unpackOps(decodeWire(encodeWire(packOps(t))!)));
  return { ops, wrong, after, undone, redone, worker: [blockState(w), tableState(w)], printed: h.printed };
}

const layerDef = (name: string, aci: number): Layer => ({ name, handle: '0', flags: 0, color: { aci }, off: false, frozen: false, locked: false, linetype: 'Continuous', lineweight: -3, plot: true, transparency: 255 });
const toNamed = (h: Harness) => {
  const r = convertToNamedOps(h.doc, () => h.st.session.newHandle(), undefined, h.st.session.scanHints())!;
  h.st.session.commit({ label: 'CONVERTPSTYLES', ops: r.ops });
};

/** [이름, 명령, 블록 정의 안 바꾸기가 있는지] */
const CASES: [string, Cmd, boolean][] = [
  ['-RENAME 도면층', (h) => runWith(h, '-RENAME', ['LA', 'L1', 'L9']), true],
  ['-RENAME 선종류', (h) => runWith(h, '-RENAME', ['LT', 'DASHED', 'DASH9']), true],
  ['-RENAME 문자 스타일', (h) => runWith(h, '-RENAME', ['S', 'S1', 'S9']), false],
  ['-RENAME 치수 스타일', (h) => runWith(h, '-RENAME', ['D', DIMSTYLE(h.doc), 'D9']), false],
  ['-RENAME 블록', (h) => runWith(h, '-RENAME', ['B', 'B1', 'B9']), false],
  ['도면층 관리자 이름 바꾸기', (h) => renameLayer(h.app, 'L1', 'L8'), true],
  ['LAYMRG', (h) => runWith(h, 'LAYMRG', ['N', 'L1', '', 'N', 'L2', 'Y']), true],
  ['LAYCUR', (h, pick) => runWith(h, 'LAYCUR', [{ sel: pick }]), false],
  [
    '도면층 변환기',
    (h) => {
      const r = translateLayersOps(h.doc, [{ from: 'L1', to: layerDef('L7', 4) }], { forceColor: true, forceLinetype: true, forceTransparency: false, blocks: true, purge: true }, () => h.st.session.newHandle(), undefined, h.st.session.scanHints());
      h.st.session.commit({ label: 'LAYTRANS', ops: r.ops });
    },
    true,
  ],
  ['SETBYLAYER 블록 포함', (h, pick) => runWith(h, 'SETBYLAYER', [{ sel: pick }, 'N', 'Y']), true],
  ['문자 스타일 대화 상자 이름 바꾸기', (h) => h.st.session.commit({ label: 'RENAME', ops: textStyleRenameOps(h.st, 'S1', 'S8') }), false],
  ['치수 스타일 대화 상자 이름 바꾸기', (h) => h.st.session.commit({ label: 'RENAME', ops: dimStyleRenameOps(h.st, DIMSTYLE(h.doc), 'D8') }), false],
  ['CONVERTPSTYLES 이름 있는 플롯 스타일로', toNamed, true],
  [
    'PLOTSTYLE',
    Object.assign(
      (h: Harness, pick: string[]) => {
        const r = assignPlotStyleOps(h.doc, pick, 'Color_5', () => h.st.session.newHandle(), (x) => h.st.session.ownerOf(x), (x) => h.st.session.slotHint(x))!;
        h.st.session.commit({ label: 'PLOTSTYLE', ops: r.ops });
      },
      { prep: toNamed },
    ),
    false,
  ],
];

describe('블록을 훑으며 바꾸는 길에도 자리 짐작(109차)', () => {
  for (const [name, cmd, nested] of CASES)
    it(`${name}: 바꾸기 변경마다 지금 자리, 짐작 없는 같은 명령과 문서·명령 취소·다시·워커가 같다`, async () => {
      const hinted = await run(cmd);
      const plain = await run(cmd, { noHint: true });
      expect(hinted.ops.length).toBeGreaterThan(nested ? 64 : 10);
      // 모두 짐작이 달리고 맞다(지운 9개만큼 밀린 지금 자리)
      expect(hinted.ops.every((op) => op.index !== undefined)).toBe(true);
      expect(hinted.wrong).toBe(0);
      expect(hinted.ops.some((op) => op.block === MODEL_SPACE && op.index! < parseInt(op.before.handle.slice(1), 16) - 256)).toBe(true);
      // 블록 정의 안 객체도
      expect(hinted.ops.some((op) => op.block === 'B1')).toBe(nested);
      expect(plain.ops.every((op) => !('index' in op))).toBe(true);
      expect(plain.ops.length).toBe(hinted.ops.length);
      expect(hinted.after).toEqual(plain.after);
      expect(hinted.after).not.toEqual(hinted.undone);
      expect(hinted.undone).toEqual(plain.undone);
      expect(hinted.redone).toEqual(plain.redone);
      expect(hinted.redone).toEqual(hinted.after);
      expect(hinted.worker).toEqual(hinted.after.slice(0, 2));
      expect(plain.worker).toEqual(plain.after.slice(0, 2));
      expect(hinted.printed).toEqual(plain.printed);
    });

  it('핸들이 겹친 문서(옛 길)는 짐작 없이 전처럼', async () => {
    for (const [, cmd] of [CASES[0]!, CASES[5]!, CASES[6]!, CASES[8]!, CASES[9]!, CASES[12]!]) {
      const r = await run(cmd, { dup: true });
      const plain = await run(cmd, { dup: true, noHint: true });
      expect(r.ops.length).toBeGreaterThan(0);
      expect(r.ops.every((op) => !('index' in op))).toBe(true);
      expect(r.after).toEqual(plain.after);
    }
  });
});
