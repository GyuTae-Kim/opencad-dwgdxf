/**
 * 편집 명령 불변식 훑기(74차, `npm run edit-audit`): 실제 도면마다 모형 공간 객체를 모두 골라 MOVE·COPY·ROTATE·MIRROR(원본 지우기)·
 * EXPLODE·ERASE 뒤 OOPS를 돌린다(도면은 명령마다 새로 읽는다). 명령마다 본다:
 *  - 아무 객체도 쓰지 않는 익명 블록이 새로 생기지 않는다. 지우거나 분해한 객체가 쓰던 블록은 명령 취소로 되살릴 때 쓰므로 뺀다
 *    (69차 — MOVE마다 쓰이지 않는 *D가 남던 결함 같은 것)
 *  - 핸들 색인에 어느 블록에도 없는 객체가 늘지 않는다(69차 COPY)
 *  - DXF·DWG(R2018)로 쓰고 다시 읽을 때 모형 공간에서 빠지는 객체가 원본 왕복보다 늘지 않는다(늘어난 객체 수만큼은 봐 준다)
 *  - 명령 취소하면 처음 문서(블록·색인 수, 쓰이지 않는 익명 블록)로 돌아온다
 * 명령은 시험 하네스(tests/cmds2)로 흘려 넣어 화면 없이 돈다. 결과는 문제만 담은 작은 JSON이다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL_SPACE, tableKey, type CadDocument } from '../../src/core/model';
import { readCadFile } from '../../src/io/index';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { makeHarness } from '../../tests/cmds2/harness';
import { runWith, type Input2 } from '../../tests/drawmod/ctx';
import { perCommandGroups } from '../../tests/drawmod/groups';

const USAGE = `편집 명령 불변식 훑기
  npm run edit-audit -- --list <도면 목록 파일> [--out <결과 JSON>] [--commands MOVE,COPY,…]
  목록 파일은 한 줄에 도면 경로 하나(# 줄은 건너뜀). 결과를 주지 않으면 화면에만 요약한다.`;

/** 이름, 명령 차례(이름과 입력) */
export const AUDIT_CASES: [string, [string, (hs: string[]) => Input2[]][]][] = [
  ['MOVE', [['MOVE', (hs) => [{ sel: hs }, '0,0', '10,10']]]],
  ['COPY', [['COPY', (hs) => [{ sel: hs }, '0,0', '10,10', '']]]],
  ['ROTATE', [['ROTATE', (hs) => [{ sel: hs }, '0,0', '30']]]],
  ['MIRROR', [['MIRROR', (hs) => [{ sel: hs }, '0,0', '0,10', 'Y']]]],
  ['EXPLODE', [['EXPLODE', (hs) => [{ sel: hs }]]]],
  ['ERASE+OOPS', [['ERASE', (hs) => [{ sel: hs }]], ['OOPS', () => []]]],
];

interface Audit {
  unused: string[];
  stale: number;
  blocks: number;
  index: number;
  /** 블록을 쓰는 객체 핸들 → 블록 열쇠 */
  users: Map<string, string>;
}

export function auditDoc(doc: CadDocument): Audit {
  const inBlocks = new Set<string>();
  const used = new Set<string>();
  const users = new Map<string, string>();
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
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
  return { unused: anon.filter((k) => !used.has(k)).sort(), stale, blocks: doc.blocks.size, index: doc.entityIndex.size, users };
}

const msCount = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)?.entities.length ?? 0;
/** DXF·DWG(R2018) 왕복에서 모형 공간에서 빠지는 객체 수 */
function roundtripLoss(doc: CadDocument): { dxf: number; dwg: number } {
  const n = msCount(doc);
  return { dxf: Math.max(0, n - msCount(readDxf(writeDxf(doc, { version: 'AC1032' }).data))), dwg: Math.max(0, n - msCount(readDwg(writeDwg(doc, { version: 'AC1032' }).data))) };
}

export type AuditProblem = Record<string, unknown> & { file: string; cmd?: string };

/** 도면 하나를 명령마다 새로 읽어 훑는다 */
export async function auditFile(path: string, bytes: Uint8Array, cases = AUDIT_CASES): Promise<{ problems: AuditProblem[]; skipped?: string; runs: number }> {
  const load = () => readCadFile(bytes, path.split('/').pop()!);
  let base: CadDocument;
  try {
    base = load();
  } catch (e) {
    return { problems: [{ file: path, readError: String(e).slice(0, 120) }], runs: 0 };
  }
  if (!msCount(base)) return { problems: [], skipped: '모형 공간이 비었다', runs: 0 };
  let loss0: { dxf: number; dwg: number } | null = null;
  try {
    loss0 = roundtripLoss(base);
  } catch (e) {
    return { problems: [{ file: path, roundtripError: String(e).slice(0, 120) }], runs: 0 };
  }
  const n0 = msCount(base);
  const problems: AuditProblem[] = [];
  let runs = 0;
  for (const [label, steps] of cases) {
    runs++;
    try {
      const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, load())));
      registerDrawCommands(h.app);
      registerModifyCommands(h.app);
      (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (n: string) => h.app.commands.get(n.toUpperCase());
      registerUtil2MiscCommands(h.app);
      const s = h.st.session;
      const before = auditDoc(h.doc);
      const mark = s.undoTop();
      const hs = h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
      for (const [cmd, inputs] of steps) await runWith(h, cmd, inputs(hs));
      const after = auditDoc(h.doc);
      // 지우거나 분해한 객체가 쓰던 블록
      const gone = new Set([...before.users].filter(([x]) => !after.users.has(x)).map(([, b]) => b));
      const p: AuditProblem = { file: path, cmd: label };
      if (s.undoTop() === mark) p.noCommit = true;
      const fresh = after.unused.filter((k) => !before.unused.includes(k) && !gone.has(k));
      if (fresh.length) p.newUnused = fresh.slice(0, 8);
      if (after.stale > before.stale) p.stale = [before.stale, after.stale];
      const loss = roundtripLoss(h.doc);
      const k = Math.max(1, msCount(h.doc) / n0);
      if (loss.dxf > Math.ceil(loss0.dxf * k) || loss.dwg > Math.ceil(loss0.dwg * k)) p.roundtripLoss = { before: loss0, after: loss };
      while (s.undoTop() !== mark) s.undo();
      const back = auditDoc(h.doc);
      if (back.unused.join() !== before.unused.join() || back.stale !== before.stale || back.blocks !== before.blocks || back.index !== before.index) {
        p.undo = { before: [before.blocks, before.index, before.stale], back: [back.blocks, back.index, back.stale] };
      }
      if (Object.keys(p).length > 2) problems.push(p);
    } catch (e) {
      problems.push({ file: path, cmd: label, error: String(e).slice(0, 160) });
    }
  }
  return { problems, runs };
}

export async function editAuditMain(argv: string[], log: (s: string) => void = (s) => console.log(s)): Promise<number> {
  let list = '';
  let out = '';
  let only: Set<string> | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--list') list = argv[++i] ?? '';
    else if (a === '--out') out = argv[++i] ?? '';
    else if (a === '--commands') only = new Set((argv[++i] ?? '').toUpperCase().split(',').filter(Boolean));
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
  let runs = 0;
  for (const f of files) {
    const r = await auditFile(f, new Uint8Array(readFileSync(f)), cases);
    runs += r.runs;
    problems.push(...r.problems);
    if (r.skipped) skipped.push({ file: f, why: r.skipped });
  }
  const summary = { done: true, tool: 'opencad-dwgdxf edit-audit', files: files.length, runs, skipped, problems };
  if (out) writeFileSync(out, JSON.stringify(summary, null, 1));
  log(`도면 ${files.length}개, 명령 ${runs}회, 건너뜀 ${skipped.length}, 문제 ${problems.length}`);
  for (const p of problems.slice(0, 20)) log(`  ${p.cmd ?? '-'} ${p.file.split('/').slice(-2).join('/')} ${JSON.stringify({ ...p, file: undefined, cmd: undefined })}`);
  return problems.length ? 1 : 0;
}
