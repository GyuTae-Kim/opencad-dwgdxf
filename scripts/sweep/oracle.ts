/**
 * 훑기의 ezdxf 대조(선택, --oracle과 CAD_PYTHON이 있을 때만): 워커마다 파이썬 하나를 띄워 두고 DXF를 하나씩 넘긴다.
 *  A: DXF 원본 — ezdxf(원본) ↔ 우리 리더
 *  B: DWG 원본 + 같은 폴더의 같은 이름 DXF(짝) — ezdxf(짝) ↔ 우리 DWG 리더
 *  C: 우리가 쓴 DXF R2018 — ezdxf(출력) ↔ 우리 문서(쓰기 전), ezdxf audit 오류
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compareSummaries } from '../../tests/oracle/compare';
import { decodeCadEscapes } from '../../src/core/codepage';
import { decodeCaret } from '../../src/io/dxf/records';

type Tally = Record<string, number>;
const inc = (t: Tally, k: string, n = 1) => {
  t[k] = (t[k] ?? 0) + n;
};

export interface EzResult {
  ok: boolean;
  error?: string;
  loadError?: string;
  recovered?: boolean;
  summary?: OracleSummary;
  auditErrors?: Record<string, number>;
  auditFirst?: string[];
}

type Ent = Record<string, unknown> & { type: string; handle: string };
export interface OracleSummary {
  layers: { name: string }[];
  blocks: Record<string, Ent[]>;
}

export class EzdxfOracle {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = '';
  private waiting: ((line: string | null) => void) | null = null;
  private n = 0;

  constructor(
    private readonly python: string,
    private readonly scriptDir: string,
    private readonly tmpDir: string,
  ) {}

  private start(): ChildProcessWithoutNullStreams {
    if (this.proc) return this.proc;
    const p = spawn(this.python, ['-I', join(this.scriptDir, 'ezdxf_batch.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d: string) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        const w = this.waiting;
        this.waiting = null;
        w?.(line);
      }
    });
    p.stderr.on('data', () => {});
    p.on('exit', () => {
      this.proc = null;
      const w = this.waiting;
      this.waiting = null;
      w?.(null);
    });
    this.proc = p;
    return p;
  }

  /** DXF 하나를 ezdxf로 요약한다(파이썬이 죽으면 다음 파일에서 다시 띄운다) */
  async dump(path: string): Promise<EzResult> {
    const p = this.start();
    const out = join(this.tmpDir, `ez-${process.pid}-${this.n++}.json`);
    const line = await new Promise<string | null>((resolve) => {
      this.waiting = resolve;
      p.stdin.write(JSON.stringify({ in: path, out }) + '\n');
    });
    try {
      if (line !== 'ok' || !existsSync(out)) return { ok: false, error: 'ezdxf process ended' };
      return JSON.parse(readFileSync(out, 'utf8')) as EzResult;
    } finally {
      rmSync(out, { force: true });
    }
  }

  close(): void {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
  }
}

/** 문자 비교 표기 맞추기: \U+ 이스케이프와 캐럿 표기(ezdxf는 DXF의 ^J·"^ "를 그대로 두고, 우리 리더는 푼다)를 글자로 */
const normText = (s: unknown): unknown => (typeof s === 'string' ? decodeCaret(decodeCadEscapes(s)) : s);

export interface OracleDiff {
  /** 기준(ezdxf)에 대한 우리 종류별 개수 차이 */
  countDelta?: Tally;
  /** 핸들로 맞춘 값 차이(종류.속성 → 객체 수) */
  fieldDiffs?: Tally;
  samples?: Record<string, unknown>;
  onlyExp?: Tally;
  onlyAct?: Tally;
  layersOnlyExp?: string[];
  layersOnlyAct?: string[];
  blocksOnlyExp?: string[];
  blocksOnlyAct?: string[];
  auditErrors?: Record<string, number>;
  auditFirst?: string[];
  loadError?: string;
  error?: string;
}

/** exp: 기준(ezdxf 요약), act: 우리 요약 */
export function compareOracle(exp: OracleSummary, act: OracleSummary): OracleDiff {
  const countsE: Tally = {};
  const countsA: Tally = {};
  const fieldDiffs: Tally = {};
  const samples: Record<string, unknown> = {};
  const onlyExp: Tally = {};
  const onlyAct: Tally = {};
  const blocksOnlyExp: string[] = [];
  const blocksOnlyAct: string[] = [];
  for (const [k, list] of Object.entries(exp.blocks)) {
    for (const e of list) inc(countsE, e.type);
    const al = act.blocks[k];
    if (!al) {
      blocksOnlyExp.push(k);
      for (const e of list) inc(onlyExp, e.type);
      continue;
    }
    const am = new Map(al.map((e) => [e.handle, e]));
    const seen = new Set<string>();
    for (const e of list) {
      const a = am.get(e.handle);
      if (!a) {
        inc(onlyExp, e.type);
        continue;
      }
      seen.add(e.handle);
      const e2: Record<string, unknown> = { ...e };
      const a2: Record<string, unknown> = { ...a };
      if ('text' in e2) {
        e2.text = normText(e2.text);
        a2.text = normText(a2.text);
      }
      if (Array.isArray(e2.attvals)) {
        e2.attvals = (e2.attvals as string[]).map(normText);
        a2.attvals = Array.isArray(a2.attvals) ? (a2.attvals as string[]).map(normText) : a2.attvals;
      }
      // 기준 DXF에 맞춤점만 있는 스플라인: 우리 리더는 DWG 맞춤점 자료에서 AutoCAD처럼 조정점·매듭을 채운다
      // (AutoCAD가 그 DWG를 DXF로 쓰면 함께 적는 값 — 기준 DXF를 AutoCAD가 쓰지 않았을 때만 생기는 차이)
      if (e.type === 'SPLINE' && e2.controlPoints === 0 && typeof e2.fitPoints === 'number' && e2.fitPoints >= 2 && e2.fitPoints === a2.fitPoints) {
        delete e2.controlPoints;
        delete e2.knots;
        delete a2.controlPoints;
        delete a2.knots;
      }
      for (const d of compareSummaries(e2, a2, 1e-6, '', [], 20)) {
        const f = `${e.type}${d.path.replace(/\[\d+\]/g, '[]').replace(/\.length$/, '#')}`;
        inc(fieldDiffs, f);
        if (!samples[f]) samples[f] = clip({ block: k, handle: e.handle, exp: d.expected, act: d.actual });
      }
    }
    for (const a of al) if (!seen.has(a.handle)) inc(onlyAct, a.type);
  }
  for (const [k, al] of Object.entries(act.blocks)) {
    for (const a of al) inc(countsA, a.type);
    if (!(k in exp.blocks)) {
      blocksOnlyAct.push(k);
      for (const a of al) inc(onlyAct, a.type);
    }
  }
  const le = new Set(exp.layers.map((l) => l.name));
  const la = new Set(act.layers.map((l) => l.name));
  const countDelta: Tally = {};
  for (const k of new Set([...Object.keys(countsE), ...Object.keys(countsA)])) {
    const d = (countsA[k] ?? 0) - (countsE[k] ?? 0);
    if (d) countDelta[k] = d;
  }
  return prune({
    countDelta,
    fieldDiffs,
    samples,
    onlyExp,
    onlyAct,
    blocksOnlyExp: blocksOnlyExp.slice(0, 10),
    blocksOnlyAct: blocksOnlyAct.slice(0, 10),
    layersOnlyExp: [...le].filter((l) => !la.has(l)).slice(0, 10),
    layersOnlyAct: [...la].filter((l) => !le.has(l)).slice(0, 10),
  });
}

/** 기록을 작게: 긴 글은 자르고 빈 항목은 뺀다 */
export function clip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'string' && x.length > 160 ? x.slice(0, 160) + '…' : x))) as T;
}

export function prune<T extends object>(o: T): T {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || (Array.isArray(v) && !v.length) || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete (o as Record<string, unknown>)[k];
  }
  return o;
}
