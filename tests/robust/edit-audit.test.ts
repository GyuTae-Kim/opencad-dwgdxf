/**
 * 71차: 편집 명령 뒤 문서 불변식(69차에 MOVE·COPY에서 찾은 결함과 같은 종류를 다른 명령에서도 본다).
 * 견본 도면(치수·속성 블록 참조·해치·여러 줄 문자·다중 지시선)을 모두 골라 명령을 돌린 뒤
 *  - 아무 객체도 쓰지 않는 익명 블록(*D·*U·*T …)이 새로 생기지 않고(지우거나 분해한 치수의 블록은 남는다 — 명령 취소로 되살릴 때 쓰고,
 *    쓰이지 않는 익명 블록을 저장할 때 뺄지는 AutoCAD 근거가 없어 두었다),
 *  - 핸들 색인에 어느 블록에도 없는 객체가 없으며,
 *  - 명령 취소하면 처음 문서, 다시 하면 명령 뒤 문서와 같은지.
 * STRETCH는 시험 하네스의 고르기가 걸침 윈도우를 흉내 내지 않아 빼었다(같은 commitResults 경로는 dim-xform-blocks.test.ts가 본다).
 * 71차에 치수·주석 명령(DIMEDIT·DIMTEDIT·DIMSPACE·MATCHPROP)을 더했다. DIMBREAK는 하네스의 고르기에 겹침 찾기가 없고,
 * 견본 치수는 연관이 아니어서 DIMDISASSOCIATE는 할 일이 없다. MATCHPROP이 치수 그림을 다시 그리는지는 matchprop-dim.test.ts가 본다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, tableKey, type CadDocument, type DimensionEntity } from '../../src/core/model';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { registerDrawCommands } from '../../src/app/draw';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerModifyCommands } from '../../src/app/modify';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { makeHarness } from '../cmds2/harness';
import { runWith, type Input2 } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

const SAMPLE = readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url));

function harness() {
  const h = perCommandGroups(
    makeHarness((doc) => {
      Object.assign(doc, readDxf(new Uint8Array(SAMPLE)));
    }),
  );
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  registerAnnot2Commands(h.app);
  registerEditCommands(h.app);
  (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (name: string) => h.app.commands.get(name.toUpperCase());
  registerUtil2MiscCommands(h.app);
  registerUtil2BlockCommands(h.app);
  return h;
}

/** 쓰이지 않는 익명 블록, 블록 밖 색인 항목, 블록·색인 수, 치수 핸들 → 블록 */
function audit(doc: CadDocument) {
  const inBlocks = new Set<string>();
  const used = new Set<string>();
  const dims = new Map<string, string>();
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      inBlocks.add(e.handle);
      if (e.type === 'INSERT') for (const a of e.attribs) inBlocks.add(a.handle);
      const blk = (e as { block?: unknown }).block;
      if (typeof blk === 'string' && blk) used.add(tableKey(blk));
      if (e.type === 'DIMENSION' && e.block) dims.set(e.handle, tableKey(e.block));
    }
  const anon = [...doc.blocks.keys()].filter((k) => /^\*[A-Z]\d+$/.test(k));
  return {
    unused: anon.filter((k) => !used.has(k)).sort(),
    stale: [...doc.entityIndex.keys()].filter((x) => !inBlocks.has(x)).sort(),
    blocks: doc.blocks.size,
    index: doc.entityIndex.size,
    dims,
  };
}

const all = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
const dims = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
/** 치수 하나를 문자 자리에서 고른 입력 */
const pickDim = (d: DimensionEntity): Input2 => ({ pick: d.handle, at: [d.textMid.x, d.textMid.y] });
const ofType = (doc: CadDocument, ...ts: string[]) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => ts.includes(e.type)).map((e) => e.handle);

/** 이름, 명령 차례(이름과 입력) */
const CASES: [string, [string, (doc: CadDocument) => Input2[]][]][] = [
  ['MOVE', [['MOVE', (d) => [{ sel: all(d) }, '0,0', '10,10']]]],
  ['COPY', [['COPY', (d) => [{ sel: all(d) }, '0,0', '10,10', '']]]],
  ['ROTATE', [['ROTATE', (d) => [{ sel: all(d) }, '0,0', '30']]]],
  ['SCALE', [['SCALE', (d) => [{ sel: all(d) }, '0,0', '2']]]],
  ['MIRROR', [['MIRROR', (d) => [{ sel: all(d) }, '0,0', '0,10', '']]]],
  ['MIRROR 원본 지우기', [['MIRROR', (d) => [{ sel: all(d) }, '0,0', '0,10', 'Y']]]],
  ['EXPLODE', [['EXPLODE', (d) => [{ sel: all(d) }]]]],
  ['ERASE', [['ERASE', (d) => [{ sel: all(d) }]]]],
  ['ERASE 뒤 OOPS', [['ERASE', (d) => [{ sel: all(d) }]], ['OOPS', () => []]]],
  ['COPYCLIP 뒤 PASTECLIP', [['COPYCLIP', (d) => [{ sel: all(d) }]], ['PASTECLIP', () => ['50,50']]]],
  // 치수·주석 명령(71차)
  ['DIMEDIT 회전', [['DIMEDIT', (d) => ['R', '30', { sel: ofType(d, 'DIMENSION') }]]]],
  ['DIMEDIT 기울기', [['DIMEDIT', (d) => ['O', { sel: ofType(d, 'DIMENSION') }, '15']]]],
  ['DIMTEDIT 왼쪽', [['DIMTEDIT', (d) => [pickDim(dims(d)[0]!), 'L']]]],
  ['DIMSPACE', [['DIMSPACE', (d) => [pickDim(dims(d)[0]!), { sel: ofType(d, 'DIMENSION') }, '']]]],
  ['MATCHPROP 치수', [['MATCHPROP', (d) => [pickDim(dims(d)[0]!), { sel: ofType(d, 'DIMENSION') }, '']]]],
  ['ATTSYNC', [['ATTSYNC', (d) => ['', { pick: ofType(d, 'INSERT')[0]!, at: [0, 0] }, '']]]],
];

describe('편집 명령 뒤 문서 불변식(견본 도면 전체 선택)', () => {
  for (const [name, steps] of CASES)
    it(name, async () => {
      const h = harness();
      const s = h.st.session;
      const before = audit(h.doc);
      expect(before.stale).toEqual([]);
      const mark = s.undoTop();
      for (const [cmd, inputs] of steps) await runWith(h, cmd, inputs(h.doc));
      expect(s.undoTop()).not.toBe(mark);
      const after = audit(h.doc);
      const gone = new Set([...before.dims].filter(([x]) => !after.dims.has(x)).map(([, b]) => b));
      expect(after.unused.filter((k) => !before.unused.includes(k) && !gone.has(k))).toEqual([]);
      expect(after.stale).toEqual([]);
      // 명령 뒤 문서를 DXF·DWG로 쓰고 다시 읽어도 모형 공간의 종류별 수와 블록 수가 같다
      const kinds = (doc: CadDocument) => {
        const m: Record<string, number> = {};
        for (const e of doc.blocks.get(MODEL_SPACE)!.entities) m[e.type] = (m[e.type] ?? 0) + 1;
        return { m, blocks: doc.blocks.size };
      };
      expect(kinds(readDxf(writeDxf(h.doc, { version: 'AC1032' }).data))).toEqual(kinds(h.doc));
      expect(kinds(readDwg(writeDwg(h.doc, { version: 'AC1032' }).data))).toEqual(kinds(h.doc));
      while (s.undoTop() !== mark) s.undo();
      expect(audit(h.doc)).toEqual(before);
      while (s.canRedo()) s.redo();
      expect(audit(h.doc)).toEqual(after);
    });
});
