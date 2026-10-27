/**
 * 훑기 결과 두 개 비교(전 → 후): 분류가 바뀐 파일, 지표가 바뀐 파일(내용 해시), 새 예외, 품질 지표 표.
 * 사용법: npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--fail-on-change] [--json <파일>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileRecord } from './record';
import { ORACLE_QUALITY, QUALITY, classify, fileErrors, isDesignDrop, qualityFlags, rereadKinds } from './summary';

export function readRecords(dir: string): FileRecord[] {
  const p = join(dir, 'records.jsonl');
  if (!existsSync(p)) throw new Error(`records.jsonl이 없습니다: ${dir}`);
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FileRecord);
}

/** 파일 하나의 비교 지표(값이 같으면 바뀌지 않은 것) */
export function fileMetrics(r: FileRecord, oracle = true) {
  const kinds = new Set<string>();
  /** 설계대로 빠진 비그래픽 객체(대상:종류) — 지표 바뀜으로 세지 않고 따로 센다 */
  const drops = new Set<string>();
  const writeWarn = new Set<string>();
  for (const [k, w] of Object.entries(r.writes ?? {})) {
    for (const kind of rereadKinds(w, k)) {
      if (isDesignDrop(kind)) drops.add(`${k}:${kind.slice(8)}`);
      else kinds.add(kind);
    }
    for (const code of Object.keys(w.warn ?? {})) writeWarn.add(`${k}:${code}`);
  }
  return {
    class: classify(r),
    version: r.version ?? '',
    nEnt: r.nEnt ?? 0,
    counts: r.counts ?? {},
    readWarn: new Set(Object.keys(r.read?.warn ?? {})),
    kinds,
    drops,
    writeWarn,
    flags: new Set(qualityFlags(r, oracle)),
    errors: new Set(fileErrors(r)),
  };
}

const setDiff = (label: string, a: Set<string>, b: Set<string>, out: string[], limit = 4) => {
  const plus = [...b].filter((x) => !a.has(x));
  const minus = [...a].filter((x) => !b.has(x));
  if (plus.length) out.push(`+${label} ${plus.slice(0, limit).join(', ')}${plus.length > limit ? ` 외 ${plus.length - limit}` : ''}`);
  if (minus.length) out.push(`-${label} ${minus.slice(0, limit).join(', ')}${minus.length > limit ? ` 외 ${minus.length - limit}` : ''}`);
};

export interface FileChange {
  key: string;
  ext: string;
  version: string;
  classBefore: string;
  classAfter: string;
  changes: string[];
}

export interface CompareResult {
  before: number;
  after: number;
  matched: number;
  onlyBefore: number;
  onlyAfter: number;
  classChanged: number;
  transitions: Record<string, number>;
  metricChanged: number;
  /** 설계대로 빠지는 비그래픽 객체 목록이 바뀐 파일 수(지표 바뀜에 넣지 않는다) */
  dropsChanged: number;
  /** 설계대로 빠지는 비그래픽 객체가 있는 파일 수(전, 후) */
  dropFiles: [number, number];
  changed: FileChange[];
  newExceptions: Record<string, number>;
  goneExceptions: Record<string, number>;
  quality: Record<string, [number, number]>;
}

export function compareRuns(before: FileRecord[], after: FileRecord[]): CompareResult {
  const bm = new Map(before.map((r) => [r.key, r]));
  const am = new Map(after.map((r) => [r.key, r]));
  const res: CompareResult = { before: before.length, after: after.length, matched: 0, onlyBefore: 0, onlyAfter: 0, classChanged: 0, transitions: {}, metricChanged: 0, dropsChanged: 0, dropFiles: [0, 0], changed: [], newExceptions: {}, goneExceptions: {}, quality: {} };
  for (const k of bm.keys()) if (!am.has(k)) res.onlyBefore++;
  for (const k of am.keys()) if (!bm.has(k)) res.onlyAfter++;
  const errB: Record<string, number> = {};
  const errA: Record<string, number> = {};
  const oracle = before.some((r) => r.oracle) && after.some((r) => r.oracle);
  const qkeys = [...Object.keys(QUALITY), ...(oracle ? Object.keys(ORACLE_QUALITY) : [])];
  for (const q of qkeys) res.quality[q] = [0, 0];
  for (const [key, a] of am) {
    const b = bm.get(key);
    if (!b) continue;
    res.matched++;
    const mb = fileMetrics(b, oracle);
    const ma = fileMetrics(a, oracle);
    if (mb.drops.size) res.dropFiles[0]++;
    if (ma.drops.size) res.dropFiles[1]++;
    if (mb.drops.size !== ma.drops.size || [...mb.drops].some((x) => !ma.drops.has(x))) res.dropsChanged++;
    for (const e of mb.errors) errB[e] = (errB[e] ?? 0) + 1;
    for (const e of ma.errors) errA[e] = (errA[e] ?? 0) + 1;
    for (const q of qkeys) {
      if (mb.flags.has(q)) res.quality[q]![0]++;
      if (ma.flags.has(q)) res.quality[q]![1]++;
    }
    const ch: string[] = [];
    if (mb.class !== ma.class) {
      res.classChanged++;
      const t = `${mb.class} → ${ma.class}`;
      res.transitions[t] = (res.transitions[t] ?? 0) + 1;
      ch.push(t);
    }
    if (mb.version !== ma.version) ch.push(`판 ${mb.version} → ${ma.version}`);
    if (mb.nEnt !== ma.nEnt) ch.push(`객체 ${mb.nEnt} → ${ma.nEnt}`);
    const types = new Set([...Object.keys(mb.counts), ...Object.keys(ma.counts)]);
    const cd = [...types].filter((t) => (mb.counts[t] ?? 0) !== (ma.counts[t] ?? 0)).map((t) => `${t} ${mb.counts[t] ?? 0}→${ma.counts[t] ?? 0}`);
    if (cd.length) ch.push(`종류별 수 ${cd.slice(0, 4).join(', ')}${cd.length > 4 ? ` 외 ${cd.length - 4}` : ''}`);
    setDiff('예외', mb.errors, ma.errors, ch, 2);
    setDiff('품질', mb.flags, ma.flags, ch);
    setDiff('왕복 차이', mb.kinds, ma.kinds, ch);
    setDiff('읽기 경고', mb.readWarn, ma.readWarn, ch);
    setDiff('쓰기 경고', mb.writeWarn, ma.writeWarn, ch);
    if (ch.length) {
      res.metricChanged++;
      res.changed.push({ key, ext: a.ext, version: a.version ?? a.sniff, classBefore: mb.class, classAfter: ma.class, changes: ch });
    }
  }
  // 분류가 바뀐 것, 바뀐 것이 많은 것부터
  res.changed.sort((x, y) => Number(y.classBefore !== y.classAfter) - Number(x.classBefore !== x.classAfter) || y.changes.length - x.changes.length || (x.key < y.key ? -1 : 1));
  for (const [e, n] of Object.entries(errA)) if (!errB[e]) res.newExceptions[e] = n;
  for (const [e, n] of Object.entries(errB)) if (!errA[e]) res.goneExceptions[e] = n;
  return res;
}

export function compareText(r: CompareResult, top = 20): string {
  const L: string[] = [];
  L.push(`전 ${r.before}개, 후 ${r.after}개 — 같은 파일 ${r.matched}개(전에만 ${r.onlyBefore}, 후에만 ${r.onlyAfter})`);
  L.push(`분류가 바뀐 파일 ${r.classChanged}개, 지표가 바뀐 파일 ${r.metricChanged}개, 새 예외 ${Object.keys(r.newExceptions).length}가지, 사라진 예외 ${Object.keys(r.goneExceptions).length}가지`);
  L.push(`설계대로 빠지는 비그래픽 객체(쓰기 경고·버전에 없는 종류·DWG 표 보조 자료)가 있는 파일 전 ${r.dropFiles[0]}개 → 후 ${r.dropFiles[1]}개, 그 목록이 바뀐 파일 ${r.dropsChanged}개(지표 바뀜에 넣지 않음)`);
  L.push('');
  L.push('품질 지표(같은 파일 중)            전      후');
  for (const [k, [b, a]] of Object.entries(r.quality)) L.push(`  ${k.padEnd(28)} ${String(b).padStart(6)} ${String(a).padStart(6)}${a !== b ? (a > b ? '  ▲' : '  ▼') : ''}`);
  if (Object.keys(r.transitions).length) {
    L.push('', '분류 바뀜:');
    for (const [t, n] of Object.entries(r.transitions).sort((a, b) => b[1] - a[1])) L.push(`  ${String(n).padStart(5)}  ${t}`);
  }
  if (Object.keys(r.newExceptions).length) {
    L.push('', '새 예외:');
    for (const [e, n] of Object.entries(r.newExceptions).sort((a, b) => b[1] - a[1]).slice(0, top)) L.push(`  ${String(n).padStart(5)}  ${e}`);
  }
  if (Object.keys(r.goneExceptions).length) {
    L.push('', '사라진 예외:');
    for (const [e, n] of Object.entries(r.goneExceptions).sort((a, b) => b[1] - a[1]).slice(0, top)) L.push(`  ${String(n).padStart(5)}  ${e}`);
  }
  if (r.changed.length) {
    L.push('', `지표가 바뀐 파일(상위 ${Math.min(top, r.changed.length)}개, 열쇠는 내용 sha256 앞 12자 — 경로는 records.jsonl):`);
    for (const c of r.changed.slice(0, top)) L.push(`  ${c.key.slice(0, 12)} ${c.ext} ${c.version}: ${c.changes.join('; ')}`);
  }
  return L.join('\n');
}

export const COMPARE_USAGE = `훑기 결과 비교 — npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--fail-on-change] [--json <파일>]
  --fail-on-change: 분류·지표가 바뀐 파일이나 새 예외가 있으면 1로 끝납니다.`;

export function compareMain(argv: string[], log: (s: string) => void = (s) => console.log(s)): number {
  const dirs: string[] = [];
  let top = 20;
  let fail = false;
  let json: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--top') top = Math.max(1, Number(argv[++i]) || 20);
    else if (a === '--fail-on-change') fail = true;
    else if (a === '--json') json = argv[++i] ?? null;
    else if (a === '-h' || a === '--help') {
      log(COMPARE_USAGE);
      return 0;
    } else if (a.startsWith('--')) {
      log(`알 수 없는 인자: ${a}\n${COMPARE_USAGE}`);
      return 2;
    } else dirs.push(a);
  }
  if (dirs.length !== 2) {
    log(COMPARE_USAGE);
    return dirs.length ? 2 : 0;
  }
  let r: CompareResult;
  try {
    r = compareRuns(readRecords(dirs[0]!), readRecords(dirs[1]!));
  } catch (e) {
    log((e as Error).message);
    return 2;
  }
  log(compareText(r, top));
  if (json) writeFileSync(json, JSON.stringify(r, null, 1) + '\n');
  const changed = r.classChanged > 0 || r.metricChanged > 0 || Object.keys(r.newExceptions).length > 0;
  return fail && changed ? 1 : 0;
}
