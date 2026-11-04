/**
 * 편집 명령 불변식 훑기(74차, `npm run edit-audit`): 실제 도면마다 모형 공간 객체를 모두 골라 MOVE·COPY·ROTATE·MIRROR(원본 지우기)·
 * EXPLODE·ERASE 뒤 OOPS를 돌린다(도면은 명령마다 새로 읽는다). 75차에 SCALE·MIRROR(원본 남기기)·COPYCLIP 뒤 PASTECLIP·ARRAYRECT와
 * 선택 기반 명령(-OVERKILL·JOIN·BURST·-BLOCK·CHPROP·SETBYLAYER·REVERSE·SCALETEXT·FLATTEN)을 더했다. 76차부터 배치(도면 공간)에서도 훑는다
 * (`--space`: 모형 공간이 빈 도면은 객체가 있는 첫 배치, paper면 언제나 배치 — 전체 용지 뷰포트는 고르지 않는다). 명령마다 본다:
 *  - 아무 객체도 쓰지 않는 익명 블록이 새로 생기지 않는다. 지우거나 분해한 객체가 쓰던 블록은 명령 취소로 되살릴 때 쓰므로 뺀다
 *    (69차 — MOVE마다 쓰이지 않는 *D가 남던 결함 같은 것)
 *  - 핸들 색인에 어느 블록에도 없는 객체가 늘지 않는다(69차 COPY)
 *  - DXF·DWG(R2018)로 쓰고 다시 읽을 때 그 공간에서 빠지는 객체가 원본 왕복보다 늘지 않는다(늘어난 객체 수만큼은 봐 준다)
 *  - 두 자리에 든 핸들, 소유자가 든 블록의 레코드가 아닌 객체, 핸들 색인이 블록 안의 그 객체가 아닌 것이 늘지 않는다(75차)
 *  - 명령 취소하면 처음 문서(블록·색인 수, 쓰이지 않는 익명 블록, 위의 세 수)로 돌아온다
 *  - 커밋·명령 취소마다 워커와 같은 전송(packOps → 구조화 복제, 큰 편집은 묶음 부호화 → unpackOps → applyOps)으로 따로 읽은 문서에 적용하면 메인 문서와 같다
 *    (블록·객체 차례, 색인, 바뀌거나 더한 객체 — 78차, 속성 없는 블록 참조를 바꾸면 워커가 멈추던 결함)
 * 명령은 시험 하네스(tests/cmds2)로 흘려 넣어 화면 없이 돈다. 결과는 문제만 담은 작은 JSON이다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL_SPACE, tableKey, type CadDocument } from '../../src/core/model';
import { readCadFile } from '../../src/io/index';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { applyOps, type ChangeSummary, type Transaction } from '../../src/edit/session';
import { ENCODE_MIN_OPS, decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import type { App } from '../../src/app/app';
import { registerBlockCommands } from '../../src/app/blocks';
import { registerDashMiscCommands } from '../../src/app/dashcmds-misc';
import { registerDrawCommands } from '../../src/app/draw';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerExpressDrawCommands } from '../../src/app/express-draw';
import { registerLayerToolCommands } from '../../src/app/layerstate-tools';
import { registerModifyCommands } from '../../src/app/modify';
import { registerModify2Commands } from '../../src/app/modify2';
import { registerPropCommands } from '../../src/app/propcmds';
import { registerUtil2BlockCommands } from '../../src/app/util2-blocks';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { makeHarness } from '../../tests/cmds2/harness';
import { runWith, type Input2 } from '../../tests/drawmod/ctx';
import { perCommandGroups } from '../../tests/drawmod/groups';

const USAGE = `편집 명령 불변식 훑기
  npm run edit-audit -- --list <도면 목록 파일> [--out <결과 JSON>] [--commands MOVE,COPY,…] [--space auto|model|paper]
  목록 파일은 한 줄에 도면 경로 하나(# 줄은 건너뜀). 결과를 주지 않으면 화면에만 요약한다.
  --space: auto(기본)는 모형 공간, 모형 공간이 비었으면 객체가 있는 첫 배치. paper는 언제나 배치, model은 언제나 모형 공간.`;

/** 이름, 명령 차례(이름과 입력) */
export const AUDIT_CASES: [string, [string, (hs: string[]) => Input2[]][]][] = [
  ['MOVE', [['MOVE', (hs) => [{ sel: hs }, '0,0', '10,10']]]],
  ['COPY', [['COPY', (hs) => [{ sel: hs }, '0,0', '10,10', '']]]],
  ['ROTATE', [['ROTATE', (hs) => [{ sel: hs }, '0,0', '30']]]],
  ['MIRROR', [['MIRROR', (hs) => [{ sel: hs }, '0,0', '0,10', 'Y']]]],
  ['EXPLODE', [['EXPLODE', (hs) => [{ sel: hs }]]]],
  ['ERASE+OOPS', [['ERASE', (hs) => [{ sel: hs }]], ['OOPS', () => []]]],
  // 75차: 축척·원본을 남기는 대칭·클립보드·배열과 선택 기반 명령
  ['SCALE', [['SCALE', (hs) => [{ sel: hs }, '0,0', '2']]]],
  ['MIRROR-N', [['MIRROR', (hs) => [{ sel: hs }, '0,0', '0,10', 'N']]]],
  ['COPYCLIP+PASTECLIP', [['COPYCLIP', (hs) => [{ sel: hs }]], ['PASTECLIP', () => ['50,50']]]],
  ['ARRAYRECT', [['ARRAYRECT', (hs) => [{ sel: hs }, '']]]],
  ['-OVERKILL', [['-OVERKILL', (hs) => [{ sel: hs }, '']]]],
  ['JOIN', [['JOIN', (hs) => [{ sel: hs }]]]],
  ['BURST', [['BURST', (hs) => [{ sel: hs }]]]],
  ['-BLOCK', [['-BLOCK', (hs) => ['EDIT_AUDIT_BLOCK', '0,0', { sel: hs }]]]],
  ['CHPROP', [['CHPROP', (hs) => [{ sel: hs }, 'LA', '0', '']]]],
  ['SETBYLAYER', [['SETBYLAYER', (hs) => [{ sel: hs }, 'Y', 'Y']]]],
  ['REVERSE', [['REVERSE', (hs) => [{ sel: hs }]]]],
  ['SCALETEXT', [['SCALETEXT', (hs) => [{ sel: hs }, '', '5']]]],
  ['FLATTEN', [['FLATTEN', (hs) => [{ sel: hs }, '']]]],
];

interface Audit {
  unused: string[];
  stale: number;
  blocks: number;
  index: number;
  /** 블록을 쓰는 객체 핸들 → 블록 열쇠 */
  users: Map<string, string>;
  /** 두 자리 이상에 든 핸들, 소유자가 든 블록의 레코드가 아닌 객체, 핸들 색인이 블록 안의 그 객체가 아닌 것(75차) */
  dup: number;
  owner: number;
  mismatch: number;
}

export function auditDoc(doc: CadDocument): Audit {
  const inBlocks = new Set<string>();
  const used = new Set<string>();
  const users = new Map<string, string>();
  let dup = 0;
  let owner = 0;
  let mismatch = 0;
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      if (inBlocks.has(e.handle)) dup++;
      if (b.recordHandle && e.owner && e.owner !== b.recordHandle) owner++;
      if (doc.entityIndex.get(e.handle) !== e) mismatch++;
      inBlocks.add(e.handle);
      if (e.type === 'INSERT') for (const a of e.attribs) inBlocks.add(a.handle);
      const blk = (e as { block?: unknown }).block;
      if (typeof blk === 'string' && blk) {
        used.add(tableKey(blk));
        users.set(e.handle, tableKey(blk));
      }
    }
  const anon = [...doc.blocks.keys()].filter((k) => /^\*[A-Z]\d+$/.test(k));
  let stale = 0;
  for (const h of doc.entityIndex.keys()) if (!inBlocks.has(h)) stale++;
  return { unused: anon.filter((k) => !used.has(k)).sort(), stale, blocks: doc.blocks.size, index: doc.entityIndex.size, users, dup, owner, mismatch };
}

export type AuditSpace = 'auto' | 'model' | 'paper';

/** 훑는 공간: 모형 공간 또는 배치 이름(쓰고 다시 읽으면 배치 블록 이름이 바뀔 수 있어 이름으로 찾는다) */
export interface Target {
  layout: string | null;
}

/** 배치의 블록 열쇠 */
function spaceKey(doc: CadDocument, t: Target): string | null {
  if (!t.layout) return MODEL_SPACE;
  const l = doc.layouts.find((x) => x.name === t.layout);
  return l ? tableKey(l.blockName) : null;
}

/** 고를 객체: 배치의 전체 용지 뷰포트(번호 1 또는 배치가 가리키는 뷰포트)는 AutoCAD에서도 고를 수 없어 뺀다 */
export function pickable(doc: CadDocument, t: Target): string[] {
  const key = spaceKey(doc, t);
  const ents = (key && doc.blocks.get(key)?.entities) || [];
  if (!t.layout) return ents.map((e) => e.handle);
  const lay = doc.layouts.find((x) => x.name === t.layout);
  return ents.filter((e) => !(e.type === 'VIEWPORT' && (e.id === 1 || e.handle === lay?.viewport))).map((e) => e.handle);
}

const countIn = (doc: CadDocument, t: Target) => {
  const key = spaceKey(doc, t);
  return (key && doc.blocks.get(key)?.entities.length) || 0;
};

/** 훑을 공간을 고른다: model은 모형 공간, paper는 고를 객체가 있는 첫 배치(탭 차례), auto는 모형 공간이 비었을 때만 배치 */
export function chooseTarget(doc: CadDocument, mode: AuditSpace): Target | null {
  const model: Target = { layout: null };
  if (mode !== 'paper' && pickable(doc, model).length) return model;
  if (mode === 'model') return null;
  const lays = doc.layouts.filter((l) => tableKey(l.blockName) !== MODEL_SPACE).sort((a, b) => a.tabOrder - b.tabOrder);
  for (const l of lays) if (pickable(doc, { layout: l.name }).length) return { layout: l.name };
  return null;
}

/** DXF·DWG(R2018) 왕복에서 그 공간에서 빠지는 객체 수 */
function roundtripLoss(doc: CadDocument, t: Target): { dxf: number; dwg: number } {
  const n = countIn(doc, t);
  return {
    dxf: Math.max(0, n - countIn(readDxf(writeDxf(doc, { version: 'AC1032' }).data), t)),
    dwg: Math.max(0, n - countIn(readDwg(writeDwg(doc, { version: 'AC1032' }).data), t)),
  };
}

/** 훑는 명령이 든 묶음을 모두 등록한다(명령을 이름으로 찾는 findCommand는 시험 하네스에 없어 채운다) */
function registerAll(app: App): void {
  for (const r of [registerDrawCommands, registerModifyCommands, registerModify2Commands, registerExpressDrawCommands, registerUtil2BlockCommands, registerBlockCommands, registerPropCommands, registerLayerToolCommands, registerDashMiscCommands, registerEditCommands]) {
    r(app);
    (app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (n: string) => app.commands.get(n.toUpperCase());
  }
  registerUtil2MiscCommands(app);
}

export type AuditProblem = Record<string, unknown> & { file: string; cmd?: string };

/** 메인 문서와 워커 문서가 다른 첫 자리(같으면 null). touched: 이 편집이 바꾸거나 더한 객체 */
export function workerDiff(a: CadDocument, b: CadDocument, touched: ReadonlySet<string>): string | null {
  if (a.blocks.size !== b.blocks.size) return `blocks ${a.blocks.size}/${b.blocks.size}`;
  for (const [k, blk] of a.blocks) {
    const o = b.blocks.get(k);
    if (!o) return `block ${k}`;
    if (o.entities.length !== blk.entities.length) return `${k} ${blk.entities.length}/${o.entities.length}`;
    for (let i = 0; i < blk.entities.length; i++) if (blk.entities[i]!.handle !== o.entities[i]!.handle) return `${k}[${i}] ${blk.entities[i]!.handle}/${o.entities[i]!.handle}`;
  }
  if (a.entityIndex.size !== b.entityIndex.size) return `index ${a.entityIndex.size}/${b.entityIndex.size}`;
  for (const h of touched) {
    const x = a.entityIndex.get(h);
    const y = b.entityIndex.get(h);
    if (!x !== !y) return `index ${h}`;
    if (x && JSON.stringify(x) !== JSON.stringify(y)) return `entity ${h}`;
  }
  if (a.objects.size !== b.objects.size) return `objects ${a.objects.size}/${b.objects.size}`;
  return null;
}

/** 도면 하나를 명령마다 새로 읽어 훑는다 */
export async function auditFile(
  path: string,
  bytes: Uint8Array,
  cases = AUDIT_CASES,
  mode: AuditSpace = 'auto',
): Promise<{ problems: AuditProblem[]; skipped?: string; runs: number; idle: string[]; layout?: string }> {
  const load = () => readCadFile(bytes, path.split('/').pop()!);
  let base: CadDocument;
  try {
    base = load();
  } catch (e) {
    return { problems: [{ file: path, readError: String(e).slice(0, 120) }], runs: 0, idle: [] };
  }
  const target = chooseTarget(base, mode);
  if (!target) return { problems: [], skipped: mode === 'model' ? '모형 공간이 비었다' : mode === 'paper' ? '배치가 비었다' : '모형 공간·배치가 비었다', runs: 0, idle: [] };
  let loss0: { dxf: number; dwg: number } | null = null;
  try {
    loss0 = roundtripLoss(base, target);
  } catch (e) {
    return { problems: [{ file: path, roundtripError: String(e).slice(0, 120) }], runs: 0, idle: [] };
  }
  const n0 = countIn(base, target);
  const problems: AuditProblem[] = [];
  const idle: string[] = [];
  let runs = 0;
  for (const [label, steps] of cases) {
    runs++;
    try {
      const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, load())));
      registerAll(h.app);
      h.st.space = spaceKey(h.doc, target)!;
      const s = h.st.session;
      // 워커 문서: 편집 세션이 화면·워커에 알리는 자리(onApply — 생성자에 받은 함수)를 감싸 같은 전송으로 적용한다
      const wdoc = load();
      const touched = new Set<string>();
      let wireError: string | null = null;
      const hook = s as unknown as { onApply: (tx: Transaction, sum: ChangeSummary) => void };
      const inner = hook.onApply;
      hook.onApply = (tx, sum) => {
        inner(tx, sum);
        for (const op of tx.ops) if (op.kind === 'add') touched.add(op.entity.handle);
        else if (op.kind === 'modify') touched.add(op.after.handle);
        try {
          // 앱(engine.ts edit)처럼 큰 편집은 묶음 부호화로(79차)
          const wire = packOps(tx.ops);
          const enc = wire.length >= ENCODE_MIN_OPS ? encodeWire(wire) : null;
          applyOps(wdoc, unpackOps(enc ? decodeWire(structuredClone(enc)) : structuredClone(wire)));
        } catch (e) {
          wireError ??= String(e).slice(0, 120);
        }
      };
      const before = auditDoc(h.doc);
      const mark = s.undoTop();
      const hs = pickable(h.doc, target);
      try {
        for (const [cmd, inputs] of steps) await runWith(h, cmd, inputs(hs));
      } catch (e) {
        // 고른 것 가운데 대상이 없어(문자가 없는 도면의 SCALETEXT 등) 입력을 다 쓰지 않고 끝난 명령은 할 일이 없던 것
        if (!(s.undoTop() === mark && String(e).includes('남은 입력'))) throw e;
      }
      const after = auditDoc(h.doc);
      // 지우거나 분해한 객체가 쓰던 블록
      const gone = new Set([...before.users].filter(([x]) => !after.users.has(x)).map(([, b]) => b));
      const p: AuditProblem = { file: path, cmd: label, ...(target.layout ? { layout: target.layout } : {}) };
      // 할 일이 없던 명령(중복·문자·곡선·블록 참조가 없는 도면 등)은 문제가 아니라 따로 센다
      if (s.undoTop() === mark) idle.push(label);
      const fresh = after.unused.filter((k) => !before.unused.includes(k) && !gone.has(k));
      if (fresh.length) p.newUnused = fresh.slice(0, 8);
      if (after.stale > before.stale) p.stale = [before.stale, after.stale];
      for (const k of ['dup', 'owner', 'mismatch'] as const) if (after[k] > before[k]) p[k] = [before[k], after[k]];
      const wd = wireError ?? workerDiff(h.doc, wdoc, touched);
      if (wd) p.worker = wd;
      const loss = roundtripLoss(h.doc, target);
      const k = Math.max(1, countIn(h.doc, target) / n0);
      if (loss.dxf > Math.ceil(loss0.dxf * k) || loss.dwg > Math.ceil(loss0.dwg * k)) p.roundtripLoss = { before: loss0, after: loss };
      while (s.undoTop() !== mark) s.undo();
      const wu = wireError ?? workerDiff(h.doc, wdoc, touched);
      if (wu && !wd) p.workerUndo = wu;
      const back = auditDoc(h.doc);
      const same = (['stale', 'blocks', 'index', 'dup', 'owner', 'mismatch'] as const).every((k) => back[k] === before[k]);
      if (back.unused.join() !== before.unused.join() || !same) {
        p.undo = { before: [before.blocks, before.index, before.stale, before.dup, before.owner, before.mismatch], back: [back.blocks, back.index, back.stale, back.dup, back.owner, back.mismatch] };
      }
      if (Object.keys(p).length > (target.layout ? 3 : 2)) problems.push(p);
    } catch (e) {
      problems.push({ file: path, cmd: label, error: String(e).slice(0, 160) });
    }
  }
  return { problems, runs, idle, ...(target.layout ? { layout: target.layout } : {}) };
}

export async function editAuditMain(argv: string[], log: (s: string) => void = (s) => console.log(s)): Promise<number> {
  let list = '';
  let out = '';
  let only: Set<string> | null = null;
  let mode: AuditSpace = 'auto';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--list') list = argv[++i] ?? '';
    else if (a === '--out') out = argv[++i] ?? '';
    else if (a === '--commands') only = new Set((argv[++i] ?? '').toUpperCase().split(',').filter(Boolean));
    else if (a === '--space') {
      const v = argv[++i] ?? '';
      if (v !== 'auto' && v !== 'model' && v !== 'paper') {
        log(`--space는 auto·model·paper 가운데 하나입니다: ${v}\n\n${USAGE}`);
        return 2;
      }
      mode = v;
    }
    else if (a === '--help' || a === '-h') {
      log(USAGE);
      return 0;
    } else {
      log(`모르는 인자: ${a}\n\n${USAGE}`);
      return 2;
    }
  }
  if (!list) {
    log(USAGE);
    return 0;
  }
  const files = readFileSync(list, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
    .map((s) => resolve(s));
  const cases = only ? AUDIT_CASES.filter(([label]) => only!.has(label)) : AUDIT_CASES;
  const problems: AuditProblem[] = [];
  const skipped: { file: string; why: string }[] = [];
  /** 명령마다 할 일이 없던 도면 수 */
  const idle: Record<string, number> = {};
  /** 배치에서 훑은 도면 수 */
  let paper = 0;
  let runs = 0;
  for (const f of files) {
    const r = await auditFile(f, new Uint8Array(readFileSync(f)), cases, mode);
    if (r.layout) paper++;
    runs += r.runs;
    problems.push(...r.problems);
    for (const c of r.idle) idle[c] = (idle[c] ?? 0) + 1;
    if (r.skipped) skipped.push({ file: f, why: r.skipped });
  }
  const summary = { done: true, tool: 'opencad-dwgdxf edit-audit', space: mode, files: files.length, paper, runs, skipped, idle, problems };
  if (out) writeFileSync(out, JSON.stringify(summary, null, 1));
  log(`도면 ${files.length}개(배치에서 ${paper}개), 명령 ${runs}회, 건너뜀 ${skipped.length}, 문제 ${problems.length}`);
  if (Object.keys(idle).length) log(`할 일이 없던 명령(도면 수): ${Object.entries(idle).map(([c, n]) => `${c} ${n}`).join(', ')}`);
  for (const p of problems.slice(0, 20)) log(`  ${p.cmd ?? '-'} ${p.file.split('/').slice(-2).join('/')} ${JSON.stringify({ ...p, file: undefined, cmd: undefined })}`);
  return problems.length ? 1 : 0;
}
