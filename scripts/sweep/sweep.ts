/**
 * 실제 도면 훑기(개발 도구): 로컬 폴더의 DXF·DWG를 앱과 같은 길로 읽고·그리고·쓰고·다시 읽어 결과를 모은다.
 *
 * 사용법: npm run sweep -- [--dirs <폴더1>:<폴더2>] [--list <경로 목록 파일>] [--out .runtime/sweep/<이름>]
 *                         [--jobs N] [--limit N] [--filter dwg,AC1015,R2018] [--timeout 초] [--oracle]
 *  - 표본 폴더는 --dirs 또는 환경 변수 OPENCAD_SWEEP_DIRS(쌍점으로 구분). 둘 다 없으면 쓰는 법만 찍고 0으로 끝난다.
 *  - --list: 한 줄에 경로 하나(#으로 시작하면 건너뜀) — 지난번과 똑같은 표본으로 다시 돌릴 때
 *  - --oracle: CAD_PYTHON(ezdxf가 있는 파이썬)이 있을 때만 ezdxf와 대조한다
 * 결과: <out>/records.jsonl(파일마다 한 줄, 열쇠는 내용 sha256 — 경로는 이 로컬 결과에만), <out>/summary.json(done: true)
 * 비교: npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더>
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, parseFilter, walk, type SweepFile } from './files';
import type { FileRecord } from './record';
import { buildSummary, summaryText } from './summary';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export const USAGE = `실제 도면 훑기 — 로컬 폴더의 DXF·DWG를 앱과 같은 길로 읽고·그리고·쓰고·다시 읽습니다.

  npm run sweep -- --dirs <폴더1>:<폴더2> [--out .runtime/sweep/<이름>] [--jobs N] [--limit N]
                   [--filter dwg,AC1015,R2018] [--timeout 초] [--oracle] [--list <경로 목록 파일>]

  표본 폴더는 --dirs 또는 환경 변수 OPENCAD_SWEEP_DIRS(쌍점으로 구분)로 줍니다. 저장소에는 표본이 없습니다.
  결과는 <out>/records.jsonl(파일마다 한 줄)과 <out>/summary.json입니다.
  비교: npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--fail-on-change]`;

export interface SweepArgs {
  dirs: string[];
  list?: string;
  out?: string;
  jobs: number;
  limit: number;
  filter?: string;
  timeoutSec: number;
  oracle: boolean;
  help: boolean;
}

/** 명령 인자 + 환경 변수 → 설정(폴더가 없으면 dirs가 빈 배열) */
export function parseArgs(argv: string[], env: Record<string, string | undefined> = {}): SweepArgs {
  const a: SweepArgs = { dirs: [], jobs: Math.max(1, Math.min(4, cpus().length - 2)), limit: Infinity, timeoutSec: 120, oracle: false, help: false };
  const val = (i: number, name: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} 뒤에 값이 필요합니다.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    const [name, inline] = k.includes('=') ? [k.slice(0, k.indexOf('=')), k.slice(k.indexOf('=') + 1)] : [k, undefined];
    const take = () => (inline !== undefined ? inline : val(i++, name));
    switch (name) {
      case '--dirs':
        a.dirs.push(...take().split(':').filter(Boolean));
        break;
      case '--list':
        a.list = take();
        break;
      case '--out':
        a.out = take();
        break;
      case '--jobs':
        a.jobs = Math.max(1, Math.floor(Number(take())) || 1);
        break;
      case '--limit':
        a.limit = Math.max(0, Math.floor(Number(take())));
        if (!Number.isFinite(a.limit)) throw new Error('--limit은 수여야 합니다.');
        break;
      case '--filter':
        a.filter = take();
        break;
      case '--timeout':
        a.timeoutSec = Math.max(5, Number(take()) || 120);
        break;
      case '--oracle':
        a.oracle = true;
        break;
      case '-h':
      case '--help':
        a.help = true;
        break;
      default:
        throw new Error(`알 수 없는 인자: ${k}`);
    }
  }
  if (!a.dirs.length && !a.list && env.OPENCAD_SWEEP_DIRS) a.dirs.push(...env.OPENCAD_SWEEP_DIRS.split(':').filter(Boolean));
  return a;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

/** 파일 하나의 시간 한도(큰 파일은 더 기다린다, 대조하면 두 배) */
export function fileTimeoutMs(f: Pick<SweepFile, 'size'>, baseSec: number, oracle: boolean): number {
  return Math.round((baseSec * 1000 + (f.size / 1e6) * 40_000) * (oracle ? 2 : 1));
}

interface Lane {
  proc: ChildProcess | null;
  stderr: string;
}

/**
 * vite-node 실행 파일 — 판마다 자리가 달라(3.x `vite-node.mjs`, 5.x `dist/cli.mjs`) 경로를 박아 두지 않고
 * 설치된 vite-node의 package.json `bin`으로 찾는다
 */
function viteNodeCli(): string {
  let pkgPath: string;
  try {
    pkgPath = createRequire(join(root, 'package.json')).resolve('vite-node/package.json');
  } catch {
    throw new Error('vite-node를 찾지 못했습니다. 먼저 npm ci를 하십시오.');
  }
  const { bin } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: string | Record<string, string> };
  const rel = typeof bin === 'string' ? bin : bin?.['vite-node'];
  const cli = rel ? resolve(dirname(pkgPath), rel) : '';
  if (!cli || !existsSync(cli)) throw new Error('vite-node 실행 파일을 찾지 못했습니다. 먼저 npm ci를 하십시오.');
  return cli;
}

/** 워커 하나 띄우기(vite-node로 TS를 바로 돌린다) — 준비되면 resolve */
function spawnWorker(lane: Lane, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  const vn = viteNodeCli();
  const p = spawn(process.execPath, [vn, join(here, 'worker.ts')], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  lane.proc = p;
  lane.stderr = '';
  p.stderr!.setEncoding('utf8');
  p.stderr!.on('data', (d: string) => {
    lane.stderr = (lane.stderr + d).slice(-3000);
  });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`워커가 준비되지 않았습니다: ${lane.stderr.slice(-500)}`)), 180_000);
    const onMsg = (m: { type: string }) => {
      if (m.type !== 'ready') return;
      clearTimeout(t);
      p.off('message', onMsg);
      res(p);
    };
    p.on('message', onMsg);
    p.once('exit', (code) => {
      clearTimeout(t);
      rej(new Error(`워커가 시작하다 끝났습니다(${code}): ${lane.stderr.slice(-800)}`));
    });
  });
}

function kill(p: ChildProcess | null): void {
  if (!p || p.exitCode !== null || p.signalCode !== null) return;
  p.kill('SIGTERM');
  setTimeout(() => {
    if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL');
  }, 5000).unref();
}

/** 파일 하나를 워커에 맡기고 기록·시간 넘김·죽음 중 먼저 온 것을 돌려준다 */
function runOne(lane: Lane, f: SweepFile, timeoutMs: number): Promise<FileRecord> {
  const p = lane.proc!;
  const base = { key: f.key, path: f.path, ext: f.ext, size: f.size, dups: f.dups, sniff: f.sniff };
  const t0 = performance.now();
  return new Promise((res) => {
    let settled = false;
    const finish = (r: FileRecord) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      p.off('message', onMsg);
      p.off('exit', onExit);
      res(r);
    };
    const onMsg = (m: { type: string; record?: FileRecord }) => {
      if (m.type === 'record' && m.record?.key === f.key) finish(m.record);
    };
    const onExit = (code: number | null, sig: string | null) => {
      lane.proc = null;
      finish({ ...base, fatal: `EXIT ${code ?? ''} ${sig ?? ''} ${lane.stderr.slice(-400).replace(/\s+/g, ' ')}`.trim(), ms: Math.round(performance.now() - t0) });
    };
    const timer = setTimeout(() => {
      kill(p);
      lane.proc = null;
      finish({ ...base, fatal: `TIMEOUT ${Math.round(timeoutMs / 1000)}s`, ms: Math.round(performance.now() - t0) });
    }, timeoutMs);
    p.on('message', onMsg);
    p.on('exit', onExit);
    p.send({ type: 'file', file: f });
  });
}

/** 훑기 실행. 돌려주는 값은 끝 코드 */
export async function main(argv: string[], env: Record<string, string | undefined> = process.env, log: (s: string) => void = (s) => console.log(s)): Promise<number> {
  let args: SweepArgs;
  try {
    args = parseArgs(argv, env);
  } catch (e) {
    log(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help || (!args.dirs.length && !args.list)) {
    log(USAGE);
    return 0;
  }
  // 표본 고르기
  const paths: string[] = [];
  for (const d of args.dirs) {
    if (!existsSync(d)) log(`폴더가 없습니다(건너뜀): ${d}`);
    walk(resolve(d), paths);
  }
  if (args.list) {
    for (const line of readFileSync(args.list, 'utf8').split('\n')) {
      const p = line.trim();
      if (p && !p.startsWith('#')) paths.push(resolve(p));
    }
  }
  const filter = parseFilter(args.filter);
  const picked = collect([...new Set(paths)], filter, args.limit);
  const files = picked.files;
  const out = resolve(args.out ?? join(root, '.runtime/sweep', stamp()));
  if (existsSync(out) && readdirSync(out).some((n) => /^(records|summary)/.test(n))) {
    log(`결과 폴더에 이미 결과가 있습니다(덮어쓰지 않습니다): ${out}`);
    return 2;
  }
  mkdirSync(out, { recursive: true });
  const tmp = join(out, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const python = args.oracle ? env.CAD_PYTHON : undefined;
  const oracle = !!python && existsSync(python);
  if (args.oracle && !oracle) log('CAD_PYTHON이 없어 ezdxf 대조는 건너뜁니다.');
  const jobs = Math.max(1, Math.min(args.jobs, files.length || 1));
  log(`표본 ${files.length}개(찾은 파일 ${picked.found}, 같은 내용 ${picked.duplicates}, 조건 밖 ${picked.filteredOut}, 너무 큼 ${picked.tooBig}) — 워커 ${jobs}개${oracle ? ', ezdxf 대조' : ''} → ${out}`);
  const partial = join(out, 'records.partial.jsonl');
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  // 큰 파일부터(끝에 큰 파일 하나만 남아 기다리지 않게)
  const queue = [...files].sort((a, b) => b.size - a.size);
  const records: FileRecord[] = [];
  let lastLog = 0;
  const wenv: NodeJS.ProcessEnv = { ...process.env, SWEEP_TMP: tmp, NODE_OPTIONS: [process.env.NODE_OPTIONS ?? '', '--max-old-space-size=8192'].join(' ').trim() };
  if (oracle) wenv.SWEEP_ORACLE_PYTHON = python;
  else delete wenv.SWEEP_ORACLE_PYTHON;
  const lanes: Lane[] = Array.from({ length: jobs }, () => ({ proc: null, stderr: '' }));
  let stop = false;
  const onSig = () => {
    stop = true;
    for (const l of lanes) kill(l.proc);
  };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);
  try {
    await Promise.all(
      lanes.map(async (lane) => {
        while (queue.length && !stop) {
          const f = queue.shift()!;
          if (!lane.proc) await spawnWorker(lane, wenv);
          const rec = await runOne(lane, f, fileTimeoutMs(f, args.timeoutSec, oracle));
          records.push(rec);
          appendFileSync(partial, JSON.stringify(rec) + '\n');
          const now = performance.now();
          if (now - lastLog > 15_000 || records.length === files.length) {
            lastLog = now;
            log(`  ${records.length}/${files.length} (${Math.round((records.length / Math.max(1, files.length)) * 100)}%) ${Math.round((now - t0) / 1000)}초`);
          }
        }
        if (lane.proc) {
          lane.proc.send({ type: 'exit' });
          const p = lane.proc;
          setTimeout(() => kill(p), 3000).unref();
        }
      }),
    );
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
    for (const l of lanes) kill(l.proc);
    rmSync(tmp, { recursive: true, force: true });
  }
  if (stop) {
    log(`멈췄습니다. 지금까지의 기록: ${partial}`);
    return 130;
  }
  records.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  writeFileSync(join(out, 'records.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  rmSync(partial, { force: true });
  const summary = buildSummary({
    records,
    input: { dirs: args.dirs.length, list: !!args.list, found: picked.found, unique: picked.unique, duplicates: picked.duplicates, filteredOut: picked.filteredOut, tooBig: picked.tooBig, unreadable: picked.unreadable },
    options: { jobs, limit: Number.isFinite(args.limit) ? args.limit : null, filter: args.filter ?? null, oracle, timeoutSec: args.timeoutSec },
    wallMs: Math.round(performance.now() - t0),
    startedAt,
    finishedAt: new Date().toISOString(),
  });
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');
  log(summaryText(summary));
  log(`결과: ${join(out, 'summary.json')}`);
  return 0;
}
